import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, normalize, sep } from "node:path";
import { extractFile, listPackage } from "@electron/asar";

const nativeModulePattern = /(?:^|[\\/])[^\\/]+\.node$/i;
const forbiddenSqlitePattern = /(?:^|[\\/])better-sqlite3(?:[\\/]|$)/i;

function normalizeAsarPath(path) {
  return path.replace(/^[/\\]+/, "").replaceAll("\\", "/");
}

export function createAsarReader(asarPath) {
  const paths = listPackage(asarPath).map(normalizeAsarPath);
  return {
    paths,
    read(path) {
      const normalized = normalizeAsarPath(path);
      assert.ok(paths.includes(normalized), `Missing app.asar entry: ${normalized}`);
      return extractFile(asarPath, normalized.replaceAll("/", sep)).toString("utf8");
    }
  };
}

export function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

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

export function packageExtensions(outputDirectory) {
  return readdirSync(outputDirectory)
    .filter((name) => [".exe", ".dmg", ".AppImage", ".deb"].includes(extname(name)))
    .sort();
}
