"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addDays,
  buildPlanTimeline,
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
}: {
  stages: PlanStage[];
  period?: PlanPeriodMarker | null;
}) {
  const view = buildPlanTimeline(stages, period);
  if (view.empty) {
    return <p className={t.empty} role="status">本季种植方案暂无生育期日期。</p>;
  }
  const endInclusive = addDays(view.end, -1);
  return (
    <TooltipProvider delayDuration={250}>
      <section className={t.timeline} aria-label="本田方案生育期时间轴">
        <div className={t.caption}>本田方案生育期 <small>{view.start} — {endInclusive}</small></div>
        <div className={t.track} aria-label="S1 至 S3">
          {view.phases.map((phase) => (
            <Tip key={phase.label} label={`${phase.label} ${phase.name} · ${phase.start}–${addDays(phase.end, -1)}`}>
              <div className={`${t.phaseBand} ${t[PHASE_CLASS[phase.label]]}`} style={position(phase)}>
                <span className={t.phaseCode}>{phase.label}</span>
                <span className={t.phaseName}>{phase.name}</span>
              </div>
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
                <div
                  className={`${t.stageBand} ${stage.monitored && stage.phase_label ? t[PHASE_CLASS[stage.phase_label]] : t.unmonitored}`}
                  style={position(stage)}
                  data-monitored={stage.monitored ? "true" : "false"}
                >
                  <span className={t.stageName}>{stage.name}</span>
                </div>
              </Tip>
            );
          })}
          {view.period ? <span className={t.periodMark} style={position(view.period)} aria-hidden="true" /> : null}
        </div>
        <div className={t.ruler} aria-hidden="true">
          {view.ticks.map((tick) => (
            <time key={`${tick.align}-${tick.date}`} dateTime={tick.date} data-align={tick.align} style={{ left: pct(tick.left) }}>
              {md(tick.date)}
            </time>
          ))}
        </div>
        {view.period ? (
          <p className={t.periodCaption}>
            当前{view.period.label} {range(view.period.start, view.period.end_inclusive)}
          </p>
        ) : null}
      </section>
    </TooltipProvider>
  );
}
