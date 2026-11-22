"""Exercise the compiled H5 guide in an isolated browser against a loopback mock API."""
import argparse
import hashlib
import importlib.util
import json
import re
import time
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright
from PIL import Image, ImageChops, ImageDraw, ImageStat


shared_spec = importlib.util.spec_from_file_location("visitor_web", Path(__file__).with_name("verify-visitor-web.py"))
shared = importlib.util.module_from_spec(shared_spec)
shared_spec.loader.exec_module(shared)
GUIDE = "/pages/ai-guide/index"

# Replace only the hardware boundary. MediaRecorder, microphone metering,
# WAV conversion, upload, playback and the page lifecycle are the app's own.
TEST_MIC = """
(() => {
  if (!navigator.mediaDevices || !window.MediaRecorder) return;
  const OutputContext = window.AudioContext;
  window.testTracks = [];
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.testDenyCapture) throw new DOMException('QA permission refusal', 'NotAllowedError');
    const a = new OutputContext(), tone = a.createOscillator(), gain = a.createGain();
    const output = a.createMediaStreamDestination();
    tone.frequency.value = 312; gain.gain.value = window.testToneAmplitude ?? 0.24;
    window.testGain = gain;
    tone.connect(gain); gain.connect(output); tone.start(); await a.resume();
    window.testTracks.push(...output.stream.getAudioTracks());
    const cleanup = setInterval(() => {
      if (output.stream.getTracks().every(t => t.readyState === 'ended')) {
        clearInterval(cleanup); tone.stop(); a.close().catch(() => {});
      }
    }, 100);
    return output.stream;
  };
})();
"""


def route_total(log, path):
    return sum(row[0] == "POST" and row[1] == path for row in log["api"])

def guide_action(page, name):
    labels = {
        "settings": r"^(导游设置|Guide settings)$",
        "text": r"^(文字提问|Type a question)$",
        "history": r"^(对话记录|Conversation history)$",
        "cancel": r"^(取消录音|取消|Cancel recording|Cancel)$",
    }
    region = {"text": ".subtitles", "settings": ".guide-header", "history": ".guide-header", "cancel": ".guide-tools"}[name]
    return page.locator(region).get_by_role("button", name=re.compile(labels[name], re.I))


def inspect_navigation(page, is_guide):
    bar = page.locator(".guide-tabbar:visible" if is_guide else "uni-tabbar .uni-tabbar:visible")
    cells = bar.locator(".nav-cell" if is_guide else ".uni-tabbar__item")
    expect(bar).to_be_visible()
    expect(cells).to_have_count(5)
    other = page.locator("uni-tabbar .uni-tabbar:visible" if is_guide else ".guide-tabbar:visible")
    expect(other).to_have_count(0)
    if is_guide:
        expect(cells.nth(2).locator(".mic")).to_have_count(1)
    for icon in bar.locator("img").all():
        expect(icon).to_have_js_property("complete", True)
        expect(icon).not_to_have_js_property("naturalWidth", 0)
    return bar.evaluate("""(el, guide)=>{
      const rect = k => {const r=k.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(x=>Math.round(x*10)/10)};
      return {rect:rect(el),track:rect(guide?el.querySelector('.nav-track'):el),cells:[...el.querySelectorAll(guide?'.nav-cell':'.uni-tabbar__item')].map((cell,i)=>{
        const icon=cell.querySelector('img'), label=cell.querySelector(guide?'.tab-label':'.uni-tabbar__label');
        return {rect:rect(cell),label:label?.textContent.trim() || '',icon:icon?rect(icon):null,
          labelRect:label?rect(label):null, labelFont:label?getComputedStyle(label).fontSize:null,
          labelFamily:label?getComputedStyle(label).fontFamily:null, labelLine:label?getComputedStyle(label).lineHeight:null,
          iconPath:icon?new URL(icon.src,location.href).pathname:null, loaded:!!(icon?.complete&&icon.naturalWidth)};
      })};
    }""", is_guide)


