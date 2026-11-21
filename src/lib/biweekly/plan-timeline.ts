function isoDay(value: string): number {
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`Invalid ISO day: ${value}`);
  }
  return ms;
}

function addDays(date: string, count: number): string {
  return new Date(isoDay(date) + count * 86400000).toISOString().slice(0, 10);
}

function dateRatio(date: string, start: string, end: string): number {
  const span = isoDay(end) - isoDay(start);
  if (span <= 0) throw new RangeError("Timeline end must follow start");
  return Math.max(0, Math.min(1, (isoDay(date) - isoDay(start)) / span));
}

export const PHASE_LABELS = {
  S1: "营养生长",
  S2: "营养/生殖并进",
  S3: "生殖生长",
} as const;

export type PhaseLabel = keyof typeof PHASE_LABELS;

export type PlanStage = {
  id: string;
  name: string;
  source_stage_name: string;
  stage_code: string | null;
  start: string;
  end_inclusive: string;
  end_exclusive: string;
  mapping_status: string | null;
  phase_label: PhaseLabel | null;
  phase_code: string | null;
  phase_name: string | null;
  monitored: boolean;
  tags: string[];
};

export type PlanPeriodMarker = {
  period_id: string;
  label: string;
  start: string;
  end_inclusive: string;
  end_exclusive: string;
  has_eligible_optics?: boolean;
  report_status?: string | null;
};

export type Placed<T> = T & { left: number; width: number };

export type PlanPeriodDot = PlanPeriodMarker & {
  mid: string;
  left: number;
  width: number;
  bandLeft: number;
};

export type PlanTimelineView = {
  empty: boolean;
  start: string;
  end: string;
  phases: Placed<{ label: PhaseLabel; name: string; start: string; end: string }>[];
  stages: Array<Placed<PlanStage> & { labelLane: number }>;
  period: Placed<PlanPeriodMarker> | null;
  periods: PlanPeriodDot[];
  ticks: { date: string; left: number; align: "start" | "middle" | "end" }[];
  labelLanes: number;
};

function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asPhase(value: unknown): PhaseLabel | null {
  return value === "S1" || value === "S2" || value === "S3" ? value : null;
}

function earliest(dates: string[]): string {
  return dates.reduce((left, right) => (left < right ? left : right));
}

function latest(dates: string[]): string {
  return dates.reduce((left, right) => (left > right ? left : right));
}

/** Map a seasons/periods payload (stages or native_plan.intervals) into plan windows. */
export function planStagesFromPayload(raw: unknown): PlanStage[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  const rows = Array.isArray(record.stages)
    ? record.stages
    : Array.isArray(record.native_plan?.intervals)
      ? record.native_plan.intervals
      : [];
  const stages: PlanStage[] = [];
  rows.forEach((row: Record<string, any>, index: number) => {
    const name = String(row?.name || row?.source_stage_name || row?.stage_code || "").trim();
    const start = row?.start;
    const endInclusive = row?.end_inclusive;
    const endExclusive = isIsoDay(row?.end_exclusive)
      ? row.end_exclusive
      : isIsoDay(endInclusive)
        ? addDays(endInclusive, 1)
        : null;
    if (!name || !isIsoDay(start) || !isIsoDay(endInclusive) || !isIsoDay(endExclusive)) return;
    if (endExclusive <= start) return;
    const phaseLabel = asPhase(row?.phase_label);
    const status = row?.mapping_status == null || row.mapping_status === "" ? null : String(row.mapping_status);
    stages.push({
      id: String(row?.id ?? row?.plant_task_id ?? `${name}-${start}-${index}`),
      name,
      source_stage_name: String(row?.source_stage_name || name),
      stage_code: row?.stage_code ? String(row.stage_code) : null,
      start,
      end_inclusive: endInclusive,
      end_exclusive: endExclusive,
      mapping_status: status,
      phase_label: phaseLabel,
      phase_code: row?.phase_code ? String(row.phase_code) : null,
      phase_name: phaseLabel ? PHASE_LABELS[phaseLabel] : row?.phase_name ? String(row.phase_name) : null,
      monitored: status !== "NOT_APPLICABLE" && Boolean(phaseLabel),
      tags: Array.isArray(row?.tags) ? row.tags.map((tag: unknown) => String(tag)) : [],
    });
  });
  return stages.sort((a, b) => a.start.localeCompare(b.start) || a.end_exclusive.localeCompare(b.end_exclusive));
}

function overlapDays(startA: string, endA: string, startB: string, endB: string): number {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  if (end <= start) return 0;
  return (isoDay(end) - isoDay(start)) / 86400000;
}

function midpoint(start: string, endExclusive: string): string {
  const days = (isoDay(endExclusive) - isoDay(start)) / 86400000;
  return addDays(start, Math.floor(days / 2));
}

