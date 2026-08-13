import assert from "node:assert/strict";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { extractFile, listPackage } from "@electron/asar";

import { verifyPackagedTree, walk } from "./package-verifier.mjs";

if (process.platform !== "linux") {
  throw new Error("Linux package verification must run on Linux.");
}

const outputDirectory = resolve(process.argv[2] || "dist");
assert.ok(existsSync(outputDirectory), `Package directory is missing: ${outputDirectory}`);

const packageFiles = readdirSync(outputDirectory).filter((name) =>
  [".AppImage", ".deb"].includes(extname(name))
);
assert.ok(packageFiles.some((name) => name.endsWith(".AppImage")), "AppImage is missing.");
assert.ok(packageFiles.some((name) => name.endsWith(".deb")), "Debian package is missing.");

const unpackedDirectory = join(outputDirectory, "linux-unpacked");
assert.ok(existsSync(unpackedDirectory), "linux-unpacked runtime is missing.");
const maximumSupportedGlibc = [2, 27];

const normalizeAsarPath = (path) => path.replace(/^[/\\]+/, "").replaceAll("\\", "/");

function verifyRoot(root) {
  const result = verifyPackagedTree(root, {
    readAsar(asarPath) {
      const paths = listPackage(asarPath).map(normalizeAsarPath);
      return {
        paths,
        read(path) {
          const normalized = normalizeAsarPath(path);
          assert.ok(paths.includes(normalized), `Missing app.asar entry: ${normalized}`);
          return extractFile(asarPath, path.replaceAll("/", sep)).toString("utf8");
        }
      };
    }
  });
  verifyGlibcCompatibility(root);
  return result;
}

function isElf(path) {
  const descriptor = openSync(path, "r");
  try {
    const magic = Buffer.alloc(4);
    return readSync(descriptor, magic, 0, magic.length, 0) === 4 &&
      magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } finally {
    closeSync(descriptor);
  }
}

function compareVersion(left, right) {
  return left[0] - right[0] || left[1] - right[1];
}

function verifyGlibcCompatibility(root) {
  const incompatible = [];
  for (const path of walk(root).filter(isElf)) {
    const result = spawnSync("readelf", ["--version-info", path], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(result.error, undefined, `Failed to inspect ${path}: ${result.error?.message}`);
    assert.equal(result.status, 0, result.stderr || `readelf failed for ${path}.`);
    const versions = [...result.stdout.matchAll(/GLIBC_(\d+)\.(\d+)/g)]
      .map((match) => [Number(match[1]), Number(match[2])]);
    const maximum = versions.sort(compareVersion).at(-1) || [0, 0];
    if (compareVersion(maximum, maximumSupportedGlibc) > 0) {
      incompatible.push(`${path}: GLIBC_${maximum.join(".")}`);
    }
  }
  assert.deepEqual(
    incompatible,
    [],
    `Linux package exceeds the Ubuntu 18.04 GLIBC_2.27 baseline:\n${incompatible.join("\n")}`
  );
}

function findPackagedRoot(directory) {
  const asar = walk(directory).find((path) => path.endsWith(join("resources", "app.asar")));
  assert.ok(asar, `Extracted package does not contain resources/app.asar: ${directory}`);
  return dirname(dirname(asar));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.error, undefined, `Failed to run ${command}: ${result.error?.message}`);
  assert.equal(result.status, 0, result.stderr || result.stdout || `${command} failed.`);
}

verifyRoot(unpackedDirectory);

const verificationRoot = mkdtempSync(join(tmpdir(), "shuzhiyouzong-linux-package-"));
try {
  const debFiles = packageFiles.filter((name) => name.endsWith(".deb"));
  const appImageFiles = packageFiles.filter((name) => name.endsWith(".AppImage"));
  assert.equal(debFiles.length, 1, `Expected one Debian package, found: ${debFiles.join(", ")}`);
  assert.equal(appImageFiles.length, 1, `Expected one AppImage, found: ${appImageFiles.join(", ")}`);
  const [debFile] = debFiles;
  const [appImageFile] = appImageFiles;

  const debExtract = join(verificationRoot, "deb");
  const debArchitecture = spawnSync(
    "dpkg-deb",
    ["--field", join(outputDirectory, debFile), "Architecture"],
    { encoding: "utf8" }
  );
  assert.equal(debArchitecture.error, undefined, debArchitecture.error?.message);
  assert.equal(debArchitecture.status, 0, debArchitecture.stderr || debArchitecture.stdout);
  assert.equal(debArchitecture.stdout.trim(), "amd64", "Debian package architecture must be amd64.");
  run("dpkg-deb", ["--extract", join(outputDirectory, debFile), debExtract]);
  verifyRoot(findPackagedRoot(debExtract));

  const appImagePath = join(outputDirectory, appImageFile);
  const appImageExtract = join(verificationRoot, "appimage");
  mkdirSync(appImageExtract, { recursive: true });
  chmodSync(appImagePath, 0o755);
  run(appImagePath, ["--appimage-extract"], { cwd: appImageExtract });
  verifyRoot(findPackagedRoot(join(appImageExtract, "squashfs-root")));
} finally {
  rmSync(verificationRoot, { recursive: true, force: true });
}

for (const name of packageFiles) {
  assert.ok(statSync(join(outputDirectory, name)).size > 0, `${name} is empty.`);
}

console.log("Linux unpacked runtime, Debian package, and AppImage passed portability checks.");
