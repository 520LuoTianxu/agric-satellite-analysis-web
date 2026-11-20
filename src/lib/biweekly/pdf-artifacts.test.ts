import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { MOCK_REPORTS } from "./mock-report.ts";

test("each synthetic snapshot has a genuine downloadable PDF with matching digest and provenance",()=>{
 const manifest=JSON.parse(readFileSync("src/lib/biweekly/mock-pdf-manifest.json","utf8"));
 assert.equal(manifest.modelVersion,"none-mock-template");
 assert.equal(manifest.artifacts.length,MOCK_REPORTS.length);
 for(const report of MOCK_REPORTS){
  const artifact=manifest.artifacts.find((a:{reportId:string})=>a.reportId===report.id);
  assert.ok(artifact);
  assert.equal(artifact.snapshotSha256,createHash("sha256").update(JSON.stringify(report)).digest("hex"));
  const pdf=readFileSync(`public${artifact.url}`);
  assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
  assert.ok(pdf.length>10000);
  assert.equal(artifact.sha256,createHash("sha256").update(pdf).digest("hex"));
  assert.equal(artifact.status,"ready");
 }
});
test("future async state contract never enables a download without a ready artifact",async()=>{
 const {pdfAction}=await import("./pdf-contract.ts");
 for(const status of ["queued","running","failed","unavailable"] as const) assert.equal(pdfAction({status}).downloadable,false);
 assert.equal(pdfAction({status:"ready"}).downloadable,false);
 assert.equal(pdfAction({status:"ready",artifactUrl:"javascript:alert(1)"}).downloadable,false);
 assert.equal(pdfAction({status:"ready",artifactUrl:"//untrusted.example/file.pdf"}).downloadable,false);
 assert.equal(pdfAction({status:"ready",artifactUrl:"/biweekly-mock/wheat-1.pdf"}).downloadable,true);
});
test("download is an actual file anchor, not print or a fake AI/generation call",()=>{
 const ui=readFileSync("src/components/biweekly/mock-pdf-download.tsx","utf8");
 assert.match(ui,/download=/);
 assert.match(ui,/Mock/);
 assert.doesNotMatch(ui,/window\.print|fetch\(|axios|setTimeout|生成中/);
});
