import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload.cjs", import.meta.url), "utf8");
const builderSource = readFileSync(new URL("./run-builder.mjs", import.meta.url), "utf8");
const sqliteTestSource = readFileSync(
  new URL("./test-node-sqlite-runtime.mjs", import.meta.url),
  "utf8"
);

assert.match(mainSource, /let bootstrapPromise = null;/);
assert.match(mainSource, /if \(bootstrapPromise\) \{\s*return bootstrapPromise;\s*\}/s);
assert.match(mainSource, /app\.on\("activate", async \(\) => \{\s*await app\.whenReady\(\);/s);
assert.match(mainSource, /app\.on\("activate"[\s\S]*?await bootstrap\(\);/);
assert.match(mainSource, /app\.whenReady\(\)\.then\(async \(\) =>/);
assert.match(mainSource, /function provisionServerEnvironment\(paths\)/);
assert.match(mainSource, /join\(process\.resourcesPath, "runtime", "default-server\.env"\)/);
assert.match(mainSource, /currentConfig\.startsWith\(managedHeader\)/);
assert.match(mainSource, /provisionServerEnvironment\(paths\);[\s\S]*?utilityProcess\.fork/);
assert.match(mainSource, /DESKTOP_USE_NODE_SQLITE: "1"/);
assert.match(mainSource, /function getAvatarCredentials\(\)/);
assert.match(mainSource, /function readRuntimeEnvironment\(paths\)/);
assert.match(mainSource, /\.\.\.readRuntimeEnvironment\(paths\)/);
assert.match(mainSource, /async function prepareSmokeSession\(window, port\)/);
assert.match(mainSource, /desktop:get-avatar-credentials/);
assert.match(mainSource, /preload: join\(desktopRoot\(\), "preload\.cjs"\)/);
assert.match(mainSource, /Desktop LLM smoke test passed: provider=/);
assert.match(mainSource, /Desktop avatar smoke test passed: state=/);
assert.match(mainSource, /Desktop service configuration smoke test passed\./);
assert.match(preloadSource, /getAvatarCredentials: \(\) => ipcRenderer\.invoke\("desktop:get-avatar-credentials"\)/);
assert.match(builderSource, /resolve\(workspaceDir, "LocalTemp", "desktop-dist"\)/);
assert.match(sqliteTestSource, /spawnSync\(process\.execPath, \[databaseTests\]/);
assert.doesNotMatch(sqliteTestSource, /import electronBinary|process\.platform|Electron\.app\/Contents\/MacOS/);
assert.match(sqliteTestSource, /assert\.equal\(\s*result\.error,\s*undefined,/s);
assert.match(sqliteTestSource, /assert\.equal\(\s*result\.signal,\s*null,/s);

console.log("Desktop main-process lifecycle tests passed.");