def check_root_navigation(page, log, case, args):
    guide_layout = inspect_navigation(page, True)
    guide_cells = guide_layout["cells"]
    layout = {"guide": guide_layout}
    for i, name in [(0,"home"), (1,"map"), (3,"trip"), (4,"profile")]:
        if i == 0:
            page.evaluate("""() => {
              window.navFrames = [];
              window.navFrameTimer = setInterval(()=>{
                const el=document.querySelector('.guide-tabbar .voice-face');
                const track=document.querySelector('.guide-tabbar .nav-track');
                const system=document.querySelector('.uni-tabbar');
                const visible=e=>e && e.getBoundingClientRect().height>0 && getComputedStyle(e).display!=='none';
                const rect=e=>visible(e)?[e.getBoundingClientRect().top,e.getBoundingClientRect().bottom].map(Math.round):null;
                const current=[...document.querySelectorAll('uni-page-body .page')].find(e=>visible(e));
                window.navFrames.push([Math.round(performance.now()),location.pathname,
                  visible(el)?+getComputedStyle(el).opacity:null,visible(system)?1:0,
                  rect(track),rect(system),rect(current)]);
              },16)
            }""")
        if i == 1:
            destination = page.locator(".guide-tabbar .tab-item[role=button]").nth(1)
            destination.focus()
            page.keyboard.press("Enter")
            page.wait_for_url("**/pages/map/index")
        else:
            shared.go_to_tab(page, i)
        native = inspect_navigation(page, False)
        assert abs(guide_layout["track"][1] - native["track"][1]) <= 1, (guide_layout["track"], native["track"])
        layout[name] = native
        for index in (0, 1, 3, 4):
            g, n = guide_cells[index], native["cells"][index]
            x, _, w, _ = g["rect"]
            nx, _, nw, _ = n["rect"]
            assert abs((x+w/2)-(nx+nw/2)) <= 1, (name, index, "center", g, n)
            assert g["icon"] and n["icon"] and g["labelRect"], (name, index, "icon/label", g, n)
            assert abs(g["icon"][1]-n["icon"][1]) <= 2, (name, index, "icon vertical", g, n)
            assert abs(g["icon"][2]-n["icon"][2]) <= 1, (name, index, "icon width", g, n)
            assert abs(g["labelRect"][1]-n["labelRect"][1]) <= 2, (name, index, "label vertical", g, n)
            assert g["label"] == n["label"] and g["labelFont"] == n["labelFont"], (name, index, g, n)
            assert g["loaded"] and n["loaded"], (name, index, "icon failed", g, n)
            if index != i:
                assert g["iconPath"] == n["iconPath"], (name, index, "icon resource", g, n)
        if case == "chromium-390-zh-light" and name == "profile":
            capture_screen(page, args.out / "guide-navigation-system-reference.webp")
        shared.go_to_tab(page, 2)
        inspect_navigation(page, True)
        expect(page.locator(".mic")).to_have_attribute("aria-pressed", "false")
        if i == 0:
            page.wait_for_function("() => +getComputedStyle(document.querySelector('.guide-tabbar .voice-face')).opacity === 1")
            frames = page.evaluate("clearInterval(window.navFrameTimer);window.navFrames")
            home = [j for j, row in enumerate(frames) if row[1] in ('/', '/pages/home/index')]
            assert home, frames
            if case.endswith('-light'):
                for samples in [frames[:home[0]], frames[home[-1]+1:]]:
                    assert any(row[2] is not None and 0 < row[2] < 1 for row in samples), samples
            else:
                assert all(row[2] in (0, 1, None) for row in frames), frames
            start = frames[0][0]
            log["transitionFrames"] = [[row[0]-start, *row[1:]] for row in frames]
    log["navigation"] = layout
    log["checks"].append("four guide exits and four system-tab returns; four ordinary destinations align with system icon, center, label and font")


