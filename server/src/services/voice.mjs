/**
 * @fileoverview 语音识别、语音合成、语音问答编排和短期音频片段存储服务。
 *
 * @description 支持讯飞 WebSocket ASR/TTS 及离线模拟实现；讯飞不可用时是否降级由演示模式和供应商配置决定。
 */

/**
 * @typedef {object} TranscriptionResult
 * @description 一次语音识别的文本与性能结果。
 * @property {string} text 识别文本。
 * @property {string} provider 实际识别供应商。
 * @property {number} confidence 识别置信度。
 * @property {string} [mimeType] 输入音频媒体类型。
 * @property {number} latencyMs 识别耗时，单位为毫秒。
 */

/**
 * @typedef {object} SpeechSegment
 * @description 可单独播放的语音合成片段。
 * @property {string} id 音频片段 ID。
 * @property {string} text 对应文本。
 * @property {string} audioUrl 临时音频访问地址。
 * @property {string} mimeType 输出音频媒体类型。
 * @property {number} durationMs 估算播放时长，单位为毫秒。
 */

/**
 * @typedef {object} AudioClip
 * @description 保存在进程内存中的临时合成音频。
 * @property {Buffer} buffer 音频字节。
 * @property {string} mimeType 音频媒体类型。
 * @property {string} text 对应文本。
 * @property {number} expiresAt 过期的 Unix 毫秒时间戳。
 */

/**
 * @typedef {Error & {statusCode: number, code: string}} VoiceServiceError
 * @description 带 HTTP 状态和业务错误码的语音服务异常。
 * @property {number} statusCode HTTP 状态码。
 * @property {string} code 业务错误码。
 */
import { createHmac, randomBytes } from "node:crypto";
import { config } from "../config.mjs";
import { answerQuestion, formatPublicAssistantText } from "./chat.mjs";
import { getCachedAnswer, setCachedAnswer } from "./faqCache.mjs";

/**
 * @description 可通过临时 API URL 获取的合成音频片段。
 * @type {Map<string, AudioClip>}
 */
const audioStore = new Map();
/**
 * @description 合成音频在内存中的有效期，单位为毫秒。
 * @type {number}
 */
const AUDIO_TTL_MS = 1000 * 60 * 30;
/**
 * @description 单个 TTS 请求片段的最大字符数。
 * @type {number}
 */
const MAX_TTS_CHARS = 90;

/**
 * @description 获取 Unix 毫秒时间，用于延迟统计。
 * @private
 * @returns {number} 当前毫秒时间戳。
 */
function nowMs() {
  return Date.now();
}

/**
 * @description 将音频转换为文字；显式 transcript 优先，其次使用讯飞，最后按配置使用模拟识别。
 * @param {{audioBase64?: string, mimeType?: string, transcript?: string, signal?: AbortSignal}} [input={}] 识别输入。
 * @returns {Promise<TranscriptionResult>} 识别文本、供应商、置信度和耗时。
 * @throws {VoiceServiceError} 音频缺失/格式无效、密钥缺失、供应商未实现、请求中止或讯飞调用失败时抛出。
 * @example
 * const result = await transcribeAudio({ audioBase64, mimeType: "audio/wav" });
 */
export async function transcribeAudio({ audioBase64 = "", mimeType = "", transcript = "", signal } = {}) {
  const started = nowMs();
  const suppliedTranscript = String(transcript || "").trim();
  if (suppliedTranscript) {
    return {
      text: suppliedTranscript,
      provider: "provided-transcript",
      confidence: 0.98,
      mimeType,
      latencyMs: nowMs() - started
    };
  }

  if (config.providers.asr === "xfyun" && hasXfyunAsrConfig()) {
    return transcribeXfyunAudio({ audioBase64, mimeType, signal, started });
  }

  const useMockAsr = config.providers.asr === "mock" || (config.demoMode && !hasXfyunAsrConfig());
  if (!useMockAsr) {
    assertProviderKey("ASR_API_KEY", config.providers.asr);
    throw providerNotImplemented("ASR", config.providers.asr);
  }

  if (signal?.aborted) {
    throw abortedError("ASR");
  }

  const text = inferMockTranscript(audioBase64, mimeType);
  return {
    text,
    provider: "mock",
    confidence: 0.55,
    mimeType,
    latencyMs: nowMs() - started
  };
}

/**
 * @description 判断讯飞 ASR 所需的应用 ID、API Key 和 API Secret 是否齐全。
 * @private
 * @returns {boolean} 配置完整时为 `true`。
 */
