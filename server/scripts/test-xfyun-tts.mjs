/**
 * @fileoverview 讯飞语音合成联调测试脚本。
 * @description 调用真实讯飞 TTS 并校验供应商标识、音频片段和缓存内容。
 */
import assert from "node:assert/strict";

process.env.DEMO_MODE = "false";

const { synthesizeSpeech, getAudioClip } = await import("../src/services/voice.mjs");

const result = await synthesizeSpeech({
  text: "您好，我是灵山胜境 AI 导游。",
  voice: process.env.XFYUN_TTS_VOICE || "xiaoyan"
});

assert.equal(result.provider, "xfyun");
assert.ok(result.segments.length > 0);

const clip = getAudioClip(result.segments[0].id);
assert.ok(clip);
assert.equal(clip.mimeType, "audio/mpeg");
assert.ok(clip.buffer.length > 1000);

console.log(`XFYUN TTS tests passed. bytes=${clip.buffer.length}`);
