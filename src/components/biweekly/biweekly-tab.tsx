"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FieldTabSkeleton } from "@/components/field/field-tab-skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LOCAL_LAND_ID, LOCAL_SEASONS, adjacentPeriod, getLocalSeason, isMaizeCrop, type LocalPeriod } from "@/lib/biweekly/local-catalog";
import { downloadJob, getJob, getJobSummary, listPeriods, listSeasons, triggerBackfill, triggerBackfillSeason, triggerGenerate, usesLocalFixture } from "@/lib/biweekly/local-trigger";
import { downloadPercent, formatDownloadProgress, type DownloadProgress } from "@/lib/biweekly/job-download";
import {
 canDownloadBiweeklyJob,
 clientFailedJob,
 decidePollTick,
 isGenerateInFlight,
 isInFlightJobStatus,
 cardFromSummary,
 conclusionPieces,
 jobFromApi,
 jobFromLatest,
 normalizeLatestJob,
 type ReportCardView,
 selectPeriodJob,
 POLL_INTERVAL_MS,
 type JobView,
 type PollScope,
} from "@/lib/biweekly/job-display";
import { periodsWithinMonitoring, planStagesFromPayload, type PlanStage } from "@/lib/biweekly/plan-timeline";
import { addDays } from "@/lib/biweekly/timeline";
import { PlanPhenologyTimeline } from "./plan-timeline";
import s from "./biweekly-tab.module.css";

const md=(date:string)=>date.slice(5).replace("-",".");
const range=(start:string,endInclusive:string)=>`${md(start)}–${md(endInclusive)}`;

type SeasonView = {season_id:string;label?:string;crop?:string;crop_name?:string;land_id?:string;land_name?:string;note?:string;plan_status?:string;periods:LocalPeriod[];stages:PlanStage[]};

function ConclusionLine({line}:{line:string}){
 const pieces=conclusionPieces(line);
 return <p className={s.conclusionLine}>{pieces.map((piece,index)=>{
  if(piece.type==="mark") return <span className={s.conclusionMark} key={index} style={{color:piece.color,backgroundColor:piece.background}}>{piece.text}</span>;
  if(piece.type==="bold") return <strong key={index}>{piece.text}</strong>;
  return <span key={index}>{piece.text}</span>;
 })}</p>;
}

function formatCoreValue(value:number|null,decimals:number,unit:string){
 if(value==null) return "—";
 const text=value.toFixed(decimals);
 return unit?`${text} ${unit}`:text;
}

function periodHeading(span:{label:string;start:string|null;end:string|null}){
 if(span.start&&span.end) return `${span.label} ${range(span.start,span.end)}`;
 return span.label;
}

function emptyConclusion(line:string):ReportCardView{
 return {
  title:"本期结论",
  lines:[line],
  periods:{current:{label:"本期",start:null,end:null},prior:{label:"上一期",start:null,end:null}},
  metrics:[],
  weather:[],
 };
}

function ConclusionParameters({card}:{card:ReportCardView}){
 if(!card.metrics.length&&!card.weather.length) return null;
 return <details className={s.conclusionParams}>
  <summary>本期与上期指标对照</summary>
  <table className={s.conclusionTable}>
   <caption className={s.conclusionCaption}>指数是可用光学日的田块均值。有效降雨和蒸散来自附近气象记录。</caption>
   <thead>
    <tr>
     <th scope="col">参数</th>
     <th scope="col">{periodHeading(card.periods.current)}</th>
     <th scope="col">{periodHeading(card.periods.prior)}</th>
    </tr>
   </thead>
   <tbody>
    {card.metrics.map((row,index)=><tr key={`m-${index}-${row.key}`}>
     <th scope="row">{row.abbr?`${row.abbr} ${row.name}`:row.name}</th>
     <td>{formatCoreValue(row.current,row.decimals,row.unit)}</td>
     <td>{formatCoreValue(row.prior,row.decimals,row.unit)}</td>
    </tr>)}
    {card.weather.map((row,index)=><tr key={`w-${index}-${row.key}`}>
     <th scope="row">{row.name}</th>
     <td>{formatCoreValue(row.current,row.decimals,row.unit)}</td>
     <td>{formatCoreValue(row.prior,row.decimals,row.unit)}</td>
    </tr>)}
   </tbody>
  </table>
 </details>;
}