function hasXfyunAsrConfig() {
  return Boolean(config.xfyun.appId && config.xfyun.apiKey && config.xfyun.apiSecret);
}

/**
 * @description 按讯飞鉴权规范构建 ASR WebSocket 签名 URL。
 * @private
 * @returns {string} 带 HMAC 鉴权参数的 `wss:` URL。
 */
function xfyunAsrSignedUrl() {
  const host = config.xfyun.asrHost;
  const path = config.xfyun.asrPath;
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = createHmac("sha256", config.xfyun.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorizationOrigin = `api_key="${config.xfyun.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
}

/**
 * @description 解码并校验讯飞 ASR 支持的 MP3、单声道 PCM WAV 或原始 PCM 音频。
 * @private
 * @param {*} audioBase64 Base64 编码音频。
 * @param {*} mimeType 音频媒体类型。
 * @returns {{buffer: Buffer, encoding: "lame"|"raw", format: string}} 讯飞请求音频。
 * @throws {VoiceServiceError} 音频为空、类型不支持或 WAV 格式不满足要求时抛出。
 */
function prepareXfyunAsrAudio(audioBase64, mimeType) {
  const buffer = Buffer.from(String(audioBase64 || ""), "base64");
  if (!buffer.length) {
    const error = new Error("Audio data is required.");
    error.statusCode = 400;
    error.code = "ASR_AUDIO_REQUIRED";
    throw error;
  }

  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("mpeg") || normalizedMime.includes("mp3")) {
    return { buffer, encoding: "lame", format: "audio/L16;rate=16000" };
  }

  if (normalizedMime.includes("wav") || (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF")) {
    return parsePcmWav(buffer);
  }

  if (normalizedMime.includes("pcm") || normalizedMime.includes("l16") || normalizedMime === "application/octet-stream") {
    return { buffer, encoding: "raw", format: normalizedMime.includes("8000") ? "audio/L16;rate=8000" : "audio/L16;rate=16000" };
  }

  const error = new Error(`Unsupported ASR audio type: ${mimeType || "unknown"}. Use 16 kHz mono MP3, WAV or PCM.`);
  error.statusCode = 415;
  error.code = "ASR_AUDIO_TYPE_UNSUPPORTED";
  throw error;
}

/**
 * @description 解析 RIFF/WAVE 分块并提取 8 kHz 或 16 kHz 单声道 16 位 PCM 数据。
 * @private
 * @param {Buffer} buffer WAV 文件内容。
 * @returns {{buffer: Buffer, encoding: "raw", format: string}} 原始 PCM 及讯飞格式描述。
 * @throws {VoiceServiceError} WAV 容器无效或编码、声道、位深、采样率不受支持时抛出。
 */
function parsePcmWav(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    const error = new Error("Invalid WAV audio.");
    error.statusCode = 400;
    error.code = "ASR_WAV_INVALID";
    throw error;
  }

  let offset = 12;
  let format = null;
  let audio = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buffer.length, chunkStart + chunkSize);
    if (chunkId === "fmt " && chunkSize >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === "data") {
      audio = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!format || !audio || format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16 || ![8000, 16000].includes(format.sampleRate)) {
    const error = new Error("WAV must be mono 16-bit PCM at 8 kHz or 16 kHz.");
    error.statusCode = 415;
    error.code = "ASR_WAV_FORMAT_UNSUPPORTED";
    throw error;
  }

  return { buffer: audio, encoding: "raw", format: `audio/L16;rate=${format.sampleRate}` };
}

/**
 * @description 通过讯飞 WebSocket 分片发送音频并按序组合识别片段。
 * @private
 * @param {{audioBase64: string, mimeType: string, signal?: AbortSignal, started: number}} input 识别参数。
 * @returns {Promise<TranscriptionResult>} 讯飞识别结果。
 * @throws {VoiceServiceError|Error} 超时、上游错误、空结果、网络故障、中止或消息解析失败时拒绝。
 */
function transcribeXfyunAudio({ audioBase64, mimeType, signal, started }) {
  const prepared = prepareXfyunAsrAudio(audioBase64, mimeType);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(xfyunAsrSignedUrl());
    const fragments = new Map();
    let settled = false;
    let sendTimer = null;
    const timeout = setTimeout(() => finish(asrServiceError("XFYUN ASR timed out.", "XFYUN_ASR_TIMEOUT")), config.xfyun.asrTimeoutMs);
    /**
     * @description 将外部取消信号转换为统一 ASR 中止异常。
     * @returns {void}
     */
    const onAbort = () => finish(abortedError("ASR"));

    if (signal) signal.addEventListener("abort", onAbort, { once: true });

/**
     * @description 只结算一次识别 Promise，并释放定时器、监听器和 WebSocket。
     * @param {Error|null} error 失败异常。
     * @param {TranscriptionResult} [result] 成功结果。
     * @returns {void} 无返回值。
     */
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (sendTimer) clearTimeout(sendTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      try { ws.close(); } catch { /* ignore close failures */ }
      if (error) reject(error);
      else resolve(result);
    }

    ws.addEventListener("open", () => {
      const chunkSize = prepared.encoding === "raw" ? 1280 : 1280;
      let offset = 0;
      let status = 0;

      /**
       * @description 分片发送下一段音频，并在结束时发送状态 2。
       * @returns {void}
       */
      const sendNext = () => {
        if (settled) return;
        if (offset >= prepared.buffer.length) {
          ws.send(JSON.stringify({ data: { status: 2, format: prepared.format, encoding: prepared.encoding, audio: "" } }));
          return;
        }

        const end = Math.min(offset + chunkSize, prepared.buffer.length);
        const payload = {
          data: {
            status,
            format: prepared.format,
            encoding: prepared.encoding,
            audio: prepared.buffer.subarray(offset, end).toString("base64")
          }
        };
        if (status === 0) {
          payload.common = { app_id: config.xfyun.appId };
          payload.business = { language: "zh_cn", domain: "iat", accent: "mandarin", eos: 5000, ptt: 1 };
        }
        ws.send(JSON.stringify(payload));
        offset = end;
        status = 1;
        sendTimer = setTimeout(sendNext, 40);
      };

      sendNext();
    });

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.code !== 0) {
          finish(asrServiceError(`XFYUN ASR error ${payload.code}: ${payload.message || "unknown error"}`, "XFYUN_ASR_ERROR"));
          return;
        }
        const result = payload.data?.result;
        if (result) {
          const text = (result.ws || []).map((word) => word.cw?.[0]?.w || "").join("");
          fragments.set(Number(result.sn ?? fragments.size), text);
        }
        if (payload.data?.status === 2) {
          const text = [...fragments.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]).join("").trim();
          if (!text) {
            finish(asrServiceError("XFYUN ASR returned no transcript.", "XFYUN_ASR_EMPTY"));
            return;
          }
          finish(null, {
            text,
            provider: "xfyun",
            confidence: 0.85,
            mimeType,
            latencyMs: nowMs() - started
          });
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.addEventListener("error", () => {
      finish(asrServiceError("XFYUN ASR websocket connection failed.", "XFYUN_ASR_NETWORK_ERROR"));
    });
  });
}

/**
 * @description 创建统一的讯飞 ASR 上游错误。
 * @private
 * @param {string} message 错误说明。
 * @param {string} code 业务错误码。
 * @returns {VoiceServiceError} HTTP 502 服务异常。
 */
function asrServiceError(message, code) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = code;
  return error;
}

/**
 * @description 将文本分段并合成为可通过临时 URL 播放的音频。
 * 优先尝试讯飞发音人和配置回退发音人；演示模式下讯飞失败可降级为模拟 WAV。
 * @param {{text?: string, voice?: string, speed?: number, signal?: AbortSignal}} [input={}] 合成参数。
 * @returns {Promise<{provider: string, voice: string, requestedVoice?: string, fallbackUsed?: boolean, speed: number, segments: SpeechSegment[], audioUrl: string|null, latencyMs: number}>} 合成结果。
 * @throws {VoiceServiceError} 文本为空、密钥缺失、供应商未实现、请求中止或讯飞调用失败且不可降级时抛出。
 * @example
 * const speech = await synthesizeSpeech({ text: "欢迎来到灵山胜境。", speed: 1 });
 */
export async function synthesizeSpeech({ text = "", voice = "guide_female", speed = 1, signal } = {}) {
  const started = nowMs();
  const cleanText = formatPublicAssistantText(text);
  if (!cleanText) {
    const error = new Error("Text is required.");
    error.statusCode = 400;
    error.code = "TTS_TEXT_REQUIRED";
    throw error;
  }

  const useMockTts = config.providers.tts === "mock" || (config.demoMode && !process.env.TTS_API_KEY);
  if (!useMockTts && config.providers.tts !== "xfyun") {
    assertProviderKey("TTS_API_KEY", config.providers.tts);
    throw providerNotImplemented("TTS", config.providers.tts);
  }

  if (signal?.aborted) {
    throw abortedError("TTS");
  }

  const segments = splitForTts(cleanText);
  if (config.providers.tts === "xfyun" && hasXfyunTtsConfig()) {
    const requestedVoice = resolveXfyunVoice(voice);
    const fallbackVoice = resolveXfyunVoice(config.xfyun.ttsVoice);
    const candidates = [...new Set([requestedVoice, fallbackVoice].filter(Boolean))];
    let lastError;
    for (const candidateVoice of candidates) {
      try {
        const audioSegments = [];
        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          const buffer = await synthesizeXfyunSegment({
            text: segment,
            voice: candidateVoice,
            speed,
            signal
          });
          const id = `tts_${Date.now()}_${randomBytes(4).toString("hex")}_${index}`;
          audioStore.set(id, {
            buffer,
            mimeType: "audio/mpeg",
            text: segment,
            expiresAt: Date.now() + AUDIO_TTL_MS
          });
          audioSegments.push({
            id,
            text: segment,
            audioUrl: `/api/voice/tts/audio/${id}`,
            mimeType: "audio/mpeg",
            durationMs: Math.min(30000, Math.max(900, segment.length * 180))
          });
        }
        cleanupAudioStore();
        return {
          provider: "xfyun",
          voice: candidateVoice,
          requestedVoice,
          fallbackUsed: candidateVoice !== requestedVoice,
          speed,
          segments: audioSegments,
          audioUrl: audioSegments[0]?.audioUrl || null,
          latencyMs: nowMs() - started
        };
      } catch (error) {
        lastError = error;
        if (candidateVoice !== candidates.at(-1)) {
          console.warn(`XFYUN TTS voice ${candidateVoice} failed; retrying the configured fallback voice.`);
        }
      }
    }
    if (!config.demoMode) {
      throw lastError;
    }
    console.warn(`XFYUN TTS failed, falling back to mock: ${lastError?.message || "unknown error"}`);
  }

  const audioSegments = segments.map((segment, index) => {
    const durationMs = Math.min(1200, Math.max(420, segment.length * 24));
    const buffer = createMockWav({ durationMs, frequency: 520 + index * 28 });
    const id = `tts_${Date.now()}_${randomBytes(4).toString("hex")}_${index}`;
    audioStore.set(id, {
      buffer,
      mimeType: "audio/wav",
      text: segment,
      expiresAt: Date.now() + AUDIO_TTL_MS
    });
    return {
      id,
      text: segment,
      audioUrl: `/api/voice/tts/audio/${id}`,
      mimeType: "audio/wav",
      durationMs
    };
  });

  cleanupAudioStore();
  return {
    provider: "mock",
    voice,
    speed,
    segments: audioSegments,
    audioUrl: audioSegments[0]?.audioUrl || null,
    latencyMs: nowMs() - started
  };
}

/**
 * @description 判断讯飞 TTS 所需的应用 ID、API Key 和 API Secret 是否齐全。
 * @private
 * @returns {boolean} 配置完整时为 `true`。
 */
function hasXfyunTtsConfig() {
  return Boolean(config.xfyun.appId && config.xfyun.apiKey && config.xfyun.apiSecret);
}

/**
 * @description 将前端通用音色别名解析为讯飞发音人代码。
 * @private
 * @param {*} voice 请求音色。
 * @returns {string} 讯飞发音人代码。
 */
function resolveXfyunVoice(voice) {
  const value = String(voice || "").trim();
  if (value && !["guide_female", "guide_soft", "guide_test"].includes(value)) {
    return value;
  }
  return config.xfyun.ttsVoice || "xiaoyan";
}

/**
 * @description 按讯飞鉴权规范构建 TTS WebSocket 签名 URL。
 * @private
 * @returns {string} 带 HMAC 鉴权参数的 `wss:` URL。
 */
function xfyunSignedUrl() {
  const host = config.xfyun.ttsHost;
  const path = config.xfyun.ttsPath;
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = createHmac("sha256", config.xfyun.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorizationOrigin = `api_key="${config.xfyun.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
}

/**
 * @description 通过讯飞 WebSocket 合成单个文本片段并拼接 MP3 音频块。
 * @private
 * @param {{text: string, voice: string, speed: number, signal?: AbortSignal}} input 合成参数。
 * @returns {Promise<Buffer>} MP3 音频。
 * @throws {VoiceServiceError|Error} 超时、上游错误、网络故障、中止或消息解析失败时拒绝。
 */
function synthesizeXfyunSegment({ text, voice, speed, signal }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(xfyunSignedUrl());
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`XFYUN TTS timed out after ${config.xfyun.ttsTimeoutMs}ms.`)), config.xfyun.ttsTimeoutMs);
    /**
     * @description 将外部取消信号转换为统一 TTS 中止异常。
     * @returns {void}
     */
    const onAbort = () => finish(abortedError("TTS"));

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

