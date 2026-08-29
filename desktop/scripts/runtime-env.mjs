/**
 * @fileoverview 桌面端服务环境变量白名单工具。
 * @description 负责筛选、校验并序列化桌面安装包允许携带的服务端运行配置。
 */
/**
 * @description 标识由桌面运行时托管的 dotenv 文件头。
 * @type {string}
 */
const managedHeader = "# Managed by the desktop runtime.";

/**
 * @description 允许从服务端配置复制到桌面评审包的环境变量名。
 * @type {readonly string[]}
 * @example
 * if (serverEnvKeys.includes(key)) console.info("允许写入桌面配置");
 */
export const serverEnvKeys = [
  "DEMO_MODE",
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_TIMEOUT_MS",
  "LLM_MAX_RETRIES",
  "LLM_TEMPERATURE",
  "ASR_PROVIDER",
  "ASR_API_KEY",
  "TTS_PROVIDER",
  "TTS_API_KEY",
  "XFYUN_APP_ID",
  "XFYUN_API_KEY",
  "XFYUN_API_SECRET",
  "XFYUN_TTS_VOICE",
  "DEFAULT_AVATAR_ID",
  "DEFAULT_AVATAR_VCN"
];

/**
 * @description 启用真实问答和讯飞数字人时桌面包必须携带的配置项。
 * @type {readonly string[]}
 * @example
 * const missing = requiredServerEnvKeys.filter((key) => !environment[key]);
 */
export const requiredServerEnvKeys = [
  "LLM_API_KEY",
  "XFYUN_APP_ID",
  "XFYUN_API_KEY",
  "XFYUN_API_SECRET"
];

/**
 * @description 将 dotenv 文本解析为键值映射，并保留第一个等号后的完整内容。
 * @param {string} content dotenv 文本。
 * @returns {Record<string, string>} 解析后的环境变量映射。
 */
function parseDotEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value;
  }
  return values;
}

/**
 * @description 从 dotenv 文本或配置对象中提取桌面运行时白名单值，并移除嵌入换行符。
 * @param {string|Record<string, unknown>} source dotenv 文本或配置对象。
 * @returns {Record<string, string>} 只包含 `serverEnvKeys` 中键名的字符串映射。
 * @throws {TypeError} `source` 既不是字符串也不是可枚举对象时抛出。
 * @example
 * const selected = selectServerEnvironment("LLM_API_KEY=test\nADMIN_PASSWORD=hidden");
 */
export function selectServerEnvironment(source) {
  const values = typeof source === "string" ? parseDotEnv(source) : source;
  return Object.fromEntries(
    serverEnvKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
      .map((key) => [key, String(values[key] ?? "").replace(/[\r\n]/g, "")])
  );
}

/**
 * @description 将白名单配置序列化为带桌面托管标记且以换行结尾的 dotenv 文本。
 * @param {Record<string, unknown>} values 待写入的环境变量映射。
 * @returns {string} 可保存为 `server.env` 的文本。
 * @throws {TypeError} `values` 不是可枚举对象时抛出。
 * @example
 * const content = serializeServerEnvironment({ LLM_API_KEY: "test" });
 */
export function serializeServerEnvironment(values) {
  const lines = serverEnvKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
    .map((key) => `${key}=${values[key]}`);
  return `${managedHeader}\n${lines.join("\n")}\n`;
}
