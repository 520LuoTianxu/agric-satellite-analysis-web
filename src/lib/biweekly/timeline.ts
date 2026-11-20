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
/** A phase is navigation, not a duration-proportional slice of a season-wide track. */
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
