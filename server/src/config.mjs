/**
 * @fileoverview 服务端运行配置加载器。
 * @description 读取 dotenv 与进程环境变量，建立数据目录，并导出统一的服务、供应商和安全配置。
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
 * @typedef {object} RagExperimentConfig
 * @description RAG 对照实验、样本门槛、质量护栏和成本估算配置。
 * @property {boolean} enabled 是否启用对照实验。
 * @property {string} id 实验唯一标识。
 * @property {number} treatmentPercent 实验组流量百分比。
 * @property {string} salt 稳定分流使用的盐值。
 * @property {number} minSamples 评估所需最小总样本数。
 * @property {number} minFeedbackSamples 评估所需最小反馈样本数。
 * @property {number} maxP95Ratio 实验组相对基线的最大 P95 时延倍率。
 * @property {number} maxRefusalRateIncrease 允许的最大拒答率增幅。
 * @property {number} maxAcceptanceRateDrop 允许的最大采纳率降幅。
 * @property {number} maxCostRatio 允许的最大成本倍率。
 * @property {number} inputCostPerMillion 每百万输入 Token 单价。
 * @property {number} outputCostPerMillion 每百万输出 Token 单价。
 * @property {number} embeddingCostPerMillion 每百万向量化 Token 单价。
 */

/**
 * @typedef {object} RagConfig
 * @description RAG 检索阈值、追踪采样、分档策略和实验配置。
 * @property {number} minRuleScore 规则检索最低得分。
 * @property {number} minBm25Score BM25 检索最低得分。
 * @property {number} minQueryCoverage 查询词最低覆盖率。
 * @property {number} traceSampleRate 普通检索追踪采样率。
 * @property {Record<string, unknown>} thresholdProfiles 按场景覆盖阈值的配置映射。
 * @property {RagExperimentConfig} experiment 对照实验配置。
 */

/**
 * @typedef {object} ProviderConfig
 * @description 智能问答、语音识别和语音合成供应商选择。
 * @property {string} llm 大语言模型供应商。
 * @property {string} asr 语音识别供应商。
 * @property {string} tts 语音合成供应商。
 */

/**
 * @typedef {object} LlmConfig
 * @description OpenAI 兼容大语言模型调用配置。
 * @property {string} provider 供应商代码。
 * @property {string} apiKey API 密钥。
 * @property {string} baseUrl 兼容接口根地址。
 * @property {string} model 模型名称。
 * @property {number} timeoutMs 单次请求超时毫秒数。
 * @property {number} maxRetries 最大重试次数。
 * @property {number} temperature 生成温度。
 */

/**
 * @typedef {object} XfyunConfig
 * @description 讯飞 ASR 与 TTS WebSocket 鉴权和运行参数。
 * @property {string} appId 应用 ID。
 * @property {string} apiKey API Key。
 * @property {string} apiSecret API Secret。
 * @property {string} asrHost 语音识别主机。
 * @property {string} asrPath 语音识别路径。
 * @property {number} asrTimeoutMs 语音识别超时毫秒数。
 * @property {string} ttsVoice 默认发音人代码。
 * @property {string} ttsHost 语音合成主机。
 * @property {string} ttsPath 语音合成路径。
 * @property {number} ttsTimeoutMs 语音合成超时毫秒数。
 */

/**
 * @typedef {object} DigitalHumanWebConfig
 * @description 讯飞 Web 数字人会话、场景和短期令牌配置。
 * @property {string} appId 应用 ID。
 * @property {string} apiKey API Key。
 * @property {string} apiSecret API Secret。
 * @property {string} serverUrl WebSocket 服务地址。
 * @property {string} sceneId 场景 ID。
 * @property {string} sceneVersion 场景版本。
 * @property {string} sessionSecret 短期会话令牌签名密钥。
 * @property {number} sessionTtlSeconds 短期会话有效秒数。
 */

