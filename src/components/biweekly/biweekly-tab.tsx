"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MOCK_REPORTS, getPhaseTree, growthPeriodNames, type CropKey, type MockReport } from "@/lib/biweekly/mock-report";
import { addDays, adjacentReport, getGrowthReports, selectGrowthPeriod, selectPhase } from "@/lib/biweekly/timeline";
import { MockReportContent } from "./mock-report";
import { MockPdfDownload } from "./mock-pdf-download";
import s from "./biweekly-tab.module.css";

const md=(date:string)=>date.slice(5).replace("-",".");
const range=(start:string,end:string)=>`${md(start)}–${md(addDays(end,-1))}`;

export default function BiweeklyTab() {
 const [crop,setCrop]=useState<CropKey>("wheat");
 const [selection,setSelection]=useState<{growthId:string;reportId:string|null}>({growthId:"jointing",reportId:"wheat-4"});
 const reports=MOCK_REPORTS.filter(r=>r.crop===crop);
 const phases=getPhaseTree(crop);
 const phase=phases.find(p=>p.growthPeriods.some(g=>g.id===selection.growthId))!;
 const growth=phase.growthPeriods.find(g=>g.id===selection.growthId)!;
 const filtered=getGrowthReports(selection.growthId,reports);
 const selected=filtered.find(r=>r.id===selection.reportId);
 const previous=adjacentReport(filtered,selected?.id??null,-1,growth.start);
 const next=adjacentReport(filtered,selected?.id??null,1,growth.start);
 const chooseReport=(report:MockReport)=>setSelection({growthId:report.primaryGrowthPeriod,reportId:report.id});
 const phaseStart=phase.growthPeriods[0].start;
 const phaseEnd=addDays(phase.growthPeriods.at(-1)!.end,-1);

 return <div className={s.frame}><section className={s.root} aria-label="种植双周报原型" lang="zh-CN">
  <header className={s.header}>
   <h2>种植双周报 <span className={s.mock}>MOCK</span></h2>
   <div className={s.crop}>
    <Select value={crop} onValueChange={value=>{if(value!=="wheat"&&value!=="maize")return;setCrop(value);setSelection({growthId:value==="wheat"?"jointing":"ear",reportId:`${value}-4`});}}>
     <SelectTrigger className={s.selectTrigger} aria-label="示例种植季"><SelectValue/></SelectTrigger>
     <SelectContent align="end" collisionPadding={12} className={s.selectPopup}>
      <SelectItem className={s.selectItem} value="wheat">冬小麦 · 2026/27</SelectItem>
      <SelectItem className={s.selectItem} value="maize">玉米 · 2027夏播</SelectItem>
     </SelectContent>
    </Select>
   </div>
  </header>
  <p className={s.disclaimer}>虚构数据与排期，非当前地块；未调用AI。</p>
  <div className={s.timelineCaption}><span>农艺阶段导航 · 非等比</span><span>{phaseStart.replaceAll("-",".")}–{phaseEnd.replaceAll("-",".")}</span></div>
  <div className={s.phases} role="group" aria-label="农艺阶段导航，非时长比例">
   {phases.map(item=><Button key={item.code} type="button" variant="ghost" size="sm" className={s.phase} aria-pressed={phase.code===item.code} aria-label={`${item.label} ${item.name}`} onClick={()=>{if(item.code!==phase.code)setSelection(selectPhase(item,reports));}}>
    <span>{item.label}</span><strong>{item.label==="S2"?"并进阶段":item.name}</strong>
   </Button>)}
  </div>
  <div className={s.periods} role="group" aria-label={`${phase.label}生育期`}>
   {phase.growthPeriods.map(period=><Button key={period.id} type="button" variant="ghost" size="sm" className={s.period} aria-pressed={period.id===selection.growthId} aria-label={`${period.name}，${period.start}至${addDays(period.end,-1)}，${period.reports.length}份报告`} onClick={()=>setSelection(selectGrowthPeriod(period.id,reports))}>
    <strong>{period.name}</strong><small><span>{range(period.start,period.end)}</span><span>{period.reports.length?`${period.reports.length}份`:"暂无"}</span></small>
   </Button>)}
  </div>
  {filtered.length>0&&<div className={s.reportToolbar}>
   <div className={s.reportRow} role="group" aria-label="本生育期报告">
   <Select value={selected?.id} onValueChange={id=>{const report=filtered.find(r=>r.id===id);if(report)chooseReport(report);}}>
    <SelectTrigger className={s.selectTrigger} aria-label="选择本生育期报告"><SelectValue/></SelectTrigger>
    <SelectContent align="start" collisionPadding={12} className={s.selectPopup}>
     {filtered.map(report=><SelectItem className={s.selectItem} key={report.id} value={report.id} aria-label={`${report.label}，${report.start}至${addDays(report.end,-1)}`}>{report.label} · {range(report.start,report.end)}</SelectItem>)}
    </SelectContent>
   </Select>
   <TooltipProvider delayDuration={300}>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={s.navButton} aria-label="本生育期上一份报告" disabled={!previous} onClick={()=>previous&&chooseReport(previous)}><ChevronLeft size={15} aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>本生育期上一份</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={s.navButton} aria-label="本生育期下一份报告" disabled={!next} onClick={()=>next&&chooseReport(next)}><ChevronRight size={15} aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>本生育期下一份</TooltipContent></Tooltip>
   </TooltipProvider>
   </div>
   {selected&&<MockPdfDownload key={`pdf-${selected.id}`} report={selected}/>}
  </div>}
  <div className={s.content} aria-live="polite">{selected?<>
   {selected.coveredGrowthPeriods.length>1&&<p className={s.cross}>跨期：{growthPeriodNames(crop,selected.coveredGrowthPeriods)}；主归属{growth.name}，仅此一份。</p>}
   <MockReportContent key={selected.id} report={selected}/>
  </>:<p className={s.empty}>{growth.name}暂无报告。</p>}</div>
 </section></div>;
}
