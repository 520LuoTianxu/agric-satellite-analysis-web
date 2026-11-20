import assert from "node:assert/strict";
import { test } from "node:test";
import { MOCK_REPORTS, getMockReport } from "./mock-report.ts";

test("eight deterministic reports are synthetic with consistent chart and metrics", () => {
 assert.equal(MOCK_REPORTS.length, 8);
 for (const r of MOCK_REPORTS) {
  assert.equal(r.dataKind, "mock");
  assert.equal(r.series.length, 6);
  assert.equal(r.series.at(-1)?.ndvi, r.ndvi);
  assert.equal(r.series.at(-1)?.fvc, r.fvc);
  assert.equal(r.series.at(-1)?.lai, r.lai);
  assert.equal(r.weather.reduce((sum, d) => sum + d.rain, 0), r.rainTotal);
  assert.equal(r.weather.length, 14);
  assert.equal(r.phases.reduce((sum,p)=>sum+p.days,0),14);
  assert.equal(r.gapDays,5);
  assert.ok(r.series.every((p,i)=>i===0 || p.date > r.series[i-1].date));
  assert.ok(r.fvc >= 0 && r.fvc <= 1);
  assert.ok(r.series.filter(p=>p.inPeriod).every(p=>p.date>=r.start && p.date<r.end));
  assert.equal(r.phases[0].start, r.start);
  assert.equal(r.phases.at(-1)?.end, r.end);
  for(let i=1;i<r.phases.length;i++) assert.equal(r.phases[i-1].end,r.phases[i].start);
  assert.equal(r.validDays, r.series.filter(p=>p.inPeriod).length);
 }
});
test("selection resolves only fixture identities with deterministic fallback", () => {
 assert.equal(getMockReport("wheat", "2").id, "wheat-2");
 assert.equal(getMockReport("maize", "1").crop, "maize");
 assert.equal(getMockReport("real-land-id", "missing").id, "wheat-2");
});

test("sequential reports share their previous-period FVC value and continuous windows",()=>{
 for(const crop of ["wheat","maize"]){
  const reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  for(let i=1;i<reports.length;i++){
   assert.equal(reports[i].start,reports[i-1].end);
   assert.equal(reports[i].previousFvc,reports[i-1].fvc);
  }
 }
});