def check_navigation_failures(browser, args):
    """Exercise the real fail callbacks by faulting only the bundled platform adapter."""
    with browser.new_context(viewport={"width":390, "height":844}, service_workers="block") as context:
        page = context.new_page()
        log = {"api": [], "blocked_hosts": set()}
        shared.intercept(context, args.api, args.web, log)
        faulted = []

        def inject(route):
            response = route.fetch()
            data = response.text()
            for api in ("hideTabBar", "switchTab"):
                # Pinned HBuilderX 5.24 uses a public API registration with a
                # per-call reject callback. Fail loudly if its signature changes.
                signature = re.compile(r'\("' + api + r'",\(\((?:\{[^}]*\}|\w+),\{resolve:\w+,reject:(\w+)\}\)=>\{')
                def entry(match):
                    faulted.append(api)
                    return match[0] + f'if(window.__navTestFail==="{api}"){{return {match[1]}("controlled QA failure")}}'
                data = signature.sub(entry, data)
            route.fulfill(response=response, body=data)

        page.route("**/assets/index-*.js", inject)
        page.add_init_script("window.__navTestFail='hideTabBar'")
        page.goto(args.web + GUIDE)
        expect(page.locator(".story .mic")).to_be_visible()
        expect(page.locator(".guide-tabbar")).to_have_count(0)
        inspect_navigation(page, False)
        assert set(faulted) == {"hideTabBar", "switchTab"}, faulted
        shared.go_to_tab(page, 4)
        page.evaluate("window.__navTestFail=''")
        shared.go_to_tab(page, 2)
        inspect_navigation(page, True)
        page.evaluate("window.__navTestFail='switchTab'")
        page.locator(".guide-tabbar .tab-item[role=button]").first.click()
        page.wait_for_timeout(500)
        expect(page).to_have_url(re.compile(re.escape(GUIDE)+"$"))
        expect(page.locator(".guide-tabbar .voice-face")).to_have_class(re.compile("voice-shown"))
        page.evaluate("window.__navTestFail=''")
        shared.go_to_tab(page, 4)
        inspect_navigation(page, False)
        context.unroute_all(behavior="wait")
        return {"adapter": "HBuilderX 5.24 public API reject callback (test injection)",
                "hideTabBar": "native five items, one in-page mic; following visit used central slot",
                "switchTab": "guide restored after failure; retry reached profile"}


def touch(page, element, name, y_offset=0):
    box = element.bounding_box()
    element.dispatch_event(name, {
        "touches": [] if name in ("touchend", "touchcancel") else [{
            "identifier": 1, "clientX": box["x"] + box["width"] / 2,
            "clientY": box["y"] + box["height"] / 2 + y_offset,
        }],
        "bubbles": True, "cancelable": True,
    })


def frame_delta(left, right):
    diff = ImageChops.difference(left, right)
    red, green, blue = diff.split()
    peaks = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    changed = sum(peaks.histogram()[9:])
    return {"changedAbove8": changed, "pixels": diff.width * diff.height,
            "meanAbsoluteChannelDelta": round(sum(ImageStat.Stat(diff).mean) / 3, 2)}


def capture_screen(page, path):
    Image.open(BytesIO(page.screenshot(animations="allow"))).convert("RGB").save(path, quality=90, method=5)


def text_contrast(foreground, background):
    def luminance(css):
        channels = [float(value) for value in re.findall(r"[\d.]+", css)]
        assert len(channels) == 3 or (len(channels) == 4 and channels[-1] == 1), css
        rgb = [channel / 255 for channel in channels[:3]]
        linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return sum(a * b for a, b in zip(linear, (0.2126, 0.7152, 0.0722)))
    low, high = sorted((luminance(foreground), luminance(background)))
    return round((high + 0.05) / (low + 0.05), 2)


