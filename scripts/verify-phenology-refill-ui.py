"""使用用户提供的两条接口响应回归生育窗回填；所有业务接口均被拦截。

python scripts/verify-phenology-refill-ui.py http://127.0.0.1:3000
"""

import copy
import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Error, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
DATA = json.loads((ROOT / "scripts/fixtures/phenology-refill.json").read_text(encoding="utf-8"))
T = json.loads((ROOT / "messages/zh.json").read_text(encoding="utf-8"))["parcelInsights"]
OUTPUT = Path(tempfile.gettempdir()) / "agric-phenology-refill-qa"
OUTPUT.mkdir(exist_ok=True)
LANDS = [{"land_id": key, "land_name": f"solx同步测试0{i + 1}", "crop_type": "corn"} for i, key in enumerate(DATA)]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1360, "height": 1100})
    context.add_init_script("""(() => {
        if (!["http:", "https:"].includes(location.protocol)) return;
        localStorage.setItem('jointLoginData', JSON.stringify({accountRoleList:[{accountRoleId:1,shopName:'回填验证',mainAccountFlag:1}]}));
        localStorage.setItem('activeAccountRoleId','1');
        localStorage.setItem('agric:remote-sensing-guide:v3:1','seen');
        localStorage.setItem('theme','light');
    })();""")
    state = {"mode": "normal", "held": [], "requests": []}

    def handle(route):
        url = urlparse(route.request.url)
        if url.path.endswith("/phenology"):
            land_id = url.path.split("/")[-2]
            query = parse_qs(url.query)
            data = copy.deepcopy(DATA[land_id])
            data.update(start_date=query["start_date"][0], end_date=query["end_date"][0])
            state["requests"].append((land_id, query))
            if state["mode"] == "hold":
                state["held"].append((route, data))
                return
            if state["mode"] == "multiple":
                data["windows"][0].update(start_date="2025-02-01", status="complete")
            elif state["mode"] == "open_end":
                # 没有 observed_end 时才应继续保留空白，验证真正缺少边界的提示。
                data["windows"][0].update(start_date="2025-03-09", end_date=None, observed_end=None, status="open_end")
            elif state["mode"] == "empty":
                data.update(windows=[], status="insufficient_data")
            route.fulfill(status=503 if state["mode"] == "error" else 200,
                          json={"detail": "模拟识别失败"} if state["mode"] == "error" else data)
        elif url.path.endswith("/lands"):
            route.fulfill(json={"items": LANDS, "total": 2, "limit": 30, "offset": 0})
        elif "/satellite-api/" in url.path:
            route.fulfill(json={"items": [], "total": 0})
        elif url.netloc != urlparse(BASE).netloc or url.path.startswith(("/bapi/", "/agric-api/", "/admin-api/")):
            route.abort()
        else:
            route.continue_()

    context.route("**/*", handle)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/zh/insights/")
    expect(page.get_by_role("heading", name=T["title"], exact=True)).to_be_visible(timeout=60000)
    for land in LANDS:
        page.get_by_role("checkbox", name=re.compile(land["land_name"])).check()
    page.get_by_label(T["start"], exact=True).fill("2025-01-01")
    page.get_by_label(T["end"], exact=True).fill("2025-12-31")
    settings = page.locator("details").filter(has=page.get_by_text(T["seasonSettings"], exact=True))
    settings.locator("summary").click()
    a, b = (land["land_name"] for land in LANDS)
    for name in (a, b):
        settings.get_by_role("checkbox", name=f"{name} · {T['manualWindow']}", exact=True).check()
    start_b = page.get_by_label(f"{b} {T['start']}", exact=True)
    end_b = page.get_by_label(f"{b} {T['end']}", exact=True)
    generate = page.get_by_role("button", name=T["generate"], exact=True)
    infer = settings.get_by_role("button", name=T["inferAndReview"], exact=True)

    # 部分周期使用首末观测日期回填代理窗口，不能继续保留全年默认日期。
    infer.nth(1).click()
    expect(start_b).to_have_value("2025-01-03")
    expect(end_b).to_have_value("2025-05-28")
    region_b = page.get_by_role("region", name=f"{b} {T['inferenceResults']}", exact=True)
    expect(region_b).to_contain_text("2025-01-03")
    expect(region_b).to_contain_text(T["observedWindowFilled"])
    expect(generate).to_be_enabled()
    settings.screenshot(path=str(OUTPUT / "partial-dates.png"))

    # 一个 partial 加一个 complete：展示两段，优先回填完整段，且不改动另一块地。
    page.get_by_label(T["end"], exact=True).fill("2026-06-30")
    infer.nth(0).click()
    start_a = page.get_by_label(f"{a} {T['start']}", exact=True)
    end_a = page.get_by_label(f"{a} {T['end']}", exact=True)
    expect(start_a).to_have_value("2026-03-09")
    expect(end_a).to_have_value("2026-05-30")
    expect(start_b).to_have_value("2025-01-03")
    expect(end_b).to_have_value("2025-05-28")
    region_a = page.get_by_role("region", name=f"{a} {T['inferenceResults']}", exact=True)
    expect(region_a.locator("article")).to_have_count(2)
    settings.screenshot(path=str(OUTPUT / "mixed-cycles.png"))

    state["mode"] = "multiple"
    infer.nth(0).click()
    expect(region_a.get_by_text(T["completeWindow"], exact=True)).to_have_count(2)
    region_a.locator("article").first.get_by_role("button").click()
    expect(start_a).to_have_value("2025-02-01")
    expect(end_a).to_have_value("2025-05-28")

    state["mode"] = "open_end"
    infer.nth(1).click()
    expect(start_b).to_have_value("2025-03-09")
    expect(end_b).to_have_value("")
    expect(generate).to_be_disabled()
    end_b.fill("2025-05-28")
    state["mode"] = "empty"
    infer.nth(1).click()
    expect(region_b).to_contain_text(T["noCompleteWindow"])
    expect(end_b).to_have_value("2025-05-28")
    state["mode"] = "error"
    infer.nth(1).click()
    expect(settings.get_by_role("alert")).to_contain_text("模拟识别失败")
    expect(end_b).to_have_value("2025-05-28")

    # 人工修改查询日期后，延迟到达的旧响应不得覆盖当前表单。
    state["mode"] = "hold"
    with page.expect_request(re.compile("/phenology")):
        infer.nth(1).click()
    page.get_by_label(T["end"], exact=True).fill("2025-12-31")
    for route, data in state["held"]:
        try:
            route.fulfill(json=data)
        except Error:
            pass  # 已取消的请求可能先被浏览器关闭。
    page.wait_for_timeout(300)
    expect(region_b).to_have_count(0)
    expect(start_b).to_have_value("2025-03-09")
    expect(end_b).to_have_value("2025-05-28")
    expect(infer.nth(1)).to_be_enabled()
    assert not errors, errors
    print(json.dumps({"ok": True, "checks": ["部分边界自动回填", "混合周期", "多完整周期选择", "地块隔离", "缺失终点", "补齐后可分析", "空结果", "失败提示", "旧请求取消"], "screenshots": str(OUTPUT)}, ensure_ascii=False))
    browser.close()
