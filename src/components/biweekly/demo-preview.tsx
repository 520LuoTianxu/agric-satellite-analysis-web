"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import BiweeklyTab from "./biweekly-tab";
import s from "./demo-preview.module.css";

const WIDTHS=[288,400,640,900] as const;
/** Isolated preview instrumentation only. Never imported by the parcel details page. */
export function BiweeklyDemoPreview() {
 const [width,setWidth]=useState<number>(900);
 const [measurements,setMeasurements]=useState<{client:number;content:number;pageOverflow:boolean}|null>(null);
 const frame=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=frame.current;
  if(!node)return;
  let task=0;
  const measure=()=>{
   cancelAnimationFrame(task);
   task=requestAnimationFrame(()=>{
    const root=node.firstElementChild as HTMLElement|null;
    if(!root)return;
    const next={client:root.clientWidth,content:root.scrollWidth,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
    setMeasurements(old=>old&&old.client===next.client&&old.content===next.content&&old.pageOverflow===next.pageOverflow?old:next);
   });
  };
  const observer=new ResizeObserver(measure);
  observer.observe(node);
  const mutations=new MutationObserver(measure);
  mutations.observe(node,{childList:true,subtree:true});
  window.addEventListener("resize",measure);
  document.addEventListener("focusin",measure);
  measure();
  return ()=>{observer.disconnect();mutations.disconnect();window.removeEventListener("resize",measure);document.removeEventListener("focusin",measure);cancelAnimationFrame(task);};
 },[]);
 return <main className={s.shell}>
  <div className={s.toolbar} role="group" aria-label="仅预览：组件宽度">
   <span>预览宽度</span>{WIDTHS.map(value=><Button key={value} type="button" variant={width===value?"secondary":"ghost"} size="sm" aria-pressed={width===value} onClick={()=>setWidth(value)}>{value}px</Button>)}
  </div>
  <p role="status" className={s.status}>{measurements?`目标 ${width}px · 实际 ${measurements.client}px · 内容 ${measurements.content}px · ${measurements.content<=measurements.client+1&&!measurements.pageOverflow?"未检测到横向溢出":"检测到横向溢出，请检查"}`:"等待浏览器测量"}</p>
  <div className={s.frame} ref={frame} style={{width}}><BiweeklyTab/></div>
 </main>;
}
