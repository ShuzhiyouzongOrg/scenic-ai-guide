import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const electronBinary = process.platform === "win32"
  ? resolve("node_modules", "electron", "dist", "electron.exe")
  : resolve("node_modules", "electron", "dist", "electron");
const databaseTests = resolve("..", "server", "scripts", "test-db.mjs");
const result = spawnSync(electronBinary, [databaseTests], {
  cwd: resolve(import.meta.dirname, ".."),
  env: {
    ...process.env,
    DESKTOP_USE_NODE_SQLITE: "1",
    ELECTRON_RUN_AS_NODE: "1",
    SQLITE_PATH: ":memory:"
  },
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /10\/10 passed/);
console.log("Electron node:sqlite runtime tests passed.");
