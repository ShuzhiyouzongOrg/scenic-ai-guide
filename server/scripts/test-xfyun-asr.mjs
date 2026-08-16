import assert from "node:assert";
import { config } from "../src/config.mjs";
import { getAudioClip, synthesizeSpeech, transcribeAudio } from "../src/services/voice.mjs";

assert.equal(config.providers.asr, "xfyun", "Set ASR_PROVIDER=xfyun before running this integration test.");
assert.equal(config.providers.tts, "xfyun", "Set TTS_PROVIDER=xfyun before running this integration test.");

const expected = "欢迎来到灵山胜境";
const speech = await synthesizeSpeech({ text: expected });
const firstSegment = speech.segments[0];
const clip = getAudioClip(firstSegment.id);
assert.ok(clip?.buffer?.length > 0, "TTS must return an audio buffer.");

const result = await transcribeAudio({
  audioBase64: clip.buffer.toString("base64"),
  mimeType: clip.mimeType
});

assert.equal(result.provider, "xfyun");
assert.ok(result.text.includes("灵山"), `Unexpected transcript: ${result.text}`);
console.log("XFYUN ASR round-trip test passed.");