function planErrorMessage(code:string){
 if(code==="NO_SEASONS" || code.includes("未关联") || code.includes("无法读取 Smart")){
  return code.includes("本田") || code.includes("无法读取")
   ? code
   : "本田未关联 Smart 种植方案，未列出种植季。不会改用其他地块的方案。";
 }
 return `暂时无法列出周期（${code}）。`;
}

function fixtureEnabled(allowLocalFixture?: boolean){
 return Boolean(allowLocalFixture || usesLocalFixture());
}

function toSeasonView(landId:string, raw:any, periods:LocalPeriod[], extra?:unknown):SeasonView{
 const fromSeason=planStagesFromPayload(raw);
 const stages=fromSeason.length?fromSeason:planStagesFromPayload(extra);
 return {
  season_id:String(raw.season_id),
  label:String(raw.label||raw.season_id),
  crop:raw.crop?String(raw.crop):"wheat",
  crop_name:String(raw.crop_name||"小麦"),
  land_id:String(raw.land_id||landId),
  land_name:raw.land_name?String(raw.land_name):undefined,
  note:raw.note?String(raw.note):"默认不出报，需显式触发补数或生成。",
  periods:periodsWithinMonitoring(periods, stages),
  stages,
 };
}

function localSeasonView(item: (typeof LOCAL_SEASONS)[number]): SeasonView {
 const stages = planStagesFromPayload(item);
 return {...item, periods: periodsWithinMonitoring(item.periods, stages), stages};
}

function toPeriod(raw:any, index:number):LocalPeriod{
 const start=String(raw.start);
 const endInclusive=String(raw.end_inclusive);
 const endExclusive=String(raw.end_exclusive||addDays(endInclusive,1));
 return {
  ...(raw as LocalPeriod),
  period_id:String(raw.period_id??index+1),
  label:String(raw.label||`第${raw.period_id??index+1}期`),
  start,
  end_inclusive:endInclusive,
  end_exclusive:endExclusive,
  has_eligible_optics:Boolean(raw.has_eligible_optics),
  optical_descriptive_days:Number(raw.optical_descriptive_days||0),
  s1_products:Number(raw.s1_products||0),
  latest_job:normalizeLatestJob(raw.latest_job),
 };
}

function preferredPeriod(periods:LocalPeriod[]):LocalPeriod|undefined{
 // 首次阅读优先进入已出报告的期次，其次看已有观测或最近开始的一期。
 const today = new Date();
 const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
 const latestFirst = [...periods].sort((a, b) => b.start.localeCompare(a.start));
 const started = latestFirst.filter((row) => row.start <= localDate);
 return started.find((row) => canDownloadBiweeklyJob(jobFromLatest(row.latest_job)))
     ?? started.find((row) => row.has_eligible_optics)
     ?? started[0]
     ?? latestFirst[latestFirst.length - 1];
}

