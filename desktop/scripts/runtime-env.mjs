const managedHeader = "# Managed by the desktop runtime.";

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

export const requiredServerEnvKeys = [
  "LLM_API_KEY",
  "XFYUN_APP_ID",
  "XFYUN_API_KEY",
  "XFYUN_API_SECRET"
];

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

export function selectServerEnvironment(source) {
  const values = typeof source === "string" ? parseDotEnv(source) : source;
  return Object.fromEntries(
    serverEnvKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
      .map((key) => [key, String(values[key] ?? "").replace(/[\r\n]/g, "")])
  );
}

export function serializeServerEnvironment(values) {
  const lines = serverEnvKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
    .map((key) => `${key}=${values[key]}`);
  return `${managedHeader}\n${lines.join("\n")}\n`;
}
