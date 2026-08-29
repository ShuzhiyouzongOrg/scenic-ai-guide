/**
 * @fileoverview 桌面端 Node SQLite 运行时测试。
 * @description 以 Electron 兼容环境变量调用服务端数据库测试，确认内置 SQLite 路径可用。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseTests = resolve("..", "server", "scripts", "test-db.mjs");
const result = spawnSync(process.execPath, [databaseTests], {
  cwd: resolve(import.meta.dirname, ".."),
  env: {
    ...process.env,
    DESKTOP_USE_NODE_SQLITE: "1",
    SQLITE_PATH: ":memory:"
  },
  encoding: "utf8"
});

assert.equal(
  result.error,
  undefined,
  `Failed to launch the Node SQLite test runtime: ${result.error?.message}`
);
assert.equal(
  result.signal,
  null,
  `Node SQLite test runtime was terminated by signal ${result.signal}: ${result.stderr || result.stdout}`
);
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /10\/10 passed/);
console.log("Desktop node:sqlite adapter tests passed.");
