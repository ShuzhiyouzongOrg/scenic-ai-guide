/**
 * @fileoverview electron-builder 命令代理脚本。
 * @description 统一桌面构建工作目录，并在本地 Windows 环境中重定向缓存与产物目录。
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repositoryDir = resolve(desktopDir, "..");
const workspaceDir = resolve(repositoryDir, "..");
const environment = { ...process.env };

// Keep local Windows build caches in the workspace-level LocalTemp directory.
// CI runners keep their native ephemeral cache paths.
if (process.platform === "win32" && !process.env.CI) {
  const localTemp = resolve(workspaceDir, "LocalTemp");
  const builderCache = resolve(localTemp, "electron-builder-cache");
  const electronCache = resolve(localTemp, "electron-cache");
  const npmCache = resolve(localTemp, "npm-cache");
  mkdirSync(builderCache, { recursive: true });
  mkdirSync(electronCache, { recursive: true });
  mkdirSync(npmCache, { recursive: true });
  environment.ELECTRON_BUILDER_CACHE = builderCache;
  environment.electron_config_cache = electronCache;
  environment.npm_config_cache = npmCache;
}

const builderCli = resolve(desktopDir, "node_modules", "electron-builder", "cli.js");
const builderArguments = process.argv.slice(2);
if (!builderArguments.includes("--config.directories.output")) {
  const outputDirectory = process.platform === "win32" && !process.env.CI
    ? resolve(workspaceDir, "LocalTemp", "desktop-dist")
    : resolve(desktopDir, "dist");
  mkdirSync(outputDirectory, { recursive: true });
  builderArguments.push("--config.directories.output", outputDirectory);
}
const result = spawnSync(process.execPath, [builderCli, ...builderArguments], {
  cwd: desktopDir,
  env: environment,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
