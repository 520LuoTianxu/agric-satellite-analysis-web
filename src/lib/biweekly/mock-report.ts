/** Synthetic UI fixtures only. No parcel data, requests or production calculations. */
export type CropKey = "wheat" | "maize";
export type MetricKey = "ndvi" | "fvc" | "lai";
export type PhaseCode = "VEG" | "TRANS" | "REPRO";
export interface MockReport {
 primaryGrowthPeriod: string; coveredGrowthPeriods: string[];
 id: string; dataKind: "mock"; crop: CropKey; cropName: string; season: string; period: string;
 start: string; end: string; label: string; field: string; area: number;
 ndvi: number; fvc: number; lai: number; ndre: number; previousFvc: number;
 validDays: number; validFraction: number; gapDays: number;
 phases: {code: PhaseCode; name: string; detail: string; start: string; end: string; days: number}[];
 series: {date: string; ndvi: number; fvc: number; lai: number; inPeriod: boolean}[];
 weather: {date: string; rain: number; temp: number}[]; rainTotal: number; historicRain: number;
 peerFvc: number; historicFvc: number; drought: "attention" | "limited"; flood: "limited" | "quiet";
}
const round = (n: number) => Math.round(n * 100) / 100;
function day(start: string, offset: number) { const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); }
function makeReport(crop: CropKey, index: number): MockReport {
 const wheat = crop === "wheat";
 const start = day(wheat ? "2027-03-01" : "2027-06-14", index*14);
 const ndvi = round((wheat ? 0.46 : 0.51)+index*0.09);
 const fvc = round((wheat ? 0.54 : 0.58)+index*0.09);
 const lai = round((wheat ? 1.8 : 2.1)+index*0.55);
 const codes: PhaseCode[] = index === 0 ? ["VEG"] : index === 1 ? ["VEG", "TRANS"] : ["TRANS"];
 const phases = codes.map((code,i)=>({code,name: code === "VEG" ? "营养生长" : "营养 / 生殖并进", detail: code === "VEG" ? (wheat ? (index===0?"返青":"起身") : (index===0?"苗期":"拔节")) : (wheat ? "拔节" : "穗期"), start: day(start,i===0?0:6),end:day(start,codes.length===1||i===1?14:6),days:codes.length===1?14:i===0?6:8}));
 const weather = Array.from({length:14},(_,i)=>({date:day(start,i),rain:([0,0,2,0,0,0,5,0,0,1,0,0,0,0][i]) + (index===0 && i===4 ? 4 : 0),temp:round((wheat ? 10 : 24)+index*2+Math.sin(i)*2)}));
 const primaryGrowthPeriod = index===0 ? (wheat?"green":"seedling") : index===1 ? (wheat?"rising":"jointing") : (wheat?"jointing":"ear");
 const coveredGrowthPeriods = index===1 ? [primaryGrowthPeriod,wheat?"jointing":"ear"] : [primaryGrowthPeriod];
 return {primaryGrowthPeriod,coveredGrowthPeriods,id:`${crop}-${index+1}`,dataKind:"mock",crop,cropName:wheat?"冬小麦":"玉米",season:wheat?"2026 / 27 种植季":"2027 夏播季",period:String(index+1),start,end:day(start,14),label:`第 ${String(index+1).padStart(2,"0")} 期`,field:wheat?"示例地块 · 麦田 01":"示例地块 · 玉米田 02",area:wheat?128.6:96.4,ndvi,fvc,lai,ndre:round(0.25+index*0.04),previousFvc:round(fvc-0.09), validDays:3,validFraction:round(0.89-index*0.02),gapDays:5,phases,
 series:Array.from({length:6},(_,i)=>({date:day(start,-12+i*5),ndvi:round(ndvi-(5-i)*0.025),fvc:round(fvc-(5-i)*0.022),lai:round(lai-(5-i)*0.13),inPeriod:i>=3})),weather,rainTotal:weather.reduce((s,d)=>s+d.rain,0),historicRain:wheat?18:24,peerFvc:round(fvc-0.03),historicFvc:round(fvc-0.05),drought:index===0?"limited":"attention",flood:index===2?"limited":"quiet"};
}
export const MOCK_REPORTS: MockReport[] = (["wheat","maize"] as const).flatMap(crop=>[0,1,2,3].map(i=>makeReport(crop,i)));
export function getMockReport(crop: string, period: string): MockReport {return MOCK_REPORTS.find(r=>r.crop===crop&&r.period===period) ?? MOCK_REPORTS[1];}
export const PHASE_LABELS: Record<PhaseCode,string> = {VEG:"营养生长",TRANS:"并进生长",REPRO:"生殖生长"};
export const METRIC_LABELS: Record<MetricKey,string> = {ndvi:"NDVI 绿度",fvc:"FVC 覆盖估计",lai:"LAI 叶面积估计"};
export function formatMetric(metric: MetricKey,value: number): string { return metric === "fvc" ? `${Math.round(value*100)}%` : value.toFixed(2); }


export interface GrowthPeriod { id: string; name: string; timing: string; reports: MockReport[] }
export interface AgronomicPhase { code: PhaseCode; label: "S1" | "S2" | "S3"; name: string; growthPeriods: GrowthPeriod[] }

/** Dates and stages are synthetic UI examples, never a selected parcel's real phenology. */
export function getPhaseTree(crop: CropKey): AgronomicPhase[] {
 const wheat=crop==="wheat";
 const definitions = wheat ? [
  [["seedling","出苗 / 分蘖期","2026.10—11"],["winter","越冬期","2026.12—2027.02"],["green","返青期","03.01—03.14"],["rising","起身期","03.15—03.20"]],
  [["jointing","拔节期","03.21—04.25"],["booting","孕穗期","04.26—05.09"]],
  [["heading","抽穗 / 开花期","05.10—05.23"],["filling","灌浆 / 成熟期","05.24—06.13"]],
 ] : [
  [["seedling","苗期","06.14—06.27"],["jointing","拔节期","06.28—07.03"]],
  [["ear","穗期（喇叭口）","07.04—08.08"]],
  [["flowering","抽雄 / 吐丝期","08.09—08.22"],["filling","灌浆 / 成熟期","08.23—09.19"]],
 ];
 return (["VEG","TRANS","REPRO"] as const).map((code,index)=>({
  code,label:(["S1","S2","S3"] as const)[index],name:["营养生长","营养 / 生殖并进","生殖生长"][index],
  growthPeriods: definitions[index].map(([id,name,timing])=>({id,name,timing,reports:MOCK_REPORTS.filter(r=>r.crop===crop&&r.primaryGrowthPeriod===id)})),
 }));
}
export function growthPeriodNames(crop: CropKey, ids: string[]): string {
 return getPhaseTree(crop).flatMap(p=>p.growthPeriods).filter(g=>ids.includes(g.id)).map(g=>g.name).join(" → ");
}
