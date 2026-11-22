// Exercise the real HTTP handlers and intercept the WebSocket transport before any network I/O.
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

Object.assign(process.env, {
  CONFIG_ENV_FILE: join(tmpdir(), "scenic-voice-locale-unused.env"),
  SQLITE_PATH: ":memory:",
  ASR_PROVIDER: "xfyun",
  LLM_PROVIDER: "mock",
  TTS_PROVIDER: "xfyun",
  RAG_REMOTE_ENABLED: "false",
  XFYUN_APP_ID: "test-app",
  XFYUN_API_KEY: "test-key",
  XFYUN_API_SECRET: "test-secret",
  XFYUN_ASR_HOST: "iat-test.invalid",
  XFYUN_ASR_PATH: "/v2/iat",
  XFYUN_TTS_HOST: "tts-test.invalid",
  XFYUN_TTS_PATH: "/v2/tts",
  XFYUN_TTS_VOICE: "qa-configured-guide"
});

const connections = [];
const synthesisFrames = [];
const realWebSocket = globalThis.WebSocket;
class RecordingSocket extends EventTarget {
  constructor(url) {
    super();
    const request = new URL(url);
    this.synthesis = request.pathname === "/v2/tts";
    assert.equal(request.host, this.synthesis ? "tts-test.invalid" : "iat-test.invalid");
    assert.equal(request.pathname, this.synthesis ? "/v2/tts" : "/v2/iat");
    this.frames = [];
    if (!this.synthesis) connections.push(this.frames);
    queueMicrotask(() => this.dispatchEvent(new Event("open")));
  }
  send(serialized) {
    const frame = JSON.parse(serialized);
    if (this.synthesis) {
      synthesisFrames.push(frame);
      const data = JSON.stringify({ code: 0, data: { status: 2, audio: "AA==" } });
      this.dispatchEvent(new MessageEvent("message", { data }));
      return;
    }
    this.frames.push(frame);
    if (frame.data.status === 2) {
      const result = { sn: 0, ws: [{ cw: [{ w: "灵山大佛有多高？" }] }] };
      const data = JSON.stringify({ code: 0, data: { status: 2, result } });
      this.dispatchEvent(new MessageEvent("message", { data }));
    }
  }
  close() {}
}
globalThis.WebSocket = RecordingSocket;
const { startServer, stopServer } = await import("../src/app.mjs");
const { getCachedAnswer } = await import("../src/services/faqCache.mjs");
const pcm = Buffer.alloc(1600);
for (let i = 0; i < pcm.length; i++) pcm[i] = i % 251;
const wav = Buffer.alloc(44 + pcm.length);
wav.write("RIFF"); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);

try {
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const base = "http://127.0.0.1:" + server.address().port + "/api/voice/";
  for (const [route, locale, language, rawPcm] of [
    ["asr", "en-US", "en_us"], ["asr", undefined, "zh_cn"], ["ask", "en", "en_us"],
    ["ask-upload", "en", "en_us"], ["ask-upload", "zh-TW", "zh_cn"], ["ask-upload", "zh-CN", "zh_cn"],
    ["ask-upload", undefined, "zh_cn"],
    ["ask-upload", "en", "en_us", true], ["ask-upload", "zh-CN", "zh_cn", true]
  ]) {
    const previous = connections.length;
    const previousSynthesis = synthesisFrames.length;
    const options = { method: "POST" };
    if (route === "ask-upload") {
      const form = new FormData();
      if (locale) form.set("locale", locale);
      if (rawPcm) form.set("audio", new Blob([pcm], { type: "application/octet-stream" }), "record.PCM");
      else form.set("audio", new Blob([wav], { type: "audio/wav" }), "sample.wav");
      options.body = form;
    } else {
      options.headers = { "content-type": "application/json" };
      options.body = JSON.stringify({ locale, audioBase64: pcm.toString("base64"), mimeType: "audio/pcm" });
    }
    const response = await fetch(base + route, options);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(connections.length, previous + 1);
    const [first, middle, last] = connections.at(-1);
    assert.deepEqual([first.data.status, middle.data.status, last.data.status], [0, 1, 2]);
    assert.deepEqual(first.business, { language, domain: "iat", accent: "mandarin", eos: 5000, ptt: 1 });
    assert.equal(first.common.app_id, "test-app");
    assert.equal(first.data.format, "audio/L16;rate=16000");
    assert.equal(first.data.encoding, "raw");
    assert.deepEqual(Buffer.concat([first, middle].map(frame => Buffer.from(frame.data.audio, "base64"))), pcm);
    assert.equal(middle.business, undefined);
    assert.equal(last.business, undefined);
    const asr = route === "asr" ? payload.data : payload.data.asr;
    assert.equal(asr.provider, "xfyun");
    assert.equal(asr.text, "灵山大佛有多高？");
    if (route !== "asr") {
      const answerLocale = language === "en_us" ? "en" : locale === "zh-TW" ? "zh-TW" : "zh";
      assert.equal(payload.data.answer.locale, answerLocale);
      assert.ok(payload.data.tts.segments.length > 0);
      const frames = synthesisFrames.slice(previousSynthesis);
      assert.equal(frames.length, payload.data.tts.segments.length);
      for (const [index, frame] of frames.entries()) {
        assert.equal(frame.business.vcn, "qa-configured-guide");
        assert.equal(frame.business.tte, "UTF8");
        assert.equal(Buffer.from(frame.data.text, "base64").toString("utf8"), payload.data.tts.segments[index].text);
      }
      const mode = route === "ask-upload" ? "hybrid" : "auto";
      const cacheLocale = locale || (route === "ask-upload" ? "zh-CN" : "auto");
      const cached = getCachedAnswer(`voice::${cacheLocale}::${asr.text}::${mode}`, "voice");
      assert.equal(cached?.answerPayload.locale, answerLocale);
    }
    console.log(`${route} ${locale || "(omitted)"} -> ${language}, ${rawPcm ? "raw upload, " : ""}PCM bytes matched`);
  }
} finally {
  globalThis.WebSocket = realWebSocket;
  await stopServer();
}
