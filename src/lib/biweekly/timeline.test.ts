import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MOCK_REPORTS, getPhaseTree } from "./mock-report.ts";

// No full-season pixel geometry: navigation deliberately does not imply duration proportions.
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
  const expected=crop==="wheat"?["rising","jointing","heading"]:["jointing","ear","flowering"];
  assert.deepEqual(phases.map(p=>nav.selectPhase(p,reports).growthId),expected);
  assert.deepEqual(phases.map(p=>nav.selectPhase(p,reports).reportId),[`${crop}-2`,`${crop}-4`,null]);
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
test("flat stage navigation has no full-season scroll track, auto-scroll, or report overlay", () => {
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 const css=readFileSync("src/components/biweekly/biweekly-tab.module.css","utf8");
 assert.doesNotMatch(ui,/buildTimeline|dateRatio|scrollTo|ResizeObserver|scrollRef|<details|<summary|Dialog|Drawer|Portal|tablist/);
 assert.match(ui,/阶段导航.*非等比/);
 assert.match(ui,/aria-pressed/);
 assert.match(ui,/phase\.growthPeriods\.map/);
 assert.match(ui,/getGrowthReports\(selection\.growthId,reports\)/);
 assert.match(ui,/adjacentReport\(filtered/);
 assert.match(ui,/暂无.*报告/);
 assert.doesNotMatch(css,/position:\s*absolute|overflow-x:\s*(auto|scroll)|white-space:\s*nowrap|text-overflow:\s*ellipsis/);
 assert.match(css,/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
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
 const featureFiles=["biweekly-tab.tsx","mock-report.tsx","mock-pdf-download.tsx"];
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
 assert.match(toolbar,/MockPdfDownload/);
 assert.match(css,/\.reportToolbar\{[^}]*flex-wrap:\s*wrap/);
 assert.match(css,/var\(--surface-2\)/);
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
  const figure=Math.min(468,panel>=480?(panel-20)*1.3/2.3:panel);
  assert.ok(figure*140/400<=164);
 }
});
