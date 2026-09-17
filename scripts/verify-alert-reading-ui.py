"""独立浏览器模拟接口验证个人已读；不会请求真实业务接口或修改业务数据库。

用法：python scripts/verify-alert-reading-ui.py http://127.0.0.1:3027
"""

import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3027"
OUTPUT = Path(tempfile.gettempdir()) / "agric-alert-reading-qa"
OUTPUT.mkdir(exist_ok=True)
reads = {}
counts = {"38": 120, "39": 1, "41": 99, "42": 100}
fail_next_bulk = False
errors = []


def install(context, user="alice", base="38"):
    login = {
        "agricToken": f"qa-{user}", "villageToken": "qa-village",
        "certifiedExternalSystems": [{"systemType": 2, "systemId": base}],
        "accountRoleList": [{"accountRoleId": 1, "shopName": "预警验收租户", "mainAccountFlag": 1}],
    }
    context.add_init_script(
        f"if (location.origin === {json.dumps(BASE.rstrip('/'))}) {{"
        f"localStorage.setItem('jointLoginData',JSON.stringify({json.dumps(login)}));"
        "localStorage.setItem('activeAccountRoleId','1');"
        "localStorage.setItem('agric:remote-sensing-guide:v3:1','seen');"
        "localStorage.setItem('theme','light');"
        "}"
    )

    def handle(route):
        global fail_next_bulk
        request = route.request
        url = urlparse(request.url)
        path = url.path.rstrip("/")
        if "/satellite-api/alerts" in path:
            assert request.headers.get("authorization") == f"Bearer qa-{user}"
            assert request.headers.get("hr-base-id") == base
            seen = reads.setdefault((user, base), set())
            total = counts[base]
            payload = None
            if path.endswith("/summary"):
                payload = {"open_total": total, "unread_total": total - len(seen),
                           "high": total, "medium": 0, "low": 0}
            elif path.endswith("/read-all"):
                if fail_next_bulk:
                    fail_next_bulk = False
                    return route.fulfill(status=503, json={"detail": "模拟标记失败，请重试"})
                payload = {"marked_count": total - len(seen)}
                seen.update(range(total))
            elif path.endswith("/read"):
                index = int(path.split("/")[-2])
                seen.add(index)
                payload = alert(index, seen)
            else:
                query = parse_qs(url.query)
                items = [alert(i, seen) for i in range(total)]
                if "is_read" in query:
                    wanted = query["is_read"][0] == "true"
                    items = [item for item in items if item["is_read"] == wanted]
                offset = int(query.get("offset", [0])[0])
                limit = int(query.get("limit", [10])[0])
                payload = {"items": items[offset:offset + limit], "total": len(items),
                           "offset": offset, "limit": limit}
            return route.fulfill(json=payload)
        if "/agric-api/" in path or "/bapi/" in path:
            return route.fulfill(json={"code": 200, "data": {"rows": [{"baseId": base}]}})
        if url.hostname not in ("127.0.0.1", "localhost"):
            return route.fulfill(status=204)
        return route.continue_()

    context.route("**/*", handle)
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))


def alert(index, seen):
    return {"id": str(index), "land_id": f"land-{index}", "land_name": f"示例地块 {index + 1}",
            "farm_id": "demo", "farm_name": "示例农场", "date": "2026-09-17", "severity": "high",
            "rule_name": "ndvi_threshold", "rule_params_json": {"threshold": 0.3},
            "message": "NDVI 0.12，低于阈值 0.30，建议核查地块长势。", "status": "open",
            "index_type": "ndvi", "created_at": "2026-09-17T03:00:00Z",
            "weather_context": None, "soil_context": None, "is_read": index in seen,
            "read_at": "2026-09-17T04:00:00Z" if index in seen else None}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    install(context)
    page = context.new_page()
    page.goto(f"{BASE}/alerts/", wait_until="domcontentloaded")
    nav = page.locator("header").get_by_role("link", name=re.compile("预警"))
    expect(nav).to_contain_text("99+", timeout=30000)
    expect(page.get_by_role("button", name="标记已读", exact=True)).to_have_count(10)
    page.screenshot(path=str(OUTPUT / "unread-desktop.png"))
    page.get_by_role("button", name="标记已读", exact=True).first.click()
    expect(page.get_by_role("button", name="标记已读", exact=True)).to_have_count(9)
    expect(nav).to_contain_text("99+")
    assert len(reads[("alice", "38")]) == 1
    page.get_by_role("button", name="下一页", exact=True).click()
    expect(page.get_by_text("示例地块 11", exact=True)).to_be_visible()
    page.get_by_role("button", name="一键已读", exact=True).click()
    expect(nav).not_to_contain_text("99+")
    expect(page.get_by_role("button", name="一键已读", exact=True)).to_be_disabled()
    expect(page.get_by_role("button", name="标记已读", exact=True)).to_have_count(0)
    assert len(reads[("alice", "38")]) == 120
    page.reload()
    expect(page.get_by_role("button", name="一键已读", exact=True)).to_be_disabled()
    page.screenshot(path=str(OUTPUT / "read-desktop.png"))
    page.get_by_label("阅读状态", exact=True).click()
    page.get_by_role("option", name="未读", exact=True).click()
    expect(page.get_by_text("暂无预警", exact=True)).to_be_visible()

    second = browser.new_context(viewport={"width": 390, "height": 844})
    install(second, user="bob")
    mobile = second.new_page()
    mobile.goto(f"{BASE}/alerts/", wait_until="domcontentloaded")
    mobile_nav = mobile.locator("header").get_by_role("link", name=re.compile("预警"))
    expect(mobile_nav).to_contain_text("99+")
    fail_next_bulk = True
    mobile.get_by_role("button", name="一键已读", exact=True).click()
    expect(mobile.get_by_text("模拟标记失败，请重试", exact=True)).to_be_visible()
    expect(mobile_nav).to_contain_text("99+")
    assert not reads[("bob", "38")]
    mobile.screenshot(path=str(OUTPUT / "unread-mobile.png"))

    for base, expected in (("39", "预警1"), ("41", "预警99"), ("42", "预警99+")):
        separate = browser.new_context()
        install(separate, base=base)
        check = separate.new_page()
        check.goto(f"{BASE}/alerts/", wait_until="domcontentloaded")
        expect(check.locator("header").get_by_role("link", name=re.compile("预警"))).to_have_text(expected)
        separate.close()
    assert not errors, errors
    browser.close()
print(f"PASS: 单条/跨页全部已读、刷新保持、不同用户/基地、失败保持未读、0/1/99/100 边界、移动端。截图：{OUTPUT}")
