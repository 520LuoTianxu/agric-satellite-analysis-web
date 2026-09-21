"""用独立浏览器和模拟接口验证项目一期交互；先构建并启动本地静态服务。

python scripts/verify-project-monitoring-ui.py http://127.0.0.1:3017
需要 Python playwright、Pillow 和 Chromium；不会调用或修改真实业务数据。
"""

import io
import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3017"
OUTPUT = Path(tempfile.gettempdir()) / "agric-project-monitoring-qa"
OUTPUT.mkdir(exist_ok=True)


def boundary(index):
    lng, lat = 116.1 + (index % 3) * 0.008, 39.1 + (index // 3) * 0.008
    ring = [[lng, lat], [lng + 0.006, lat], [lng + 0.006, lat + 0.005], [lng, lat + 0.005], [lng, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


lands, items = [], []
for i, (risk, quality) in enumerate([
    ("high", "fresh"), ("medium", "fresh"), ("normal", "fresh"),
    ("low", "stale"), ("unknown", "low_quality"), ("unknown", "missing"),
]):
    land_id = f"L{i + 1}"
    geom = boundary(i) if i != 5 else None
    name = f"东区 {i + 1:02d} 号地块"
    lands.append({"landId": land_id, "landName": name, "landArea": (i + 1) * 100,
                  "cropName": "玉米" if i < 3 else "小麦", "cropStatusName": "种植中",
                  "ownerName": "示例负责人", "wgsLandPath": "|".join(f"{x},{y}" for x, y in geom["coordinates"][0]) if geom else ""})
    count = 2 if risk == "high" else 1 if risk in ("medium", "low") else 0
    observation = {"date": "2026-09-15" if quality == "fresh" else "2026-08-15", "ndvi": 0.4,
                   "ndmi": 0.25, "evi": 0.3, "cloud_cover": 5, "source": "stac_direct"} if quality in ("fresh", "stale") else None
    items.append({"land_id": land_id, "land_name": name, "area_mu": (i + 1) * 100,
                  "crop_type": lands[-1]["cropName"], "boundary_geojson": geom,
                  "risk_level": risk, "data_status": quality, "latest_scene_date": "2026-09-15" if observation else None,
                  "observation": observation, "previous_observation": {**observation, "date": "2026-08-10", "ndvi": 0.65} if observation else None,
                  "open_alert_count": count, "open_high_count": count if risk == "high" else 0,
                  "risk_alert_count": count, "alerts": [{"id": f"{land_id}-{j}", "date": observation["date"], "severity": risk,
                  "rule_name": "ndvi_drop", "message": "长势指标较近期基线下降，建议核查现场。", "status": "open", "index_type": "ndvi"} for j in range(count)]})

monitoring = {"group_id": "qa", "as_of": "2026-09-17", "generated_at": "2026-09-17T04:00:00Z", "freshness_days": 14, "items": items}
tile = io.BytesIO()
Image.new("RGB", (256, 256), (236, 239, 231)).save(tile, format="PNG")


def install_fixtures(context, *, monitoring_failed=False, business_failed=False):
    # 使用本地测试会话，不读取用户浏览器登录态；所有业务请求均由此处拦截。
    context.add_init_script("""
        localStorage.setItem('jointLoginData', JSON.stringify({accountRoleList:[{accountRoleId:1,shopName:'交互验证',mainAccountFlag:1}]}));
        localStorage.setItem('activeAccountRoleId','1');
        localStorage.setItem('agric:remote-sensing-guide:v1:1','seen');
        localStorage.setItem('theme','light');
    """)

    def handle(route):
        url = urlparse(route.request.url)
        if "/agriculture/group/detail" in url.path:
            route.fulfill(json={"code": 200, "data": {"groupId": "qa", "groupName": "一期交互验证（示例数据）", "ownerName": "测试负责人", "status": 0}})
        elif "/agriculture/land/cropLandList" in url.path:
            route.fulfill(status=500 if business_failed else 200, json={"code": 500 if business_failed else 200, "rows": lands, "total": len(lands)})
        elif "/system/dict/" in url.path:
            route.fulfill(json={"code": 200, "data": []})
        elif "/projects/qa/monitoring" in url.path:
            route.fulfill(status=503 if monitoring_failed else 200, json=monitoring)
        elif "/satellite-api/" in url.path:
            route.fulfill(json={"items": [], "total": 0, "limit": 50, "offset": 0})
        elif url.netloc != urlparse(BASE).netloc:
            if "tile" in url.path or "tile" in url.netloc:
                route.fulfill(content_type="image/png", body=tile.getvalue())
            else:
                route.abort()
        else:
            route.continue_()
    context.route("**/*", handle)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    install_fixtures(context)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/zh/farms/detail/?groupId=qa")
    expect(page.get_by_role("heading", name="一期交互验证（示例数据）")).to_be_visible(timeout=60000)
    statistics = page.get_by_label("项目统计")
    expect(statistics.get_by_role("button", name=re.compile("地块数量"))).to_contain_text("6")
    expect(statistics.get_by_role("button", name=re.compile("有效监测覆盖率"))).to_contain_text("28.6%")
    expect(statistics.get_by_role("button", name=re.compile("预警地块数"))).to_contain_text("3")
    expect(statistics.get_by_role("button", name=re.compile("待处理预警"))).to_contain_text("4")
    expect(page.locator("canvas.maplibregl-canvas")).to_be_visible()
    page.wait_for_timeout(1800)
    page.screenshot(path=str(OUTPUT / "desktop.png"))
    # 示例地块固定为两行三列；验证点击地图多边形也能打开同一详情。
    canvas = page.locator("canvas.maplibregl-canvas")
    canvas_box = canvas.bounding_box()
    canvas.click(position={"x": canvas_box["width"] * 0.25, "y": canvas_box["height"] * 0.75})
    expect(page.get_by_label("地块监测详情")).to_contain_text("东区 01 号地块")
    page.keyboard.press("Escape")
    page.get_by_label("项目地块列表").get_by_role("button", name=re.compile("东区 01 号地块")).click()
    panel = page.get_by_label("地块监测详情")
    expect(panel).to_be_visible()
    expect(panel).to_contain_text("严重预警")
    expect(panel).to_contain_text("0.400")
    expect(panel).to_contain_text("地块概览")
    expect(panel).to_contain_text("监测结论")
    expect(panel).to_contain_text("数据状态")
    expect(panel).to_contain_text("最近有效指标")
    expect(panel).to_contain_text("较上一期")
    expect(panel).not_to_contain_text("最近影像日期")
    expect(panel.get_by_role("link", name="查看完整地块详情")).to_have_attribute("href", re.compile("fieldId=L1"))
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUTPUT / "selected.png"))
    page.keyboard.press("Escape")
    expect(panel).not_to_be_visible()
    statistics.get_by_role("button", name=re.compile("预警地块数")).click()
    expect(page.get_by_text("3 块地块 · 严重预警优先", exact=True)).to_be_visible()
    expect(page.get_by_label("项目地块列表").get_by_role("button", name=re.compile("东区 .* 号地块"))).to_have_count(3)
    page.get_by_role("button", name="重置筛选", exact=True).click()
    page.get_by_role("button", name="展开筛选", exact=True).click()
    page.get_by_label("按作物筛选", exact=True).select_option("玉米")
    expect(statistics.get_by_role("button", name=re.compile("有效监测覆盖率"))).to_contain_text("100.0%")
    page.get_by_label("按风险等级筛选", exact=True).select_option("low")
    expect(page.get_by_label("项目地块列表").get_by_text("没有符合筛选条件的地块。", exact=True)).to_be_visible()
    page.get_by_role("button", name="重置筛选", exact=True).first.click()
    page.get_by_label("按关注范围筛选", exact=True).select_option("unmarked")
    expect(page.get_by_text("当前地块均未标绘边界，可在列表中查看。", exact=True)).to_be_visible()
    page.get_by_label("项目地块列表").get_by_role("button", name=re.compile("东区 06 号地块")).click()
    expect(panel).to_contain_text("暂无法判断")
    expect(panel).to_contain_text("尚未标绘边界")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="重置筛选", exact=True).click()
    page.get_by_role("button", name="切换主题", exact=True).click()
    expect(page.locator("html")).to_have_class(re.compile("dark"))
    page.screenshot(path=str(OUTPUT / "dark.png"))
    assert not errors, errors
    context.close()

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    install_fixtures(mobile)
    page = mobile.new_page()
    mobile_errors = []
    page.on("pageerror", lambda error: mobile_errors.append(str(error)))
    page.goto(BASE + "/zh/farms/detail/?groupId=qa")
    expect(page.get_by_role("button", name="列表", exact=True)).to_be_visible(timeout=30000)
    page.get_by_role("button", name="列表", exact=True).click()
    page.get_by_label("项目地块列表").get_by_role("button", name=re.compile("东区 01 号地块")).click()
    expect(page.get_by_label("地块监测详情")).to_be_visible()
    page.screenshot(path=str(OUTPUT / "mobile.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile page overflows horizontally"
    page.get_by_role("button", name="关闭地块详情", exact=True).click()
    page.get_by_role("button", name="地图", exact=True).click()
    expect(page.locator("canvas.maplibregl-canvas")).to_be_visible()
    assert not mobile_errors, mobile_errors
    mobile.close()

    failed = browser.new_context(viewport={"width": 1440, "height": 900})
    install_fixtures(failed, monitoring_failed=True)
    page = failed.new_page()
    page.goto(BASE + "/zh/farms/detail/?groupId=qa")
    expect(page.get_by_role("alert").filter(has_text="监测数据暂不可用")).to_be_visible(timeout=30000)
    expect(page.get_by_label("项目统计").get_by_role("button", name=re.compile("预警地块数"))).to_contain_text("—")
    page.screenshot(path=str(OUTPUT / "unavailable.png"))
    failed.close()

    incomplete = browser.new_context()
    install_fixtures(incomplete, business_failed=True)
    page = incomplete.new_page()
    page.goto(BASE + "/zh/farms/detail/?groupId=qa")
    expect(page.get_by_text("项目地块未能完整加载，请重试。", exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_label("项目统计")).not_to_be_visible()
    incomplete.close()
    browser.close()
    print(json.dumps({"result": "passed", "screenshots": str(OUTPUT), "checks": ["statistics", "selection", "filters", "empty", "unmarked", "mobile", "unavailable", "incomplete"]}, ensure_ascii=False))
