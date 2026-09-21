"""用模拟接口验证地块分析页面；先运行后端 verify_parcel_insights.py 并启动静态站点。

python scripts/verify-parcel-insights-ui.py http://127.0.0.1:3018
不访问真实业务接口，不读取用户浏览器会话。
"""

import copy
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3018"
OUTPUT = ROOT.parent / "agric-satellite-analysis-api/tmp/parcel-insights-qa"
SNAPSHOT = json.loads((OUTPUT / "snapshot.json").read_text(encoding="utf-8"))
T = json.loads((ROOT / "messages/zh.json").read_text(encoding="utf-8"))["parcelInsights"]
LANDS = [{"land_id": item["land_id"], "land_name": item["land_name"], "crop_type": item["crop"], "group_name": "模拟项目"} for item in SNAPSHOT["items"]]


def fixtures(context, *, fail=False, empty=False):
    context.add_init_script("""(() => {
        if (!["http:", "https:"].includes(location.protocol)) return;
        localStorage.setItem('jointLoginData', JSON.stringify({accountRoleList:[{accountRoleId:1,shopName:'交互验证',mainAccountFlag:1}]}));
        localStorage.setItem('activeAccountRoleId','1');
        localStorage.setItem('agric:remote-sensing-guide:v3:1','seen');
        localStorage.setItem('theme','light');
    })();""")
    posted = []

    def handle(route):
        url = urlparse(route.request.url)
        if url.path.endswith("/phenology"):
            route.fulfill(json=SNAPSHOT["items"][0]["phenology"])
        elif url.path.endswith("/report.pdf"):
            route.fulfill(content_type="application/pdf", body=(OUTPUT / "parcel-insights-demo.pdf").read_bytes())
        elif url.path.endswith("/parcel-insights"):
            if route.request.method == "POST":
                body = route.request.post_data_json
                posted.append(body)
                snapshot = copy.deepcopy(SNAPSHOT)
                snapshot["request"] = body
                if body["mode"] == "recent":
                    snapshot["snapshot_id"] = None
                route.fulfill(status=503 if fail else 200, json={"detail": "模拟接口暂不可用"} if fail else snapshot)
            else:
                route.fulfill(json={"items": [{"id": SNAPSHOT["snapshot_id"], "created_at": SNAPSHOT["created_at"], "request": SNAPSHOT["request"]}], "total": 1, "limit": 10, "offset": 0})
        elif "/parcel-insights/" in url.path:
            route.fulfill(json=SNAPSHOT)
        elif url.path.endswith("/lands"):
            query = parse_qs(url.query).get("q", [""])[0]
            lands = [] if empty else [land for land in LANDS if query in land["land_name"]]
            route.fulfill(json={"items": lands, "total": len(lands), "limit": 30, "offset": 0})
        elif "/satellite-api/" in url.path:
            route.fulfill(json={"items": [], "total": 0, "limit": 20, "offset": 0})
        elif url.netloc != urlparse(BASE).netloc or url.path.startswith(("/bapi/", "/agric-api/", "/admin-api/")):
            route.abort()
        else:
            route.continue_()

    context.route("**/*", handle)
    return posted