export default function BiweeklyTab({landId,cropType,allowLocalFixture}:{landId?:string;cropType?:string|null;allowLocalFixture?:boolean}={}) {
 const canUseFixture=fixtureEnabled(allowLocalFixture);
 const maize=isMaizeCrop(cropType);
 const resolvedLand=landId|| (canUseFixture?LOCAL_LAND_ID:"");
 const [seasons,setSeasons]=useState<SeasonView[]>(canUseFixture && !landId?LOCAL_SEASONS.map(localSeasonView):[]);
 const [seasonId,setSeasonId]=useState(seasons[0]?.season_id??"2025/26");
 const [periodId,setPeriodId]=useState(() => preferredPeriod(seasons[0]?.periods ?? [])?.period_id ?? "");
 const [job,setJob]=useState<JobView|null>(null);
 const [trackedJobId,setTrackedJobId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [downloading,setDownloading]=useState(false);
 const [downloadProgress,setDownloadProgress]=useState<DownloadProgress|null>(null);
 const downloadPaintRef=useRef(0);
 const [catalogLoading,setCatalogLoading]=useState(Boolean(resolvedLand) && !seasons.length);
 const [loadError,setLoadError]=useState<string|null>(null);
 const [conclusion,setConclusion]=useState<{key:string; card:ReportCardView}|null>(null);
 const pollTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const pollAbortRef=useRef<AbortController|null>(null);
 const pollGenerationRef=useRef(0);
 const pollScopeRef=useRef<PollScope|null>(null);
 const season=useMemo(()=>{
  const found=seasons.find(item=>item.season_id===seasonId);
  if(found) return found;
  if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
   const local=getLocalSeason(seasonId);
   return localSeasonView(local);
  }
  return seasons[0];
 },[seasons,seasonId,canUseFixture,resolvedLand]);
 const period=season?.periods.find(item=>item.period_id===periodId)??season?.periods[0];
 const previous=season&&period?adjacentPeriod({periods:season.periods} as any,period.period_id,-1):undefined;
 const next=season&&period?adjacentPeriod({periods:season.periods} as any,period.period_id,1):undefined;
 const displayedJob=selectPeriodJob({periodLatest:period?.latest_job,localJob:job,trackedJobId});

 const stopPolling=()=>{
  pollGenerationRef.current+=1;
  pollScopeRef.current=null;
  if(pollTimerRef.current){
   clearTimeout(pollTimerRef.current);
   pollTimerRef.current=null;
  }
  if(pollAbortRef.current){
   pollAbortRef.current.abort();
   pollAbortRef.current=null;
  }
 };

 const startPolling=(land:string, nextPeriodId:string, jobId:string)=>{
  stopPolling();
  const scope:PollScope={landId:land,periodId:nextPeriodId,jobId,generation:pollGenerationRef.current};
  pollScopeRef.current=scope;
  const abort=new AbortController();
  pollAbortRef.current=abort;
  let attempts=0;
  let consecutiveErrors=0;
  const schedule=()=>{
   pollTimerRef.current=setTimeout(()=>{void tick();},POLL_INTERVAL_MS);
  };
  const apply= (decision:ReturnType<typeof decidePollTick>)=>{
   if(decision.action==="ignore") return;
   if(decision.action==="retry"){
    schedule();
    return;
   }
   if(decision.action==="apply-and-continue"){
    setJob(decision.job);
    schedule();
    return;
   }
   if(decision.action==="apply-and-stop"){
    setJob(decision.job);
    stopPolling();
    return;
   }
   if(decision.action==="stop-error" || decision.action==="stop-timeout"){
    setJob(current=>{
     const base=decision.job??current??{job_id:jobId,status:"dispatched"};
     return {...base,error:decision.error};
    });
    stopPolling();
   }
  };
  const tick=async()=>{
   attempts+=1;
   const current=pollScopeRef.current;
   if(!current) return;
   try{
    const data=await getJob(land,jobId,abort.signal);
    apply(decidePollTick({request:scope,current:pollScopeRef.current??current,response:data,attempts,consecutiveErrors}));
    consecutiveErrors=0;
   }catch(error){
    if(abort.signal.aborted){
     apply(decidePollTick({request:scope,current:pollScopeRef.current??current,cancelled:true,attempts,consecutiveErrors}));
     return;
    }
    const message=error instanceof Error?error.message:"API_UNAVAILABLE";
    const decision=decidePollTick({request:scope,current:pollScopeRef.current??current,error:message,attempts,consecutiveErrors});
    if(decision.action==="retry") consecutiveErrors+=1;
    apply(decision);
   }
  };
  void tick();
 };

 useEffect(()=>()=>stopPolling(),[]);

 const jobId=displayedJob?.job_id;
 // 同一任务状态变化后重新读取；切换期次时只显示与当前请求匹配的正文。
 const conclusionKey=jobId ? JSON.stringify([resolvedLand,period?.period_id,jobId,displayedJob?.status]) : null;
 const card=conclusion?.key===conclusionKey ? conclusion.card : null;

 useEffect(()=>{
  if(maize || !resolvedLand || !jobId || !conclusionKey) return;
  const abort=new AbortController();
  getJobSummary(resolvedLand,jobId,abort.signal).then(raw=>{
   if(abort.signal.aborted) return;
   setConclusion({key:conclusionKey,card:cardFromSummary(raw)??emptyConclusion("这期还没有可显示的结论。")});
  }).catch(()=>{
   if(abort.signal.aborted) return;
   setConclusion({key:conclusionKey,card:emptyConclusion("暂时读不到本期结论。")});
  });
  return ()=>abort.abort();
 },[maize,resolvedLand,jobId,conclusionKey]);

 useEffect(()=>{
  if(maize || !resolvedLand) return;
  const abort=new AbortController();
  setCatalogLoading(true);
  stopPolling();
  setTrackedJobId(null);
  const load=async()=>{
   try{
    const seasonPayload=await listSeasons(resolvedLand,abort.signal) as {seasons?:Array<any>;plan_status?:string;note?:string;plan_available?:boolean};
    const list=seasonPayload.seasons||[];
    const views:SeasonView[]=[];
    for(const item of list){
     const periodPayload=await listPeriods(resolvedLand,String(item.season_id),abort.signal) as {periods?:Array<any>;stages?:Array<any>;native_plan?:any};
     views.push(toSeasonView(resolvedLand,item,(periodPayload.periods||[]).map(toPeriod),periodPayload));
    }
    if(!abort.signal.aborted){
     if(views.length){
      setSeasons(views);
      setSeasonId(views[0].season_id);
      const preferred=preferredPeriod(views[0].periods);
      if(preferred){
       setPeriodId(preferred.period_id);
       setJob(jobFromLatest(preferred.latest_job));
      }
      setLoadError(null);
     }else if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
      setSeasons(LOCAL_SEASONS.map(localSeasonView));
      setLoadError(null);
     }else{
      setSeasons([]);
      setJob(null);
      setLoadError(seasonPayload.note || seasonPayload.plan_status || "NO_SEASONS");
     }
    }
   }catch(error){
    if(abort.signal.aborted) return;
    if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
     setSeasons(LOCAL_SEASONS.map(localSeasonView));
     setLoadError(null);
    }else{
     setSeasons([]);
     setJob(null);
     setLoadError(error instanceof Error?error.message:"API_UNAVAILABLE");
    }
   }finally{
    if(!abort.signal.aborted) setCatalogLoading(false);
   }
  };
  void load();
  return ()=>{abort.abort();stopPolling();};
 },[resolvedLand,maize,canUseFixture]);

 const showPeriodJob=(item:LocalPeriod|undefined)=>{
  stopPolling();
  setTrackedJobId(null);
  if(!item){
   setJob(null);
   return;
  }
  setPeriodId(item.period_id);
  setJob(jobFromLatest(item.latest_job));
 };

 const choosePeriod=(item:{period_id:string})=>{
  const row=season?.periods.find(periodRow=>periodRow.period_id===item.period_id);
  if(row){
   showPeriodJob(row);
   return;
  }
  stopPolling();
  setTrackedJobId(null);
  setPeriodId(item.period_id);
  setJob(null);
 };

 const chooseSeason=(value:string)=>{
  const nextSeason=seasons.find(item=>item.season_id===value);
  setSeasonId(value);
  const preferred=preferredPeriod(nextSeason?.periods||[]);
  if(preferred){
   showPeriodJob(preferred);
   return;
  }
  stopPolling();
  setTrackedJobId(null);
  setPeriodId("");
  setJob(null);
 };

 const run=async(action:"backfill-period"|"backfill-season"|"generate")=>{
  if(!resolvedLand||!season) return;
  if(action!=="backfill-season"&&!period) return;
  if(action==="generate"&&isGenerateInFlight(displayedJob)) return;
  setBusy(true);
  try{
   const result=action==="backfill-period"
    ? await triggerBackfill(resolvedLand,season.season_id,period!.period_id)
    : action==="backfill-season"
     ? await triggerBackfillSeason(resolvedLand,season.season_id)
     : await triggerGenerate(resolvedLand,season.season_id,period!.period_id);
   const view=jobFromApi(result)??(result as JobView);
   if(action==="generate"){
    const id=view?.job_id;
    setTrackedJobId(id??null);
    setJob(view);
    if(id&&isInFlightJobStatus(view?.status)&&period){
     startPolling(resolvedLand,period.period_id,id);
    }else{
     stopPolling();
    }
   }else{
    setJob(view);
   }
  }catch(error){
   if(action==="generate"){
    stopPolling();
    setTrackedJobId(null);
   }
   setJob(clientFailedJob(error instanceof Error?error.message:"API_UNAVAILABLE"));
  }finally{setBusy(false);}
 };

 const saveReport=async()=>{
  if(!resolvedLand||!displayedJob?.job_id||!canDownloadBiweeklyJob(displayedJob)||downloading) return;
  setDownloading(true);
  downloadPaintRef.current=0;
  setDownloadProgress({receivedBytes:0,totalBytes:null,complete:false});
  try{
   await downloadJob(resolvedLand,displayedJob.job_id,undefined,(progress)=>{
    const now=Date.now();
    if(!progress.complete && progress.receivedBytes>0 && now-downloadPaintRef.current<100) return;
    downloadPaintRef.current=now;
    setDownloadProgress(progress);
   });
  }catch(error){
   const message=error instanceof Error?error.message:"下载失败。";
   setJob(current=>{
    const base=current??displayedJob;
    return {...base,error:message};
   });
  }finally{
   setDownloading(false);
   setDownloadProgress(null);
  }
 };

 if(maize){
  return <div className={s.frame}><section className={s.root} aria-label="种植双周报" lang="zh-CN">
   <header className={s.header}><h2>种植双周报</h2></header>
   <p className={s.empty}>当前作物暂不支持双周报。</p>
  </section></div>;
 }

 if(resolvedLand && catalogLoading){
  return <div className={s.frame}><div className={s.root}>
   <FieldTabSkeleton variant="biweekly" />
  </div></div>;
 }

 const generateBusy=busy||isGenerateInFlight(displayedJob);

 return <div className={s.frame}><section className={s.root} aria-label="种植双周报" lang="zh-CN">
  <header className={s.header}>
   <h2>种植双周报 {canUseFixture&&!landId?<span className={s.mock}>本地夹具</span>:null}</h2>
   {season?<div className={s.seasonControls}>
    <div className={s.crop}>
     <Select value={season.season_id} onValueChange={chooseSeason}>
      <SelectTrigger className={s.selectTrigger} aria-label="选择种植季"><SelectValue/></SelectTrigger>
      <SelectContent align="end" collisionPadding={12} className={s.selectPopup}>
       {seasons.map(item=><SelectItem className={s.selectItem} key={item.season_id} value={item.season_id}>{item.crop_name||item.label} · {item.label}</SelectItem>)}
      </SelectContent>
     </Select>
    </div>
    <Button type="button" variant="outline" size="sm" className={s.seasonFill} disabled={busy||!season.periods.length} onClick={()=>run("backfill-season")}>一键补齐全部双周报</Button>
   </div>:null}
  </header>
  {season&&season.periods.length>0&&<div className={s.reportToolbar}>
   <div className={s.reportRow} role="group" aria-label="种植季周期">
   <Select value={period?.period_id} onValueChange={id=>{const item=season.periods.find(row=>row.period_id===id);if(item)choosePeriod(item);}}>
    <SelectTrigger className={s.selectTrigger} aria-label="选择周期"><SelectValue/></SelectTrigger>
    <SelectContent align="start" collisionPadding={12} className={s.selectPopup}>
     {season.periods.map(item=><SelectItem className={s.selectItem} key={item.period_id} value={item.period_id} aria-label={`${item.label}，${item.start}至${item.end_inclusive}`}>{item.label} · {range(item.start,item.end_inclusive)}{item.partial?"（短窗）":""}</SelectItem>)}
    </SelectContent>
   </Select>
   <TooltipProvider delayDuration={300}>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={s.navButton} aria-label="上一周期" disabled={!previous} onClick={()=>previous&&choosePeriod(previous)}><ChevronLeft size={15} aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>上一周期</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={s.navButton} aria-label="下一周期" disabled={!next} onClick={()=>next&&choosePeriod(next)}><ChevronRight size={15} aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>下一周期</TooltipContent></Tooltip>
   </TooltipProvider>
    <Button type="button" variant="outline" size="sm" className={s.periodFill} disabled={busy||!period} onClick={()=>run("backfill-period")}>补齐本期数据</Button>
   </div>
   <div className={s.triggerRow} role="group" aria-label="生成双周报">
    <Button type="button" variant="outline" size="sm" disabled={generateBusy||!period} onClick={()=>run("generate")}>生成</Button>
    {displayedJob?.job_id&&canDownloadBiweeklyJob(displayedJob)&&<>
     <Button type="button" variant="ghost" size="sm" disabled={downloading} onClick={()=>{void saveReport();}}>{downloading?"下载中":"下载产物"}</Button>
     {downloading&&downloadProgress?<div className={s.downloadProgress} role="progressbar" aria-valuemin={0} aria-valuemax={downloadProgress.totalBytes??undefined} aria-valuenow={downloadProgress.totalBytes!=null?downloadProgress.receivedBytes:undefined} aria-label={formatDownloadProgress(downloadProgress)}>
      <span>{formatDownloadProgress(downloadProgress)}</span>
      <span className={s.downloadTrack} aria-hidden="true"><span className={s.downloadFill} data-unknown={downloadProgress.totalBytes==null?"true":"false"} style={downloadPercent(downloadProgress)!=null?{width:`${downloadPercent(downloadProgress)}%`}:undefined}/></span>
     </div>:null}
    </>}
   </div>
  </div>}
  {season?<PlanPhenologyTimeline stages={season.stages} period={period?{period_id:period.period_id,label:period.label,start:period.start,end_inclusive:period.end_inclusive,end_exclusive:period.end_exclusive,has_eligible_optics:period.has_eligible_optics}:null} periods={season.periods} onSelectPeriod={choosePeriod}/>:null}
  <div className={s.content} aria-live="polite">{period?<>
   {card ? <div className={s.conclusion}>
    <p className={s.conclusionTitle}>{card.title}</p>
    {card.lines.map((line,index)=><ConclusionLine key={index} line={line}/>)}
    <ConclusionParameters card={card}/>
   </div> : conclusionKey ? <FieldTabSkeleton variant="conclusion" />
    : <p className={s.empty}>{period.has_eligible_optics?"尚未生成报告。":"本期暂无可用光学报告。"}</p>}
   <p className={s.cross}>{period.has_eligible_optics?`可用光学观测 ${period.optical_descriptive_days} 天`:"暂无可用光学观测"}{period.s1_products?"":" · 无雷达观测"}</p>
  </>: <p className={s.empty}>{loadError?planErrorMessage(loadError):"暂无报告。"}</p>}</div>
 </section></div>;
}
