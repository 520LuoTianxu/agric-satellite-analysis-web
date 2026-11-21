import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("frontend biweekly client uses the shared satellite API base and land paths", () => {
  const client = readFileSync("src/lib/biweekly/local-trigger.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  assert.match(api, /export const biweeklyApi/);
  assert.match(api, /getSatelliteAuthHeaders/);
  assert.match(api, /\/lands\//);
  assert.match(api, /biweekly\/seasons/);
  assert.match(api, /biweekly\/periods/);
  assert.match(api, /\/backfill/);
  assert.match(api, /\/generate/);
  assert.match(client, /from "@\/lib\/api"/);
  assert.match(client, /biweeklyApi\.backfill/);
  assert.match(client, /getSatelliteAuthHeaders/);
  assert.doesNotMatch(client, /127\.0\.0\.1:8765/);
  assert.doesNotMatch(client, /X-Biweekly-Dev-Token/);
  assert.match(client, /NEXT_PUBLIC_BIWEEKLY_LOCAL_FIXTURE/);
});

test("field detail wires the current land into the biweekly tab", () => {
  const page = readFileSync("src/app/[locale]/(authenticated)/farms/fields/detail/page.tsx", "utf8");
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  assert.match(page, /BiweeklyTab landId=\{landId\}/);
  assert.match(tab, /landId,cropType,allowLocalFixture/);
  assert.match(tab, /triggerBackfill/);
  assert.match(tab, /LOCAL_SEASONS/);
});

test("biweekly tab explains a missing Smart plan and does not invent 孕穗 or put 起身 in S1", () => {
  const tab = readFileSync("src/components/biweekly/biweekly-tab.tsx", "utf8");
  const mock = readFileSync("src/lib/biweekly/mock-report.ts", "utf8");
  assert.match(tab, /本田未关联 Smart 种植方案/);
  assert.match(tab, /不会改用其他地块的方案/);
  assert.match(tab, /listSeasons/);
  assert.doesNotMatch(mock, /孕穗/);
  const s1 = mock.slice(mock.indexOf("wheat ? ["), mock.indexOf('["rising","起身期"'));
  assert.match(s1, /返青期/);
  assert.doesNotMatch(s1, /起身期/);
  assert.match(mock, /\["rising","起身期"/);
});
