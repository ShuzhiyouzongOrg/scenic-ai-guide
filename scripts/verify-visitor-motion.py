"""Verify motion tokens on the real visitor H5. Both servers must use loopback."""
import argparse
import json
import re
from pathlib import Path
from runpy import run_path

from playwright.sync_api import expect, sync_playwright

web_qa = run_path(str(Path(__file__).with_name("verify-visitor-web.py")))
loopback = web_qa["loopback"]
intercept = web_qa["intercept"]
go_to_tab = web_qa["go_to_tab"]


def style(control):
    return control.evaluate("""e => {
        const s = getComputedStyle(e);
        return {opacity:Number(s.opacity), property:s.transitionProperty,
                duration:s.transitionDuration, easing:s.transitionTimingFunction, delay:s.transitionDelay};
    }""")


def verify(engine, web, api, evidence):
    with sync_playwright() as playwright:
        browser = getattr(playwright, engine).launch()
        context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                      has_touch=True, reduced_motion="no-preference")
        intercept(context, api, web, {"blocked_hosts": set(), "api": []})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(web, wait_until="domcontentloaded")
        choice = page.locator("uni-page-body .choice:visible").first
        expect(choice).to_have_class(re.compile("sg-press-release"))
        result = {"engine": engine, "version": browser.version, "default": style(choice)}
        assert result["default"] == {"opacity": 1, "property": "opacity", "duration": "0.12s",
                                      "easing": "ease-out", "delay": "0s"}
        if engine == "chromium":
            cdp = context.new_cdp_session(page)
            box = choice.bounding_box()
            point = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
            expect(choice).to_have_css("opacity", "0.76")
            result["touchStart"] = style(choice)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []})
            expect(choice).to_have_css("opacity", "1")
            result["touchCancel"] = style(choice)
            assert result["touchStart"]["duration"] == "0s"
            cdp.detach()
        page.emulate_media(reduced_motion="reduce")
        expect(choice).to_have_css("transition-duration", "0s")
        result["systemReduced"] = style(choice)
        go_to_tab(page, 4)
        pref = page.locator(".service-row:visible").filter(has_text="减少动态效果")
        pref.click()
        expect(pref).to_contain_text("已开启")
        go_to_tab(page, 0)
        page.emulate_media(reduced_motion="no-preference")
        expect(choice).to_have_css("transition-duration", "0s")
        page.reload(wait_until="domcontentloaded")
        expect(choice).to_have_css("transition-duration", "0s")
        result["preferenceAfterReload"] = style(choice)
        go_to_tab(page, 3)
        waiting = []
        page.route("**/api/routes/recommend", lambda route: waiting.append(route))
        generate = page.get_by_role("button", name="生成行程", exact=True)
        generate.click()
        busy = page.locator("[aria-busy=true]:visible")
        expect(busy).to_have_count(1)
        expect(busy).to_contain_text("正在生成")
        expect(busy).to_have_attribute("aria-disabled", "true")
        assert busy.locator(".rice-loading").count() == 0
        result["reducedBusy"] = {"label": busy.inner_text(), "spinnerCount": 0, "ariaDisabled": True}
        expect(page.locator(".choice:visible").first).to_have_css("transition-duration", "0s")
        page.screenshot(path=str(evidence / ("motion-busy-" + engine + ".png")), scale="css")
        assert len(waiting) == 1
        waiting[0].fulfill(status=503, content_type="application/json", body='{"message":"motion QA"}')
        expect(generate).to_be_enabled()
        go_to_tab(page, 4)
        pref.click()
        go_to_tab(page, 0)
        expect(choice).to_have_css("transition-duration", "0.12s")
        assert not errors, errors
        result["pageErrors"] = errors
        browser.close()
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=loopback, default="http://127.0.0.1:5156")
    parser.add_argument("--api", type=loopback, default="http://127.0.0.1:5178")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = [verify(engine, args.web, args.api, args.output) for engine in ("chromium", "webkit")]
    (args.output / "motion-preferences.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Both browser engines passed motion preference and busy-state checks.")
