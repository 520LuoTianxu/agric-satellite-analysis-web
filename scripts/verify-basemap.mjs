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
vm.runInNewContext(code, {
    module, exports: module.exports, process: { env }, setTimeout, clearTimeout,
    require: () => ({}),
    console: { warn: (...args) => warnings.push(args), error: (error) => errors.push(error) },
}, { filename });
const { getBasemapStyle, getStreetBasemapStyle, MAP_STYLES, installBasemapFallback } = module.exports;
const satellite = getBasemapStyle();
assert.equal(satellite.sources["farm-satellite"].minzoom, 16);
assert.equal(satellite.sources["farm-satellite"].maxzoom, 19);
assert.equal(satellite.layers.at(-1).maxzoom, undefined, "放大到 20 级后仍应显示 19 级影像");
assert.ok(satellite.sources["farm-satellite"].tiles[0].includes("2025_WGS84_HIGH_Satellite"));
assert.ok(!JSON.stringify(MAP_STYLES).includes("arcgisonline.com"), "不能再次请求被拒绝的 Esri 瓦片");
assert.equal(satellite.layers.at(-1).minzoom, 15, "MapLibre 视图 15 级应开始加载 256 像素瓦片的 16 级");
env.NEXT_PUBLIC_TIANDITU_KEY = "fixture-browser-key";
assert.ok(getBasemapStyle().sources.tianditu.tiles[0].startsWith("https://"), "天地图不得在 HTTPS 页面发起混合内容请求");
assert.ok(getBasemapStyle().layers.some((layer) => layer.source === "tianditu"));
delete env.NEXT_PUBLIC_TIANDITU_KEY;
env.NODE_ENV = "development";
env.NEXT_PUBLIC_BASE_PATH = "/agric-satellite-analysis-web/";
assert.equal(getBasemapStyle().sources["farm-satellite"].tiles[0],
    "/agric-satellite-analysis-web/basemap-satellite/{z}/{z}-{x}-{y}.png", "开发代理必须兼容子路径部署");
env.NEXT_PUBLIC_SATELLITE_TILE_URL = "https://example.com/{z}/{x}/{y}.png";
assert.equal(getBasemapStyle().sources["farm-satellite"].tiles[0], env.NEXT_PUBLIC_SATELLITE_TILE_URL);
for (const name of Object.keys(env)) delete env[name];

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
const failedTile = { sourceId: "farm-satellite", error: new TypeError("Failed to fetch") };
const map = new TestMap();
const field = map.getSource("field");
const heatmap = map.getSource("heatmap");
const changed = [];
installBasemapFallback(map, (styleId) => changed.push(styleId));
for (let i = 0; i < 15; i++) map.emit("error", failedTile);
await waitForFallback();
assert.deepEqual(changed, ["street"], "一批瓦片错误只降级一次");
assert.equal(map.getSource("farm-satellite"), undefined);
assert.equal(map.getSource("field"), field, "保留同一个地块数据源");
assert.equal(map.getSource("heatmap"), heatmap, "保留遥感影像和数据引用");
assert.deepEqual(map.style.layers.map((layer) => layer.id), ["osm-layer", "heatmap", "field"]);
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
assert.ok(removed.getSource("farm-satellite"), "卸载时取消待执行的地图操作");
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
assert.ok(aborted.getSource("farm-satellite"), "取消请求不是图源故障");
for (const item of [map, switched, aborted]) item.emit("remove");
env.NEXT_PUBLIC_TIANDITU_KEY = "fixture-browser-key";
const partial = new TestMap();
const remainingImagery = partial.getSource("tianditu");
const partialChanges = [];
installBasemapFallback(partial, (styleId) => partialChanges.push(styleId));
partial.emit("error", failedTile);
await waitForFallback();
assert.equal(partial.getSource("tianditu"), remainingImagery, "高清瓦片未覆盖的区域应继续显示天地图");
assert.equal(partialChanges[0], "satellite");
partial.emit("remove");
const bothFailed = new TestMap();
installBasemapFallback(bothFailed);
bothFailed.emit("error", failedTile);
bothFailed.emit("error", { ...failedTile, sourceId: "tianditu" });
await waitForFallback();
assert.equal(bothFailed.getSource("farm-satellite"), undefined);
assert.equal(bothFailed.getSource("tianditu"), undefined, "同一批次的多个图源失败都应被处理");
assert.ok(bothFailed.getSource("osm"));
bothFailed.emit("remove");
console.log("Basemap checks passed: WGS84 satellite levels, overlay preservation, batched failures, no retry loop and cleanup.");
