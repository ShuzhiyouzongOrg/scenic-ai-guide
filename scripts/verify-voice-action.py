"""Check touch-target continuity and action ownership on the compiled H5 guide."""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import re
from urllib.request import urlopen
import wave

from playwright.sync_api import expect, sync_playwright


spec = importlib.util.spec_from_file_location("guide", Path(__file__).with_name("verify-immersive-guide.py"))
guide = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guide)
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}


def run(browser, web, api):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True,
                                  is_mobile=True, locale="zh-CN", service_workers="block")
    context.add_init_script(guide.TEST_MIC)
    log = {"api": [], "blocked_hosts": set()}
    guide.shared.intercept(context, api, web, log)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # A known two-second clip makes the release-after-natural-end race reproducible.
    clip = io.BytesIO()
    with wave.open(clip, "wb") as audio:
        audio.setparams((1, 2, 16000, 32000, "NONE", "NONE"))
        audio.writeframes(bytes(64000))
    page.route("**/_qa-voice-action.wav", lambda r: r.fulfill(body=clip.getvalue(), content_type="audio/wav"))
    def synth(route):
        if route.request.method == "OPTIONS":
            route.fulfill(status=204, headers=CORS)
        else:
            route.fulfill(headers=CORS, json={"data": {"segments": [{"id": "action-test", "text": "测试音频",
                "audioUrl": web + "/_qa-voice-action.wav", "mimeType": "audio/wav", "durationMs": 2000}]}})
    page.route("**/api/voice/tts", synth)
    page.goto(web + "/")
    guide.shared.go_to_tab(page, 2)
    button = page.locator(".guide-tabbar .voice-action")
    idle = re.compile(r"^录音.*点击或按住说话")
    expect(button).to_have_attribute("aria-label", idle)
    page.wait_for_function("document.querySelector('.guide-tabbar .voice-action')?.getBoundingClientRect().width === 56")
    bounds = button.bounding_box()
    assert (bounds["width"], bounds["height"]) == (56, 56), bounds
    cdp = context.new_cdp_session(page)
    def touch(event, dy=0):
        box = button.bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        points = [] if event == "touchEnd" else [{"x": x, "y": y + dy, "radiusX": 4, "radiusY": 4}]
        cdp.send("Input.dispatchTouchEvent", {"type": event, "touchPoints": points})
    def play():
        guide.guide_action(page, "text").click()
        page.locator("textarea").fill("九龙灌浴在哪里？")
        page.get_by_text("发送", exact=True).last.click()
        expect(button).to_have_attribute("aria-label", re.compile("播报"))
        expect(page.locator(".sheet-host")).to_have_count(0)

    touch("touchStart")
    expect(button).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_text("松开发送，上滑取消", exact=True)).to_be_visible()
    touch("touchMove", -65)
    touch("touchEnd")
    expect(button).to_have_attribute("aria-label", idle)
    assert guide.route_total(log, "/api/voice/ask-upload") == 0
    touch("touchStart")
    touch("touchEnd")
    expect(button).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_text("再点一次发送录音", exact=True)).to_be_visible()
    page.wait_for_timeout(400)
    with page.expect_response(lambda r: "/api/voice/ask-upload" in r.url and r.request.method == "POST"):
        touch("touchStart")
        touch("touchEnd")
    expect(button).to_have_attribute("aria-label", idle, timeout=15000)
    before = page.evaluate("testTracks.length")
    assert before == 2

    play()
    touch("touchStart")
    touch("touchEnd")
    expect(button).to_have_attribute("aria-label", idle)
    for device in ("touch", "mouse", "space"):
        play()
        if device == "touch":
            touch("touchStart")
        elif device == "mouse":
            button.hover()
            page.mouse.down()
        else:
            button.focus()
            page.keyboard.down("Space")
        expect(button).to_have_attribute("aria-label", idle)
        if device == "touch":
            touch("touchEnd")
        elif device == "mouse":
            page.mouse.up()
        else:
            page.keyboard.up("Space")
        expect(button).to_have_attribute("aria-label", idle)
    play()
    page.locator(".guide-tools").get_by_text("暂停", exact=True).click()
    expect(button).to_have_attribute("aria-label", "继续")
    button.press("Enter")
    expect(button).to_have_attribute("aria-label", re.compile("播报"))
    assert page.evaluate("testTracks.length") == before
    assert not errors, errors
    assert guide.route_total(log, "/api/voice/ask-upload") == 1
    context.close()
    print("56px; slide-cancel, tap/send, interrupt, touch/mouse/Space across natural end, Enter resume passed; two captures, one upload")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", required=True, type=guide.shared.loopback)
    parser.add_argument("--api", required=True, type=guide.shared.loopback)
    args = parser.parse_args()
    with urlopen(args.api + "/api/health", timeout=5) as response:
        assert all(value == "mock" for value in json.load(response)["data"]["providers"].values())
    with sync_playwright() as pw:
        chromium = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        try:
            run(chromium, args.web, args.api)
        finally:
            chromium.close()
