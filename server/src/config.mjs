/**
 * @fileoverview 服务端运行配置加载器。
 *
 * 模块先读取 `CONFIG_ENV_FILE` 指定的 dotenv 文件，再将环境变量整理为只读使用约定的
 * `config` 对象，同时创建数据与上传目录。父进程显式传入的变量优先级高于 dotenv。
 *
 * @example
 * import { config } from "./config.mjs";
 * console.log(config.host, config.port, config.providers.llm);
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 将 dotenv 文件中尚未存在于 `process.env` 的键加载到当前进程。
 *
 * 空行、注释行和不含等号的行会被忽略；值保留第一个等号后的完整文本。
 *
 * @param {string} filePath dotenv 文件的绝对路径或可解析路径。
 * @returns {void}
 * @throws {Error} 文件存在但无法读取时透传文件系统异常。
 * @private
 */
function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    // Respect variables that were explicitly supplied by the parent process,
    // including an empty value used by deterministic fallback tests.
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(resolve(process.env.CONFIG_ENV_FILE || resolve(process.cwd(), ".env")));

/**
 * 服务端统一运行配置。
 *
 * @type {{
 *   appName: string,
 *   nodeEnv: string,
 *   host: string,
 *   port: number,
 *   adminUsername: string,
 *   adminPassword: string,
 *   jwtSecret: string,
 *   dataDir: string,
 *   uploadDir: string,
 *   demoMode: boolean,
 *   providers: {llm: string, asr: string, tts: string},
 *   llm: {provider: string, apiKey: string, baseUrl: string, model: string, timeoutMs: number, maxRetries: number, temperature: number},
 *   xfyun: {appId: string, apiKey: string, apiSecret: string, asrHost: string, asrPath: string, asrTimeoutMs: number, ttsVoice: string, ttsHost: string, ttsPath: string, ttsTimeoutMs: number},
 *   digitalHumanWeb: {appId: string, apiKey: string, apiSecret: string, serverUrl: string, sceneId: string, sceneVersion: string, sessionSecret: string, sessionTtlSeconds: number}
 * }}
 *
 * @example
 * import { config } from "./config.mjs";
 * if (config.demoMode) console.info("deterministic fallback enabled");
 */
export const config = {
  appName: process.env.APP_NAME || "Lingshan AI Guide",
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 5178),
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  dataDir: resolve(process.cwd(), process.env.DATA_DIR || "./data"),
  uploadDir: resolve(process.cwd(), process.env.UPLOAD_DIR || "./data/uploads"),
  demoMode: String(process.env.DEMO_MODE || "true").toLowerCase() !== "false",
  providers: {
    llm: process.env.LLM_PROVIDER || "mock",
    asr: process.env.ASR_PROVIDER || "mock",
    tts: process.env.TTS_PROVIDER || "mock"
  },
  llm: {
    provider: process.env.LLM_PROVIDER || "mock",
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
    maxRetries: Number(process.env.LLM_MAX_RETRIES || 2),
    temperature: Number(process.env.LLM_TEMPERATURE || 0.4)
  },
  xfyun: {
    appId: process.env.XFYUN_APP_ID || "",
    apiKey: process.env.XFYUN_API_KEY || "",
    apiSecret: process.env.XFYUN_API_SECRET || "",
    asrHost: process.env.XFYUN_ASR_HOST || "iat-api.xfyun.cn",
    asrPath: process.env.XFYUN_ASR_PATH || "/v2/iat",
    asrTimeoutMs: Number(process.env.XFYUN_ASR_TIMEOUT_MS || 45000),
    ttsVoice: process.env.XFYUN_TTS_VOICE || "x4_xiaoyan",
    ttsHost: process.env.XFYUN_TTS_HOST || "tts-api.xfyun.cn",
    ttsPath: process.env.XFYUN_TTS_PATH || "/v2/tts",
    ttsTimeoutMs: Number(process.env.XFYUN_TTS_TIMEOUT_MS || 20000)
  },
  digitalHumanWeb: {
    appId: process.env.XFYUN_AVATAR_APP_ID || process.env.XFYUN_APP_ID || "",
    apiKey: process.env.XFYUN_AVATAR_API_KEY || process.env.XFYUN_API_KEY || "",
    apiSecret: process.env.XFYUN_AVATAR_API_SECRET || process.env.XFYUN_API_SECRET || "",
    serverUrl: process.env.XFYUN_AVATAR_SERVER_URL || "wss://avatar.cn-huadong-1.xf-yun.com/v1/interact",
    sceneId: process.env.XFYUN_AVATAR_SCENE_ID || "",
    sceneVersion: process.env.XFYUN_AVATAR_SCENE_VERSION || "",
    sessionSecret: process.env.XFYUN_AVATAR_SESSION_SECRET || process.env.JWT_SECRET || "dev-secret",
    sessionTtlSeconds: Math.max(
      30,
      Math.min(300, Number(process.env.XFYUN_AVATAR_SESSION_TTL_SECONDS || 180))
    )
  }
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.uploadDir, { recursive: true });