/**
     * @description 只结算一次合成 Promise，并释放定时器、监听器和 WebSocket。
     * @param {Error|null} error 失败异常。
     * @param {Buffer} [buffer] 合成音频。
     * @returns {void} 无返回值。
     */
    function finish(error, buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      try {
        ws.close();
      } catch {
        // ignore close failures
      }
      if (error) {
        reject(error);
      } else {
        resolve(buffer);
      }
    }

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        common: {
          app_id: config.xfyun.appId
        },
        business: {
          aue: "lame",
          sfl: 1,
          vcn: resolveXfyunVoice(voice),
          speed: Math.max(0, Math.min(100, Math.round(Number(speed || 1) * 50))),
          volume: 60,
          pitch: 50,
          bgs: 0,
          tte: "UTF8"
        },
        data: {
          status: 2,
          text: Buffer.from(text, "utf8").toString("base64")
        }
      }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.code !== 0) {
          const error = new Error(`XFYUN TTS error ${payload.code}: ${payload.message || "unknown error"}`);
          error.statusCode = 502;
          error.code = "XFYUN_TTS_ERROR";
          finish(error);
          return;
        }
        if (payload.data?.audio) {
          chunks.push(Buffer.from(payload.data.audio, "base64"));
        }
        if (payload.data?.status === 2) {
          finish(null, Buffer.concat(chunks));
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.addEventListener("error", () => {
      const error = new Error("XFYUN TTS websocket connection failed.");
      error.statusCode = 502;
      error.code = "XFYUN_TTS_NETWORK_ERROR";
      finish(error);
    });
  });
}

