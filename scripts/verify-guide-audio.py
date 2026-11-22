"""Exercise the visitor's browser recorder, PCM meter and TTS player using a local tone."""
import functools
import http.server
import math
from pathlib import Path
import shutil
import struct
import tempfile
import threading
import wave

from playwright.sync_api import sync_playwright


SERVICES = Path(__file__).resolve().parents[1] / "visitor-app" / "services"
PAGE = """<button>Record</button><script type="module">
import {createWebRecording} from './web-recording.js';
import {createWebNarrationPlayer} from './web-narration.js';
window.result = {microphone: [], playback: [], states: [], done: false};
const r = window.result;
document.querySelector('button').onclick = () => {
  const capture = createWebRecording(() => {
    r.states.push('recording');
    setTimeout(() => capture.stop(), 2300);
  }, () => r.states.push('encoding'), async url => {
    const bytes = await (await fetch(url)).arrayBuffer();
    r.format = String.fromCharCode(...new Uint8Array(bytes, 0, 4));
    r.rate = new DataView(bytes).getUint32(24, true);
    narrate();
  }, error => { r.error = error; }, level => r.microphone.push(level));
  capture.start();
};
function narrate() {
  const player = createWebNarrationPlayer(level => r.playback.push(level));
  let pauseOnce = true;
  player.onPlay(() => {
    r.states.push('playing');
    if (pauseOnce) { pauseOnce = false; setTimeout(() => player.pause(), 550); }
  });
  player.onPause(() => {
    const count = r.playback.length;
    r.states.push('paused');
    setTimeout(() => {
      if (r.done) return;
      r.pauseStable = count === r.playback.length;
      player.play();
    }, 280);
  });
  player.onEnded(() => { player.destroy(); r.states.push('ended'); r.done = true; });
  player.onError(() => { r.error = 'playback failed'; });
  player.src = './signal.wav';
  player.play();
}
</script>"""


def write_signal(path):
    samples = bytearray()
    for i in range(32000):
        t = i / 16000
        gain = 0 if t < .35 or t > 1.65 else .1 if t < .95 else .6
        samples.extend(struct.pack("<h", round(32767 * gain * math.sin(2 * math.pi * 440 * t))))
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, 16000, 0, "NONE", "NONE"))
        output.writeframes(samples)


def run(directory):
    for name in ("web-recording.js", "web-narration.js", "web-audio-meter.js", "decoded-levels.js"):
        shutil.copyfile(SERVICES / name, directory / name)
    tone = directory / "signal.wav"
    write_signal(tone)
    (directory / "index.html").write_text(PAGE, encoding="utf8")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(args=[
                    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                    f"--use-file-for-fake-audio-capture={tone}", "--autoplay-policy=no-user-gesture-required",
                ])
                page = browser.new_context(permissions=["microphone"]).new_page()
                page.goto(f"http://127.0.0.1:{server.server_port}/")
                page.get_by_role("button", name="Record").click()
                page.wait_for_function("result.done || result.error", timeout=20000)
                result = page.evaluate("result")
                browser.close()
        finally:
            server.shutdown()
    assert "error" not in result and result["pauseStable"], result
    assert (result["format"], result["rate"]) == ("RIFF", 16000), result
    for name in ("microphone", "playback"):
        levels = result[name]
        assert min(levels) < .02 and max(levels) > .30 and any(.035 < x < .15 for x in levels), levels
        print(f"{name}: {len(levels)} RMS readings, {min(levels):.4f} to {max(levels):.4f}")
    print("PCM16 WAV at 16 kHz, quiet/soft/loud signals and pause/resume passed")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as temporary:
        run(Path(temporary))