def measure_orb(page, mic, enabled, log, case, args):
    """Measure the rendered 62/76px production orb in place, with real stream analysis."""
    if not enabled:
        return
    orb = page.locator(".ambient-orb")
    def frame():
        return Image.open(BytesIO(orb.screenshot(animations="allow"))).convert("RGB")
    page.emulate_media(reduced_motion="no-preference")
    page.evaluate("window.testToneAmplitude = 0")
    mic.click()
    expect(mic).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".meter")).to_be_visible()
    page.wait_for_timeout(400)
    frames = {"silence": frame()}
    for label, amplitude in [("soft", 0.035), ("medium", 0.14)]:
        page.evaluate("value => { window.testGain.gain.value = value }", amplitude)
        page.wait_for_timeout(650)
        frames[label] = frame()
        if page.locator(".orb-signal").count():
            log.setdefault("measuredSignalVisibility", {})[label] = page.locator(".orb-signal").is_visible()
    if case.startswith("chromium-390"):
        capture_screen(page, args.out / "guide-immersive-measured-mic.webp")
        # Capture the actual stage at its native CSS size, with no drawn UI or
        # render-time hooks. Preserve capture intervals when replaying the strip.
        snapshots, stamps = [], []
        stage = page.locator(".stage-frame")
        for peak in (0.035, 0.14, 0):
            page.evaluate("value => { window.testGain.gain.value = value }", peak)
            for _ in range(9):
                started = time.monotonic()
                snapshots.append(Image.open(BytesIO(stage.screenshot(animations="allow"))).convert("RGB"))
                stamps.append(time.monotonic())
                page.wait_for_timeout(max(0, round((0.14 - (stamps[-1] - started)) * 1000)))
        intervals = [max(20, round(1000 * (b - a))) for a, b in zip(stamps, stamps[1:])]
        snapshots[0].save(args.out / "guide-immersive-orb-demo.webp", save_all=True,
                          append_images=snapshots[1:], duration=intervals + [intervals[-1]],
                          loop=0, quality=88, method=4)
        log["stageRecording"] = {"frames": len(snapshots), "cssPixels": list(snapshots[0].size),
                                 "capturedMs": round(1000*(stamps[-1]-stamps[0])),
                                 "peakSeries": [0.035, 0.14, 0]}
    guide_action(page, "cancel").click()
    expect(mic).to_have_attribute("aria-pressed", "false")
    # Keep the synthetic source and actual recorder, disable only optional Web Audio metering.
    page.evaluate("""() => { window.testContext = window.AudioContext; window.testWebkitContext = window.webkitAudioContext;
        window.AudioContext = undefined; window.webkitAudioContext = undefined; }""")
    try:
        mic.click()
        expect(mic).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".meter")).to_have_count(0)
        expect(page.locator(".orb-signal")).to_have_count(0)
        frames["unmetered"] = frame()
        page.wait_for_timeout(720)
        unsampled = frame_delta(frames["unmetered"], frame())
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(350)
        still = frame()
        page.wait_for_timeout(380)
        frozen = frame_delta(still, frame())
        assert frozen["changedAbove8"] == 0, frozen
    finally:
        page.evaluate("window.AudioContext = window.testContext; window.webkitAudioContext = window.testWebkitContext")
        guide_action(page, "cancel").click()
        page.evaluate("window.testToneAmplitude = 0.24")
    log["orbPerception"] = {"rawTonePeak": {"silence": 0, "soft": 0.035, "medium": 0.14},
                            "expectedRms": {"silence": 0, "soft": 0.0247, "medium": 0.099},
                            "diameter": frames["silence"].width,
                            "silenceToSoft": frame_delta(frames["silence"], frames["soft"]),
                            "softToMedium": frame_delta(frames["soft"], frames["medium"]),
                            "unmetered720ms": unsampled, "reduced380ms": frozen}
    log["checks"].append("in-place orb pixels measured using silence, soft, medium, unmetered and reduced motion")
    tile = max(100, frames["silence"].width + 14)
    strip = Image.new("RGB", (tile * len(frames), frames["silence"].height + 32), "white")
    draw = ImageDraw.Draw(strip)
    for index, (name, picture) in enumerate(frames.items()):
        strip.paste(picture, (tile * index + 4, 24))
        draw.text((tile * index + 4, 4), name, fill="black")
    strip.save(args.out / f"guide-immersive-levels-{case}.webp", lossless=True)