/**
 * @description 串联语音识别、RAG 问答缓存、文本回答和语音合成，并返回端到端耗时。
 * @param {{audioBase64?: string, mimeType?: string, transcript?: string, question?: string, sessionId?: string, mode?: string, locale?: string, signal?: AbortSignal}} [input={}] 语音问答输入。
 * @returns {Promise<{transcript: string, asr: TranscriptionResult, answer: object, tts: object, latency: object}>} 识别、回答、语音及阶段耗时。
 * @throws {Error} ASR、问答或 TTS 任一阶段失败时透传异常。
 * @example
 * const result = await voiceAsk({ question: "介绍灵山大佛", sessionId: "visitor-1" });
 */
export async function voiceAsk({ audioBase64 = "", mimeType = "", transcript = "", question = "", sessionId = "", mode = "", locale = "", signal } = {}) {
  const started = nowMs();
  const asrStart = nowMs();
  const asr = question
    ? { text: String(question).trim(), provider: "direct", confidence: 1, latencyMs: 0 }
    : await transcribeAudio({ audioBase64, mimeType, transcript, signal });
  const asrMs = nowMs() - asrStart;

  const cacheKey = `voice::${locale || "auto"}::${asr.text}::${mode || "auto"}`;
  const cached = getCachedAnswer(cacheKey, "voice");
  let answer;
  let ragMs = 0;
  let llmMs = 0;
  if (cached) {
    answer = cached.answerPayload;
  } else {
    const answerStart = nowMs();
    answer = await answerQuestion({ question: asr.text, sessionId, mode, locale, signal });
    ragMs = answer.latency?.retrievalMs || 0;
    llmMs = answer.latency?.llmMs || 0;
    setCachedAnswer(cacheKey, "voice", { answerPayload: answer }, 1000 * 60 * 10);
  }

  const ttsStart = nowMs();
  const tts = await synthesizeSpeech({ text: answer.answer, signal });
  const ttsMs = nowMs() - ttsStart;

  return {
    transcript: asr.text,
    asr,
    answer,
    tts,
    latency: {
      asrMs,
      ragMs,
      llmMs,
      ttsMs,
      totalMs: nowMs() - started,
      targetMs: 5000,
      withinTarget: nowMs() - started <= 5000
    }
  };
}

