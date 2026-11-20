"use client";

import { useId, useState } from "react";
import { Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { METRIC_LABELS, formatMetric, type MetricKey, type MockReport } from "@/lib/biweekly/mock-report";
import s from "./mock-report.module.css";
const shortDate=(date:string)=>date.slice(5).replace("-",".");
function Trend({report,metric}:{report:MockReport;metric:MetricKey}) {
 const values=report.series.map(p=>p[metric]); const min=Math.min(...values)*0.85;const max=Math.max(...values)*1.08;
 const y=(v:number)=>154-(v-min)/(max-min)*115;const points=values.map((v,i)=>`${52+i*92},${y(v)}`).join(" ");
 return <svg viewBox="0 0 560 210" role="img" aria-label={`${METRIC_LABELS[metric]}模拟观测趋势`} className={s.chart}>
 <defs><linearGradient id={`area-${report.id}-${metric}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#369e75" stopOpacity=".22"/><stop offset="100%" stopColor="#369e75" stopOpacity="0"/></linearGradient></defs>
 {[0,1,2].map(i=><g key={i}><line x1="50" y1={40+i*55} x2="522" y2={40+i*55} stroke="#e3eae6" strokeDasharray="4 5"/><text x="3" y={44+i*55} fill="#76867d" fontSize="11">{formatMetric(metric,max-i*(max-min)/2)}</text></g>)}
 <rect x="285" y="22" width="240" height="143" fill="#e9f4ee" opacity=".45"/><text x="297" y="36" fontSize="10" fill="#5c856e">本期统计窗口</text>
 <polygon points={`52,165 ${points} 512,165`} fill={`url(#area-${report.id}-${metric})`}/><polyline points={points} fill="none" stroke="#24845e" strokeWidth="3" strokeLinejoin="round"/>
 {report.series.map((p,i)=><g key={p.date}><circle cx={52+i*92} cy={y(p[metric])} r="5" fill="#fff" stroke="#24845e" strokeWidth="2"><title>{p.date}：{formatMetric(metric,p[metric])}（模拟）</title></circle><text x={52+i*92} y="191" textAnchor="middle" fill="#6c7c72" fontSize="11">{shortDate(p.date)}</text></g>)}
 </svg>;
}
function PixelMap({report,metric}:{report:MockReport;metric:MetricKey}) {
 const clipId=useId().replace(/:/g, "");
 const colors=metric==="fvc"?["#d4e2a4","#a9cc81","#7ab66f","#4c9b64","#2b7c52"]:metric==="lai"?["#d8e5b3","#b3d59e","#7cb99c","#489995","#2f7d81"]:["#dce6b3","#b7d78e","#88bd70","#57a064","#2c7e54"];
 return <div className={s.pixelPanel}><div className={s.mapTag}><Layers3 size={12}/>模拟像元示意 · 非卫星影像</div><svg viewBox="0 0 400 230" role="img" aria-label={`${METRIC_LABELS[metric]}模拟空间分布，非真实地块`}>
 <defs><clipPath id={`parcel-${clipId}`}><path d="M65 39L286 20L356 77L334 192L106 211L37 152Z"/></clipPath></defs>
 <path d="M0 15L400 190M0 70L350 230M25 0L400 165" stroke="#d4ded2" strokeWidth="15"/><g clipPath={`url(#parcel-${clipId})`}>{Array.from({length:120},(_,i)=><rect key={i} x={30+(i%15)*23} y={15+Math.floor(i/15)*25} width="22" height="24" fill={colors[(i*7+Math.floor(i/15)+Number(report.period)+(metric==="lai"?2:0))%5]}/>)}</g><path d="M65 39L286 20L356 77L334 192L106 211L37 152Z" fill="none" stroke="#fff" strokeWidth="4"/><circle cx="109" cy="146" r="18" fill="none" stroke="#e9af55" strokeWidth="2" strokeDasharray="4 3"/><text x="92" y="150" fill="#fff" fontSize="10" fontWeight="bold">A区</text><text x="367" y="28" fontSize="12" fill="#53665a">N ↑</text></svg><div className={s.legend}><span>相对偏低</span><div>{colors.map(c=><i key={c} style={{background:c}}/>)}</div><span>相对偏高</span></div></div>;
}

/** Concise raw-data view. Detailed mock interpretation is a separate PDF artifact. */
export function MockReportContent({report}:{report:MockReport}) {
 const [metric,setMetric]=useState<MetricKey>("fvc");
 const values=[
  ["NDVI",report.ndvi.toFixed(2),"冠层绿度 · Mock"],
  ["FVC",`${Math.round(report.fvc*100)}%`,"覆盖估计 · 未验证"],
  ["LAI",report.lai.toFixed(2),"叶面积估计 · 未验证"],
  ["NDRE",report.ndre.toFixed(2),"红边指数 · Mock"],
 ];
 return <article className={s.reader} lang="zh-CN">
  <header className={s.reportHeader}><h3>{report.label} · 原始数据</h3><p>{report.field} · {report.start} — {report.series.at(-1)!.date}（中国时间）</p></header>
  <dl className={s.metrics}>{values.map(([label,value,note])=><div key={label}><dt>{label}</dt><dd>{value}</dd><small>{note}</small></div>)}</dl>
  <section className={s.section}><h4>遥感指标与空间示意</h4><div className={s.metricSwitch} aria-label="遥感指标选择">{(["fvc","ndvi","lai"] as const).map(key=><Button key={key} type="button" variant="ghost" size="sm" aria-pressed={metric===key} onClick={()=>setMetric(key)}>{key.toUpperCase()}</Button>)}</div><div className={s.chartGrid}><Trend report={report} metric={metric}/><PixelMap report={report} metric={metric}/></div><p className={s.note}>模拟观测 {report.validDays} 日 · 有效像元 {Math.round(report.validFraction*100)}% · 间隔 {report.gapDays} 天。</p></section>
  <section className={s.section}><h4>天气、历史与周边参照</h4><dl className={s.evidence}>
   <div><dt>本期模拟降水</dt><dd>{report.rainTotal} mm</dd></div><div><dt>历史同期模拟降水</dt><dd>{report.historicRain} mm</dd></div><div><dt>上期模拟FVC</dt><dd>{Math.round(report.previousFvc*100)}%</dd></div><div><dt>历史同期模拟FVC</dt><dd>{Math.round(report.historicFvc*100)}%</dd></div><div><dt>周边模拟FVC</dt><dd>{Math.round(report.peerFvc*100)}%</dd></div><div><dt>模拟平均气温</dt><dd>{(report.weather.reduce((n,d)=>n+d.temp,0)/report.weather.length).toFixed(1)} °C</dd></div>
  </dl><p className={s.note}>虚构参照；逐日天气与详细解读见Mock PDF。</p></section>
  <section className={s.section}><h4>质量与使用边界</h4><ul className={s.limits}><li>固定虚构数据，不读取当前地块；阶段排期非实测。</li><li>FVC / LAI 未验证，无地面真值；PSRI未启用。</li><li>缺少灌溉、墒情和灾害证据，不判断灾害、产量或损失。</li></ul></section>
 </article>;
}
