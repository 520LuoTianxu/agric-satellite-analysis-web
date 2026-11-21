import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {getPhaseTree,MOCK_REPORTS} from "./mock-report.ts";

test("cursor belongs to exactly one half-open interval and local coordinate reconstructs its date",async()=>{
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.cursorWithinInterval,"function");
 assert.equal(nav.cursorWithinInterval(.5,{left:0,width:.5}),null);
 assert.equal(nav.cursorWithinInterval(.5,{left:.5,width:.5}),0);
 assert.equal(nav.cursorWithinInterval(.75,{left:.5,width:.5}),.5);
 assert.equal(nav.cursorWithinInterval(1,{left:.5,width:.5}),null);
 assert.equal(nav.cursorWithinInterval(.5,{left:.5,width:0}),null);
 for(const crop of ["wheat","maize"] as const){
  const phases=getPhaseTree(crop),reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  for(const report of reports){
   const view=nav.buildWindowTimeline(phases,reports,nav.focusWindow(phases,report.start).start);
   const anchor=nav.dateRatio(report.start,view.start,view.end);
   for(const rows of [view.phases,view.periods]){
    const owned=rows.map(row=>({row,local:nav.cursorWithinInterval(anchor,row)})).filter(x=>x.local!==null);
    assert.equal(owned.length,1);
    for(const width of [256,360,592,852])assert.ok(Math.abs((owned[0].row.left+owned[0].local!*owned[0].row.width)*width-anchor*width)<1e-8);
   }
   for(const row of view.periods.slice(1))assert.equal(view.periods.filter(p=>nav.cursorWithinInterval(row.left,p)!==null).length,1,"a seam never draws two overlapping cursor segments");
  }
 }
});
test("date range labels show years only for an actual inclusive crossyear window",async()=>{
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.timelineDateLabels,"function");
 assert.deepEqual(nav.timelineDateLabels("2026-12-18","2027-02-12"),{from:"2026.12.18",to:"2027.02.11"});
 assert.deepEqual(nav.timelineDateLabels("2026-11-06","2027-01-01"),{from:"11.06",to:"12.31"});
 assert.deepEqual(nav.timelineDateLabels("2028-02-01","2028-03-01"),{from:"02.01",to:"02.29"});
 assert.throws(()=>nav.timelineDateLabels("2027-01-02","2027-01-02"));
});
test("growth boundary marks share exact stage/growth/report geometry without adding crowded date labels",async()=>{
 const nav=await import("./timeline.ts");
 for(const crop of ["wheat","maize"] as const){
  const phases=getPhaseTree(crop),reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  for(const p of phases.flatMap(p=>p.growthPeriods)){
   const view=nav.buildWindowTimeline(phases,reports,nav.focusWindow(phases,p.start).start);
   assert.ok(Array.isArray(view.boundaryTicks));
   assert.equal(view.boundaryTicks.length,view.periods.length-1);
   for(const tick of view.boundaryTicks){
    assert.ok(tick.left>0&&tick.left<1);
    assert.equal(tick.left,nav.dateRatio(tick.date,view.start,view.end));
    assert.ok(view.periods.some(g=>g.start===tick.date&&g.left===tick.left));
   }
   assert.equal(view.ticks.length,3,"no extra text crowded onto narrow ruler");
  }
 }
});
test("timeline detail keeps cursor beneath labels, full evidence tips and an explicit offwindow action",()=>{
 const ui=readFileSync("src/components/biweekly/report-timeline.tsx","utf8");
 const css=readFileSync("src/components/biweekly/report-timeline.module.css","utf8");
 assert.match(ui,/cursorWithinInterval/);
 assert.match(ui,/timelineDateLabels/);
 assert.match(ui,/IntervalCursor/);
 assert.match(ui,/定位所选/);
 assert.match(ui,/在当前窗口外/);
 assert.match(ui,/coveredGrowthPeriods/);
 assert.match(ui,/Mock排期/);
 assert.match(ui,/view\.boundaryTicks\.map/);
 assert.match(css,/\.intervalCursor\{[^}]*pointer-events:none/);
 assert.match(css,/\.periodName\{[^}]*position:relative[^}]*z-index:1/);
 assert.match(css,/\.timeline \.dot\{[^}]*width:28px[^}]*height:28px/);
 assert.match(css,/\.dot\[aria-pressed=true\] time\{[^}]*font-weight:600/);
 assert.match(css,/\.windowRange\{[^}]*border:1px solid/);
 assert.doesNotMatch(css,/position:fixed/);
 assert.doesNotMatch(ui,/<button\b|<select\b|Dialog|Drawer/);
});
test("record target/line center and date baseline have explicit non-overlapping geometry",()=>{
 const css=readFileSync("src/components/biweekly/report-timeline.module.css","utf8");
 const y=Number(css.match(/--record-y:(\d+)px/)![1]);
 const target=Number(css.match(/\.timeline \.dot\{[^}]*height:(\d+)px/)![1]);
 const inset=Number(css.match(/\.timeline \.dot\{[^}]*top:calc\(var\(--record-y\) - (\d+)px\)/)![1]);
 assert.equal(y-inset+target/2,y,"target visual centre and record line use the exact same Y anchor");
 const captionOffset=Number(css.match(/\.dot time\{[^}]*top:(\d+)px/)![1]);
 const canvas=Number(css.match(/\.canvas\{[^}]*height:(\d+)px/)![1]);
 assert.ok(y-inset+captionOffset>=y+12,"selected outline does not touch report date");
 assert.ok(y-inset+captionOffset+14<=canvas,"10px/1.4 date text fits the canvas");
 assert.match(css,/\.dot\[aria-pressed=true\] time\{[^}]*color:var\(--bw-active\)/);
 assert.match(css,/\.windowRange\{[^}]*border-inline-color:transparent/);
});