/**
 * @description 获取尚未过期的临时合成音频。
 * @param {string} id 音频片段 ID。
 * @returns {AudioClip|null} 音频片段；不存在或已过期时返回 `null`。
 * @example
 * const clip = getAudioClip("tts_1234_abcd_0");
 */
export function getAudioClip(id) {
  cleanupAudioStore();
  const clip = audioStore.get(id);
  if (!clip) {
    return null;
  }
  return clip;
}

/**
 * @description 优先按句末标点拆分文本，再将超长句硬切为不超过 90 字符的片段。
 * @param {*} text 待合成文本。
 * @returns {string[]} 有序 TTS 片段；空文本返回空数组。
 * @example
 * splitForTts("欢迎来到灵山。祝您游览愉快！");
 */
export function splitForTts(text) {
  const sentences = [];
  for (const line of String(text || "").split(/\n+/u)) {
    const normalized = line.replace(/[ \t]+/gu, " ").trim();
    if (!normalized) continue;
    if (/^\d{1,2}[.)、）]\s*\S/u.test(normalized)) {
      sentences.push(normalized);
      continue;
    }
    sentences.push(...normalized
      .split(/(?<=[。！？；!?;])\s*/u)
      .map((item) => item.trim())
      .filter(Boolean));
  }

  const parts = [];
  for (const sentence of sentences.length ? sentences : [String(text || "").trim()]) {
    if (sentence.length <= MAX_TTS_CHARS) {
      parts.push(sentence);
      continue;
    }
    for (let index = 0; index < sentence.length; index += MAX_TTS_CHARS) {
      parts.push(sentence.slice(index, index + MAX_TTS_CHARS));
    }
  }
  return parts;
}

