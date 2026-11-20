"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, FileText, Sprout } from "lucide-react";
import { getPhaseTree, growthPeriodNames } from "@/lib/biweekly/mock-report";
import { getMockReport, type CropKey } from "@/lib/biweekly/mock-report";
import { MockReportContent } from "./mock-report";
import s from "./biweekly-tab.module.css";

function Disclosure({ title, children, expanded=false }: {title: ReactNode; children: ReactNode; expanded?: boolean}) {
 const [open,setOpen]=useState(expanded);
 return <details className={s.disclosure} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary>{title}<ChevronDown size={14} aria-hidden="true"/></summary>{children}
 </details>;
}

export default function BiweeklyTab() {
 const [crop,setCrop]=useState<CropKey>("wheat");
 const [period,setPeriod]=useState("4");
 const tree=getPhaseTree(crop);
 const selected=getMockReport(crop,period);
 return <section className={s.root} aria-label="种植双周报原型" lang="zh-CN">
  <header className={s.header}><div className={s.heading}><Sprout size={20}/><h2>种植双周报</h2><span>MOCK</span></div>
   <p>纯前端交互原型 · 全部为独立虚拟地块数据，不代表当前地块。当前模拟进度：S2。</p>
   <label>示例种植季<select value={crop} onChange={e=>{setCrop(e.target.value as CropKey);setPeriod("4");}}><option value="wheat">冬小麦 · 2026 / 27 季</option><option value="maize">玉米 · 2027 夏播季</option></select></label>
   <small>S1 / S2 / S3 为农艺阶段，不是 Sentinel 卫星传感器；日期与划分仅供原型展示。</small>
  </header>
  <div className={s.timeline}>
   {tree.map(phase=>{
    const count=phase.growthPeriods.reduce((n,g)=>n+g.reports.length,0);
    return <Disclosure key={`${crop}-${phase.code}`} expanded={phase.code!=="VEG"} title={<span className={s.phaseTitle}><b>{phase.label}</b><strong>{phase.name}</strong><em>{phase.code==="TRANS"?"模拟当前阶段":count?`${count} 份报告`:"待生成 · 0 份"}</em><small>{phase.growthPeriods.map(g=>g.name).join(" / ")}</small></span>}>
     <div className={s.periods}>{phase.growthPeriods.map(growth=><Disclosure key={`${crop}-${growth.id}`} expanded={growth.id===selected.primaryGrowthPeriod||growth.reports.length===0} title={<span className={s.growthTitle}><strong>{growth.name}</strong><span>{growth.reports.length} 份</span><small>模拟排期 · {growth.timing}</small></span>}>
      {growth.reports.length===0?<p className={s.empty}>{phase.code==="REPRO"||growth.id==="booting"?"尚未进入该模拟生育期，暂无报告。":"该示例生育期暂无报告。"} 不补造观测、不触发生成。</p>:<div className={s.reports} aria-label={`${growth.name}的双周报`}>
       {growth.reports.map(report=><button key={report.id} type="button" aria-pressed={selected.id===report.id} className={selected.id===report.id?s.selected:s.report} onClick={()=>setPeriod(report.period)}><FileText size={14}/><span><strong>{report.label}</strong><small>{report.start} — {report.end}（不含）</small>{report.coveredGrowthPeriods.length>1&&<em>跨期覆盖：{growthPeriodNames(crop,report.coveredGrowthPeriods)}；主归属：{growth.name}，按起始日归档，仅列一次</em>}</span><b>{selected.id===report.id?"阅读中":"阅读"}</b></button>)}
      </div>}
     </Disclosure>)}</div>
    </Disclosure>;
   })}
  </div>
  <div className={s.content} id="bw-selected-report" aria-live="polite"><p className={s.reading}>当前阅读：{selected.label} · 归档生育期：{growthPeriodNames(crop,[selected.primaryGrowthPeriod])}</p><MockReportContent key={selected.id} report={selected}/></div>
  <footer className={s.footer}>全部报告已预置为 Mock，无查询、无生成、无真实农情结论。FVC / LAI 为未验证的概念值。</footer>
 </section>;
}
