"""用真实 MapLibre 验证卫星瓦片、缩放层级和 403 降级；需要 Python Playwright、Pillow。

python scripts/verify-basemap-ui.py
使用独立浏览器和临时本地页面，不读取用户会话，不访问业务接口。
"""

import io
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(tempfile.gettempdir()) / "agric-basemap-qa"
OUTPUT.mkdir(exist_ok=True)
public_env = {}
local_env = ROOT / ".env.local"
if local_env.exists():
    for line in local_env.read_text(encoding="utf-8").splitlines():
        if line.startswith("NEXT_PUBLIC_TIANDITU_KEY="):
            public_env["NEXT_PUBLIC_TIANDITU_KEY"] = line.split("=", 1)[1].strip()

# 直接编译真实业务模块，仅替换与本次测试无关的图标和 PMTiles 注册依赖。
compiled = subprocess.run([
    "node", "-e",
    "const fs=require('fs'), ts=require('typescript');"
    "process.stdout.write(ts.transpileModule(fs.readFileSync('src/lib/pmtiles.ts','utf8'),"
    "{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);",
], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf-8")
(OUTPUT / "basemap.js").write_text(compiled, encoding="utf-8")
for asset in ["maplibre-gl.js", "maplibre-gl.css"]:
    (OUTPUT / asset).write_bytes((ROOT / "node_modules/maplibre-gl/dist" / asset).read_bytes())
(OUTPUT / "index.html").write_text("""<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="maplibre-gl.css"><style>html,body,#map{margin:0;width:100%;height:100%}</style>
<div id="map"></div><script src="maplibre-gl.js"></script><script>
const module={exports:{}}, exports=module.exports, process={env:{}};
const require=(name)=>name==='maplibre-gl'?maplibregl:{};
</script><script src="basemap.js"></script><script>
window.fallbackCount=0;
window.map=new maplibregl.Map({container:'map',style:module.exports.getBasemapStyle(),
    center:[112.0774,37.2545],zoom:18,preserveDrawingBuffer:true});
module.exports.installBasemapFallback(map,()=>window.fallbackCount++);
map.once('style.load',()=>{
    map.addSource('field',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',
        coordinates:[[[112.0771,37.2543],[112.0776,37.2543],[112.0776,37.2547],[112.0771,37.2547],[112.0771,37.2543]]]}}});
    map.addLayer({id:'field-outline',source:'field',type:'line',paint:{'line-color':'#ff3344','line-width':3}});
    map.addSource('heatmap',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[112.0774,37.2545]}}});
    map.addLayer({id:'heatmap',source:'heatmap',type:'circle',paint:{'circle-color':'#00ff00','circle-radius':5}});
    window.fieldSource=map.getSource('field'); window.heatmapSource=map.getSource('heatmap');
});
</script>""".replace("process={env:{}}", "process={env:" + json.dumps(public_env) + "}"), encoding="utf-8")


# 仅在独立浏览器内拦截测试页面，模拟部署域名的真实 Origin；瓦片请求仍直连 OSS。
# 不发布文件到测试站点，也不伪造瓦片响应的跨域头。
url = "https://joint-venture-test.cdfinance.com.cn/__basemap-qa/"


def install_page(context):
    def serve(route):
        name = route.request.url.removeprefix(url) or "index.html"
        mime = "text/html" if name.endswith(".html") else "text/css" if name.endswith(".css") else "application/javascript"
        route.fulfill(content_type=mime, body=(OUTPUT / name).read_bytes())
    context.route(url + "**", serve)


report = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1100, "height": 760})
    install_page(context)
    page = context.new_page()
    page_errors, requests, satellite_ok, failed_requests, console_errors = [], [], [], [], []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: requests.append(request.url))
    page.on("requestfailed", lambda request: failed_requests.append((request.url, request.failure)))
    page.on("response", lambda response: satellite_ok.append(response.url)
            if "2025_WGS84_HIGH_Satellite" in response.url and response.status == 200 else None)
    page.goto(url)
    page.wait_for_function("window.map && map.loaded() && window.fieldSource", timeout=45000)
    assert page.evaluate("!!map.getSource('farm-satellite') && fallbackCount === 0"), f"真实卫星图源加载失败: {console_errors[:3]} {failed_requests[:2]}"
    assert satellite_ok, "未收到成功的卫星瓦片响应"
    image = page.screenshot(path=str(OUTPUT / "satellite.png"))
    colors = Image.open(io.BytesIO(image)).convert("RGB").crop((100, 100, 900, 600)).getcolors(400001)
    assert colors and len(colors) > 1000, "地图可能是空白或占位图"
    report["satellite_200_responses"] = len(satellite_ok)
    page.evaluate("() => new Promise(resolve => { map.once('idle', () => resolve(true)); map.jumpTo({zoom:15}); })")
    assert page.evaluate("fallbackCount === 0 && !!map.getSource('farm-satellite')"), "视图 15 级应加载有效的 16 级瓦片"
    request_start = len(requests)
    page.evaluate("() => new Promise(resolve => { map.once('idle', () => resolve(true)); map.jumpTo({zoom:5}); })")
    assert not any("2025_WGS84_HIGH_Satellite" in item for item in requests[request_start:]), "低层级不应请求不存在的影像"
    if public_env.get("NEXT_PUBLIC_TIANDITU_KEY"):
        assert page.evaluate("!!map.getSource('tianditu') && fallbackCount === 0"), "低层级天地图影像应可用"
        report["tianditu_low_zoom"] = "passed"
    request_start = len(requests)
    page.evaluate("() => new Promise(resolve => { map.once('idle', () => resolve(true)); map.jumpTo({zoom:20,center:[112.083,37.2545]}); })")
    zoomed_tiles = [item for item in requests[request_start:] if "2025_WGS84_HIGH_Satellite" in item]
    assert zoomed_tiles and all("/19/19-" in item for item in zoomed_tiles), f"20 级应复用 19 级瓦片: {zoomed_tiles}"
    assert not any("arcgisonline.com" in item for item in requests)
    assert not page_errors, page_errors
    report["zoom_limits"] = "passed"
    context.close()

    # 模拟外部服务拒绝，验证真实错误事件能降级且不会删除业务数据源。
    context = browser.new_context(viewport={"width": 1100, "height": 760})
    install_page(context)
    context.route("**/2025_WGS84_HIGH_Satellite/**", lambda route: route.fulfill(
        status=403, body="Forbidden", headers={"Access-Control-Allow-Origin": "*"}))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("window.fallbackCount === 1 && map.loaded()", timeout=45000)
    assert page.evaluate("""!map.getSource('farm-satellite') && !!map.getSource('osm') &&
        map.getSource('field')===fieldSource && map.getSource('heatmap')===heatmapSource &&
        !!map.getLayer('field-outline') && !!map.getLayer('heatmap')""")
    if public_env.get("NEXT_PUBLIC_TIANDITU_KEY"):
        assert page.evaluate("!!map.getSource('tianditu')"), "高清影像 403 后应保留正常的低级别影像"
    page.screenshot(path=str(OUTPUT / "fallback.png"))
    assert not errors, errors
    report["403_preserves_overlays"] = "passed"
    context.close()
    browser.close()

print(json.dumps({**report, "screenshots": str(OUTPUT)}, ensure_ascii=False))
