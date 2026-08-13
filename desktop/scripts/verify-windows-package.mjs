import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createAsarReader, verifyPackagedTree, walk } from "./package-verifier.mjs";

if (process.platform !== "win32") {
  throw new Error("Windows installer verification must run on Windows.");
}

const outputDirectory = resolve(process.argv[2] || "dist");
const installers = readdirSync(outputDirectory)
  .filter((name) => name.endsWith(".exe"))
  .sort();
assert.ok(installers.length > 0, `No Windows installers were found in ${outputDirectory}.`);

const sevenZip = resolve("node_modules", "electron-winstaller", "vendor", "7z.exe");
assert.ok(existsSync(sevenZip), `Bundled 7-Zip is missing: ${sevenZip}`);

function run(args) {
  const result = spawnSync(sevenZip, args, { encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const temp = mkdtempSync(join(tmpdir(), "shuzhiyouzong-windows-package-"));
try {
  for (const installer of installers) {
    const installerExtract = join(temp, installer.replace(/\.exe$/i, ""), "installer");
    run(["x", "-y", `-o${installerExtract}`, join(outputDirectory, installer), "$PLUGINSDIR\\app-64.7z"]);
    const applicationArchive = walk(installerExtract).find((path) => path.endsWith("app-64.7z"));
    assert.ok(applicationArchive, `${installer} does not contain app-64.7z.`);

    const applicationRoot = join(temp, installer.replace(/\.exe$/i, ""), "application");
    run(["x", "-y", `-o${applicationRoot}`, applicationArchive]);
    verifyPackagedTree(applicationRoot, { readAsar: createAsarReader });
    console.log(`Verified Windows installer: ${installer}.`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
