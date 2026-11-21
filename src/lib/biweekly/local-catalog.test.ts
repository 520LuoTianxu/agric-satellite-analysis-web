import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Avoid JSON import attributes so node --test can load this file.
const catalog = JSON.parse(readFileSync(new URL("./local-catalog.json", import.meta.url), "utf8"));
const seasons = catalog.seasons.filter(s => s.crop === "winter_wheat" && s.land_id === "6417");

test("local 6417 catalog is the 2025/26 wheat season with 18 half-open periods", () => {
 assert.deepEqual(seasons.map(s=>s.season_id),["2025/26"]);
 assert.equal(seasons[0].auto_publish,false);
 assert.equal(seasons.some(s=>s.crop!=="winter_wheat"),false);
 const season=seasons[0];
 assert.equal(season.periods.length,18);
 const issue12=season.periods.find(p=>p.period_id==="12");
 assert.equal(issue12?.start,"2026-04-04");
 assert.equal(issue12?.end_exclusive,"2026-04-18");
 assert.equal(issue12?.has_eligible_optics,true);
 assert.equal(season.periods.find(p=>p.period_id==="1")?.has_eligible_optics,false);
 const index=season.periods.findIndex(p=>p.period_id==="12");
 assert.equal(season.periods[index-1]?.period_id,"11");
 assert.equal(season.periods[17+1],undefined);
});