/**
 * @typedef {object} ServerConfig
 * @description 服务端启动、存储、供应商和 RAG 的完整运行配置。
 * @property {string} appName 应用名称。
 * @property {string} nodeEnv Node.js 运行环境。
 * @property {string} host HTTP 监听主机。
 * @property {number} port HTTP 监听端口。
 * @property {string} adminUsername 初始管理员用户名。
 * @property {string} adminPassword 初始管理员密码。
 * @property {string} jwtSecret JWT 签名密钥。
 * @property {string} dataDir 数据目录绝对路径。
 * @property {string} uploadDir 上传目录绝对路径。
 * @property {boolean} demoMode 是否启用演示降级模式。
 * @property {RagConfig} rag RAG 运行配置。
 * @property {ProviderConfig} providers 能力供应商选择。
 * @property {LlmConfig} llm 大语言模型配置。
 * @property {XfyunConfig} xfyun 讯飞语音配置。
 * @property {DigitalHumanWebConfig} digitalHumanWeb 讯飞 Web 数字人配置。
 */

/**
 * @description 将 dotenv 文件中尚未存在于 `process.env` 的键加载到当前进程。
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

/**
 * @description 将 JSON 环境变量解析为普通对象，解析失败时使用空对象。
 * @param {*} value JSON 环境变量。
 * @returns {object} 解析后的普通对象；解析失败时返回空对象。
 */
function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

loadDotEnv(resolve(process.env.CONFIG_ENV_FILE || resolve(process.cwd(), ".env")));

/**
 * @description 服务端统一运行配置。
 *
 * @type {ServerConfig}
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
  rag: {
    minRuleScore: Math.max(0, Number(process.env.RAG_MIN_RULE_SCORE || 12)),
    minBm25Score: Math.max(0, Number(process.env.RAG_MIN_BM25_SCORE || 0.35)),
    minQueryCoverage: Math.min(1, Math.max(0, Number(process.env.RAG_MIN_QUERY_COVERAGE || 0))),
    traceSampleRate: Math.min(1, Math.max(0, Number(process.env.RAG_TRACE_SAMPLE_RATE || 1))),
    thresholdProfiles: parseJsonObject(process.env.RAG_THRESHOLD_PROFILES),
    experiment: {
      enabled: String(process.env.RAG_AB_ENABLED || "false").toLowerCase() === "true",
      id: process.env.RAG_AB_EXPERIMENT_ID || "rag-retrieval-v1",
      treatmentPercent: Math.min(100, Math.max(0, Number(process.env.RAG_AB_TREATMENT_PERCENT || 10))),
      salt: process.env.RAG_AB_SALT || process.env.JWT_SECRET || "local-rag-experiment",
      minSamples: Math.max(5, Number(process.env.RAG_AB_MIN_SAMPLES || 50)),
      minFeedbackSamples: Math.max(3, Number(process.env.RAG_AB_MIN_FEEDBACK_SAMPLES || 15)),
      maxP95Ratio: Math.max(1, Number(process.env.RAG_AB_MAX_P95_RATIO || 1.5)),
      maxRefusalRateIncrease: Math.min(1, Math.max(0, Number(process.env.RAG_AB_MAX_REFUSAL_RATE_INCREASE || 0.1))),
      maxAcceptanceRateDrop: Math.min(1, Math.max(0, Number(process.env.RAG_AB_MAX_ACCEPTANCE_RATE_DROP || 0.1))),
      maxCostRatio: Math.max(1, Number(process.env.RAG_AB_MAX_COST_RATIO || 1.5)),
      inputCostPerMillion: Math.max(0, Number(process.env.RAG_AB_INPUT_COST_PER_MILLION || 0)),
      outputCostPerMillion: Math.max(0, Number(process.env.RAG_AB_OUTPUT_COST_PER_MILLION || 0)),
      embeddingCostPerMillion: Math.max(0, Number(process.env.RAG_AB_EMBEDDING_COST_PER_MILLION || 0))
    }
  },
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
