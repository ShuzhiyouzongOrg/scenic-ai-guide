import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
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
assert.match(mainSource, /currentConfig\.startsWith\(managedHeader\)/);
assert.match(mainSource, /provisionServerEnvironment\(paths\);[\s\S]*?utilityProcess\.fork/);
assert.match(mainSource, /DESKTOP_USE_NODE_SQLITE: "1"/);
assert.match(builderSource, /resolve\(workspaceDir, "LocalTemp", "desktop-dist"\)/);
assert.match(sqliteTestSource, /spawnSync\(process\.execPath, \[databaseTests\]/);
assert.doesNotMatch(sqliteTestSource, /import electronBinary|process\.platform|Electron\.app\/Contents\/MacOS/);
assert.match(sqliteTestSource, /assert\.equal\(\s*result\.error,\s*undefined,/s);
assert.match(sqliteTestSource, /assert\.equal\(\s*result\.signal,\s*null,/s);

console.log("Desktop main-process lifecycle tests passed.");
