/** 执行真实 TypeScript 业务函数，覆盖全量名单、缺测、去重与筛选统计。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
let mockFetch;
function load(relative) {
    const filename = path.join(root, relative);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports,
        require: (name) => name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name),
        Set, Map, Number, Array, Object, URLSearchParams, AbortController, DOMException,
        setTimeout, clearTimeout, fetch: (...args) => mockFetch(...args),
    }, { filename });
    return module.exports;
}
const { mergeProjectLands, summarizeProjectLands, filterProjectLands, EMPTY_PROJECT_FILTERS } = load("src/lib/project-monitoring.ts");
const business = [
    { landId: "A", landName: "高风险玉米", landArea: 100, cropName: "玉米" },
    { landId: "B", landName: "正常玉米", landArea: 300, cropName: "玉米", cropStatusName: "种植中" },
    { landId: "C", landName: "缺数据小麦", landArea: 600, cropName: "小麦" },
];
const monitoring = [
    { land_id: "A", risk_level: "high", data_status: "fresh", open_alert_count: 3, open_high_count: 2, area_mu: 99 },
    { land_id: "B", risk_level: "normal", data_status: "fresh", open_alert_count: 0, open_high_count: 0 },
    { land_id: "OUTSIDE", risk_level: "high", data_status: "fresh", open_alert_count: 99 },
];
const lands = mergeProjectLands([...business, business[0]], monitoring);
assert.equal(lands.length, 3, "duplicate business parcels and foreign parcels must not inflate totals");
const stats = summarizeProjectLands(lands);
assert.equal(stats.areaMu, 1000);
assert.equal(stats.coverage, 40, "coverage is area-weighted, not parcel-count-weighted");
assert.equal(stats.riskCount, 1);
assert.equal(stats.riskAreaMu, 100);
assert.equal(stats.openAlerts, 3, "three alerts on one parcel still represent one risk parcel");
assert.equal(stats.risks.unknown, 1);
assert.equal(lands[2].dataStatus, "missing");
assert.equal(filterProjectLands(lands, { ...EMPTY_PROJECT_FILTERS, focus: "pending" }).length, 1);
const cropFiltered = filterProjectLands(lands, { ...EMPTY_PROJECT_FILTERS, crop: "玉米" });
assert.equal(summarizeProjectLands(cropFiltered).coverage, 100);
assert.equal(cropFiltered[0].landId, "A", "highest risk sorts first");
assert.equal(filterProjectLands(lands, { ...EMPTY_PROJECT_FILTERS, risk: "high", crop: "小麦" }).length, 0);
assert.equal(filterProjectLands(lands, { ...EMPTY_PROJECT_FILTERS, planting: "种植中" }).length, 1);
assert.equal(filterProjectLands(lands, { ...EMPTY_PROJECT_FILTERS, query: " B " })[0].landId, "B");
const unavailable = mergeProjectLands(business, null);
assert.ok(unavailable.every((land) => land.dataStatus === "unavailable" && land.riskLevel === "unknown"));
const unknownArea = summarizeProjectLands(mergeProjectLands([{ landId: "D", landArea: "" }], []));
assert.equal(unknownArea.missingArea, 1);
assert.equal(unknownArea.coverage, null);
assert.equal(summarizeProjectLands([]).coverage, null);
assert.equal(mergeProjectLands(Array.from({ length: 601 }, (_, i) => ({ landId: String(i), landArea: 1 })), []).length, 601);
assert.equal(mergeProjectLands([{ landId: "invalid", wgsLandPath: "190,30|191,30|191,31" }], [])[0].geometry, null);
assert.equal(mergeProjectLands([{ landId: "broken" }], [{ land_id: "broken", boundary_geojson: { type: "Polygon", coordinates: [null] } }])[0].geometry, null);
const { listAllCropLands } = load("src/lib/agric.ts");
let pageCalls = 0;
mockFetch = async (url) => {
    const page = Number(new URL(url, "http://fixture").searchParams.get("pageNum"));
    pageCalls += 1;
    const rows = Array.from({ length: page <= 51 ? 200 : 0 }, (_, i) => ({ landId: String((page - 1) * 200 + i) }));
    return { ok: true, text: async () => JSON.stringify({ code: 200, total: 10200, rows }) };
};
assert.equal((await listAllCropLands("large-project")).length, 10200, "project statistics must not stop at 50 pages");
assert.equal(pageCalls, 51);
mockFetch = async () => ({ ok: true, text: async () => JSON.stringify({ code: 200, total: 3, rows: [{ landId: "repeated" }] }) });
await assert.rejects(listAllCropLands("incomplete-project"), /Incomplete project land list/, "repeated pages must not silently yield partial totals");
console.log("Project monitoring: scope, deduplication, area-weighted coverage, filters and missing-data checks passed.");
