"use client";

import {useEffect,useState,type ReactNode} from "react";
import {ChevronLeft,ChevronRight,CornerDownLeft} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectGroup,SelectItem,SelectLabel,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from "@/components/ui/tooltip";
import {growthPeriodNames,type AgronomicPhase,type MockReport} from "@/lib/biweekly/mock-report";
import {addDays,buildWindowTimeline,cursorWithinInterval,dateRatio,focusWindow,selectGrowthPeriod,selectPhase,shiftWindow,timelineDateLabels} from "@/lib/biweekly/timeline";
import t from "./report-timeline.module.css";

type Selection={growthId:string;reportId:string|null};
const md=(date:string)=>date.slice(5).replace("-",".");
const pct=(ratio:number)=>`${ratio*100}%`;
const position=(item:{left:number;width:number})=>({left:pct(item.left),width:pct(item.width)});
const phaseName=(phase:AgronomicPhase)=>phase.label==="S2"?"并进阶段":phase.name;
const fullRange=(start:string,end:string)=>`${start} 至 ${addDays(end,-1)}`;
function Tip({label,children}:{label:string;children:ReactNode}) {
 return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent collisionPadding={12} sideOffset={6} className={t.tip}>{label}</TooltipContent></Tooltip>;
}
/** Local layers keep the exact date line beneath readable labels, not over their glyphs. */
function IntervalCursor({anchor,interval}:{anchor:number|null;interval:{left:number;width:number}}) {
 const local=anchor===null?null:cursorWithinInterval(anchor,interval);
 return local===null?null:<span className={t.intervalCursor} style={{left:pct(local)}} aria-hidden="true"/>;
}
/** The overview and explicitly labelled focus window have independent, honest date scales. */
export function ReportTimeline({phases,reports,selection,onSelect}:{phases:AgronomicPhase[];reports:MockReport[];selection:Selection;onSelect:(value:Selection)=>void}) {
 const periods=phases.flatMap(p=>p.growthPeriods);
 const growth=periods.find(g=>g.id===selection.growthId)!;
 const selected=reports.find(r=>r.id===selection.reportId);
 const anchor=selected?.start??growth.start;
 const [start,setStart]=useState(()=>focusWindow(phases,anchor).start);
 useEffect(()=>setStart(focusWindow(phases,anchor).start),[phases,anchor]);
 const view=buildWindowTimeline(phases,reports,start);
 const activePhase=phases.find(p=>p.growthPeriods.some(g=>g.id===growth.id))!;
 const anchorVisible=anchor>=view.start&&anchor<view.end;
 const focusAnchor=anchorVisible?dateRatio(anchor,view.start,view.end):null;
 const overviewAnchor=dateRatio(anchor,view.seasonStart,view.seasonEnd);
 const dates=timelineDateLabels(view.start,view.end);
 const previous=shiftWindow(phases,view.start,-1),next=shiftWindow(phases,view.start,1);
 const locate=()=>setStart(focusWindow(phases,anchor).start);
 const move=(direction:-1|1)=>setStart(shiftWindow(phases,view.start,direction).start);
 return <TooltipProvider delayDuration={250}><section className={t.timeline} aria-label="农艺阶段与报告时间轴">
  <div className={t.overviewHeader}><span>全季概览 <small className={t.seasonDate}>{view.seasonStart} — {addDays(view.seasonEnd,-1)}</small></span>
   <Select value={growth.id} onValueChange={id=>onSelect(selectGrowthPeriod(id,reports))}>
    <SelectTrigger className={t.growthTrigger} aria-label="选择生育期，含未来空期"><SelectValue>{growth.name}</SelectValue></SelectTrigger>
    <SelectContent align="end" collisionPadding={12} className={t.popup}>{phases.map(p=><SelectGroup key={p.code}><SelectLabel>{p.label} {phaseName(p)}</SelectLabel>{p.growthPeriods.map(g=><SelectItem key={g.id} value={g.id} textValue={`${g.name} ${g.start}`} aria-label={`${g.name}，${fullRange(g.start,g.end)}，主归属报告${g.reports.length}份`}><span className={t.optionName}>{g.name}</span><span className={t.optionMeta}><time dateTime={g.start}>{md(g.start)}</time>–<time dateTime={addDays(g.end,-1)}>{md(addDays(g.end,-1))}</time> · {g.reports.length?`${g.reports.length}份报告`:"暂无报告"}</span></SelectItem>)}</SelectGroup>)}</SelectContent>
   </Select>
  </div>
  <div className={t.overview} role="group" aria-label="全季阶段，宽度按日期比例，细框为当前焦点窗口">
   {view.overview.map(p=><Tip key={p.code} label={`${p.label} ${phaseName(p)} · ${fullRange(p.start,p.end)} · Mock排期，点击查看本阶段`}><Button type="button" variant="ghost" className={`${t.overviewBand} ${t[p.code]}`} style={position(p)} aria-pressed={activePhase.code===p.code} aria-label={`${p.label} ${phaseName(p)}`} onClick={()=>onSelect(selectPhase(p,reports))}><IntervalCursor anchor={overviewAnchor} interval={p}/><span className={t.codeLabel}>{p.label}</span><strong className={t.overviewName}>{phaseName(p)}</strong></Button></Tip>)}
   <span className={t.windowRange} style={{left:pct(view.windowLeft),width:pct(view.windowWidth)}} aria-hidden="true"/>
  </div>
  <div className={t.legend} aria-hidden="true">{phases.map(p=><span key={p.code} data-selected={activePhase.code===p.code}>{p.label} {phaseName(p)}</span>)}</div>
  <div className={t.focusHeader}>
   <div className={t.focusCaption}><span className={t.focusRange}>焦点 <time dateTime={view.start}>{dates.from}</time>–<time dateTime={addDays(view.end,-1)}>{dates.to}</time></span><small>{view.days}日 · 圆点为报告</small></div>
   <div className={t.windowControls} role="group" aria-label="浏览时间轴窗口，不改变所选报告">
    <Tip label={`前移28日 · ${fullRange(previous.start,previous.end)}`}><Button type="button" variant="ghost" size="icon" className={t.windowButton} disabled={view.start===view.seasonStart} aria-label={view.start===view.seasonStart?"前移时间轴窗口（已到季初）":"前移时间轴窗口"} onClick={()=>move(-1)}><ChevronLeft size={14}/></Button></Tip>
    <Tip label={`后移28日 · ${fullRange(next.start,next.end)}`}><Button type="button" variant="ghost" size="icon" className={t.windowButton} disabled={view.end===view.seasonEnd} aria-label={view.end===view.seasonEnd?"后移时间轴窗口（已到季末）":"后移时间轴窗口"} onClick={()=>move(1)}><ChevronRight size={14}/></Button></Tip>
   </div>
  </div>
  {!anchorVisible&&<div className={t.offWindow} role="status"><span>已选{selected?.label??growth.name} · <time dateTime={anchor}>{anchor}</time> 在当前窗口外</span><Button type="button" variant="link" className={t.locateButton} onClick={locate}><CornerDownLeft size={12}/>定位所选</Button></div>}
  <div className={t.canvas} aria-label={`焦点时间轴：${fullRange(view.start,view.end)}，阶段、生育期、日期尺与报告记录对齐`}>
   <div className={t.stageRow}>{view.phases.map(p=><Tip key={p.code} label={`${p.label} ${phaseName(p)} · ${fullRange(p.start,p.end)} · Mock排期`}><Button type="button" variant="ghost" className={`${t.stageBand} ${t[p.code]}`} style={position(p)} aria-pressed={activePhase.code===p.code} aria-label={`${p.label} ${phaseName(p)}`} onClick={()=>onSelect(selectPhase(p,reports))}><IntervalCursor anchor={focusAnchor} interval={p}/><span className={t.stageCode}>{p.label}</span><span className={t.stageName}>{phaseName(p)}</span></Button></Tip>)}</div>
   <div className={t.growthRow}>{view.periods.map(g=><Tip key={g.id} label={`${g.name} · ${fullRange(g.start,g.end)} · ${g.reports.length?`主归属报告${g.reports.length}份`:"暂无Mock报告"} · Mock排期`}><Button type="button" variant="ghost" className={`${t.period} ${t[g.phaseCode]}`} style={position(g)} aria-pressed={growth.id===g.id} aria-label={`${g.name}，${g.reports.length}份报告`} onClick={()=>onSelect(selectGrowthPeriod(g.id,reports))}><IntervalCursor anchor={focusAnchor} interval={g}/><span className={t.periodName}>{g.name.replaceAll(" / ","/")}</span></Button></Tip>)}</div>
   <div className={t.ruler} aria-hidden="true">{view.minorTicks.map(left=><i key={left} style={{left:pct(left)}}/>)}{view.boundaryTicks.map(tick=><b key={tick.date} className={t.boundaryTick} style={{left:pct(tick.left)}}/>)}{view.ticks.map(tick=><time key={tick.date} dateTime={tick.date} data-align={tick.align} style={{left:pct(tick.left)}}>{md(tick.date)}</time>)}</div>
   <div className={t.recordLine} aria-hidden="true"/>
   {view.records.map(record=><Tip key={record.report.id} label={`${record.report.label} · ${fullRange(record.report.start,record.report.end)} · 主归属${periods.find(g=>g.id===record.report.primaryGrowthPeriod)?.name}${record.report.coveredGrowthPeriods.length>1?` · 跨期覆盖${growthPeriodNames(record.report.crop,record.report.coveredGrowthPeriods)}`:""} · Mock报告`}><Button type="button" variant="ghost" className={t.dot} style={{left:pct(record.left)}} aria-pressed={selected?.id===record.report.id} aria-label={`${record.report.label}报告记录，起始日${record.report.start}`} onClick={()=>onSelect({growthId:record.report.primaryGrowthPeriod,reportId:record.report.id})}><i aria-hidden="true"/><time dateTime={record.report.start}>{md(record.report.start)}</time></Button></Tip>)}
   {focusAnchor!==null&&<span className={t.cursor} style={{left:pct(focusAnchor)}} aria-hidden="true"/>}
  </div>
  {view.records.length===0&&<p className={t.footnote}>此窗口暂无报告记录，可前后浏览。</p>}
 </section></TooltipProvider>;
}
