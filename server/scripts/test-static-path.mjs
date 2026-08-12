import assert from "node:assert/strict";
import { posix, resolve, win32 } from "node:path";
import { resolveStaticFilePath } from "../src/http/staticPath.mjs";

const publicDir = resolve("fixtures", "web-dist");
const encodedMotion = "/live2d/characters/Haru/motion/%E5%BE%AE%E7%AC%91-%E5%90%91%E5%8F%B3%E6%8C%87%E5%BC%95.motion3.json";
const motionSegments = ["live2d", "characters", "Haru", "motion", "微笑-向右指引.motion3.json"];

assert.equal(
  resolveStaticFilePath(publicDir, encodedMotion),
  resolve(publicDir, ...motionSegments)
);
assert.equal(resolveStaticFilePath(publicDir, "/"), resolve(publicDir, "index.html"));
assert.equal(resolveStaticFilePath(publicDir, ""), resolve(publicDir, "index.html"));
assert.equal(resolveStaticFilePath(publicDir, "/%E0%A4%A"), null);
assert.equal(resolveStaticFilePath(publicDir, "/../../server.env"), null);
assert.equal(resolveStaticFilePath(publicDir, "/%2e%2e/server.env"), null);
assert.equal(resolveStaticFilePath(publicDir, "/safe/%2E%2E%5Cserver.env"), null);
assert.equal(resolveStaticFilePath(publicDir, "/live2d/%00model.json"), null);
assert.equal(resolveStaticFilePath(publicDir, "/C:/Windows/win.ini"), null);

const platformCases = [
  {
    name: "POSIX",
    pathApi: posix,
    publicDir: "/opt/shuzhiyouzong/web/dist"
  },
  {
    name: "Windows",
    pathApi: win32,
    publicDir: "C:\\shuzhiyouzong\\web\\dist"
  }
];

for (const { name, pathApi, publicDir: platformPublicDir } of platformCases) {
  assert.equal(
    resolveStaticFilePath(platformPublicDir, encodedMotion, pathApi),
    pathApi.resolve(platformPublicDir, ...motionSegments),
    `${name} should decode the Chinese Live2D URL`
  );
  assert.equal(
    resolveStaticFilePath(platformPublicDir, "/guide/map", pathApi),
    pathApi.resolve(platformPublicDir, "guide", "map"),
    `${name} should preserve extensionless SPA routes`
  );
  assert.equal(
    resolveStaticFilePath(platformPublicDir, "/", pathApi),
    pathApi.resolve(platformPublicDir, "index.html"),
    `${name} should resolve the root path to index.html`
  );
  for (const attack of [
    "/../server.env",
    "/%2e%2e/server.env",
    "/safe/%2E%2E%5Cserver.env",
    "/safe/%2F..%2Fserver.env"
  ]) {
    assert.equal(
      resolveStaticFilePath(platformPublicDir, attack, pathApi),
      null,
      `${name} should reject traversal: ${attack}`
    );
  }
}

console.log("Static resource path tests passed.");
