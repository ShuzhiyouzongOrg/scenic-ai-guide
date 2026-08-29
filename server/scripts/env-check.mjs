/**
 * @fileoverview 服务端环境预检脚本。
 * @description 检查目录、端口与外部服务配置是否满足启动条件，并汇总可操作的检查结果。
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { config } from "../src/config.mjs";

const checks = [];

/**
 * @description 向环境检查结果列表追加一项检查。
 * @param {string} name 检查项名称。
 * @param {boolean} ok 检查是否通过。
 * @param {string} [detail=""] 补充说明。
 * @returns {void}
 */
function add(name, ok, detail = "") {
  checks.push({ name, ok, detail });
}

/**
 * @description 尝试监听指定地址，判断端口当前是否可绑定。
 * @param {string} host 监听主机。
 * @param {number} port 监听端口。
 * @returns {Promise<boolean>} 可成功监听并关闭时为 `true`。
 */
async function canBindPort(host, port) {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", () => resolveCheck(false));
    server.once("listening", () => {
      server.close(() => resolveCheck(true));
    });
    server.listen(port, host);
  });
}

/**
 * @description 在项目根目录递归查找官方行为分析表和灵山 DOCX 资料。
 * @returns {{excel: string|undefined, docx: string[]}} 首个行为分析表和全部灵山 DOCX 路径。
 * @throws {Error} 目录读取失败时透传文件系统异常。
 */
function findOfficialFiles() {
  const root = resolve(process.cwd(), "..");
  const files = [];
  /**
   * @description 递归收集目录文件，并跳过依赖与 Git 元数据目录。
   * @param {string} dir 待扫描目录。
   * @returns {void}
   * @throws {Error} 目录读取失败时透传文件系统异常。
   */
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === "node_modules" || name.name === ".git") continue;
        walk(full);
      } else {
        files.push(full);
      }
    }
  }
  walk(root);
  return {
    excel: files.find((file) => file.endsWith(".xlsx") && file.includes("行为分析")),
    docx: files.filter((file) => file.endsWith(".docx") && file.includes("灵山"))
  };
}

add("Node.js >= 20", Number(process.versions.node.split(".")[0]) >= 20, process.version);
add("data directory", existsSync(config.dataDir), config.dataDir);
add("upload directory", existsSync(config.uploadDir), config.uploadDir);

const official = findOfficialFiles();
add("official behavior Excel", Boolean(official.excel), official.excel || "missing");
add("official Lingshan DOCX files", official.docx.length >= 2, `${official.docx.length} found`);

const portFree = await canBindPort(config.host, config.port);
add("configured port available", portFree, `${config.host}:${config.port}${portFree ? "" : " is already in use"}`);

add("LLM provider config", config.providers.llm === "mock" || Boolean(config.llm.apiKey), config.providers.llm === "mock" ? "mock mode" : "LLM_API_KEY required");
add("ASR provider config", config.providers.asr === "mock" || Boolean(process.env.ASR_API_KEY), config.providers.asr === "mock" ? "mock mode" : "ASR_API_KEY required");
add(
  "TTS provider config",
  config.providers.tts === "mock"
    || Boolean(process.env.TTS_API_KEY)
    || (config.providers.tts === "xfyun" && Boolean(config.xfyun.appId && config.xfyun.apiKey && config.xfyun.apiSecret)),
  config.providers.tts === "mock"
    ? "mock mode"
    : config.providers.tts === "xfyun"
      ? "xfyun WebAPI"
      : "TTS_API_KEY required"
);
add("demo mode", config.demoMode, config.demoMode ? "enabled" : "disabled");

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}

if (failed.length > 0) {
  console.error(`Environment check failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("Environment check passed.");
