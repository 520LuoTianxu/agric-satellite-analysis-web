import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {MOCK_REPORTS,getPhaseTree} from "./mock-report.ts";

test("overview uses real unequal stage lengths, clipped focus rows share one UTC scale",async()=>{
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.buildWindowTimeline,"function");
 assert.equal(typeof nav.dateRatio,"function");
 assert.equal(nav.dateRatio("2027-01-11","2027-01-01","2027-01-21"),.5);
 assert.throws(()=>nav.dateRatio("2027-01-01","2027-01-01","2027-01-01"));
 for(const crop of ["wheat","maize"] as const){
  const phases=getPhaseTree(crop),reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  const focus=nav.focusWindow(phases,reports[3].start);
  const view=nav.buildWindowTimeline(phases,reports,focus.start);
  assert.equal(view.overview.length,3);
  assert.notEqual(view.overview[0].width,view.overview[1].width);
  assert.ok(Math.abs(view.overview.reduce((sum,p)=>sum+p.width,0)-1)<1e-10);
  for(const rows of [view.phases,view.periods]){
   assert.equal(rows[0].left,0);
   assert.ok(Math.abs(rows.reduce((sum,p)=>sum+p.width,0)-1)<1e-10);
   for(const row of rows)assert.ok(row.left>=0&&row.width>0&&row.left+row.width<=1+1e-10);
  }
  assert.equal(new Set(view.records.map(r=>r.report.id)).size,view.records.length);
  for(const r of view.records){
   assert.equal(r.left,nav.dateRatio(r.report.start,view.start,view.end));
   assert.ok(view.periods.some(p=>p.id===r.report.primaryGrowthPeriod));
  }
  assert.equal(view.ticks.length,3);
  assert.ok(view.ticks.every(t=>t.left>=0&&t.left<=1));
 }
});
test("all periods including future empties and every report can be focused within bounded windows",async()=>{
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.focusWindow,"function");
 for(const crop of ["wheat","maize"] as const){
  const phases=getPhaseTree(crop),reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  const bounds=nav.seasonBounds(phases);
  for(const period of phases.flatMap(p=>p.growthPeriods)){
   const focus=nav.focusWindow(phases,period.start);
   assert.ok(focus.start>=bounds.start&&focus.end<=bounds.end);
   assert.equal((Date.parse(focus.end)-Date.parse(focus.start))/86400000,56);
   assert.ok(period.start>=focus.start&&period.start<focus.end);
   assert.ok(nav.buildWindowTimeline(phases,reports,focus.start).periods.some(p=>p.id===period.id));
  }
  for(const report of reports){
   const focus=nav.focusWindow(phases,report.start);
   const view=nav.buildWindowTimeline(phases,reports,focus.start);
   assert.equal(view.records.filter(r=>r.report.id===report.id).length,1);
  }
 }
});
test("window movement advances28 days, clamps at both season endpoints and never loops",async()=>{
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.shiftWindow,"function");
 const phases=getPhaseTree("wheat"),bounds=nav.seasonBounds(phases);
 const first=nav.focusWindow(phases,bounds.start);
 assert.equal(nav.shiftWindow(phases,first.start,-1).start,first.start);
 const second=nav.shiftWindow(phases,first.start,1);
 assert.equal((Date.parse(second.start)-Date.parse(first.start))/86400000,28);
 let current=first;
 for(let i=0;i<20;i++)current=nav.shiftWindow(phases,current.start,1);
 assert.equal(current.end,bounds.end);
 assert.equal(nav.shiftWindow(phases,current.start,1).start,current.start);
});
test("timeline is continuous positioned chronology, not pill/grid navigation or a long scrolling track",()=>{
 const ui=readFileSync("src/components/biweekly/report-timeline.tsx","utf8");
 const css=readFileSync("src/components/biweekly/report-timeline.module.css","utf8");
 assert.match(ui,/buildWindowTimeline/);
 assert.match(ui,/focusWindow/);
 assert.match(ui,/style=\{position/);
 assert.match(ui,/报告记录/);
 assert.match(ui,/焦点/);
 assert.match(ui,/@\/components\/ui\/select/);
 assert.match(ui,/@\/components\/ui\/button/);
 assert.match(ui,/@\/components\/ui\/tooltip/);
 assert.match(css,/position:absolute/);
 assert.match(css,/\.cursor/);
 assert.doesNotMatch(css,/overflow-x:\s*(auto|scroll)|[;{]min-width:\s*[5-9]\d\dpx|repeat\(3,\s*minmax/);
 assert.doesNotMatch(ui,/<select\b|<button\b|<details|Dialog|Drawer|scrollTo/);
});
test("bounded geometry remains readable at288/400/640/900 without forcing a seasonal min-width",async()=>{
 const nav=await import("./timeline.ts");
 for(const outer of [288,400,640,900]){
  const gutter=outer>=600?24:outer>=360?20:16,content=outer-gutter*2;
  for(const crop of ["wheat","maize"] as const){
   const phases=getPhaseTree(crop),reports=MOCK_REPORTS.filter(r=>r.crop===crop);
   for(const anchor of phases.flatMap(p=>p.growthPeriods.map(g=>g.start))){
    const view=nav.buildWindowTimeline(phases,reports,nav.focusWindow(phases,anchor).start);
    assert.ok(view.overview.every(p=>p.width*content>=24),"full season S codes retain room; names use the plain legend on narrow widths");
    for(const row of [...view.phases,...view.periods]){
     assert.ok(row.left*content>=0&&((row.left+row.width)*content)<=content+1e-8);
    }
    for(let i=0;i<view.records.length;i++){
     const left=view.records[i].left*content;
     assert.ok(left-16>=-gutter&&left+16<=content+gutter,"32px atomic date captions fit inside outer gutter even at an axis edge");
     if(i>0)assert.ok(left-view.records[i-1].left*content>=32,"record labels do not collide at narrow focus scale");
    }
   }
  }
 }
 const css=readFileSync("src/components/biweekly/report-timeline.module.css","utf8");
 assert.match(css,/container-name:report-timeline/);
 assert.match(css,/@container report-timeline \(min-width:600px\)/);
 assert.match(css,/\.ruler time\{[^}]*white-space:nowrap/);
 assert.match(css,/\.dot time\{[^}]*white-space:nowrap/);
 assert.match(css,/@container\(max-width:55px\)\{\.periodName\{display:none/);
 assert.match(css,/\.timeline button:focus-visible\{[^}]*outline:2px/);
});
