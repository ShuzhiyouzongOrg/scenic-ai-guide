/**
 * @fileoverview Electron 打包目录通用验证工具。
 * @description 检查 ASAR 与解包目录中的服务端文件、运行配置、Live2D 资源及原生模块边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, normalize, sep } from "node:path";
import { extractFile, listPackage } from "@electron/asar";

/**
 * @description 匹配打包目录或 ASAR 清单中的 Node.js 原生扩展文件。
 * @type {RegExp}
 */
const nativeModulePattern = /(?:^|[\\/])[^\\/]+\.node$/i;
/**
 * @description 匹配禁止进入桌面包的 `better-sqlite3` 路径。
 * @type {RegExp}
 */
const forbiddenSqlitePattern = /(?:^|[\\/])better-sqlite3(?:[\\/]|$)/i;

/**
 * @description 将 ASAR 路径统一为无前导分隔符的正斜杠格式。
 * @param {string} path ASAR 返回的原始内部路径。
 * @returns {string} 规范化后的 ASAR 相对路径。
 */
function normalizeAsarPath(path) {
  return path.replace(/^[/\\]+/, "").replaceAll("\\", "/");
}

/**
 * @description ASAR 文件读取器。
 * @typedef {object} AsarReader
 * @property {string[]} paths ASAR 中全部规范化文件路径。
 * @property {(path: string) => string} read 读取指定 UTF-8 文本文件的方法。
 */

/**
 * @description 创建只读 ASAR 文件清单和文本读取器。
 * @param {string} asarPath `app.asar` 文件路径。
 * @returns {AsarReader} 可用于安装包完整性验证的读取器。
 * @throws {Error} ASAR 无法解析或读取时透传底层异常。
 * @example
 * const asar = createAsarReader("dist/resources/app.asar");
 * const packageJson = asar.read("package.json");
 */
export function createAsarReader(asarPath) {
  const paths = listPackage(asarPath).map(normalizeAsarPath);
  return {
    paths,
    /**
     * @description 从 ASAR 中读取一个必需的 UTF-8 文本文件。
     * @param {string} path ASAR 内部相对路径。
     * @returns {string} 文件的 UTF-8 文本内容。
     * @throws {assert.AssertionError} 路径不在 ASAR 清单中时抛出。
     * @example
     * const source = asar.read("server/src/app.mjs");
     */
    read(path) {
      const normalized = normalizeAsarPath(path);
      assert.ok(paths.includes(normalized), `Missing app.asar entry: ${normalized}`);
      return extractFile(asarPath, normalized.replaceAll("/", sep)).toString("utf8");
    }
  };
}

/**
 * @description 递归枚举指定目录中的全部普通文件。
 * @param {string} directory 起始目录。
 * @returns {string[]} 文件路径列表，路径形式与输入目录保持一致。
 * @throws {Error} 目录不存在或无权读取时透传文件系统异常。
 * @example
 * const files = walk("dist/win-unpacked");
 */
export function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/**
 * @description 验证 Electron 应用目录和 ASAR 中的服务端入口、运行配置、Live2D 资源及原生模块边界。
 * @param {string} root Electron 应用根目录。
 * @param {{readAsar: (asarPath: string) => AsarReader}} options 验证依赖。
 * @param {(asarPath: string) => AsarReader} options.readAsar ASAR 读取器工厂。
 * @returns {{name: string, files: number, appAsarBytes: number}} 应用目录名、文件总数和 ASAR 字节数。
 * @throws {assert.AssertionError} 必需文件缺失、配置无效或包含禁用原生模块时抛出。
 * @throws {Error} 文件系统或 ASAR 读取失败时透传底层异常。
 * @example
 * const summary = verifyPackagedTree(root, { readAsar: createAsarReader });
 */
export function verifyPackagedTree(root, { readAsar }) {
  const resources = existsSync(join(root, "resources", "app.asar"))
    ? join(root, "resources")
    : join(root, "Resources");
  const asarPath = join(resources, "app.asar");
  assert.ok(existsSync(asarPath), `Packaged app.asar is missing: ${asarPath}`);

  const diskFiles = walk(root);
  const asar = readAsar(asarPath);
  const allPaths = [...diskFiles, ...asar.paths];
  const forbidden = allPaths.filter(
    (path) => nativeModulePattern.test(normalize(path)) || forbiddenSqlitePattern.test(normalize(path))
  );
  assert.deepEqual(forbidden, [], `Unexpected native SQLite files: ${forbidden.join(", ")}`);

  const bundledEnvironment = join(resources, "runtime", "default-server.env");
  const environment = existsSync(bundledEnvironment)
    ? readFileSync(bundledEnvironment, "utf8")
    : asar.read("runtime/default-server.env");
  for (const key of ["LLM_API_KEY", "XFYUN_APP_ID", "XFYUN_API_KEY", "XFYUN_API_SECRET"]) {
    assert.match(
      environment,
      new RegExp(`^${key}=\\S+`, "m"),
      `${key} is missing from the packaged service configuration.`
    );
  }

  const database = asar.read("runtime/server/src/db/database.mjs");
  assert.match(database, /DESKTOP_USE_NODE_SQLITE/);
  assert.match(database, /node:sqlite/);
  assert.doesNotMatch(database, /^import Database from ["']better-sqlite3["']/m);

  const main = asar.read("main.mjs");
  assert.match(main, /desktop:get-avatar-credentials/);
  const preload = asar.read("preload.cjs");
  assert.match(preload, /getAvatarCredentials/);

  const requiredLive2dAssets = [
    "web/dist/live2d/core/live2dcubismcore.min.js",
    "web/dist/live2d/motionsync/core/live2dcubismmotionsynccore.min.js",
    "web/dist/live2d/characters/Haru/Haru.model3.json",
    "web/dist/live2d/characters/Haru/haru.moc3",
    "web/dist/live2d/characters/Hiyori/Hiyori.model3.json",
    "web/dist/live2d/characters/Kei/Kei.model3.json",
    "web/dist/live2d/characters/Hibiki/Hibiki.model3.json"
  ];
  for (const asset of requiredLive2dAssets) {
    assert.ok(asar.paths.includes(asset), `Missing packaged Live2D asset: ${asset}`);
  }

  return {
    name: basename(root),
    files: diskFiles.length + asar.paths.length,
    appAsarBytes: statSync(asarPath).size
  };
}

/**
 * @description 列出 electron-builder 输出目录中的可发布安装包文件名。
 * @param {string} outputDirectory electron-builder 输出目录。
 * @returns {string[]} 按名称排序的 EXE、DMG、AppImage 与 DEB 文件名。
 * @throws {Error} 输出目录不存在或无法读取时透传文件系统异常。
 * @example
 * const packages = packageExtensions("dist");
 */
export function packageExtensions(outputDirectory) {
  return readdirSync(outputDirectory)
    .filter((name) => [".exe", ".dmg", ".AppImage", ".deb"].includes(extname(name)))
    .sort();
}
