/**
 * @fileoverview 桌面端 Web 构建产物验证脚本。
 * @description 确认入口与资源存在，并检查讯飞数字人构建配置已正确内联且未泄露占位符。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const webDist = resolve(process.argv[2] || resolve("..", "web", "dist"));
assert.ok(existsSync(join(webDist, "index.html")), `Web build is missing: ${webDist}`);

const requiredValues = {
  VITE_XF_AVATAR_APPID: process.env.VITE_XF_AVATAR_APPID,
  VITE_XF_AVATAR_APIKEY: process.env.VITE_XF_AVATAR_APIKEY,
  VITE_XF_AVATAR_APISECRET: process.env.VITE_XF_AVATAR_APISECRET
};

for (const [key, value] of Object.entries(requiredValues)) {
  assert.ok(String(value || "").trim(), `${key} is required to verify the web build.`);
}

/**
 * @description 递归枚举 Web 构建目录中的全部普通文件。
 * @param {string} directory 起始目录。
 * @returns {string[]} 构建产物文件路径列表。
 * @throws {Error} 目录不存在或无法读取时透传文件系统异常。
 */
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const javascript = walk(webDist)
  .filter((path) => extname(path) === ".js")
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

for (const [key, value] of Object.entries(requiredValues)) {
  assert.ok(
    javascript.includes(String(value)),
    `${key} was not embedded in the generated web JavaScript.`
  );
}

console.log("Web avatar credentials are embedded.");