/** Pick the biweek inside a phase/stage window; keep the current period when it already overlaps. */
export function selectPeriodInWindow(
  periods: PlanPeriodMarker[],
  windowStart: string,
  windowEndExclusive: string,
  currentPeriodId?: string | null,
): PlanPeriodMarker | null {
  const intersecting = periods.filter(
    (row) =>
      isIsoDay(row.start) &&
      isIsoDay(row.end_exclusive) &&
      row.start < windowEndExclusive &&
      row.end_exclusive > windowStart,
  );
  if (!intersecting.length) return null;
  if (currentPeriodId && intersecting.some((row) => row.period_id === currentPeriodId)) {
    return intersecting.find((row) => row.period_id === currentPeriodId) ?? null;
  }
  const ranked = [...intersecting].sort((a, b) => {
    const overlap =
      overlapDays(b.start, b.end_exclusive, windowStart, windowEndExclusive) -
      overlapDays(a.start, a.end_exclusive, windowStart, windowEndExclusive);
    if (overlap !== 0) return overlap;
    return a.start.localeCompare(b.start) || a.period_id.localeCompare(b.period_id);
  });
  return ranked[0] ?? null;
}

function assignLabelLanes(stages: Placed<PlanStage>[], charUnit = 0.04): number[] {
  const lanes: number[] = [];
  const rights: number[] = [];
  for (const stage of stages) {
    const mid = stage.left + stage.width / 2;
    const half = Math.max(stage.width, Math.max(stage.name.length, 2) * charUnit) / 2;
    const left = mid - half;
    const right = mid + half;
    let lane = rights.findIndex((edge) => left >= edge - 1e-6);
    if (lane < 0) {
      lane = rights.length;
      rights.push(right);
    } else {
      rights[lane] = right;
    }
    lanes.push(lane);
  }
  return lanes;
}

export function buildPlanTimeline(
  stages: PlanStage[],
  period?: PlanPeriodMarker | null,
  periods?: PlanPeriodMarker[] | null,
): PlanTimelineView {
  const empty: PlanTimelineView = {
    empty: true,
    start: "",
    end: "",
    phases: [],
    stages: [],
    period: null,
    periods: [],
    ticks: [],
    labelLanes: 0,
  };
  const dates: string[] = [];
  for (const stage of stages) {
    dates.push(stage.start, stage.end_exclusive);
  }
  const collect = (row: PlanPeriodMarker | null | undefined) => {
    if (row && isIsoDay(row.start) && isIsoDay(row.end_exclusive) && row.end_exclusive > row.start) {
      dates.push(row.start, row.end_exclusive);
    }
  };
  collect(period ?? null);
  for (const row of periods || []) collect(row);
  if (!stages.length || dates.length < 2) return empty;
  const start = earliest(dates);
  const end = latest(dates);
  if (end <= start) return empty;

  const place = <T extends { start: string; end?: string; end_exclusive?: string }>(item: T): Placed<T> => {
    const finish = item.end_exclusive || item.end!;
    const left = dateRatio(item.start < start ? start : item.start, start, end);
    const right = dateRatio(finish > end ? end : finish, start, end);
    return { ...item, left, width: Math.max(right - left, 0) };
  };

  const phases: PlanTimelineView["phases"] = [];
  for (const label of ["S1", "S2", "S3"] as PhaseLabel[]) {
    const group = stages.filter((stage) => stage.phase_label === label && stage.monitored);
    if (!group.length) continue;
    const phaseStart = earliest(group.map((stage) => stage.start));
    const phaseEnd = latest(group.map((stage) => stage.end_exclusive));
    phases.push(place({ label, name: PHASE_LABELS[label], start: phaseStart, end: phaseEnd }));
  }

  const placedStages = stages.map((stage) => place(stage));
  const lanes = assignLabelLanes(placedStages);
  const mid = addDays(start, Math.floor((isoDay(end) - isoDay(start)) / 86400000 / 2));
  const ticks = [
    { date: start, left: 0, align: "start" as const },
    { date: mid, left: dateRatio(mid, start, end), align: "middle" as const },
    { date: addDays(end, -1), left: 1, align: "end" as const },
  ];

  const periodDots: PlanPeriodDot[] = [];
  for (const row of periods || []) {
    if (!isIsoDay(row.start) || !isIsoDay(row.end_exclusive) || row.end_exclusive <= row.start) continue;
    const placed = place(row);
    const midDate = midpoint(row.start, row.end_exclusive);
    const clipped = midDate < start ? start : midDate > end ? end : midDate;
    periodDots.push({
      ...row,
      mid: midDate,
      left: dateRatio(clipped, start, end),
      width: placed.width,
      bandLeft: placed.left,
    });
  }

  return {
    empty: false,
    start,
    end,
    phases,
    stages: placedStages.map((stage, index) => ({ ...stage, labelLane: lanes[index] ?? 0 })),
    period:
      period && isIsoDay(period.start) && isIsoDay(period.end_exclusive) && period.end_exclusive > period.start
        ? place(period)
        : null,
    periods: periodDots,
    ticks,
    labelLanes: lanes.length ? Math.max(...lanes) + 1 : 0,
  };
}
