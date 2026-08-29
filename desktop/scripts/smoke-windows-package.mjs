/**
 * @fileoverview Windows 安装包冒烟验证脚本。
 * @description 解包 NSIS 安装器、启动实际桌面应用并校验服务、数据库、问答与数字人运行状态。
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { walk } from "./package-verifier.mjs";

if (process.platform !== "win32") {
  throw new Error("Windows packaged smoke tests must run on Windows.");
}

const input = resolve(process.argv[2] || "dist");
assert.ok(existsSync(input), `Windows package input is missing: ${input}`);
const localTemp = process.env.CI && process.env.RUNNER_TEMP
  ? resolve(process.env.RUNNER_TEMP)
  : resolve(import.meta.dirname, "..", "..", "..", "LocalTemp");
mkdirSync(localTemp, { recursive: true });
const extractionRoot = mkdtempSync(join(localTemp, "windows-installer-smoke-"));

/**
 * @description 使用打包依赖携带的 7-Zip 依次解出 NSIS 插件归档和桌面应用目录。
 * @param {string} outputDirectory 包含唯一 Windows 安装器的输出目录。
 * @returns {string} 解包后的桌面应用根目录。
 * @throws {assert.AssertionError} 安装器数量、7-Zip、归档内容或解包命令不符合预期时抛出。
 */
function unpackInstaller(outputDirectory) {
  const installers = readdirSync(outputDirectory).filter((name) => name.endsWith(".exe"));
  assert.equal(installers.length, 1, `Expected one Windows installer, found: ${installers.join(", ")}`);
  const sevenZip = resolve("node_modules", "electron-winstaller", "vendor", "7z.exe");
  assert.ok(existsSync(sevenZip), `Bundled 7-Zip is missing: ${sevenZip}`);
  const pluginDirectory = join(extractionRoot, "installer");
  const installerResult = spawnSync(
    sevenZip,
    ["x", "-y", `-o${pluginDirectory}`, join(outputDirectory, installers[0]), "$PLUGINSDIR\\app-64.7z"],
    { encoding: "utf8" }
  );
  assert.equal(installerResult.error, undefined, installerResult.error?.message);
  assert.equal(installerResult.status, 0, installerResult.stderr || installerResult.stdout);
  const applicationArchive = walk(pluginDirectory).find((path) => path.endsWith("app-64.7z"));
  assert.ok(applicationArchive, `${installers[0]} does not contain app-64.7z.`);
  const applicationRoot = join(extractionRoot, "application");
  const applicationResult = spawnSync(
    sevenZip,
    ["x", "-y", `-o${applicationRoot}`, applicationArchive],
    { encoding: "utf8" }
  );
  assert.equal(applicationResult.error, undefined, applicationResult.error?.message);
  assert.equal(applicationResult.status, 0, applicationResult.stderr || applicationResult.stdout);
  return applicationRoot;
}

const root = existsSync(join(input, "resources", "app.asar")) ? input : unpackInstaller(input);
const executables = readdirSync(root)
  .filter((name) => name.endsWith(".exe") && name !== "elevate.exe")
  .map((name) => join(root, name));
assert.equal(executables.length, 1, `Expected one application executable below ${root}.`);
const executable = executables[0];

const userData = mkdtempSync(join(localTemp, "windows-user-data-smoke-"));
try {
  writeFileSync(
    join(userData, "server.env"),
    "# Legacy user configuration\nLLM_API_KEY=\nXFYUN_APP_ID=\n",
    "utf8"
  );
  const result = spawnSync(executable, ["--smoke-test", "--enable-logging=stderr"], {
    env: {
      ...process.env,
      DESKTOP_SMOKE_TEST: "1",
      DESKTOP_USER_DATA_DIR: userData
    },
    encoding: "utf8",
    timeout: 90_000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `Packaged smoke test was terminated by ${result.signal}.`);
  assert.equal(result.status, 0, [result.stderr, result.stdout].filter(Boolean).join("\n"));
  assert.match(result.stdout, /Desktop LLM smoke test passed: provider=openai, model=\S+/);
  assert.match(result.stdout, /Desktop avatar smoke test passed: state=(?:ready|speaking)\./);
  assert.match(result.stdout, /Desktop service configuration smoke test passed\./);
  const llmSummary = result.stdout.match(/Desktop LLM smoke test passed:[^\r\n]+/i)?.[0];
  const avatarSummary = result.stdout.match(/Desktop avatar smoke test passed:[^\r\n]+/i)?.[0];
  if (llmSummary) console.log(llmSummary);
  if (avatarSummary) console.log(avatarSummary);
  assert.doesNotMatch(result.stderr, /Unable to load preload script|Cannot use import statement/);
  console.log("Windows packaged application smoke test passed.");
} finally {
  for (const directory of [userData, extractionRoot]) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (error) {
      console.warn(`Smoke-test cleanup deferred for ${directory}: ${error.message}`);
    }
  }
}
