import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MOCK_REPORTS, getPhaseTree } from "./mock-report.ts";

test("UTC day geometry clamps endpoints and preserves chronological proportions",async()=>{
 const {dateRatio,daySpan}=await import("./timeline.ts");
 assert.equal(daySpan("2027-02-28","2027-03-01"),1);
 assert.equal(dateRatio("2027-01-11","2027-01-01","2027-01-21"),.5);
 assert.equal(dateRatio("2026-01-01","2027-01-01","2027-01-21"),0);
 assert.equal(dateRatio("2028-01-01","2027-01-01","2027-01-21"),1);
 assert.throws(()=>daySpan("bad","2027-01-01"));
 assert.throws(()=>daySpan("2027-02-30","2027-03-01"));
 assert.throws(()=>dateRatio("2027-01-01","2027-01-01","2027-01-01"));
});
test("aligned phase and growth spans cover each season with unique start-day report markers",async()=>{
 const {buildTimeline}=await import("./timeline.ts");
 for(const crop of ["wheat","maize"] as const){
  const reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  const timeline=buildTimeline(getPhaseTree(crop),reports);
  assert.equal(timeline.phases.length,3);
  assert.equal(timeline.phases[0].left,0);
  assert.equal(timeline.phases.at(-1)!.left+timeline.phases.at(-1)!.width,1);
  assert.equal(timeline.records.length,4);
  assert.equal(new Set(timeline.records.map(r=>r.report.id)).size,4);
  for(let i=1;i<timeline.periods.length;i++) assert.equal(timeline.periods[i-1].end,timeline.periods[i].start);
  assert.ok(Math.abs(timeline.periods.reduce((s,g)=>s+g.width,0)-1)<1e-10);
  for(const record of timeline.records){
   const primary=timeline.periods.find(g=>g.id===record.report.primaryGrowthPeriod)!;
   assert.ok(record.report.start>=primary.start&&record.report.start<primary.end);
   assert.equal(record.date,record.report.start);
  }
  assert.ok(timeline.months.length>=4);
  assert.ok(timeline.months.every(m=>m.left>=0&&m.left<=1));
 }
});
test("growth selection clears absent reports, chooses latest available, and report navigation never wraps",async()=>{
 const {selectGrowthPeriod,adjacentReport}=await import("./timeline.ts");
 const reports=MOCK_REPORTS.filter(r=>r.crop==="wheat");
 assert.equal(selectGrowthPeriod("jointing",reports).reportId,"wheat-4");
 assert.equal(selectGrowthPeriod("heading",reports).reportId,null);
 assert.equal(selectGrowthPeriod("rising",reports).reportId,"wheat-2");
 assert.equal(adjacentReport(reports,"wheat-1",-1,"2027-03-01"),undefined);
 assert.equal(adjacentReport(reports,"wheat-4",1,"2027-04-12"),undefined);
 assert.equal(adjacentReport(reports,"wheat-2",1,"2027-03-15")?.id,"wheat-3");
 assert.equal(adjacentReport(reports,null,-1,"2027-05-10")?.id,"wheat-4");
});
test("view removes the accordion/card tree in favor of a bounded timeline and normal-flow reader",()=>{
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 const report=readFileSync("src/components/biweekly/mock-report.tsx","utf8");
 assert.doesNotMatch(ui,/Disclosure|<details|<summary|Dialog|Drawer|Portal/);
 assert.doesNotMatch(report,/<details|className=\{s\.card\}/);
 assert.match(ui,/aria-pressed/);
 assert.match(ui,/scrollTo/);
 assert.match(ui,/报告记录/);
});
