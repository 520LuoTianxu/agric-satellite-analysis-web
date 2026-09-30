/** 验证详情页真实热力图 effect：首次显示不受底图瓦片阻塞，旧日期等待回调必须清理。 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const filename = path.resolve(import.meta.dirname, "../src/app/[locale]/(authenticated)/farms/fields/detail/page.tsx");
const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") {
        const dependencies = node.arguments[1];
        if (dependencies && ts.isArrayLiteralExpression(dependencies) && dependencies.elements.some((item) => item.getText(source) === "agriHeatmap")) {
            effect = node.arguments[0];
        }
    }
    ts.forEachChild(node, visit);
}
visit(source);
assert.ok(effect, "必须找到详情页的真实热力图同步 effect");
const code = ts.transpileModule(`module.exports = ${effect.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

class TestMap extends EventEmitter {
    styleReady = true;
    opacity = 0.2;
    getStyle() { return this.styleReady ? { version: 8, layers: [] } : undefined; }
    isStyleLoaded() { return false; }
    getLayer() { return {}; }
    setPaintProperty(_layer, _property, value) { this.opacity = value; }
}

function sync(map, heatmap) {
    const applied = [];
    const module = { exports: undefined };
    vm.runInNewContext(code, {
        module,
        mapInstance: map,
        agriHeatmap: heatmap,
        landRef: { current: { boundary_geojson: { type: "Polygon", coordinates: [] } } },
        clearAgriHeatmapLayers: () => {},
        applyAgriHeatmapToMap: (_map, image) => applied.push(image),
    }, { filename });
    return { cleanup: module.exports(), applied };
}

const map = new TestMap();
const latest = { date: "2026-09-23", index: "ndvi" };
const initial = sync(map, latest);
assert.deepEqual(initial.applied, [latest], "底图瓦片未加载完成时，首次选择长势分析也应立即显示默认日期热力图");
assert.equal(map.opacity, 0);
initial.cleanup();
assert.equal(map.opacity, 0.2);

map.styleReady = false;
const waiting = sync(map, latest);
assert.equal(waiting.applied.length, 0, "新样式尚未就绪时不能添加热力图");
waiting.cleanup();
const next = { date: "2026-09-26", index: "ndvi" };
const changed = sync(map, next);
map.styleReady = true;
map.emit("style.load");
assert.deepEqual(waiting.applied, [], "日期切换后不能补绘旧日期热力图");
assert.deepEqual(changed.applied, [next], "样式就绪后应自动补绘最新日期，无需用户再次切换日期");
changed.cleanup();
assert.equal(map.listenerCount("style.load"), 0);
console.log("Initial heatmap checks passed: pending basemap tiles, style readiness, date replacement and listener cleanup.");
