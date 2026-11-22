"""Run the visitor H5 UI against a local API and capture the five real tab pages.

The two servers must already be running. Python 3.10+ and Playwright Chromium
are development tools only. See docs/design-system/quality/web-verification.md.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect


TABS = ["home", "map", "ai-guide", "trip", "profile"]
VIEWS = [(390, 844, "light", "no-preference"), (320, 690, "dark", "reduce")]


def loopback(value):
    url = urlsplit(value)
    if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise argparse.ArgumentTypeError("Supply an HTTP server on the loopback interface")
    return value.rstrip("/")


def intercept(context, api, web, log):
    if api == web:
        # The optional same-origin QA gateway already sends API calls to the
        # isolated server. Observe those responses without substituting them.
        def watch_response(response):
            url = urlsplit(response.url)
            if f"{url.scheme}://{url.netloc}" == web and url.path.startswith("/api/"):
                log["api"].append([response.request.method, url.path, response.status])

        def allow_loopback(route):
            url = urlsplit(route.request.url)
            if url.scheme in {"blob", "data"} or f"{url.scheme}://{url.netloc}" == web:
                route.continue_()
            else:
                log["blocked_hosts"].add(url.hostname)
                route.abort("blockedbyclient")

        context.on("response", watch_response)
        context.route("**/*", allow_loopback)
        return
    def dispatch(route):
        request = route.request
        url = urlsplit(request.url)
        if url.hostname == "api.shuzhiyouzong.cn" or (f"{url.scheme}://{url.netloc}" == api and url.path.startswith("/api/")):
            target = api + url.path + ("?" + url.query if url.query else "")
            if request.method == "OPTIONS":
                route.fulfill(status=204, headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
                })
                return
            response = route.fetch(url=target, max_redirects=0)
            headers = dict(response.headers)
            headers["access-control-allow-origin"] = "*"
            route.fulfill(response=response, headers=headers)
            log["api"].append([request.method, url.path, response.status])
        elif url.scheme in {"blob", "data"} or (f"{url.scheme}://{url.netloc}" in {web, api}):
            route.continue_()
        else:
            log["blocked_hosts"].add(url.hostname)
            route.abort("blockedbyclient")

    context.route("**/*", dispatch)


def go_to_tab(page, index):
    root = page.locator(".guide-tabbar:visible")
    tab = root.locator(".nav-cell").nth(index) if root.count() else page.locator("uni-tabbar .uni-tabbar__item:visible").nth(index)
    if index == 2 and root.count():
        raise ValueError("The current guide's center cell records audio; use the system tab to enter the guide.")
    tab.click()
    if index:
        page.wait_for_url("**/pages/" + TABS[index] + "/index")
    expect(page.locator("uni-page-body .page:visible")).to_have_count(1)


def verify_keyboard(page, log):
    go_to_tab(page, 3)
    generate = page.get_by_role("button", name="生成行程", exact=True)
    generate.focus()
    for key in ("Enter", "Space"):
        with page.expect_response(lambda r: "/api/routes/recommend" in r.url and r.request.method == "POST" and r.status == 200):
            generate.press(key)
        expect(generate).to_be_enabled()
    save = page.get_by_role("button", name="保存行程", exact=True)
    with page.expect_response(lambda r: "/api/routes/save" in r.url and r.request.method == "POST" and r.status == 201):
        save.click()
    saved = page.get_by_role("button", name="行程已保存", exact=True)
    expect(saved).to_be_disabled()
    expect(saved).to_have_attribute("tabindex", "-1")
    saved.dispatch_event("keydown", {"key": "Enter"})
    assert sum(method == "POST" and path == "/api/routes/save" for method, path, _ in log["api"]) == 1


def verify_large_text(page, output):
    title = page.locator(".page:visible .heading .title")
    row = page.get_by_role("button", name=re.compile("大号字体"))
    body = row.locator(".title")
    expect(title).to_have_css("font-size", "32px")
    expect(body).to_have_css("font-size", "16px")
    row.press("Enter")
    expect(title).to_have_css("font-size", "40px")
    expect(body).to_have_css("font-size", "20px")
    page.reload(wait_until="domcontentloaded")
    expect(title).to_have_css("font-size", "40px")
    expect(row).to_have_accessible_name(re.compile("已开启"))
    assert page.evaluate("document.documentElement.scrollWidth === 320")
    page.screenshot(path=output / "profile-320-large-type.png")
    page.get_by_role("button", name=re.compile("语言")).press("Space")
    expect(page.get_by_text("English", exact=True)).to_be_visible()


def verify_destinations(page, output, scheme, log):
    section = page.locator(".section").filter(has=page.get_by_text("热门目的地", exact=True))
    services = page.locator(".section").filter(has=page.get_by_text("特色旅游服务", exact=True))
    for area, place, count, image, service in (
        ("灵山胜境", "灵山梵宫", 4, "brahma", "游客中心租借点"),
        ("拈花湾", "拈花塔", 2, "tower", "拈花手作体验馆"),
    ):
        page.get_by_role("button", name=area, exact=True).click()
        card = section.get_by_role("button", name=place, exact=True)
        expect(card).to_contain_text(f"入选 {count} 条官方路线")
        card.scroll_into_view_if_needed()
        thumb = card.locator("img")
        expect(thumb).to_have_js_property("naturalWidth", 160)
        expect(services.get_by_text(service, exact=True)).to_have_count(1)
        if area == "拈花湾":
            lake = section.get_by_role("button", name="五灯湖广场", exact=True)
            expect(lake).to_contain_text("入选 3 条官方路线")
            lake.scroll_into_view_if_needed()
            expect(lake.locator("img")).to_have_js_property("naturalWidth", 160)
        if area == "灵山胜境" and scheme == "light":
            section.screenshot(path=output / "home-destinations.png")
        card.click()
        photo = page.locator(".photo img")
        expect(photo).to_have_attribute("src", f"/pages/spot/static/{image}.webp")
        page.wait_for_function("document.querySelector('.photo img')?.naturalWidth > 320")
        if area == "拈花湾":
            page.get_by_role("button", name="标记我已到访", exact=True).click()
            expect(page.get_by_role("button", name="已到访 · 撤销标记", exact=True)).to_be_visible()
        page.go_back()

    def fail_routes(route):
        log["injectedFailures"].append(["GET", "/api/map-guide/routes", 503])
        route.fulfill(status=503, content_type="application/json",
                      headers={"access-control-allow-origin": "*"}, body='{"message":"test offline"}')
    route_pattern = "**/api/map-guide/routes?*"
    page.route(route_pattern, fail_routes)
    page.reload(wait_until="domcontentloaded")
    expect(section.get_by_text("目的地暂时无法加载", exact=True)).to_be_visible()
    expect(section.locator(".illustration img")).to_have_js_property("naturalWidth", 240)
    if scheme == "dark":
        section.screenshot(path=output / "home-route-error.png")
    page.unroute(route_pattern, fail_routes)
    section.get_by_role("button", name="重试", exact=True).click()
    expect(section.get_by_role("button", name="拈花塔", exact=True)).to_be_visible()
    page.goto(page.url.split("/pages/")[0].rstrip("/") + "/pages/favorites/index", wait_until="domcontentloaded")
    empty = page.locator(".empty-state").first
    expect(empty.locator(".illustration img")).to_have_attribute("src", "/static/editorial/state-empty.webp")
    expect(empty.locator("img")).to_have_js_property("naturalWidth", 240)
    if scheme == "light":
        empty.screenshot(path=output / "favorites-empty.png")
    visits = page.locator(".section").filter(has=page.get_by_text("游览足迹", exact=True))
    history = page.locator(".section").filter(has=page.get_by_text("最近浏览", exact=True))
    expect(visits.locator(".spot")).to_have_count(1)
    expect(history.get_by_role("button", name="灵山梵宫", exact=True)).to_be_visible()
    visits.get_by_role("button", name="拈花塔", exact=True).click()
    page.get_by_role("button", name="已到访 · 撤销标记", exact=True).click()
    page.go_back()
    expect(visits.get_by_text("还没有到访标记", exact=True)).to_be_visible()
    expect(history.get_by_role("button", name="拈花塔", exact=True)).to_be_visible()


def capture(browser, args, dimensions):
    width, height, scheme, motion = dimensions
    context = browser.new_context(
        viewport={"width": width, "height": height}, device_scale_factor=1,
        has_touch=True, is_mobile=True, locale="zh-CN", color_scheme=scheme,
        reduced_motion=motion, service_workers="block",
    )
    page = context.new_page()
    log = {"engine": args.engine, "version": browser.version, "api": [], "blocked_hosts": set(),
           "errors": [], "console_errors": [], "injectedFailures": [], "pages": {}}
    page.on("pageerror", lambda error: log["errors"].append(str(error)))
    page.on("console", lambda message: log["console_errors"].append(message.text.split("\n")[0]) if message.type == "error" else None)
    intercept(context, args.api, args.web, log)
    try:
        page.goto(args.web, wait_until="domcontentloaded")
        expect(page.get_by_text("发现无锡", exact=True)).to_be_visible(timeout=30000)
        expect(page.locator("uni-tabbar .uni-tabbar__item")).to_have_count(5)
        for index, name in enumerate(TABS):
            if index:
                go_to_tab(page, index)
            active = page.locator("uni-page-body .page:visible")
            expect(active).to_have_class(re.compile(r"\bsg-" + scheme + r"\b"))
            bar_selector = ".guide-tabbar" if name == "ai-guide" else "uni-tabbar .uni-tabbar"
            page.wait_for_function("""selector => {
                const tab = [...document.querySelectorAll(selector)].find(el => el.getClientRects().length && el.getBoundingClientRect().height);
                if (!tab) return false;
                const icons = [...tab.querySelectorAll('img')];
                return icons.length >= (selector === '.guide-tabbar' ? 4 : 5) && icons.every(im => im.complete && im.naturalWidth > 0);
            }""", arg=bar_selector, timeout=15000)
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(300)  # Capture the settled page after the native tab update.
            metrics = active.evaluate("""(el, selector) => {
                const tab = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length && node.getBoundingClientRect().height);
                const rect = el.getBoundingClientRect();
                return {
                    width: document.documentElement.scrollWidth,
                    pageBottom: rect.bottom, tabTop: tab.getBoundingClientRect().top,
                    bg: getComputedStyle(el).backgroundColor,
                    mediaDark: matchMedia('(prefers-color-scheme:dark)').matches,
                    mediaReduced: matchMedia('(prefers-reduced-motion:reduce)').matches,
                    icons: [...tab.querySelectorAll('img')].map(im => im.complete && im.naturalWidth > 0),
                }
            }""", bar_selector)
            assert metrics["width"] == width, (name, "horizontal overflow", metrics)
            if name == "ai-guide":
                assert abs(metrics["pageBottom"] - height) < 2, (name, "embedded navigation does not reach viewport", metrics)
            else:
                assert abs(metrics["pageBottom"] - metrics["tabTop"]) < 2, (name, "gap above tabs", metrics)
            assert all(metrics["icons"]), (name, "tab image failed to load")
            assert not page.locator("vite-error-overlay").count(), name
            page.screenshot(path=args.output / f"{name}-{width}-{scheme}.png")
            log["pages"][name] = metrics
        if width == 390:
            verify_keyboard(page, log)
            log["keyboardActivationChecked"] = True
        else:
            verify_large_text(page, args.output)
            log["largeTextPersistenceChecked"] = True
        assert not log["errors"], log["errors"]
        page.goto(args.web, wait_until="domcontentloaded")
        verify_destinations(page, args.output, scheme, log)
        assert log["injectedFailures"], "route failure was not exercised"
        unexpected = [entry for entry in log["api"] if entry[2] >= 400 and entry[1:] != ["/api/digital-human/web/session", 503]]
        assert not unexpected, unexpected
        log["destinationsAndStateImagesChecked"] = True
        assert not log["errors"], log["errors"]
    finally:
        context.unroute_all(behavior="wait")
        context.close()
        log["blocked_hosts"] = sorted(host for host in log["blocked_hosts"] if host)
        (args.output / f"browser-{width}-{scheme}.json").write_text(
            json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=loopback, default="http://127.0.0.1:5156")
    parser.add_argument("--api", type=loopback, default="http://127.0.0.1:5178")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--engine", choices=("chromium", "webkit"), default="chromium")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch()
        try:
            for dimensions in VIEWS:
                capture(browser, args, dimensions)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
