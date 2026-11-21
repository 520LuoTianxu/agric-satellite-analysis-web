"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LOCAL_LAND_ID, LOCAL_SEASONS, adjacentPeriod, getLocalSeason, isMaizeCrop, type LocalPeriod } from "@/lib/biweekly/local-catalog";
import { jobDownloadUrl, listPeriods, listSeasons, triggerBackfill, triggerGenerate, usesLocalFixture } from "@/lib/biweekly/local-trigger";
import { addDays } from "@/lib/biweekly/timeline";
import s from "./biweekly-tab.module.css";

const md=(date:string)=>date.slice(5).replace("-",".");
const range=(start:string,endInclusive:string)=>`${md(start)}–${md(endInclusive)}`;

type JobView = {job_id?:string;status?:string;result?:any;error?:string;kind?:string;dispatched_to_production?:boolean};
type SeasonView = {season_id:string;label?:string;crop?:string;crop_name?:string;land_id?:string;land_name?:string;note?:string;periods:LocalPeriod[]};

function fixtureEnabled(allowLocalFixture?: boolean){
 return Boolean(allowLocalFixture || usesLocalFixture());
}

function toSeasonView(landId:string, raw:any, periods:LocalPeriod[]):SeasonView{
 return {
  season_id:String(raw.season_id),
  label:String(raw.label||raw.season_id),
  crop:raw.crop?String(raw.crop):"winter_wheat",
  crop_name:String(raw.crop_name||"冬小麦"),
  land_id:String(raw.land_id||landId),
  land_name:raw.land_name?String(raw.land_name):undefined,
  note:raw.note?String(raw.note):"默认不出报，需显式触发补数或生成。",
  periods,
 };
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
 };
}