def open_page(context):
    page = context.new_page()
    page.goto(BASE + "/zh/insights/")
    expect(page.get_by_role("heading", name=T["title"], exact=True)).to_be_visible(timeout=60000)
    return page


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1050})
    posted = fixtures(context)
    errors = []
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    page = open_page(context)
    expect(page.get_by_role("button", name=T["generate"], exact=True)).to_be_disabled()
    for land in LANDS:
        page.get_by_role("checkbox", name=re.compile(re.escape(land["land_name"]))).check()
    page.get_by_label(T["start"], exact=True).fill("2025-03-01")
    page.get_by_label(T["end"], exact=True).fill("2025-06-30")
    page.get_by_text(T["seasonSettings"], exact=True).click()
    page.get_by_role("button", name=T["inferAndReview"], exact=True).first.click()
    expect(page.get_by_label(LANDS[0]["land_name"] + " " + T["start"], exact=True)).to_have_value(SNAPSHOT["items"][0]["phenology"]["windows"][0]["start_date"])
    # 取消人工窗，验证自动多周期分析和农事记录的独立提交。
    page.get_by_role("checkbox", name=LANDS[0]["land_name"] + " · " + T["manualWindow"], exact=True).uncheck()
    page.get_by_text(re.compile("^" + T["serviceSettings"])).click()
    page.get_by_role("combobox", name=re.compile("^" + T["targetLand"])).select_option("A")
    page.get_by_label(T["eventDate"], exact=True).fill("2025-04-10")
    page.get_by_label(T["action"], exact=True).fill("灌溉记录（模拟）")
    page.get_by_role("combobox", name=re.compile("^" + T["controlLand"])).select_option("B")
    page.get_by_label(T["eventDays"], exact=True).fill("40")
    page.get_by_role("button", name=T["addEvent"], exact=True).click()
    page.get_by_role("button", name=T["generate"], exact=True).click()
    results = page.get_by_label(T["results"], exact=True)
    expect(results).to_be_visible()
    assert posted[-1]["events"][0]["control_land_id"] == "B"
    assert posted[-1]["start_date"] == "2025-03-01"
    page.get_by_text(T["seasonSettings"], exact=True).click()
    page.get_by_text(re.compile("^" + T["serviceSettings"])).click()
    results.scroll_into_view_if_needed()
    page.screenshot(path=str(OUTPUT / "ui-desktop.png"), full_page=True)
    for key in ("checkup", "history", "progress", "service"):
        results.get_by_role("button", name=T[key], exact=True).click()
        expect(results.locator("article").first).to_be_visible()
    expect(results).to_contain_text("相对对照变化")
    page.screenshot(path=str(OUTPUT / "ui-service.png"), full_page=True)
    with page.expect_download() as download:
        results.get_by_role("button", name=T["download"], exact=True).click()
    assert download.value.suggested_filename.endswith(".pdf")
    page.get_by_role("button", name=T["savedReports"], exact=True).click()
    page.get_by_role("button", name=re.compile(re.escape(SNAPSHOT["request"]["title"]))).click()
    expect(page.get_by_label(T["end"], exact=True)).to_have_value("2025-06-30")
    page.get_by_role("button", name=T["recentMode"], exact=True).click()
    expect(page.get_by_role("button", name=T["download"], exact=True)).to_have_count(0)
    page.get_by_role("button", name=T["analyzeRecent"], exact=True).click()
    expect(results).to_contain_text(T["pageOnly"])
    expect(page.get_by_role("button", name=T["download"], exact=True)).to_have_count(0)
    assert posted[-1]["mode"] == "recent"
    assert not errors, errors
    context.close()

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    fixtures(mobile)
    page = open_page(mobile)
    page.get_by_role("button", name=T["savedReports"], exact=True).click()
    page.get_by_role("button", name=re.compile(re.escape(SNAPSHOT["request"]["title"]))).click()
    expect(page.get_by_label(T["results"], exact=True)).to_be_visible()
    page.screenshot(path=str(OUTPUT / "ui-mobile.png"), full_page=True)
    page.get_by_label(T["results"], exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(OUTPUT / "ui-mobile-results.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "移动端页面横向溢出"
    mobile.close()

    for kind in ("empty", "fail"):
        context = browser.new_context()
        fixtures(context, empty=kind == "empty", fail=kind == "fail")
        page = open_page(context)
        if kind == "empty":
            expect(page.get_by_text(T["noLands"], exact=True)).to_be_visible()
        else:
            page.get_by_role("checkbox").first.check()
            page.get_by_role("button", name=T["generate"], exact=True).click()
            expect(page.get_by_role("alert").filter(has_text="模拟接口暂不可用")).to_be_visible()
            expect(page.get_by_role("button", name=T["generate"], exact=True)).to_be_enabled()
        context.close()
    browser.close()
    print(json.dumps({"ok": True, "checks": ["选择地块", "自动窗口填入", "农事记录", "五个视图", "PDF 下载", "历史重开", "近期无报告", "移动端", "空数据", "接口失败"], "screenshots": str(OUTPUT)}, ensure_ascii=False))
