/** 验证真实底图配置与失败降级，防止底图故障清空地块和遥感图层。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { EventEmitter } from "node:events";
import ts from "typescript";

const filename = path.resolve(import.meta.dirname, "../src/lib/pmtiles.ts");
const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
const env = {};
const warnings = [];
const errors = [];
const protocolHandlers = new Map();
const requestedAdminUrls = [];
const mockMapLibre = { addProtocol: (name, handler) => protocolHandlers.set(name, handler) };
const mockCoverage = {
    ghr: { "20": [[10, 20, 30, 40]] },
    map2025Shandong: { "20": [[50, 60, 70, 80]] },
};
vm.runInNewContext(code, {
    module, exports: module.exports, process: { env }, setTimeout, clearTimeout,
    require: (name) => {
        if (name === "maplibre-gl") return { default: mockMapLibre };
        if (name === "pmtiles") return { Protocol: class { tile() {} } };
        if (name === "@/lib/agric") return { getSatelliteTileCoverage: () => Promise.resolve(mockCoverage) };
        return {};
    },
    fetch: async (url) => {
        requestedAdminUrls.push(url);
        return { ok: true, status: 200, url, arrayBuffer: async () => new ArrayBuffer(0) };
    },
    console: { warn: (...args) => warnings.push(args), error: (error) => errors.push(error) },
}, { filename });
const { getBasemapStyle, getStreetBasemapStyle, MAP_STYLES, installBasemapFallback, registerPMTilesProtocol } = module.exports;
const satellite = getBasemapStyle();
assert.ok(satellite.sources["gaode-satellite"].tiles[0].includes("is.autonavi.com"), "默认底图必须使用高德卫星瓦片");
assert.ok(satellite.sources["gaode-label"].tiles[0].includes("style=8"), "卫星底图必须叠加高德标注瓦片");
assert.equal(satellite.sources["agric-admin-satellite"].minzoom, 17);
assert.equal(satellite.sources["agric-admin-satellite"].maxzoom, 20);
assert.equal(satellite.sources["agric-admin-satellite"].tiles[0], "agric-admin://{z}/{z}-{x}-{y}.png", "高层级必须通过范围感知协议读取管理端高清瓦片");
assert.ok(satellite.layers.some((layer) => layer.id === "gaode-label-layer"), "卫星底图必须包含高德标注层");
assert.equal(satellite.layers.find((layer) => layer.id === "agric-admin-satellite-layer").minzoom, 17);
assert.ok(getStreetBasemapStyle().sources["gaode-road"].tiles[0].includes("wprd01.is.autonavi.com") && getStreetBasemapStyle().sources["gaode-road"].tiles[0].includes("style=8"), "街道底图必须使用高德道路瓦片");
assert.ok(!JSON.stringify(MAP_STYLES).includes("arcgisonline.com"), "不能再次请求被拒绝的 Esri 瓦片");
registerPMTilesProtocol();
const adminTile = protocolHandlers.get("agric-admin");
assert.ok(adminTile, "必须注册管理端高清瓦片协议");
await adminTile({ url: "agric-admin://20/20-10-30.png" }, new AbortController());
await adminTile({ url: "agric-admin://20/20-50-70.png" }, new AbortController());
await adminTile({ url: "agric-admin://20/20-90-100.png" }, new AbortController());
assert.deepEqual(requestedAdminUrls, [
    "https://map-info.cdfinance.com.cn/ghr/20/20-10-30.png",
    "https://map-info.cdfinance.com.cn/Map2025Shandong/20/20-50-70.png",
    "https://map-info.cdfinance.com.cn/uat/20/20-90-100.png",
], "管理端高清瓦片必须按后端下发范围选择目录");
class TestMap extends EventEmitter {
    constructor(style = getBasemapStyle()) {
        super();
        this.style = structuredClone(style);
        this.style.sources.field = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
        this.style.sources.heatmap = { type: "image", url: "blob:heatmap" };
        this.style.layers.push({ id: "heatmap", source: "heatmap", type: "raster" }, { id: "field", source: "field", type: "line" });
    }
    getStyle() { return this.style; }
    getSource(id) { return this.style.sources[id]; }
    getLayer(id) { return this.style.layers.find((layer) => layer.id === id); }
    removeLayer(id) { this.style.layers = this.style.layers.filter((layer) => layer.id !== id); }
    removeSource(id) {
        assert.ok(!this.style.layers.some((layer) => layer.source === id));
        delete this.style.sources[id];
    }
    addSource(id, source) { assert.ok(!this.getSource(id)); this.style.sources[id] = source; }
    addLayer(layer, before) {
        assert.ok(!this.getLayer(layer.id));
        const index = before ? this.style.layers.findIndex((item) => item.id === before) : this.style.layers.length;
        assert.ok(index >= 0);
        this.style.layers.splice(index, 0, layer);
    }
}
const waitForFallback = () => new Promise((resolve) => setTimeout(resolve, 10));
const failedTile = { sourceId: "gaode-satellite", error: new TypeError("Failed to fetch") };
const map = new TestMap();
const field = map.getSource("field");
const heatmap = map.getSource("heatmap");
const changed = [];
installBasemapFallback(map, (styleId) => changed.push(styleId));
for (let i = 0; i < 15; i++) map.emit("error", failedTile);
await waitForFallback();
assert.deepEqual(changed, ["satellite"], "一批瓦片错误只降级一次");
assert.equal(map.getSource("gaode-satellite"), undefined);
assert.equal(map.getSource("field"), field, "保留同一个地块数据源");
assert.equal(map.getSource("heatmap"), heatmap, "保留遥感影像和数据引用");
assert.deepEqual(map.style.layers.map((layer) => layer.id), ["osm-layer", "agric-admin-satellite-layer", "gaode-label-layer", "heatmap", "field"]);
assert.equal(warnings.length, 1);
map.emit("error", { sourceId: "osm", error: new Error("fallback unavailable") });
map.emit("error", { sourceId: "field", error: new Error("business error") });
await waitForFallback();
assert.equal(changed.length, 1, "备用源失败不得无限重试");
assert.equal(errors.length, 2, "业务错误和备用源错误仍应被记录");

const removed = new TestMap();
installBasemapFallback(removed);
removed.emit("error", failedTile);
removed.emit("remove");
await waitForFallback();
assert.ok(removed.getSource("gaode-satellite"), "卸载时取消待执行的地图操作");
assert.equal(removed.listenerCount("error"), 0);

const switched = new TestMap();
installBasemapFallback(switched);
switched.emit("error", failedTile);
switched.style = structuredClone(getStreetBasemapStyle());
await waitForFallback();
assert.equal(warnings.length, 1, "旧瓦片的失败不能覆盖用户刚切换的底图");

const aborted = new TestMap();
installBasemapFallback(aborted);
aborted.emit("error", { ...failedTile, error: { name: "AbortError" } });
await waitForFallback();
assert.ok(aborted.getSource("gaode-satellite"), "取消请求不是图源故障");
for (const item of [map, switched, aborted]) item.emit("remove");
const partial = new TestMap();
const remainingLabels = partial.getSource("gaode-label");
const partialChanges = [];
installBasemapFallback(partial, (styleId) => partialChanges.push(styleId));
partial.emit("error", failedTile);
await waitForFallback();
assert.equal(partial.getSource("gaode-satellite"), undefined, "高德卫星瓦片失败后应移除故障图源");
assert.equal(partial.getSource("gaode-label"), remainingLabels, "高德标注图层未故障时应继续保留");
assert.equal(partialChanges[0], "satellite");
partial.emit("remove");
const bothFailed = new TestMap();
installBasemapFallback(bothFailed);
bothFailed.emit("error", failedTile);
bothFailed.emit("error", { ...failedTile, sourceId: "gaode-satellite" });
bothFailed.emit("error", { ...failedTile, sourceId: "gaode-label" });
bothFailed.emit("error", { ...failedTile, sourceId: "agric-admin-satellite" });
await waitForFallback();
assert.equal(bothFailed.getSource("agric-admin-satellite"), undefined, "同一批次的高清图源失败也应被处理");
assert.equal(bothFailed.getSource("gaode-satellite"), undefined, "同一批次的多个图源失败都应被处理");
assert.equal(bothFailed.getSource("gaode-label"), undefined, "同一批次的标注图源失败也应被处理");
assert.ok(bothFailed.getSource("osm"));
bothFailed.emit("remove");
console.log("Basemap checks passed: Gaode-only satellite layers, overlay preservation, batched failures, no retry loop and cleanup.");
