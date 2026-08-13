import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createAsarReader, verifyPackagedTree, walk } from "./package-verifier.mjs";

if (process.platform !== "darwin") {
  throw new Error("macOS disk image verification must run on macOS.");
}

const outputDirectory = resolve(process.argv[2] || "dist");
const diskImages = readdirSync(outputDirectory).filter((name) => name.endsWith(".dmg")).sort();
assert.equal(diskImages.length, 1, `Expected one macOS disk image, found: ${diskImages.join(", ")}`);
const expectedArchitecture = process.env.EXPECTED_ARCH || process.arch;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const temp = mkdtempSync(join(tmpdir(), "shuzhiyouzong-macos-package-"));
try {
  for (const diskImage of diskImages) {
    const mountPoint = join(temp, diskImage.replace(/\.dmg$/i, ""));
    run("mkdir", ["-p", mountPoint]);
    run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mountPoint, join(outputDirectory, diskImage)]);
    try {
      const asarPath = walk(mountPoint).find((path) => path.endsWith(join("Contents", "Resources", "app.asar")));
      assert.ok(asarPath, `${diskImage} does not contain a packaged app.asar.`);
      const applicationRoot = dirname(dirname(asarPath));
      const appBundle = dirname(applicationRoot);
      const bundleId = spawnSync(
        "plutil",
        ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(appBundle, "Contents", "Info.plist")],
        { encoding: "utf8" }
      );
      assert.equal(bundleId.error, undefined, bundleId.error?.message);
      assert.equal(bundleId.status, 0, bundleId.stderr || bundleId.stdout);
      assert.equal(bundleId.stdout.trim(), "cn.shuzhiyouzong.desktop", "Unexpected macOS bundle id.");
      const executableName = spawnSync(
        "plutil",
        ["-extract", "CFBundleExecutable", "raw", "-o", "-", join(appBundle, "Contents", "Info.plist")],
        { encoding: "utf8" }
      );
      assert.equal(executableName.error, undefined, executableName.error?.message);
      assert.equal(executableName.status, 0, executableName.stderr || executableName.stdout);
      const executable = join(appBundle, "Contents", "MacOS", executableName.stdout.trim());
      const architecture = spawnSync("lipo", ["-archs", executable], { encoding: "utf8" });
      assert.equal(architecture.error, undefined, architecture.error?.message);
      assert.equal(architecture.status, 0, architecture.stderr || architecture.stdout);
      assert.deepEqual(
        architecture.stdout.trim().split(/\s+/),
        [expectedArchitecture],
        `Unexpected macOS architecture for ${diskImage}.`
      );
      verifyPackagedTree(applicationRoot, { readAsar: createAsarReader });
      console.log(`Verified macOS disk image: ${diskImage}.`);
    } finally {
      run("hdiutil", ["detach", mountPoint]);
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
