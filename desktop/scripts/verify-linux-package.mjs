/**
 * @fileoverview Linux 桌面安装产物验证脚本。
 * @description 检查 AppImage、DEB、RPM 与解包目录结构，并核验 ELF 文件的 glibc 兼容上限。
 */
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
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createAsarReader, verifyPackagedTree, walk } from "./package-verifier.mjs";

if (process.platform !== "linux") {
  throw new Error("Linux package verification must run on Linux.");
}

const outputDirectory = resolve(process.argv[2] || "dist");
assert.ok(existsSync(outputDirectory), `Package directory is missing: ${outputDirectory}`);

const packageFiles = readdirSync(outputDirectory).filter((name) =>
  [".AppImage", ".deb", ".rpm"].includes(extname(name))
);
assert.ok(packageFiles.some((name) => name.endsWith(".AppImage")), "AppImage is missing.");
assert.ok(packageFiles.some((name) => name.endsWith(".deb")), "Debian package is missing.");
assert.ok(packageFiles.some((name) => name.endsWith(".rpm")), "RPM package is missing.");

const unpackedDirectory = join(outputDirectory, "linux-unpacked");
assert.ok(existsSync(unpackedDirectory), "linux-unpacked runtime is missing.");
/**
 * @description Ubuntu 18.04 对应的最高兼容 glibc 主次版本。
 * @type {readonly [number, number]}
 */
const maximumSupportedGlibc = [2, 27];

/**
 * @description 对一个 Linux 应用根目录执行通用打包检查和 glibc 兼容检查。
 * @param {string} root 解包后的应用根目录。
 * @returns {{name: string, files: number, appAsarBytes: number}} 通用打包验证摘要。
 * @throws {assert.AssertionError} 包结构或 glibc 版本不符合要求时抛出。
 * @throws {Error} 文件系统、ASAR 或 ELF 读取失败时透传底层异常。
 */
function verifyRoot(root) {
  const result = verifyPackagedTree(root, { readAsar: createAsarReader });
  verifyGlibcCompatibility(root);
  return result;
}

/**
 * @description 读取文件魔数并判断其是否为 ELF 可执行文件或共享库。
 * @param {string} path 待检查文件路径。
 * @returns {boolean} 文件以 ELF 魔数开头时返回 `true`。
 * @throws {Error} 文件打开、读取或关闭失败时透传文件系统异常。
 */
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

/**
 * @description 按主版本、次版本顺序比较两个 glibc 版本元组。
 * @param {[number, number]} left 左侧版本。
 * @param {[number, number]} right 右侧版本。
 * @returns {number} 左侧较新时为正数，相同时为零，较旧时为负数。
 */
function compareVersion(left, right) {
  return left[0] - right[0] || left[1] - right[1];
}

/**
 * @description 检查应用目录内全部 ELF 文件引用的最高 glibc 版本是否超过兼容基线。
 * @param {string} root Linux 应用根目录。
 * @returns {void}
 * @throws {assert.AssertionError} `readelf` 执行失败或发现超出基线的 glibc 引用时抛出。
 * @throws {Error} 文件枚举或 ELF 读取失败时透传底层异常。
 */
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

/**
 * @description 从已提取的 DEB、RPM 或 AppImage 目录中定位包含 `resources/app.asar` 的应用根目录。
 * @param {string} directory 提取后的包目录。
 * @returns {string} Electron 应用根目录。
 * @throws {assert.AssertionError} 未找到 `resources/app.asar` 时抛出。
 * @throws {Error} 递归枚举目录失败时透传文件系统异常。
 */
function findPackagedRoot(directory) {
  const asar = walk(directory).find((path) => path.endsWith(join("resources", "app.asar")));
  assert.ok(asar, `Extracted package does not contain resources/app.asar: ${directory}`);
  return dirname(dirname(asar));
}

/**
 * @description 同步执行外部验证命令并断言进程成功退出。
 * @param {string} command 命令或可执行文件路径。
 * @param {string[]} args 命令参数。
 * @param {import("node:child_process").SpawnSyncOptions} [options={}] 附加进程选项。
 * @returns {void}
 * @throws {assert.AssertionError} 命令无法启动或退出码非零时抛出。
 */
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

  const rpmFiles = packageFiles.filter((name) => name.endsWith(".rpm"));
  assert.equal(rpmFiles.length, 1, `Expected one RPM package, found: ${rpmFiles.join(", ")}`);
  const [rpmFile] = rpmFiles;
  const rpmPath = join(outputDirectory, rpmFile);
  const rpmArchitecture = spawnSync("rpm", ["-qp", "--qf", "%{ARCH}", rpmPath], {
    encoding: "utf8"
  });
  assert.equal(rpmArchitecture.error, undefined, rpmArchitecture.error?.message);
  assert.equal(rpmArchitecture.status, 0, rpmArchitecture.stderr || rpmArchitecture.stdout);
  assert.equal(rpmArchitecture.stdout.trim(), "x86_64", "RPM package architecture must be x86_64.");
  const rpmExtract = join(verificationRoot, "rpm");
  mkdirSync(rpmExtract, { recursive: true });
  run(
    "bash",
    ["-o", "pipefail", "-c", 'rpm2cpio "$1" | cpio -id --quiet', "verify-rpm", rpmPath],
    { cwd: rpmExtract }
  );
  verifyRoot(findPackagedRoot(rpmExtract));

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

console.log("Linux unpacked runtime, Debian package, RPM package, and AppImage passed portability checks.");
