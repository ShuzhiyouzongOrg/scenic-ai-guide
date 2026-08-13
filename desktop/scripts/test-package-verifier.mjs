import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPackage } from "@electron/asar";

import { createAsarReader, verifyPackagedTree } from "./package-verifier.mjs";

const temp = mkdtempSync(join(tmpdir(), "desktop-package-verifier-"));
const source = join(temp, "source");
const root = join(temp, "application");
const resources = join(root, "resources");
mkdirSync(join(source, "runtime", "server", "src", "db"), { recursive: true });
for (const asset of [
  "web/dist/live2d/core/live2dcubismcore.min.js",
  "web/dist/live2d/motionsync/core/live2dcubismmotionsynccore.min.js",
  "web/dist/live2d/characters/Haru/Haru.model3.json",
  "web/dist/live2d/characters/Haru/haru.moc3",
  "web/dist/live2d/characters/Hiyori/Hiyori.model3.json",
  "web/dist/live2d/characters/Kei/Kei.model3.json",
  "web/dist/live2d/characters/Hibiki/Hibiki.model3.json"
]) {
  const path = join(source, ...asset.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "asset");
}
mkdirSync(resources, { recursive: true });
mkdirSync(join(resources, "runtime"), { recursive: true });

writeFileSync(join(source, "main.mjs"), 'ipcMain.handle("desktop:get-avatar-credentials", () => ({}));');
writeFileSync(join(source, "preload.cjs"), "const getAvatarCredentials = true;");
writeFileSync(
  join(resources, "runtime", "default-server.env"),
  "LLM_API_KEY=llm\nXFYUN_APP_ID=app\nXFYUN_API_KEY=key\nXFYUN_API_SECRET=secret\n"
);
writeFileSync(
  join(source, "runtime", "server", "src", "db", "database.mjs"),
  'if (process.env.DESKTOP_USE_NODE_SQLITE) require("node:sqlite");'
);
await createPackage(source, join(resources, "app.asar"));

try {
  assert.doesNotThrow(() => verifyPackagedTree(root, { readAsar: createAsarReader }));
  const nativePath = join(resources, "app.asar.unpacked", "addon.node");
  mkdirSync(join(resources, "app.asar.unpacked"), { recursive: true });
  writeFileSync(nativePath, "native");
  assert.throws(
    () => verifyPackagedTree(root, { readAsar: createAsarReader }),
    /Unexpected native SQLite files/
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Desktop package verifier tests passed.");