/**
 * @description 为离线演示生成确定性的模拟识别文本。
 * @private
 * @param {*} audioBase64 是否提供音频内容。
 * @param {*} mimeType 是否提供媒体类型。
 * @returns {string} 模拟游客问题。
 */
function inferMockTranscript(audioBase64, mimeType) {
  if (audioBase64) {
    return "灵山大佛有多高？";
  }
  if (mimeType) {
    return "九龙灌浴有什么看点？";
  }
  return "灵山大佛有多高？";
}

/**
 * @description 创建带短促正弦音和淡入淡出的单声道 8 kHz 16 位 PCM WAV。
 * @private
 * @param {{durationMs: number, frequency: number}} input 时长和频率。
 * @returns {Buffer} 完整 WAV 文件内容。
 */
function createMockWav({ durationMs, frequency }) {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i += 1) {
    const fade = Math.min(1, i / 400, (samples - i) / 400);
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 1800 * fade);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

/**
 * @description 从进程内音频存储中移除已过期片段。
 * @private
 * @returns {void} 无返回值。
 */
function cleanupAudioStore() {
  const now = Date.now();
  for (const [id, clip] of audioStore.entries()) {
    if (clip.expiresAt < now) {
      audioStore.delete(id);
    }
  }
}

/**
 * @description 校验非讯飞云供应商对应的环境变量密钥。
 * @private
 * @param {"ASR_API_KEY"|"TTS_API_KEY"} envName 环境变量名。
 * @param {string} provider 供应商标识。
 * @returns {void} 无返回值。
 * @throws {VoiceServiceError} 密钥缺失时抛出对应的 `*_MISSING` 错误。
 */
function assertProviderKey(envName, provider) {
  const key = envName === "ASR_API_KEY" ? process.env.ASR_API_KEY : process.env.TTS_API_KEY;
  if (!key) {
    const error = new Error(`${envName} is missing for ${provider}. Set provider to mock for offline demo or configure a cloud key.`);
    error.statusCode = 500;
    error.code = `${envName}_MISSING`;
    throw error;
  }
}

/**
 * @description 创建尚未实现供应商的 HTTP 501 异常。
 * @private
 * @param {"ASR"|"TTS"|string} kind 服务类型。
 * @param {string} provider 供应商标识。
 * @returns {VoiceServiceError} 未实现异常。
 */
function providerNotImplemented(kind, provider) {
  const error = new Error(`${kind} provider "${provider}" is not implemented in this demo adapter yet.`);
  error.statusCode = 501;
  error.code = `${kind}_PROVIDER_NOT_IMPLEMENTED`;
  return error;
}

/**
 * @description 创建客户端中止请求对应的 HTTP 499 异常。
 * @private
 * @param {"ASR"|"TTS"|string} kind 服务类型。
 * @returns {VoiceServiceError} 中止异常。
 */
function abortedError(kind) {
  const error = new Error(`${kind} request was aborted.`);
  error.statusCode = 499;
  error.code = `${kind}_ABORTED`;
  return error;
}