def check(context, page, args, engine, narrow):
    case = f"{engine}-{'320-en-dark' if narrow else '390-zh-light'}"
    log = {"engine": engine, "case": case, "checks": [], "api": [], "blocked_hosts": set(), "pageErrors": []}
    shared.intercept(context, args.api, args.web, log)
    context.add_init_script(TEST_MIC)
    prefs = {"scenic-guide-app-locale": "en" if narrow else "zh-Hans",
             "scenic-guide-large-text": "large" if narrow else "standard"}
    context.add_init_script("for (const [k,v] of Object.entries(" + json.dumps(prefs) + ")) localStorage.setItem(k,v);")
    page.on("pageerror", lambda error: log["pageErrors"].append(str(error)[:180]))
    page.set_default_timeout(8000)
    page.goto(args.web + GUIDE, wait_until="domcontentloaded")
    mic, state = page.locator(".mic"), page.locator(".state-label")
    expect(mic).to_have_attribute("aria-disabled", "false", timeout=20000)
    expect(page.locator(".guide-title")).to_have_text("AI Guide" if narrow else "AI 导游")
    stage = page.locator(".stage-frame")
    expect(stage).to_be_visible()
    page.wait_for_timeout(350)
    log["bounds"] = page.evaluate("""() => Object.fromEntries(
      ['.stage-frame','.ambient-orb','.renderer','.mic','.guide-header','.guide-tabbar'].map(k=>{
        const r=document.querySelector(k).getBoundingClientRect();
        return [k, [r.x,r.y,r.width,r.height].map(Math.round)];
      }))""")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert all(log["bounds"][k][2] > 25 for k in (".mic", ".ambient-orb", ".renderer"))
    mic_rect = log["bounds"][".mic"]
    guide_bar = log["bounds"][".guide-tabbar"]
    assert abs(mic_rect[0] + mic_rect[2]/2 - guide_bar[2]/2) <= 1
    assert mic_rect[1] < guide_bar[1] + guide_bar[3] and mic_rect[1] + mic_rect[3] <= guide_bar[1]+guide_bar[3]+1
    check_root_navigation(page, log, case, args)
    asset = next(u for u in page.evaluate("performance.getEntriesByType('resource').map(x=>x.name)") if re.search(r"/pages-ai-guide-index\.[^/]+\.js", u))
    log["guideChunk"] = urlsplit(asset).path
    with urlopen(asset, timeout=5) as response:
        log["guideChunkSha256"] = hashlib.sha256(response.read()).hexdigest()
    capture_screen(page, args.out / f"guide-immersive-{case}.webp")
    log["checks"].append("stage, portrait region, mic, tab and horizontal bounds")

    def closed():
        expect(page.locator(".overlay")).to_have_count(0)

    settings = guide_action(page, "settings")
    settings.focus()
    page.keyboard.press("Enter")
    expect(page.locator(".sheet-content .setting-title").first).to_be_visible()
    expect(page.locator(".dismiss")).to_be_focused()
    system_note = page.get_by_text(re.compile("系统已开启减少动态效果|Reduce motion is on in system settings", re.I))
    motion_choice = page.locator(".sheet-content .choice").filter(has_text=re.compile("减少动态效果|Reduce motion", re.I))
    if narrow:
        expect(system_note).to_be_visible()
        expect(motion_choice).to_have_count(0)
        log["checks"].append("system reduction suppresses the manual override")
    else:
        expect(motion_choice).to_have_attribute("aria-pressed", "false")
        motion_choice.click()
        expect(motion_choice).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("localStorage.getItem('scenic-guide-reduce-motion')") == "on"
        motion_choice.click()
        expect(motion_choice).to_have_attribute("aria-pressed", "false")
        assert page.evaluate("localStorage.getItem('scenic-guide-reduce-motion')") == "off"
        log["checks"].append("in-page motion switch persists on and off")
    page.keyboard.press("Shift+Tab")
    assert page.evaluate("!!document.activeElement.closest('#guide-sheet')")
    page.keyboard.press("Escape")
    closed()
    expect(settings).to_be_focused()
    log["checks"].append("keyboard opens settings, focus is contained, Escape returns to opener")

    page.emulate_media(reduced_motion="reduce")
    material = page.locator(".orb-material")
    page.wait_for_function("() => document.querySelector('.orb-material').style.transitionDuration === '0ms' || getComputedStyle(document.querySelector('.orb-material')).transitionDuration === '0s'")
    stable = material.get_attribute("style")
    page.wait_for_timeout(330)
    assert stable == material.get_attribute("style")
    log["checks"].append("system reduced motion freezes material")

    # Canceled captures may not reach the API. A second capture is allowed.
    before = route_total(log, "/api/voice/ask-upload")
    capture = page.evaluate("typeof MediaRecorder === 'function' && typeof OfflineAudioContext === 'function' && !!navigator.mediaDevices")
    can_play = page.evaluate("!!new Audio().canPlayType('audio/wav')")
    log["capabilities"] = {"recording": capture, "wavPlayback": can_play}
    measure_orb(page, mic, capture, log, case, args)
    if not capture:
        mic.click()
        expect(page.locator(".error-text")).to_be_visible()
        expect(mic).to_have_attribute("aria-pressed", "false")
        assert route_total(log, "/api/voice/ask-upload") == before
        log["checks"].append("recorder API absent; app shows disabled/error text and offers keyboard")
    else:
        mic.click()
        expect(mic).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".meter")).to_be_visible()
        guide_action(page, "cancel").click()
        expect(mic).to_have_attribute("aria-pressed", "false")
        assert route_total(log, "/api/voice/ask-upload") == before
        log["checks"].append("click to record; actual analyser receives injected MediaStream; cancel skips upload")

        touch(page, mic, "touchstart")
        expect(mic).to_have_attribute("aria-pressed", "true")
        touch(page, mic, "touchmove", -80)
        touch(page, mic, "touchend")
        expect(mic).to_have_attribute("aria-pressed", "false")
        page.wait_for_timeout(475)
        assert route_total(log, "/api/voice/ask-upload") == before
        assert page.evaluate("window.testTracks.every(t=>t.readyState==='ended')")
        log["checks"].append("long-press, slide to cancel; zero uploads and released tracks")

        # start + re-tap to finish uses the actual conversion, multipart and answer flow.
        mic.click()
        expect(mic).to_have_attribute("aria-pressed", "true")
        page.wait_for_timeout(600)
        with page.expect_response(lambda r: "/api/voice/ask-upload" in r.url and r.request.method == "POST", timeout=14000) as response:
            mic.click()
        assert response.value.status == 200
        expect(mic).to_have_attribute("aria-pressed", "false")
        log["checks"].append("second tap finishes recording; multipart voice ask returned 200")

    # Stop auto narration, then use the same app's keyboard, text, history and replay.
    stop = page.locator(".guide-tools [role=button]").filter(has_text=re.compile(r"^(Stop|停止)$", re.I))
    if stop.is_visible():
        stop.click()
    question = "Where should I start at Lingshan?" if narrow else "第一次来灵山，游览路线怎么走？"
    guide_action(page, "text").click()
    editor = page.locator("textarea:visible").last
    expect(editor).to_be_visible()
    placeholder = page.locator("#guide-question .uni-textarea-placeholder")
    expect(placeholder).to_be_visible()
    placeholder_color = placeholder.evaluate("e => getComputedStyle(e).color")
    editor.fill(question)
    expect(editor).to_have_value(question)
    foreground, background = editor.evaluate("""e => {
      const style=getComputedStyle(e), fill=style.webkitTextFillColor;
      return [fill && fill.toLowerCase()!=='currentcolor' ? fill : style.color,
              getComputedStyle(e.closest('#guide-question')).backgroundColor];
    }""")
    draft_ratio = text_contrast(foreground, background)
    placeholder_ratio = text_contrast(placeholder_color, background)
    assert min(draft_ratio, placeholder_ratio) >= 4.5, (foreground, placeholder_color, background)
    log["draftColors"] = {"text":foreground,"placeholder":placeholder_color,"background":background,
                          "textContrast":draft_ratio,"placeholderContrast":placeholder_ratio}
    if engine == "chromium":
        capture_screen(page, args.out / f"guide-draft-{case}.webp")
    with page.expect_response(lambda r: "/api/chat/ask" in r.url and r.request.method == "POST" and r.status == 200):
        page.locator(".sheet-content .keyboard-button:visible").last.click()
    closed()
    expect(page.locator(".subtitles .caption")).not_to_be_empty()
    expect(guide_action(page, "history")).to_be_visible()
    guide_action(page, "history").click()
    expect(page.locator(".entry").filter(has_text=question)).to_have_count(1)
    answers = page.locator(".entry.answer")
    expect(answers.last).to_be_visible()
    assert len(answers.last.locator(".body").inner_text()) > 16
    assert answers.last.locator(".source").count() > 0
    if engine == "chromium" and not narrow:
        capture_screen(page, args.out / "guide-immersive-history.webp")
    log["checks"].append("typed question exactly once; history preserves full answer and sources")
    if can_play:
        answers.last.locator(".keyboard-button").click()
        closed()
        pause = page.locator(".guide-tools [role=button]").filter(has_text=re.compile(r"^(Pause|暂停)$", re.I))
        # Windows WebKit may advertise WAV but reject play() without an output.
        failed = page.locator(".error-text").filter(has_text=re.compile("audio|play|播放", re.I))
        expect(pause.or_(failed).first).to_be_visible(timeout=12000)
        if pause.is_visible():
            pause.click()
            resume = page.locator(".guide-tools [role=button]").filter(has_text=re.compile(r"^(Resume|Continue|继续)$", re.I))
            expect(resume).to_be_visible()
            paused_caption = page.locator(".subtitles .caption").inner_text()
            page.wait_for_timeout(240)
            assert page.locator(".subtitles .caption").inner_text() == paused_caption
            resume.click()
            expect(stop).to_be_visible()
            stop.click()
            expect(stop).to_have_count(0)
            log["checks"].append("host narration pauses, resumes and stops; subtitle retained during pause")
        else:
            assert engine == "webkit"
            expect(page.locator(".subtitles .caption")).not_to_be_empty()
            log["checks"].append("WebKit advertised WAV but returned playback error; localized recovery and caption visible")
    else:
        page.locator(".dismiss").click()
        closed()
        log["checks"].append("host cannot play WAV; answer and sources remain accessible")

    if capture:
        page.evaluate("window.testDenyCapture = true")
        mic.click()
        expect(page.locator(".error-text")).to_be_visible()
        expect(mic).to_have_attribute("aria-pressed", "false")
        page.evaluate("window.testDenyCapture = false")
        log["checks"].append("injected NotAllowedError keeps microphone idle and presents a keyboard alternative")
        # Two machine clicks inside the deliberate activation debounce count as one.
        page.wait_for_timeout(300)
        mic.click()
        expect(mic).to_have_attribute("aria-pressed", "true")
    shared.go_to_tab(page, 0)
    expect(page.locator(".hero-photo")).to_be_visible()
    log["homeRoute"] = urlsplit(page.url).path
    if capture:
        assert page.evaluate("window.testTracks.every(t=>t.readyState==='ended')")
    shared.go_to_tab(page, 2)
    page.wait_for_url("**/pages/ai-guide/index")
    expect(mic).to_have_attribute("aria-pressed", "false")
    assert route_total(log, "/api/voice/ask-upload") == before + int(capture)
    assert route_total(log, "/api/chat/ask") == 1
    log["checks"].append("tab leaves and returns to a non-recording guide; no unexpected upload")
    assert not log["pageErrors"], log["pageErrors"]
    log["api"] = [[method, re.sub(r"(/api/voice/tts/audio/)[^/]+", r"\1{clip}", path), status]
                  for method, path, status in log["api"]]
    log["blocked_hosts"] = sorted(log["blocked_hosts"])
    return log


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=shared.loopback, required=True)
    parser.add_argument("--api", type=shared.loopback, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--engine", choices=["chromium", "webkit"], required=True)
    parser.add_argument("--only", choices=["390", "320"])
    args = parser.parse_args()
    with urlopen(args.api + "/api/health", timeout=5) as response:
        assert all(v == "mock" for v in json.load(response)["data"]["providers"].values())
    args.out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch()
        try:
            nav_failures = check_navigation_failures(browser, args)
            for narrow in [False, True]:
                width = 320 if narrow else 390
                if args.only and int(args.only) != width:
                    continue
                context = browser.new_context(viewport={"width": width, "height": 760 if narrow else 844},
                    device_scale_factor=1, is_mobile=True, has_touch=True, locale="en-US" if narrow else "zh-CN",
                    color_scheme="dark" if narrow else "light", reduced_motion="reduce" if narrow else "no-preference",
                    service_workers="block")
                try:
                    log = check(context, context.new_page(), args, args.engine, narrow)
                    log["controlledFailures"] = nav_failures
                    log["version"] = browser.version
                    output = args.out / f"guide-immersive-{log['case']}.json"
                    output.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    print(log["case"], "passed", len(log["checks"]), log["guideChunk"])
                finally:
                    context.unroute_all(behavior="wait")
                    context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
