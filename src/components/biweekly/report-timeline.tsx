"use client";

import {useEffect,useState,type ReactNode} from "react";
import {ChevronLeft,ChevronRight,CornerDownLeft} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectGroup,SelectItem,SelectLabel,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from "@/components/ui/tooltip";
import type {AgronomicPhase,MockReport} from "@/lib/biweekly/mock-report";
import {addDays,buildWindowTimeline,dateRatio,focusWindow,selectGrowthPeriod,selectPhase,shiftWindow} from "@/lib/biweekly/timeline";
import t from "./report-timeline.module.css";

type Selection={growthId:string;reportId:string|null};
const md=(date:string)=>date.slice(5).replace("-",".");
const pct=(ratio:number)=>`${ratio*100}%`;
const position=(item:{left:number;width:number})=>({left:pct(item.left),width:pct(item.width)});
const phaseName=(phase:AgronomicPhase)=>phase.label==="S2"?"并进阶段":phase.name;
function Tip({label,children}:{label:string;children:ReactNode}) {
 return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent className={t.tip}>{label}</TooltipContent></Tooltip>;
}
/** The overview and explicitly labelled focus window have independent, honest date scales. */
export function ReportTimeline({phases,reports,selection,onSelect}:{phases:AgronomicPhase[];reports:MockReport[];selection:Selection;onSelect:(value:Selection)=>void}) {
 const growth=phases.flatMap(p=>p.growthPeriods).find(g=>g.id===selection.growthId)!;
 const selected=reports.find(r=>r.id===selection.reportId);
 const anchor=selected?.start??growth.start;
 const [start,setStart]=useState(()=>focusWindow(phases,anchor).start);
 useEffect(()=>setStart(focusWindow(phases,anchor).start),[phases,anchor]);
 const view=buildWindowTimeline(phases,reports,start);
 const activePhase=phases.find(p=>p.growthPeriods.some(g=>g.id===growth.id))!;
 const anchorVisible=anchor>=view.start&&anchor<view.end;
 const move=(direction:-1|1)=>setStart(shiftWindow(phases,view.start,direction).start);
 return <TooltipProvider delayDuration={250}><section className={t.timeline} aria-label="农艺阶段与报告时间轴">
  <div className={t.overviewHeader}><span>全季概览 <small className={t.seasonDate}>{view.seasonStart} — {addDays(view.seasonEnd,-1)}</small></span>
   <Select value={growth.id} onValueChange={id=>onSelect(selectGrowthPeriod(id,reports))}>
    <SelectTrigger className={t.growthTrigger} aria-label="选择生育期，含未来空期"><SelectValue>{growth.name}</SelectValue></SelectTrigger>
    <SelectContent align="end" collisionPadding={12} className={t.popup}>{phases.map(p=><SelectGroup key={p.code}><SelectLabel>{p.label} {phaseName(p)}</SelectLabel>{p.growthPeriods.map(g=><SelectItem key={g.id} value={g.id}>{g.name} · {md(g.start)}–{md(addDays(g.end,-1))}{g.reports.length?` · ${g.reports.length}份`:" · 暂无"}</SelectItem>)}</SelectGroup>)}</SelectContent>
   </Select>
  </div>
  <div className={t.overview} role="group" aria-label="全季阶段，宽度按日期比例">
   {view.overview.map(p=><Tip key={p.code} label={`${p.label} ${phaseName(p)} · ${p.start}至${addDays(p.end,-1)}`}><Button type="button" variant="ghost" className={`${t.overviewBand} ${t[p.code]}`} style={position(p)} aria-pressed={activePhase.code===p.code} aria-label={`${p.label} ${phaseName(p)}`} onClick={()=>onSelect(selectPhase(p,reports))}><span>{p.label}</span><strong className={t.overviewName}>{phaseName(p)}</strong></Button></Tip>)}
   <span className={t.windowRange} style={{left:pct(view.windowLeft),width:pct(view.windowWidth)}} aria-hidden="true"/>
   <span className={t.overviewCursor} style={{left:pct(dateRatio(anchor,view.seasonStart,view.seasonEnd))}} aria-hidden="true"/>
  </div>
  <div className={t.legend} aria-hidden="true">{phases.map(p=><span key={p.code} data-selected={activePhase.code===p.code}>{p.label} {phaseName(p)}</span>)}</div>
  <div className={t.focusHeader}><span>焦点 {md(view.start)}–{md(addDays(view.end,-1))} <small>· {view.days}日 / 报告点</small></span><div>
   <Tip label="前移28日窗口"><Button type="button" variant="ghost" size="icon" className={t.windowButton} disabled={view.start===view.seasonStart} aria-label="前移时间轴窗口" onClick={()=>move(-1)}><ChevronLeft size={14}/></Button></Tip>
   <Tip label="回到所选日期"><Button type="button" variant="ghost" size="icon" className={t.windowButton} disabled={anchorVisible} aria-label="回到所选日期" onClick={()=>setStart(focusWindow(phases,anchor).start)}><CornerDownLeft size={13}/></Button></Tip>
   <Tip label="后移28日窗口"><Button type="button" variant="ghost" size="icon" className={t.windowButton} disabled={view.end===view.seasonEnd} aria-label="后移时间轴窗口" onClick={()=>move(1)}><ChevronRight size={14}/></Button></Tip>
  </div></div>
  <div className={t.canvas} aria-label="焦点时间轴：阶段、生育期、日期尺与报告记录对齐">
   <div className={t.stageRow}>{view.phases.map(p=><Tip key={p.code} label={`${p.label} ${phaseName(p)}`}><Button type="button" variant="ghost" className={`${t.stageBand} ${t[p.code]}`} style={position(p)} aria-pressed={activePhase.code===p.code} aria-label={`${p.label} ${phaseName(p)}`} onClick={()=>onSelect(selectPhase(p,reports))}><span className={t.stageCode}>{p.label}</span><span className={t.stageName}>{phaseName(p)}</span></Button></Tip>)}</div>
   <div className={t.growthRow}>{view.periods.map(g=><Tip key={g.id} label={`${g.name} · ${g.start}至${addDays(g.end,-1)} · ${g.reports.length}份报告`}><Button type="button" variant="ghost" className={`${t.period} ${t[g.phaseCode]}`} style={position(g)} aria-pressed={growth.id===g.id} aria-label={`${g.name}，${g.reports.length}份报告`} onClick={()=>onSelect(selectGrowthPeriod(g.id,reports))}><span className={t.periodName}>{g.name.replaceAll(" / ","/")}</span></Button></Tip>)}</div>
   <div className={t.ruler} aria-hidden="true">{view.minorTicks.map(left=><i key={left} style={{left:pct(left)}}/>)}{view.ticks.map(tick=><time key={tick.date} dateTime={tick.date} data-align={tick.align} style={{left:pct(tick.left)}}>{md(tick.date)}</time>)}</div>
   <div className={t.recordLine} aria-hidden="true"/>
   {view.records.map(record=><Tip key={record.report.id} label={`${record.report.label} · ${record.report.start} · 主归属${phases.flatMap(p=>p.growthPeriods).find(g=>g.id===record.report.primaryGrowthPeriod)?.name}`}><Button type="button" variant="ghost" className={t.dot} style={{left:pct(record.left)}} aria-pressed={selected?.id===record.report.id} aria-label={`${record.report.label}报告记录，起始日${record.report.start}`} onClick={()=>onSelect({growthId:record.report.primaryGrowthPeriod,reportId:record.report.id})}><i/><time dateTime={record.report.start}>{md(record.report.start)}</time></Button></Tip>)}
   {anchorVisible&&<span className={t.cursor} style={{left:pct(dateRatio(anchor,view.start,view.end))}} aria-hidden="true"/>}
  </div>
  {view.records.length===0&&<p className={t.footnote}>此窗口暂无报告记录</p>}
 </section></TooltipProvider>;
}
