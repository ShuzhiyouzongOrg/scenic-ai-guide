/**
 * @fileoverview 语音问答服务测试脚本。
 * @description 验证转写、文本切分、语音合成、音频缓存和语音问答组合流程。
 */
import assert from "node:assert";
import { transcribeAudio, synthesizeSpeech, voiceAsk, splitForTts, getAudioClip } from "../src/services/voice.mjs";

const asr = await transcribeAudio({ transcript: "灵山大佛有多高？", mimeType: "audio/webm" });
assert.equal(asr.text, "灵山大佛有多高？");
assert.equal(asr.provider, "provided-transcript");

const parts = splitForTts("第一句很短。第二句也很短。");
assert.equal(parts.length, 2);

const routeParts = splitForTts("1. 南门入园。\n2. 灵山大佛含台基总高101.5米。[C-route]");
assert.equal(routeParts.length, 2);
assert.equal(routeParts[0], "1. 南门入园。");
assert.equal(routeParts[1], "2. 灵山大佛含台基总高101.5米。[C-route]");

const tts = await synthesizeSpeech({ text: "灵山大佛高88米。[C-height]欢迎继续提问。" });
assert.ok(tts.segments.length >= 1);
assert.ok(tts.audioUrl);
assert.ok(getAudioClip(tts.segments[0].id)?.buffer.length > 44);
assert.ok(tts.segments.every((segment) => !/\[C-/u.test(segment.text)));

const result = await voiceAsk({ transcript: "九龙灌浴有什么看点？", sessionId: "voice_test" });
assert.equal(result.transcript, "九龙灌浴有什么看点？");
assert.ok(result.answer.answer.includes("九龙灌浴"));
assert.ok(result.tts.segments.length >= 1);
assert.ok(result.latency.totalMs >= 0);

console.log("Voice tests passed.");
