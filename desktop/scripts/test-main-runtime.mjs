import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mainSource = readFileSync(new URL("../main.mjs", import.meta.url), "utf8");

assert.match(mainSource, /let bootstrapPromise = null;/);
assert.match(mainSource, /if \(bootstrapPromise\) \{\s*return bootstrapPromise;\s*\}/s);
assert.match(mainSource, /app\.on\("activate", async \(\) => \{\s*await app\.whenReady\(\);/s);
assert.match(mainSource, /app\.on\("activate"[\s\S]*?await bootstrap\(\);/);
assert.match(mainSource, /app\.whenReady\(\)\.then\(async \(\) =>/);
assert.match(mainSource, /function provisionServerEnvironment\(paths\)/);
assert.match(mainSource, /currentConfig\.startsWith\(managedHeader\)/);
assert.match(mainSource, /provisionServerEnvironment\(paths\);[\s\S]*?utilityProcess\.fork/);

console.log("Desktop main-process lifecycle tests passed.");