export default function BiweeklyTab({landId,cropType,allowLocalFixture}:{landId?:string;cropType?:string|null;allowLocalFixture?:boolean}={}) {
 const canUseFixture=fixtureEnabled(allowLocalFixture);
 const maize=isMaizeCrop(cropType);
 const resolvedLand=landId|| (canUseFixture?LOCAL_LAND_ID:"");
 const [seasons,setSeasons]=useState<SeasonView[]>(canUseFixture && !landId?LOCAL_SEASONS.map(item=>({...item,periods:item.periods})):[]);
 const [seasonId,setSeasonId]=useState(seasons[0]?.season_id??"2025/26");
 const [periodId,setPeriodId]=useState("12");
 const [job,setJob]=useState<JobView|null>(null);
 const [busy,setBusy]=useState(false);
 const [loadError,setLoadError]=useState<string|null>(null);
 const season=useMemo(()=>{
  const found=seasons.find(item=>item.season_id===seasonId);
  if(found) return found;
  if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
   const local=getLocalSeason(seasonId);
   return {...local,periods:local.periods};
  }
  return seasons[0];
 },[seasons,seasonId,canUseFixture,resolvedLand]);
 const period=season?.periods.find(item=>item.period_id===periodId)??season?.periods[0];
 const previous=season&&period?adjacentPeriod({periods:season.periods} as any,period.period_id,-1):undefined;
 const next=season&&period?adjacentPeriod({periods:season.periods} as any,period.period_id,1):undefined;

 useEffect(()=>{
  if(maize || !resolvedLand) return;
  let cancelled=false;
  const load=async()=>{
   try{
    const seasonPayload=await listSeasons(resolvedLand) as {seasons?:Array<any>};
    const list=seasonPayload.seasons||[];
    const views:SeasonView[]=[];
    for(const item of list){
     const periodPayload=await listPeriods(resolvedLand,String(item.season_id)) as {periods?:Array<any>};
     views.push(toSeasonView(resolvedLand,item,(periodPayload.periods||[]).map(toPeriod)));
    }
    if(!cancelled){
     if(views.length){
      setSeasons(views);
      setSeasonId(views[0].season_id);
      const preferred=views[0].periods.find(row=>row.period_id==="12")??views[0].periods[0];
      if(preferred) setPeriodId(preferred.period_id);
      setLoadError(null);
     }else if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
      setSeasons(LOCAL_SEASONS.map(item=>({...item,periods:item.periods})));
      setLoadError(null);
     }else{
      setSeasons([]);
      setLoadError("NO_SEASONS");
     }
    }
   }catch(error){
    if(cancelled) return;
    if(canUseFixture && resolvedLand===LOCAL_LAND_ID){
     setSeasons(LOCAL_SEASONS.map(item=>({...item,periods:item.periods})));
     setLoadError(null);
    }else{
     setSeasons([]);
     setLoadError(error instanceof Error?error.message:"API_UNAVAILABLE");
    }
   }
  };
  void load();
  return ()=>{cancelled=true;};
 },[resolvedLand,maize,canUseFixture]);

 const choosePeriod=(item:LocalPeriod)=>{setPeriodId(item.period_id);setJob(null);};
 const run=async(action:"backfill"|"generate"|"generate-ref")=>{
  if(!resolvedLand||!season||!period) return;
  setBusy(true);
  try{
   const result=action==="backfill"
    ? await triggerBackfill(resolvedLand,season.season_id,period.period_id)
    : await triggerGenerate(resolvedLand,season.season_id,period.period_id,action==="generate-ref"?"15933":undefined);
   setJob(result as JobView);
  }catch(error){
   setJob({status:"failed",error:error instanceof Error?error.message:"API_UNAVAILABLE"});
  }finally{setBusy(false);}
 };

 if(maize){
  return <div className={s.frame}><section className={s.root} aria-label="种植双周报" lang="zh-CN">
   <header className={s.header}><h2>种植双周报</h2></header>
   <p className={s.empty}>当前作物没有已批准的双周报映射，不展示其他作物的假数据。</p>
  </section></div>;
 }

 return <div className={s.frame}><section className={s.root} aria-label="种植双周报" lang="zh-CN">
  <header className={s.header}>
   <h2>种植双周报 {canUseFixture&&!landId?<span className={s.mock}>本地夹具</span>:null}</h2>
   {season?<div className={s.crop}>
    <Select value={season.season_id} onValueChange={value=>{setSeasonId(value);setPeriodId("12");setJob(null);}}>
     <SelectTrigger className={s.selectTrigger} aria-label="选择种植季"><SelectValue/></SelectTrigger>
     <SelectContent align="end" collisionPadding={12} className={s.selectPopup}>
      {seasons.map(item=><SelectItem className={s.selectItem} key={item.season_id} value={item.season_id}>{item.crop_name||item.label} · {item.label}</SelectItem>)}
     </SelectContent>
    </Select>
   </div>:null}
  </header>
  <p className={s.disclaimer}>地块 {resolvedLand||"—"} {season?.land_name||""} · {season?.note||"走现有登录态与 /satellite-api 网关。"} 默认不出报，需显式触发补数或生成。未调用AI。</p>
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
   </div>
   <div className={s.triggerRow} role="group" aria-label="触发 API 机双周报接口">
    <Button type="button" variant="outline" size="sm" disabled={busy||!period} onClick={()=>run("backfill")}>有界补数</Button>
    <Button type="button" variant="outline" size="sm" disabled={busy||!period} onClick={()=>run("generate")}>生成</Button>
    <Button type="button" variant="outline" size="sm" disabled={busy||!period} onClick={()=>run("generate-ref")}>生成（参照 15933）</Button>
    {job?.job_id&&(job.status==="ready"||job.status==="evidence_limited")&&<Button type="button" variant="ghost" size="sm" asChild><a href={jobDownloadUrl(resolvedLand,job.job_id)} target="_blank" rel="noreferrer">下载产物</a></Button>}
   </div>
  </div>}
  <div className={s.content} aria-live="polite">{period?<>
   <p className={s.cross}>{period.label} {period.start}—{period.end_inclusive}（结束日含，内部区间至 {period.end_exclusive} 不含）。{period.has_eligible_optics?`本期有 ${period.optical_descriptive_days} 个可用光学日。`:"本期暂无可用光学，生成前应先做有界补数；确认无景后得到证据受限简报。"}{period.s1_products?"":" 本期无雷达。"} 有本田方案时按本田方案标注生育期；只有点「生成（参照 15933）」才会显式使用参照计划。</p>
   {job? <pre className={s.jobStatus}>{JSON.stringify({status:job.status,job_id:job.job_id,error:job.error,dispatched_to_production:job.dispatched_to_production,phase:job.result?.phase,planned_batch:job.result?.planned_batch,brief:job.result?.brief},null,2)}</pre> : <p className={s.empty}>{period.has_eligible_optics?"尚未生成报告。":"本期暂无可用光学报告。"}按钮走与其他地块接口同一套网关和登录态，不会自动出报。</p>}
  </>: <p className={s.empty}>{loadError?`暂时无法列出周期（${loadError}）。`:"暂无报告。"}</p>}</div>
 </section></div>;
}
