/**
 * @fileoverview 桌面安装产物校验和生成脚本。
 * @description 按命令行给定的扩展名筛选安装包，计算 SHA-256 摘要并写入校验清单。
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const extensions = new Set(process.argv.slice(2).map((value) => value.replace(/^\*?/, "")));
if (extensions.size === 0) {
  throw new Error("At least one package extension is required.");
}

const outputDir = process.cwd();
const files = readdirSync(outputDir)
  .filter((file) => [...extensions].some((extension) => file.endsWith(extension)))
  .sort();

if (files.length === 0) {
  throw new Error(`No package files matched: ${[...extensions].join(", ")}`);
}

const checksums = files.map((file) => {
  const digest = createHash("sha256").update(readFileSync(resolve(outputDir, file))).digest("hex");
  return `${digest}  ${basename(file)}`;
});

writeFileSync(resolve(outputDir, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, "utf8");
console.log(`Created SHA256SUMS.txt for ${files.length} package(s).`);
