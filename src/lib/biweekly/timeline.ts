import type { AgronomicPhase, MockReport } from "./mock-report";
const DAY=86400000;
function isoDay(value: string): number {
 const ms=Date.parse(`${value}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value) throw new RangeError(`Invalid ISO day: ${value}`);
 return ms;
}
export function daySpan(start: string,end: string): number {return (isoDay(end)-isoDay(start))/DAY;}
export function addDays(date: string,count: number): string {return new Date(isoDay(date)+count*DAY).toISOString().slice(0,10);}
export function dateRatio(date: string,start: string,end: string): number {
 const days=daySpan(start,end);
 if(days<=0) throw new RangeError("Timeline end must follow start");
 return Math.min(1,Math.max(0,daySpan(start,date)/days));
}
export function buildTimeline(phases: AgronomicPhase[],reports: MockReport[]) {
 const growth=phases.flatMap(p=>p.growthPeriods);
 if(!growth.length) throw new RangeError("Timeline needs growth periods");
 const start=growth[0].start,end=growth.at(-1)!.end;
 const geometry=(a:string,b:string)=>{const left=dateRatio(a,start,end);return {left,width:dateRatio(b,start,end)-left};};
 const months: {date:string;label:string;left:number}[]=[];
 if(!start.endsWith("-01"))months.push({date:start,label:`${start.slice(0,4)}.${start.slice(5,7)}`,left:0});
 let month=start.slice(0,7)+"-01";
 while(month<end){if(month>=start)months.push({date:month,label:`${month.slice(0,4)}.${month.slice(5,7)}`,left:dateRatio(month,start,end)});const d=new Date(isoDay(month));d.setUTCMonth(d.getUTCMonth()+1);month=d.toISOString().slice(0,10);}
 return {start,end,days:daySpan(start,end),minWidth:Math.max(720,daySpan(start,end)*6),months,
  phases:phases.map(p=>({...p,start:p.growthPeriods[0].start,end:p.growthPeriods.at(-1)!.end,...geometry(p.growthPeriods[0].start,p.growthPeriods.at(-1)!.end)})),
  periods:growth.map(g=>({...g,...geometry(g.start,g.end)})),
  records:[...reports].sort((a,b)=>a.start.localeCompare(b.start)).map(report=>({report,date:report.start,left:dateRatio(report.start,start,end)})),
 };
}
export function selectGrowthPeriod(growthId:string,reports:MockReport[]) {
 const matches=reports.filter(r=>r.primaryGrowthPeriod===growthId).sort((a,b)=>a.start.localeCompare(b.start));
 return {growthId,reportId:matches.at(-1)?.id??null};
}
export function adjacentReport(reports:MockReport[],currentId:string|null,direction:-1|1,anchorDate:string):MockReport|undefined {
 const sorted=[...reports].sort((a,b)=>a.start.localeCompare(b.start));
 const index=sorted.findIndex(r=>r.id===currentId);
 if(index>=0) return sorted[index+direction];
 return direction===-1?sorted.filter(r=>r.start<anchorDate).at(-1):sorted.find(r=>r.start>anchorDate);
}
