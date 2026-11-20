import type { AgronomicPhase, MockReport } from "./mock-report";

function isoDay(value: string): number {
 const ms=Date.parse(`${value}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value) throw new RangeError(`Invalid ISO day: ${value}`);
 return ms;
}
export function addDays(date: string,count: number): string {
 return new Date(isoDay(date)+count*86400000).toISOString().slice(0,10);
}
/** Primary attribution only: crossover coverage never creates duplicate options. */
export function getGrowthReports(growthId:string,reports:MockReport[]):MockReport[] {
 return reports.filter(r=>r.primaryGrowthPeriod===growthId).sort((a,b)=>a.start.localeCompare(b.start));
}
export function selectGrowthPeriod(growthId:string,reports:MockReport[]) {
 return {growthId,reportId:getGrowthReports(growthId,reports).at(-1)?.id??null};
}
/** Pick a phase's latest primary report; empty phases select their first growth period. */
export function selectPhase(phase:AgronomicPhase,reports:MockReport[]) {
 const periods=new Set(phase.growthPeriods.map(g=>g.id));
 const latest=reports.filter(r=>periods.has(r.primaryGrowthPeriod)).sort((a,b)=>a.start.localeCompare(b.start)).at(-1);
 const growthId=latest?.primaryGrowthPeriod??phase.growthPeriods[0]?.id;
 if(!growthId)throw new RangeError("Phase needs a growth period");
 return selectGrowthPeriod(growthId,reports);
}
/** Caller supplies only the currently visible growth period's records. Never wraps. */
export function adjacentReport(reports:MockReport[],currentId:string|null,direction:-1|1,anchorDate:string):MockReport|undefined {
 const sorted=[...reports].sort((a,b)=>a.start.localeCompare(b.start));
 const index=sorted.findIndex(r=>r.id===currentId);
 if(index>=0)return sorted[index+direction];
 return direction===-1?sorted.filter(r=>r.start<anchorDate).at(-1):sorted.find(r=>r.start>anchorDate);
}

const DAY=86400000;
const WINDOW_DAYS=56;
export function dateRatio(date:string,start:string,end:string):number {
 const span=isoDay(end)-isoDay(start);
 if(span<=0)throw new RangeError("Timeline end must follow start");
 return Math.max(0,Math.min(1,(isoDay(date)-isoDay(start))/span));
}
export function seasonBounds(phases:AgronomicPhase[]) {
 const periods=phases.flatMap(p=>p.growthPeriods);
 if(!periods.length)throw new RangeError("Timeline needs growth periods");
 return {start:periods[0].start,end:periods.at(-1)!.end};
}
function boundedWindow(phases:AgronomicPhase[],desiredStart:string) {
 const bounds=seasonBounds(phases);
 const days=Math.min(WINDOW_DAYS,(isoDay(bounds.end)-isoDay(bounds.start))/DAY);
 if(days<=0)throw new RangeError("Season end must follow start");
 const latest=addDays(bounds.end,-days);
 isoDay(desiredStart);
 const start=desiredStart<bounds.start?bounds.start:desiredStart>latest?latest:desiredStart;
 return {start,end:addDays(start,days)};
}
export function focusWindow(phases:AgronomicPhase[],anchorDate:string) {
 return boundedWindow(phases,addDays(anchorDate,-14));
}
export function shiftWindow(phases:AgronomicPhase[],start:string,direction:-1|1) {
 return boundedWindow(phases,addDays(start,direction*28));
}
/** All rows use half-open UTC intervals on exactly the same focus window scale. */
export function buildWindowTimeline(phases:AgronomicPhase[],reports:MockReport[],desiredStart:string) {
 const bounds=seasonBounds(phases),window=boundedWindow(phases,desiredStart);
 const phaseRanges=phases.map(p=>({...p,start:p.growthPeriods[0].start,end:p.growthPeriods.at(-1)!.end}));
 const geometry=(start:string,end:string)=>({left:dateRatio(start,window.start,window.end),width:dateRatio(end,window.start,window.end)-dateRatio(start,window.start,window.end)});
 const visible=(p:{start:string;end:string})=>p.start<window.end&&p.end>window.start;
 const overview=phaseRanges.map(p=>({...p,left:dateRatio(p.start,bounds.start,bounds.end),width:dateRatio(p.end,bounds.start,bounds.end)-dateRatio(p.start,bounds.start,bounds.end)}));
 const periods=phases.flatMap(p=>p.growthPeriods.map(g=>({...g,phaseCode:p.code}))).filter(visible).map(g=>({...g,...geometry(g.start,g.end)}));
 const days=(isoDay(window.end)-isoDay(window.start))/DAY;
 const tickDays=[0,Math.floor(days/2),days-1];
 return {...window,seasonStart:bounds.start,seasonEnd:bounds.end,days,overview,
  windowLeft:dateRatio(window.start,bounds.start,bounds.end),windowWidth:dateRatio(window.end,bounds.start,bounds.end)-dateRatio(window.start,bounds.start,bounds.end),
  phases:phaseRanges.filter(visible).map(p=>({...p,...geometry(p.start,p.end)})),periods,
  records:reports.filter(r=>r.start>=window.start&&r.start<window.end).sort((a,b)=>a.start.localeCompare(b.start)).map(report=>({report,left:dateRatio(report.start,window.start,window.end)})),
  ticks:tickDays.map((d,i)=>({date:addDays(window.start,d),left:d/days,align:i===0?"start":i===tickDays.length-1?"end":"middle"})),
  minorTicks:Array.from({length:Math.floor(days/7)+1},(_,i)=>i*7/days),
 };
}
