import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MOCK_REPORTS, getPhaseTree } from "./mock-report.ts";

// Selection is independent of view-window browsing; cross-period reports have one primary owner.
test("UTC date labels handle leap/year boundaries and reject invalid calendar input", async () => {
 const {addDays}=await import("./timeline.ts");
 assert.equal(addDays("2027-01-01",-1),"2026-12-31");
 assert.equal(addDays("2028-02-28",1),"2028-02-29");
 assert.throws(()=>addDays("2027-02-30",1));
 assert.throws(()=>addDays("bad",1));
});
test("each phase selects its latest owned report or first visible empty period", async () => {
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.selectPhase,"function");
 for(const crop of ["wheat","maize"] as const){
  const phases=getPhaseTree(crop), reports=MOCK_REPORTS.filter(r=>r.crop===crop);
  const expected=crop==="wheat"?["green","jointing","heading"]:["jointing","ear","flowering"];
  assert.deepEqual(phases.map(p=>nav.selectPhase(p,reports).growthId),expected);
  assert.deepEqual(phases.map(p=>nav.selectPhase(p,reports).reportId),[crop==="wheat"?`${crop}-1`:`${crop}-2`,`${crop}-4`,null]);
 }
});
test("growth report options are chronological, scoped and never duplicated by coverage", async () => {
 const nav=await import("./timeline.ts");
 assert.equal(typeof nav.getGrowthReports,"function");
 for(const crop of ["wheat","maize"] as const){
  const reports=MOCK_REPORTS.filter(r=>r.crop===crop).reverse();
  const listed=getPhaseTree(crop).flatMap(p=>p.growthPeriods.flatMap(g=>nav.getGrowthReports(g.id,reports)));
  assert.equal(new Set(listed.map(r=>r.id)).size,4);
  assert.equal(listed.length,4);
  assert.deepEqual(listed.map(r=>r.id),[1,2,3,4].map(i=>`${crop}-${i}`));
  const lastGrowth=crop==="wheat"?"jointing":"ear";
  const scoped=nav.getGrowthReports(lastGrowth,reports);
  assert.equal(nav.adjacentReport(scoped,`${crop}-3`,-1,scoped[0].start),undefined);
  assert.equal(nav.adjacentReport(scoped,`${crop}-3`,1,scoped[0].start)?.id,`${crop}-4`);
  assert.equal(nav.adjacentReport(scoped,`${crop}-4`,1,scoped[0].start),undefined);
  assert.deepEqual(nav.getGrowthReports("filling",reports),[]);
  assert.equal(nav.selectGrowthPeriod("filling",reports).reportId,null);
 }
});
test("inline report uses season and period selectors without overlays or auto-publish", () => {
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 assert.doesNotMatch(ui,/buildTimeline|dateRatio|scrollTo|ResizeObserver|scrollRef|<details|<summary|Dialog|Drawer|Portal|tablist/);
 assert.match(ui,/选择种植季/);
 assert.match(ui,/选择周期/);
 assert.match(ui,/LOCAL_SEASONS/);
 assert.match(ui,/triggerBackfill|triggerGenerate/);
 assert.match(ui,/暂无报告/);
 assert.doesNotMatch(ui,/玉米/);
 assert.doesNotMatch(ui,/MockReportContent/);
 assert.doesNotMatch(css,/position:\s*absolute|overflow-x:\s*(auto|scroll)|white-space:\s*nowrap|text-overflow:\s*ellipsis/);
 assert.doesNotMatch(css,/grid-template-columns:\s*repeat\(3,\s*minmax/);
 assert.match(css,/min-width:\s*0/);
 assert.match(css,/flex-wrap:\s*wrap/);
});
for(const width of [288,400,640,900]){
 test(`demo exposes ${width}px component width and live DOM overflow feedback without production controls`,()=>{
  const harness=readFileSync("src/components/biweekly/demo-preview.tsx","utf8");
  const css=readFileSync("src/components/biweekly/demo-preview.module.css","utf8");
  assert.match(harness,new RegExp(`\\b${width}\\b`));
  assert.match(harness,/scrollWidth/);
  assert.match(harness,/clientWidth/);
  assert.match(harness,/ResizeObserver/);
  assert.match(harness,/role="status"/);
  assert.match(css,/max-width:\s*100%/);
  assert.doesNotMatch(css,/overflow-x:\s*hidden/);
 });
}
test("report controls reuse the existing UI system, not native selects or bespoke dropdowns",()=>{
 const featureFiles=["biweekly-tab.tsx","mock-report.tsx","mock-pdf-download.tsx","report-timeline.tsx"];
 for(const file of featureFiles){
  const ui=readFileSync(`src/components/biweekly/${file}`,"utf8");
  assert.doesNotMatch(ui,/<select\b|<option\b|<button\b/);
  assert.match(ui,/@\/components\/ui\/button/);
 }
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 assert.match(ui,/@\/components\/ui\/select/);
 assert.match(ui,/@\/components\/ui\/tooltip/);
 assert.match(ui,/collisionPadding=\{12\}/);
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 assert.match(css,/--radix-select-trigger-width/);
 assert.match(css,/--radix-select-content-available-height/);
 assert.match(css,/100vw/);
});
test("width harness is isolated to the public mock demo and uses shared Button controls",()=>{
 const harness=readFileSync("src/components/biweekly/demo-preview.tsx","utf8");
 const page=readFileSync("src/app/[locale]/biweekly-demo/page.tsx","utf8");
 const detail=readFileSync("src/app/[locale]/(authenticated)/farms/fields/detail/page.tsx","utf8");
 assert.match(harness,/@\/components\/ui\/button/);
 assert.doesNotMatch(harness,/<button\b|<select\b/);
 assert.match(page,/BiweeklyDemoPreview/);
 assert.doesNotMatch(detail,/BiweeklyDemoPreview|demo-preview/);
});
test("report navigation and the genuine PDF action form one cohesive wrapping toolbar",()=>{
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 const toolbar=ui.match(/className=\{s\.reportToolbar\}([\s\S]*?)<div className=\{s\.content\}/)?.[1]??"";
 assert.match(toolbar,/className=\{s\.reportRow\}/);
 assert.match(toolbar,/triggerRow/);
 assert.match(toolbar,/有界补数/);
 assert.match(css,/\.reportToolbar\{[^}]*flex-wrap:\s*wrap/);
 assert.match(css,/var\(--border\)/);
 assert.doesNotMatch(css,/--wash|--tone|\.VEG\{|\.TRANS\{|\.REPRO\{/);
});
test("editorial body groups metric controls with title and renders all chart dates as native text",()=>{
 const report=readFileSync("src/components/biweekly/mock-report.tsx","utf8");
 const css=readFileSync("src/components/biweekly/mock-report.module.css","utf8");
 assert.match(report,/className=\{s\.sectionHeading\}/);
 assert.match(report,/<figcaption className=\{s\.chartDates\}/);
 assert.match(report,/<time[^>]*dateTime=\{p\.date\}/);
 assert.match(css,/var\(--foreground\)/);
 assert.match(css,/var\(--muted-foreground\)/);
 assert.doesNotMatch(css,/border-bottom:/);
});
test("token-derived active text meets AA contrast on light and dark report surfaces",()=>{
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 const global=readFileSync("src/app/globals.css","utf8");
 assert.match(css,/--bw-active:color-mix\(in srgb,hsl\(var\(--success\)\) 82%,hsl\(var\(--foreground\)\)\)/);
 function token(scope:string,key:string){
  const match=scope.match(new RegExp(`--${key}:\\s*([\\d.]+) ([\\d.]+)% ([\\d.]+)%`));
  assert.ok(match,`missing ${key}`);
  const h=Number(match[1]),s=Number(match[2])/100,l=Number(match[3])/100,a=s*Math.min(l,1-l);
  const channel=(n:number)=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [channel(0),channel(8),channel(4)];
 }
 function luminance(rgb:number[]){return rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
 for(const scope of [global.split(".dark {")[0],global.split(".dark {")[1]]){
  const success=token(scope,"success"),ink=token(scope,"foreground");
  const active=success.map((c,i)=>c*.82+ink[i]*.18);
  for(const surface of ["background","primary-subtle"]){
   const a=luminance(active),b=luminance(token(scope,surface));
   assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`active text contrast on ${surface}`);
  }
 }
});
test("native date captions stay aligned because trend never exceeds its SVG height aspect cap",()=>{
 const css=readFileSync("src/components/biweekly/mock-report.module.css","utf8");
 assert.match(css,/\.trend\{[^}]*width:100%[^}]*max-width:468px/);
 assert.match(css,/\.chart\{[^}]*max-height:164px/);
 for(const panel of [288,400,640,900]){
  const content=panel-2*(panel>=600?24:panel>=360?20:16);
  const figure=Math.min(468,content>=480?(content-24)*1.3/2.3:content);
  assert.ok(figure*140/400<=164);
 }
});
test("report owns generous four-side inset exactly once in demo and real parcel tab",()=>{
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 const page=readFileSync("src/app/[locale]/(authenticated)/farms/fields/detail/page.tsx","utf8");
 assert.match(ui,/return <div className=\{s\.frame\}><section/);
 assert.match(css,/\.frame\{[^}]*container-type:inline-size/);
 assert.match(css,/\.root\{[^}]*box-sizing:border-box[^}]*padding:var\(--space-6\) var\(--space-4\)/);
 assert.match(css,/@container\(min-width:360px\)\{\.root\{padding-inline:var\(--space-5\)/);
 assert.match(css,/@container\(min-width:600px\)\{\.root\{padding-inline:var\(--space-6\)/);
 assert.match(page,/<TabsContent value="biweekly" className="mt-0 min-w-0 p-0">/);
 for(const [outer,inset,content] of [[288,16,256],[400,20,360],[640,24,592],[900,24,852]]){
  assert.equal(outer-inset*2,content);
  assert.ok(content>=256,"focus timeline retains its bounded readable content area after generous insets");
 }
});
test("chart ticks cannot split dates and narrow sparse ticks do not remove observations",()=>{
 const css=readFileSync("src/components/biweekly/mock-report.module.css","utf8");
 const report=readFileSync("src/components/biweekly/mock-report.tsx","utf8");
 assert.match(css,/\.chartDates time\{[^}]*width:32px[^}]*white-space:nowrap[^}]*overflow-wrap:normal/);
 assert.match(css,/@container\(max-width:300px\)[\s\S]*visibility:hidden/);
 assert.match(report,/report\.series\.map\(\(p,i\)=><circle/);
 assert.match(report,/report\.series\.map\(p=><time/);
 assert.doesNotMatch(report,/series\.filter|series\.slice/);
});
test("pixel map sizing cannot inflate the small Layers icon in its caption",()=>{
 const css=readFileSync("src/components/biweekly/mock-report.module.css","utf8");
 assert.doesNotMatch(css,/\.pixelPanel svg\{/);
 assert.match(css,/\.pixelPanel>svg\{/);
 assert.match(css,/\.mapTag>svg\{[^}]*width:12px[^}]*height:12px[^}]*flex-shrink:0/);
});
