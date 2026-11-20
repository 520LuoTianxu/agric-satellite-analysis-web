"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MOCK_REPORTS, getPhaseTree, growthPeriodNames, type CropKey, type MockReport } from "@/lib/biweekly/mock-report";
import { addDays, adjacentReport, buildTimeline, dateRatio, selectGrowthPeriod } from "@/lib/biweekly/timeline";
import { MockReportContent } from "./mock-report";
import { MockPdfDownload } from "./mock-pdf-download";
import s from "./biweekly-tab.module.css";
const md=(date:string)=>date.slice(5).replace("-",".");
const pct=(ratio:number)=>`${ratio*100}%`;

export default function BiweeklyTab() {
 const [crop,setCrop]=useState<CropKey>("wheat");
 const [selection,setSelection]=useState<{growthId:string;reportId:string|null}>({growthId:"jointing",reportId:"wheat-4"});
 const scrollRef=useRef<HTMLDivElement>(null);
 const reports=MOCK_REPORTS.filter(r=>r.crop===crop);
 const timeline=buildTimeline(getPhaseTree(crop),reports);
 const selected=reports.find(r=>r.id===selection.reportId);
 const growth=timeline.periods.find(g=>g.id===selection.growthId)!;
 const filtered=reports.filter(r=>r.primaryGrowthPeriod===selection.growthId);
 const cursorDate=selected?.start??growth.start;
 const cursor=dateRatio(cursorDate,timeline.start,timeline.end);
 const previous=adjacentReport(reports,selected?.id??null,-1,cursorDate);
 const next=adjacentReport(reports,selected?.id??null,1,cursorDate);
 const chooseReport=(report:MockReport)=>setSelection({growthId:report.primaryGrowthPeriod,reportId:report.id});
 useEffect(()=>{
  const node=scrollRef.current;
  if(!node)return;
  const center=()=>node.scrollTo({left:22+cursor*(node.scrollWidth-44)-node.clientWidth/2,behavior:"auto"});
  center();
  const observer=new ResizeObserver(center);
  observer.observe(node);
  return ()=>observer.disconnect();
 },[crop,cursor]);
 return <section className={s.root} aria-label="种植双周报原型" lang="zh-CN">
  <header className={s.header}><div><h2>种植双周报 <span className={s.mock}>MOCK</span></h2><p>独立虚拟地块 · 全部数值及生育期为示例，不代表当前地块</p></div><label className={s.crop}>示例种植季<select value={crop} onChange={e=>{const value=e.target.value as CropKey;setCrop(value);setSelection({growthId:value==="wheat"?"jointing":"ear",reportId:`${value}-4`});}}><option value="wheat">冬小麦 · 2026 / 27</option><option value="maize">玉米 · 2027 夏播</option></select></label></header>
  <div className={s.timelineHeader}><strong>生育期与报告时间轴</strong><div className={s.navigation}><button type="button" aria-label="上一份报告" disabled={!previous} onClick={()=>previous&&chooseReport(previous)}><ChevronLeft size={16}/></button><span>{selected?`${md(selected.start)} — ${md(addDays(selected.end,-1))}`:md(cursorDate)}</span><button type="button" aria-label="下一份报告" disabled={!next} onClick={()=>next&&chooseReport(next)}><ChevronRight size={16}/></button></div></div>
  <p className={s.hint}>S1 / S2 / S3 为农艺阶段，非卫星传感器。横向滑动查看全季，点击生育期或报告圆点。</p>
  <div className={s.scroll} ref={scrollRef} tabIndex={0} aria-label="种植季时间轴，可横向滚动">
   <div className={s.track} style={{width:timeline.minWidth}}><div className={s.canvas}>
    <div className={s.phases}>{timeline.phases.map(phase=><div key={phase.code} className={s[phase.code]} style={{left:pct(phase.left),width:pct(phase.width)}}><strong>{phase.label} {phase.name}</strong><small>{md(phase.start)} — {md(addDays(phase.end,-1))}</small></div>)}</div>
    <div className={s.periods}>{timeline.periods.map(period=><button key={period.id} type="button" className={s.period} aria-pressed={period.id===selection.growthId} aria-label={`${period.name}，${period.start}至${addDays(period.end,-1)}，${period.reports.length}份报告`} title={`${period.name} · ${period.timing} · ${period.reports.length}份报告`} style={{left:pct(period.left),width:pct(period.width)}} onClick={()=>setSelection(selectGrowthPeriod(period.id,reports))}><strong>{period.name.replace(/期/g,"").split(" / ")[0]}</strong><small>{md(period.start)}<br/>{md(addDays(period.end,-1))}</small></button>)}</div>
    <div className={s.ruler}>{timeline.months.map(month=><span key={month.date} style={{left:pct(month.left)}}>{month.label}</span>)}</div>
    <div className={s.recordLine}>{timeline.records.map(record=><button key={record.report.id} type="button" className={s.dot} aria-pressed={selected?.id===record.report.id} aria-label={`${record.report.label}，报告起始日${record.date}，主归属${growthPeriodNames(crop,[record.report.primaryGrowthPeriod])}`} title={`${record.report.label} · ${record.date}`} style={{left:pct(record.left)}} onClick={()=>chooseReport(record.report)}><i/><span>{md(record.date)}<small>{record.report.label}</small></span></button>)}</div>
    <div className={s.cursor} style={{left:pct(cursor)}} aria-hidden="true"><span>{md(cursorDate)}</span></div>
   </div></div>
  </div>
  <div className={s.selection}><div><strong>{growth.name}</strong><span> · {growth.start} — {addDays(growth.end,-1)}</span></div><small>报告记录按起始日定位 · {filtered.length} 份报告 · 排期均为Mock</small>{filtered.length>0&&<label>选择本生育期报告<select aria-label="选择本生育期报告" value={selected?.id??""} onChange={e=>{const report=reports.find(r=>r.id===e.target.value);if(report)chooseReport(report);}}>{filtered.map(report=><option key={report.id} value={report.id}>{report.label} · {report.start} — {addDays(report.end,-1)}</option>)}</select></label>}</div>
  <div id="bw-selected-report" className={s.content} aria-live="polite">{selected?<>
   {selected.coveredGrowthPeriods.length>1&&<p className={s.cross}>跨生育期：{growthPeriodNames(crop,selected.coveredGrowthPeriods)}。主归属{growth.name}，按起始日归档，仅此一份。</p>}
   <MockPdfDownload key={`pdf-${selected.id}`} report={selected}/>
   <MockReportContent key={selected.id} report={selected}/>
  </>:<p className={s.empty}>该模拟生育期暂无报告。未来报告不会补造；选择其他生育期或用上一份 / 下一份报告导航。</p>}</div>
 </section>;
}
