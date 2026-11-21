"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MOCK_REPORTS, getPhaseTree, growthPeriodNames, type CropKey, type MockReport } from "@/lib/biweekly/mock-report";
import { addDays, adjacentReport, getGrowthReports } from "@/lib/biweekly/timeline";
import { ReportTimeline } from "./report-timeline";
import { MockReportContent } from "./mock-report";
import { MockPdfDownload } from "./mock-pdf-download";
import s from "./biweekly-tab.module.css";

const md=(date:string)=>date.slice(5).replace("-",".");
const range=(start:string,end:string)=>`${md(start)}–${md(addDays(end,-1))}`;

export default function BiweeklyTab() {
 const [crop,setCrop]=useState<CropKey>("wheat");
 const [selection,setSelection]=useState<{growthId:string;reportId:string|null}>({growthId:"jointing",reportId:"wheat-4"});
 const reports=useMemo(()=>MOCK_REPORTS.filter(r=>r.crop===crop),[crop]);
 const phases=useMemo(()=>getPhaseTree(crop),[crop]);
 const phase=phases.find(p=>p.growthPeriods.some(g=>g.id===selection.growthId))!;
 const growth=phase.growthPeriods.find(g=>g.id===selection.growthId)!;
 const filtered=getGrowthReports(selection.growthId,reports);
 const selected=filtered.find(r=>r.id===selection.reportId);
 const previous=adjacentReport(filtered,selected?.id??null,-1,growth.start);
 const next=adjacentReport(filtered,selected?.id??null,1,growth.start);
 const chooseReport=(report:MockReport)=>setSelection({growthId:report.primaryGrowthPeriod,reportId:report.id});

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
  <ReportTimeline phases={phases} reports={reports} selection={selection} onSelect={setSelection}/>
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
