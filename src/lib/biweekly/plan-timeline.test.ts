import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addDays } from "./timeline.ts";
import { buildPlanTimeline, monitoringStart, periodsWithinMonitoring, planStagesFromPayload, selectPeriodInWindow, PHASE_LABELS } from "./plan-timeline.ts";

const seasonPayload = {
  season_id: "2026/27",
  label: "2026/27 种植季",
  crop_name: "小麦",
  stages: [
    { name: "播种前准备", source_stage_name: "播种前准备", start: "2026-09-20", end_inclusive: "2026-10-05", end_exclusive: "2026-10-06", mapping_status: "NOT_APPLICABLE", phase_label: null, phase_code: null, monitored: false, tags: [] },
    { name: "播种期", source_stage_name: "播种期", start: "2026-10-06", end_inclusive: "2026-10-15", end_exclusive: "2026-10-16", mapping_status: "NOT_APPLICABLE", phase_label: null, phase_code: null, monitored: false, tags: [] },
    { name: "出苗期", start: "2026-10-16", end_inclusive: "2026-10-31", end_exclusive: "2026-11-01", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "分蘖期", start: "2026-11-01", end_inclusive: "2026-11-30", end_exclusive: "2026-12-01", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "越冬期", start: "2026-12-01", end_inclusive: "2027-02-15", end_exclusive: "2027-02-16", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: ["DORMANCY"] },
    { name: "返青期", start: "2027-02-16", end_inclusive: "2027-03-10", end_exclusive: "2027-03-11", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "拔节孕穗期", start: "2027-03-11", end_inclusive: "2027-04-10", end_exclusive: "2027-04-11", mapping_status: "MAPPED", phase_label: "S2", phase_code: "TRANS", tags: [] },
    { name: "抽穗期", start: "2027-04-11", end_inclusive: "2027-04-25", end_exclusive: "2027-04-26", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
    { name: "灌浆期", start: "2027-04-26", end_inclusive: "2027-05-19", end_exclusive: "2027-05-20", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
    { name: "成熟期", start: "2027-05-20", end_inclusive: "2027-06-05", end_exclusive: "2027-06-06", mapping_status: "MAPPED", phase_label: "S3", phase_code: "REPRO", tags: [] },
  ],
};

test("maps seasons payload into a timeline including pre-S1 stages", () => {
  const stages = planStagesFromPayload(seasonPayload);
  assert.deepEqual(stages.map((row) => row.name), [
    "播种前准备",
    "播种期",
    "出苗期",
    "分蘖期",
    "越冬期",
    "返青期",
    "拔节孕穗期",
    "抽穗期",
    "灌浆期",
    "成熟期",
  ]);
  assert.equal(stages[0].monitored, false);
  assert.equal(stages[0].phase_label, null);
  assert.equal(stages[1].mapping_status, "NOT_APPLICABLE");
  assert.equal(stages[2].phase_label, "S1");
  assert.equal(stages[6].phase_label, "S2");
  assert.equal(stages[7].phase_label, "S3");
  assert.equal(stages[6].phase_name, PHASE_LABELS.S2);
  assert.ok(!stages.some((row) => row.name === "孕穗"));
  assert.ok(!stages.some((row) => row.name === "起身期"));

  const fromNative = planStagesFromPayload({
    native_plan: {
      intervals: [
        { source_stage_name: "播种前准备", start: "2026-09-20", end_inclusive: "2026-10-05", end_exclusive: "2026-10-06", mapping_status: "NOT_APPLICABLE", phase_label: null },
        { source_stage_name: "出苗期", start: "2026-10-16", end_inclusive: "2026-10-31", mapping_status: "MAPPED", phase_label: "S1" },
      ],
    },
  });
  assert.equal(fromNative[0].name, "播种前准备");
  assert.equal(fromNative[1].end_exclusive, "2026-11-01");

  const view = buildPlanTimeline(stages, {
    period_id: "5",
    label: "第5期",
    start: "2026-11-09",
    end_inclusive: "2026-11-22",
    end_exclusive: "2026-11-23",
  });
  assert.equal(view.empty, false);
  assert.equal(view.start, "2026-09-20");
  assert.equal(view.end, "2027-06-06");
  assert.deepEqual(view.phases.map((phase) => phase.label), ["S1", "S2", "S3"]);
  assert.equal(view.phases[0].name, "营养生长");
  assert.equal(view.phases[1].name, "营养/生殖并进");
  assert.equal(view.phases[2].name, "生殖生长");
  assert.equal(view.phases[0].start, "2026-10-16");
  assert.ok(view.phases[0].left > 0);
  assert.equal(view.stages.filter((row) => !row.monitored).length, 2);
  assert.ok(view.period);
  assert.equal(view.period?.label, "第5期");
  assert.ok(view.period!.left > view.stages[1].left);
  assert.ok(view.period!.left + view.period!.width <= 1);
  assert.ok(view.period!.start >= "2026-11-01" && view.period!.start < "2026-12-01");
});

test("does not invent stages and shows an empty view without dates", () => {
  assert.deepEqual(planStagesFromPayload({}), []);
  assert.equal(buildPlanTimeline([]).empty, true);
  const skipped = planStagesFromPayload({
    stages: [
      { name: "出苗期", phase_label: "S1" },
      { name: "孕穗", start: "2027-03-01", end_inclusive: "2027-03-10", end_exclusive: "2027-03-11", phase_label: "S2" },
    ],
  });
  assert.deepEqual(skipped.map((row) => row.name), ["孕穗"]);
});

test("live tab renders the Smart plan timeline, not the mock report axis", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const component = readFileSync("src/components/biweekly/plan-timeline.tsx", "utf8");
  assert.match(tab, /PlanPhenologyTimeline/);
  assert.match(tab, /planStagesFromPayload/);
  assert.doesNotMatch(tab, /ReportTimeline/);
  assert.doesNotMatch(tab, /MOCK_REPORTS/);
  assert.doesNotMatch(tab, /Mock排期/);
  const policy = readFileSync("src/lib/biweekly/plan-timeline.ts", "utf8");
  assert.doesNotMatch(component, /phase_mapping/);
  assert.doesNotMatch(component, /算法/);
  assert.match(component, /S1/);
  assert.match(component, /phase\.name/);
  assert.match(policy, /营养生长/);
  assert.match(policy, /营养\/生殖并进/);
  assert.match(policy, /生殖生长/);
  assert.match(component, /未纳入监测/);
  assert.match(component, /本季种植方案暂无生育期日期/);
});

const smartNamesPayload = {
  stages: [
    { name: "整地播种期", source_stage_name: "整地播种期", start: "2026-09-14", end_inclusive: "2026-10-10", end_exclusive: "2026-10-11", mapping_status: "NOT_APPLICABLE", phase_label: null, tags: [] },
    { name: "冬前分蘖期", source_stage_name: "冬前分蘖期", start: "2026-10-11", end_inclusive: "2026-11-20", end_exclusive: "2026-11-21", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "越冬期", source_stage_name: "越冬期", start: "2026-11-21", end_inclusive: "2027-02-15", end_exclusive: "2027-02-16", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: ["DORMANCY"] },
    { name: "返青期", source_stage_name: "返青期", start: "2027-02-16", end_inclusive: "2027-03-10", end_exclusive: "2027-03-11", mapping_status: "MAPPED", phase_label: "S1", phase_code: "VEG", tags: [] },
    { name: "拔节孕穗期", source_stage_name: "拔节孕穗期", start: "2027-03-11", end_inclusive: "2027-04-10", end_exclusive: "2027-04-11", mapping_status: "MAPPED", phase_label: "S2", phase_code: "TRANS", tags: [] },
  ],
};

function period(id: string, start: string, endInclusive: string, extras: Record<string, unknown> = {}) {
  return {
    period_id: id,
    label: `第${id}期`,
    start,
    end_inclusive: endInclusive,
    end_exclusive: addDays(endInclusive, 1),
    ...extras,
  };
}

const seasonPeriods = [
  period("1", "2026-09-14", "2026-09-27"),
  period("2", "2026-09-28", "2026-10-11"),
  period("5", "2026-11-09", "2026-11-22"),
  period("6", "2026-11-23", "2026-12-06"),
  period("12", "2027-02-15", "2027-02-28"),
  period("16", "2027-04-12", "2027-04-25", { has_eligible_optics: true }),
  period("17", "2027-04-26", "2027-05-09"),
];

test("keeps Smart task names and lists every stage name in the timeline view", () => {
  const stages = planStagesFromPayload(smartNamesPayload);
  assert.deepEqual(stages.map((row) => row.name), ["整地播种期", "冬前分蘖期", "越冬期", "返青期", "拔节孕穗期"]);
  assert.equal(stages[0].source_stage_name, "整地播种期");
  assert.equal(stages[1].source_stage_name, "冬前分蘖期");
  const view = buildPlanTimeline(stages, seasonPeriods[2], seasonPeriods);
  assert.deepEqual(view.stages.map((row) => row.name), ["整地播种期", "冬前分蘖期", "越冬期", "返青期", "拔节孕穗期"]);
  assert.ok(view.stages.every((row) => row.name.trim().length > 0));
  assert.ok(!view.stages.some((row) => row.name === "播种期"));
  assert.ok(!view.stages.some((row) => row.name === "分蘖期"));
});

test("places a clickable period dot at each biweek midpoint", () => {
  const stages = planStagesFromPayload(smartNamesPayload);
  const view = buildPlanTimeline(stages, seasonPeriods[2], seasonPeriods);
  assert.equal(view.periods.length, seasonPeriods.length);
  assert.deepEqual(view.periods.map((row) => row.period_id), seasonPeriods.map((row) => row.period_id));
  const fifth = view.periods.find((row) => row.period_id === "5");
  assert.ok(fifth);
  assert.equal(fifth!.mid, "2026-11-16");
  const span = Date.parse("2027-05-10T00:00:00Z") - Date.parse("2026-09-14T00:00:00Z");
  const expectedLeft = (Date.parse("2026-11-16T00:00:00Z") - Date.parse("2026-09-14T00:00:00Z")) / span;
  assert.ok(Math.abs(fifth!.left - expectedLeft) < 1e-9);
  assert.ok(fifth!.left > 0 && fifth!.left < 1);
  const first = view.periods[0];
  assert.equal(first.mid, "2026-09-21");
  assert.ok(first.left >= 0);
  const last = view.periods.at(-1)!;
  assert.ok(last.left <= 1);
  assert.equal(view.periods.filter((row) => !row.has_eligible_optics).length, 6);
  assert.equal(view.periods.find((row) => row.period_id === "16")?.has_eligible_optics, true);
});

test("period choices start at S1 while pre-monitoring stages stay on the timeline", () => {
  const stages = planStagesFromPayload(seasonPayload);
  assert.equal(monitoringStart(stages), "2026-10-16");
  const before = [
    period("1", "2026-09-20", "2026-10-03"),
    period("2", "2026-10-04", "2026-10-17"),
    period("3", "2026-10-18", "2026-10-31"),
    period("4", "2026-11-01", "2026-11-14"),
  ];
  const visible = periodsWithinMonitoring(before, stages);
  assert.deepEqual(visible.map((row) => row.period_id), ["2", "3", "4"]);
  assert.deepEqual(visible.map((row) => row.label), ["第1期", "第2期", "第3期"]);
  assert.equal(visible[0].start, "2026-10-04");
  const view = buildPlanTimeline(stages, visible[1], visible);
  assert.deepEqual(view.stages.slice(0, 2).map((row) => row.name), ["播种前准备", "播种期"]);
  assert.equal(view.stages[0].monitored, false);
  assert.deepEqual(view.periods.map((row) => row.period_id), ["2", "3", "4"]);
  assert.ok(view.periods[0].left > view.stages[0].left);

  const aligned = periodsWithinMonitoring(
    [period("1", "2026-10-16", "2026-10-29", { label: "第1期" })],
    stages,
  );
  assert.equal(aligned[0].label, "第1期");
  assert.equal(aligned[0].period_id, "1");
  assert.deepEqual(periodsWithinMonitoring(before, []), before);
});

test("selects the overlapping biweek, keeping the current period when it already sits in the window", () => {
  assert.equal(selectPeriodInWindow(seasonPeriods, "2026-10-11", "2026-11-21", "5")?.period_id, "5");
  assert.equal(selectPeriodInWindow(seasonPeriods, "2026-10-16", "2027-03-11", "5")?.period_id, "5");
  assert.equal(selectPeriodInWindow(seasonPeriods, "2026-09-14", "2026-10-11", "5")?.period_id, "1");
  const sowing = selectPeriodInWindow(seasonPeriods, "2026-09-14", "2026-10-11", "12");
  assert.equal(sowing?.period_id, "1");
  assert.equal(selectPeriodInWindow(seasonPeriods, "2027-04-11", "2027-05-20", "5")?.period_id, "16");
  assert.equal(selectPeriodInWindow(seasonPeriods, "2027-06-01", "2027-06-15", "5"), null);
  const tie = [
    period("a", "2026-11-01", "2026-11-14"),
    period("b", "2026-11-08", "2026-11-21"),
  ];
  // Both overlap Nov 8–14 by 7 days; the earlier start wins.
  assert.equal(selectPeriodInWindow(tie, "2026-11-08", "2026-11-15", null)?.period_id, "a");
});

test("live tab wires period selection into the plan timeline and keeps every stage name visible", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const component = readFileSync("src/components/biweekly/plan-timeline.tsx", "utf8");
  const css = readFileSync("src/components/biweekly/plan-timeline.module.css", "utf8");
  assert.match(tab, /onSelectPeriod=\{choosePeriod\}/);
  assert.match(tab, /periods=\{season\.periods\}/);
  assert.match(tab, /periodsWithinMonitoring/);
  assert.match(component, /onSelectPeriod/);
  assert.match(component, /<button/);
  assert.match(component, /aria-pressed/);
  assert.match(component, /view\.periods/);
  assert.match(component, /stage\.name/);
  assert.doesNotMatch(css, /@container\(max-width:36px\)\{\.stageName\{display:none\}\}/);
  assert.doesNotMatch(css, /\.stageName\{[^}]*display:none/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(tab, /ReportTimeline/);
  assert.doesNotMatch(component, /Mock排期/);
  assert.doesNotMatch(component, /Mock报告/);
});
