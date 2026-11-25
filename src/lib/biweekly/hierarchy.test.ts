import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MOCK_REPORTS } from "./mock-report.ts";

test("phase tree owns every report once including crossover and future empty stages", async () => {
 const { getPhaseTree } = await import("./mock-report.ts");
 for(const crop of ["wheat","maize"] as const){
  const tree=getPhaseTree(crop);
  assert.deepEqual(tree.map(p=>p.label),["S1","S2","S3"]);
  const reports=tree.flatMap(p=>p.growthPeriods.flatMap(g=>g.reports));
  assert.equal(reports.length,4);
  assert.equal(new Set(reports.map(r=>r.id)).size,4);
  assert.deepEqual(reports.map(r=>r.id).sort(),MOCK_REPORTS.filter(r=>r.crop===crop).map(r=>r.id).sort());
  assert.ok(tree.some(p=>p.growthPeriods.some(g=>g.reports.length>=2)));
  assert.ok(tree[2].growthPeriods.every(g=>g.reports.length===0));
  const crossover=reports.find(r=>r.coveredGrowthPeriods.length>1);
  assert.ok(crossover);
  assert.ok(crossover.coveredGrowthPeriods.includes(crossover.primaryGrowthPeriod));
 }
});
test("normal field workflow renders a peer tab, not a parcel entry or report modal",()=>{
 const page=readFileSync("src/app/[locale]/(authenticated)/farms/fields/detail/page.tsx","utf8");
 const parcel=readFileSync("src/components/field/parcel-analysis-tab.tsx","utf8");
 const report=readFileSync("src/components/biweekly/mock-report.tsx","utf8");
 const list=page.match(/<TabsList\b[^>]*>([\s\S]*?)<\/TabsList>/)?.[1] ?? "";
 assert.deepEqual([...list.matchAll(/<TabsTrigger\s+value="([^"]+)"/g)].map(m=>m[1]),["ndvi","weather","soil","alerts","biweekly","parcel-analysis"]);
 assert.match(page,/<TabsContent value="biweekly"/);
 assert.doesNotMatch(parcel,/MockReportSummary/);
 assert.doesNotMatch(report,/Dialog|Portal|role="dialog"/);
});

test("all supported locales define the peer label and mock UI has no service dependency",()=>{
 for(const locale of ["zh","en","es"]){
  const messages=JSON.parse(readFileSync(`messages/${locale}.json`,"utf8"));
  assert.equal(typeof messages.fieldDetail.tabBiweekly,"string");
 }
 const ui=readFileSync("src/components/biweekly/biweekly-tab.tsx","utf8");
 assert.doesNotMatch(ui,/Dialog|Drawer|Sheet|Portal|fetch\(|useSWR|axios|from ["'].*api/);

 assert.match(ui,/LOCAL_SEASONS/);
 assert.doesNotMatch(ui,/玉米/);
});
