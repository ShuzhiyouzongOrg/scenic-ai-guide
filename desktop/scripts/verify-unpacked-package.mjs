/**
 * @fileoverview Electron 解包产物验证脚本。
 * @description 定位一个或多个包含 app.asar 的应用根目录并执行通用打包完整性检查。
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createAsarReader, verifyPackagedTree, walk } from "./package-verifier.mjs";

const input = resolve(process.argv[2] || "dist");
assert.ok(existsSync(input), `Package directory is missing: ${input}`);

const roots = existsSync(join(input, "resources", "app.asar"))
  ? [input]
  : walk(input)
      .filter((path) => /[\\/](?:resources|Resources)[\\/]app\.asar$/.test(path))
      .map((path) => dirname(dirname(path)));
assert.ok(roots.length > 0, `No unpacked application was found below ${input}.`);

for (const root of [...new Set(roots)]) {
  const result = verifyPackagedTree(root, { readAsar: createAsarReader });
  console.log(`Verified ${result.name}: ${result.files} packaged files.`);
}
