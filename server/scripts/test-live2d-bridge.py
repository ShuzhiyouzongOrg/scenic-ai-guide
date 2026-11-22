"""Run with python server/scripts/test-live2d-bridge.py and Playwright Chromium.

Set CHROMIUM_BIN to use an installed Chrome executable.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]


class StageHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        file = Path(super().translate_path(path))
        relative = file.relative_to(self.directory)
        if relative.parts[:2] in (("live2d", "ui"), ("live2d", "motionsync")):
            return str(ROOT / "web/public" / relative)
        return str(file)

    def log_message(self, *args):
        pass


def delayed_bridge(browser, origin, fail_model):
    page = browser.new_page()
    held = []
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("""window.received = [];
        window.__uniapp_x_ = {postMessage: json => received.push(JSON.parse(json).data)};""")
    page.route("**/vendor/dcloud/*.js", lambda route: held.append(route))
    if fail_model:
        page.route("**/Haru.model3.json", lambda route: route.fulfill(status=404, body=""))
    page.goto(origin + "/live2d/?model=Haru&embed=1", wait_until="domcontentloaded")
    page.wait_for_selector("#status-text.error" if fail_model else "#loading[hidden]", state="attached")
    assert len(held) == 1 and page.evaluate("received.length") == 0
    held.pop().continue_()
    page.wait_for_function("received.length > 0")
    packet = page.evaluate("received.at(-1)")
    assert packet["source"] == "scenic-live2d" and packet["model"] == "Haru"
    if fail_model:
        assert packet["type"] == "error" and packet["message"]
    else:
        assert packet["type"] == "runtime-state" and packet["ready"] and not packet["speaking"]
    replay = page.evaluate("""() => {
        received.length = 0;
        document.dispatchEvent(new Event('UniAppJSBridgeReady'));
        window.scenicLive2dPing();
        window.scenicLive2dPing();
        return received;
    }""")
    assert replay == [packet] * 3, replay
    assert not errors, errors
    page.close()


def framed_preview(browser, origin):
    page = browser.new_page()
    requests = []
    page.on("request", lambda request: requests.append(request.url))
    page.goto(origin)
    page.evaluate("""() => {
        window.received = [];
        addEventListener('message', e => {
            if (e.origin === location.origin && e.data?.source === 'scenic-live2d') received.push(e.data);
        });
        const frame = document.createElement('iframe');
        frame.src = '/live2d/?model=Haru&embed=1';
        document.body.appendChild(frame);
    }""")
    page.wait_for_function("received.some(p => p.type === 'ready')")
    page.evaluate("frames[0].scenicLive2dPing()")
    page.wait_for_function("received.some(p => p.type === 'runtime-state' && p.ready)")
    assert not any("/vendor/dcloud/" in url for url in requests)
    page.close()


if __name__ == "__main__":
    handler = partial(StageHandler, directory=str(ROOT / "server/src/web"))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server, sync_playwright() as pw:
        origin = f"http://127.0.0.1:{server.server_port}"
        browser = pw.chromium.launch(
            executable_path=environ.get("CHROMIUM_BIN"), args=["--enable-unsafe-swiftshader"]
        )
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            delayed_bridge(browser, origin, fail_model=False)
            delayed_bridge(browser, origin, fail_model=True)
            framed_preview(browser, origin)
        finally:
            browser.close()
            server.shutdown()
    print("PASS: real Cubism ready and failure before bridge load; bridge ready and repeated pings; H5 iframe isolation.")
