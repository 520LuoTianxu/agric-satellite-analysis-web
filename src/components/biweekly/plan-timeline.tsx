"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays } from "@/lib/biweekly/timeline";
import {
  buildPlanTimeline,
  selectPeriodInWindow,
  type PlanPeriodMarker,
  type PlanStage,
} from "@/lib/biweekly/plan-timeline";
import t from "./plan-timeline.module.css";

const md = (date: string) => date.slice(5).replace("-", ".");
const pct = (ratio: number) => `${ratio * 100}%`;
const range = (start: string, endInclusive: string) => `${md(start)}–${md(endInclusive)}`;
const position = (item: { left: number; width: number }) => ({ left: pct(item.left), width: pct(item.width) });
const PHASE_CLASS = { S1: "VEG", S2: "TRANS", S3: "REPRO" } as const;

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent collisionPadding={12} sideOffset={6} className={t.tip}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PlanPhenologyTimeline({
  stages,
  period,
  periods = [],
  onSelectPeriod,
}: {
  stages: PlanStage[];
  period?: PlanPeriodMarker | null;
  periods?: PlanPeriodMarker[];
  onSelectPeriod?: (period: PlanPeriodMarker) => void;
}) {
  const view = buildPlanTimeline(stages, period, periods);
  if (view.empty) {
    return <p className={t.empty} role="status">本季种植方案暂无生育期日期。</p>;
  }
  const endInclusive = addDays(view.end, -1);
  const pickWindow = (start: string, endExclusive: string) => {
    const next = selectPeriodInWindow(periods, start, endExclusive, period?.period_id);
    if (next) onSelectPeriod?.(next);
  };
  return (
    <TooltipProvider delayDuration={250}>
      <section className={t.timeline} aria-label="本田方案生育期时间轴">
        <div className={t.caption}>本田方案生育期 <small>{view.start} — {endInclusive}</small></div>
        <div className={t.track} aria-label="S1 至 S3">
          {view.phases.map((phase) => (
            <Tip key={phase.label} label={`${phase.label} ${phase.name} · ${phase.start}–${addDays(phase.end, -1)}`}>
              <button
                type="button"
                className={`${t.phaseBand} ${t[PHASE_CLASS[phase.label]]}`}
                style={position(phase)}
                onClick={() => pickWindow(phase.start, phase.end)}
              >
                <span className={t.phaseCode}>{phase.label}</span>
                <span className={t.phaseName}>{phase.name}</span>
              </button>
            </Tip>
          ))}
          {view.period ? <span className={t.periodMark} style={position(view.period)} aria-hidden="true" /> : null}
        </div>
        <div className={t.legend} aria-hidden="true">
          {view.phases.map((phase) => (
            <span key={phase.label}>{phase.label} {phase.name}</span>
          ))}
          {view.stages.some((stage) => !stage.monitored) ? <span className={t.unmonitoredLegend}>未纳入监测</span> : null}
        </div>
        <div className={t.stageTrack} aria-label="生育期">
          {view.stages.map((stage) => {
            const phaseText = stage.monitored && stage.phase_label ? ` · ${stage.phase_label} ${stage.phase_name}` : " · 未纳入监测";
            return (
              <Tip key={stage.id} label={`${stage.name} · ${stage.start}–${stage.end_inclusive}${phaseText}`}>
                <button
                  type="button"
                  className={`${t.stageBand} ${stage.monitored && stage.phase_label ? t[PHASE_CLASS[stage.phase_label]] : t.unmonitored}`}
                  style={position(stage)}
                  data-monitored={stage.monitored ? "true" : "false"}
                  aria-label={`${stage.name}，${stage.start}至${stage.end_inclusive}`}
                  onClick={() => pickWindow(stage.start, stage.end_exclusive)}
                />
              </Tip>
            );
          })}
          {view.period ? <span className={t.periodMark} style={position(view.period)} aria-hidden="true" /> : null}
        </div>
        <div
          className={t.stageLabels}
          style={{ minHeight: `calc(${Math.max(view.labelLanes, 1)} * 1.35em)` }}
          aria-hidden="false"
        >
          {view.stages.map((stage) => (
            <span
              key={`label-${stage.id}`}
              className={t.stageName}
              data-lane={stage.labelLane}
              style={{ left: pct(stage.left + stage.width / 2), top: `calc(${stage.labelLane} * 1.35em)` }}
            >
              {stage.name}
            </span>
          ))}
        </div>
        <div className={t.ruler} aria-hidden="true">
          {view.ticks.map((tick) => (
            <time key={`${tick.align}-${tick.date}`} dateTime={tick.date} data-align={tick.align} style={{ left: pct(tick.left) }}>
              {md(tick.date)}
            </time>
          ))}
        </div>
        {view.periods.length > 0 ? (
          <div className={t.dotRow} role="group" aria-label="双周报周期">
            {view.periods.map((dot) => (
              <Tip key={dot.period_id} label={`${dot.label} ${range(dot.start, dot.end_inclusive)}`}>
                <button
                  type="button"
                  className={t.dot}
                  style={{ left: pct(dot.left) }}
                  aria-pressed={period?.period_id === dot.period_id}
                  aria-label={`${dot.label}，${dot.start}至${dot.end_inclusive}`}
                  data-optics={dot.has_eligible_optics ? "true" : "false"}
                  onClick={() => onSelectPeriod?.(dot)}
                >
                  <i aria-hidden="true" />
                </button>
              </Tip>
            ))}
          </div>
        ) : null}
        {view.period ? (
          <p className={t.periodCaption}>
            当前{view.period.label} {range(view.period.start, view.period.end_inclusive)}
          </p>
        ) : null}
      </section>
    </TooltipProvider>
  );
}
