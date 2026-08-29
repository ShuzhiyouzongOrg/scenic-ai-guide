/**
 * @fileoverview 静态资源性能策略集成测试脚本。
 * @description 启动临时服务验证压缩协商、缓存、ETag、HEAD 请求、SPA 回退和安全响应头。
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from "node:zlib";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "scenic-pagespeed-static-"));
const webDistDir = join(tempDir, "web-dist");
const sqlitePath = join(tempDir, "scenic.sqlite");
const port = 31_000 + Math.floor(Math.random() * 1_000);
const origin = `http://127.0.0.1:${port}`;

const indexBody = Buffer.from("<!doctype html><html><body><div id=\"app\"></div></body></html>");
const scriptBody = Buffer.from("console.log('pagespeed-static-fixture')\n".repeat(80));
const scriptBrotliBody = brotliCompressSync(scriptBody);
const scriptGzipBody = gzipSync(scriptBody);
const cssBody = Buffer.from("body{color:#123456}\n");
const runtimeBody = Buffer.from("globalThis.__runtimeFixture=true\n");
const svgBody = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');

createStaticFixture();

const child = spawn(process.execPath, ["src/app.mjs"], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port),
    SQLITE_PATH: sqlitePath,
    WEB_DIST_DIR: webDistDir,
    LLM_PROVIDER: "mock",
    ASR_PROVIDER: "mock",
    TTS_PROVIDER: "mock"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await waitForServer();
  await testPrecompressedDelivery();
  await testMimeAndCachePolicies();
  await testConditionalRequests();
  await testHeadAndMissingResources();
  await testLive2dRoutesRemainIndependent();
  console.log("PASS  main-site identity/br/gzip, MIME, cache, 304, HEAD, 404 and Live2D isolation");
} catch (error) {
  error.message = `${error.message}\nServer output:\n${output}`;
  throw error;
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))
  ]);
  rmSync(tempDir, { recursive: true, force: true });
}

/**
 * @description 创建包含预压缩脚本、缓存资源和 Live2D 文件的静态站点夹具。
 * @returns {void}
 * @throws {Error} 目录创建或文件写入失败时抛出。
 */
function createStaticFixture() {
  mkdirSync(join(webDistDir, "assets"), { recursive: true });
  mkdirSync(join(webDistDir, "images"), { recursive: true });
  mkdirSync(join(webDistDir, "live2d", "ui"), { recursive: true });
  mkdirSync(join(webDistDir, "live2d", "motionsync", "core"), { recursive: true });

  writeFileSync(join(webDistDir, "index.html"), indexBody);
  writeFileSync(join(webDistDir, "assets", "app-1234abcd.js"), scriptBody);
  writeFileSync(join(webDistDir, "assets", "app-1234abcd.js.br"), scriptBrotliBody);
  writeFileSync(join(webDistDir, "assets", "app-1234abcd.js.gz"), scriptGzipBody);
  writeFileSync(join(webDistDir, "assets", "styles-8765dcba.css"), cssBody);
  writeFileSync(join(webDistDir, "assets", "runtime.js"), runtimeBody);
  writeFileSync(join(webDistDir, "images", "brand.svg"), svgBody);

  writeFileSync(join(webDistDir, "live2d", "ui", "loading-lotus.webp"), Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
  ]));
  writeFileSync(
    join(webDistDir, "live2d", "motionsync", "core", "live2dcubismmotionsynccore.min.js"),
    "globalThis.Live2DCubismMotionSyncCore = {};\n"
  );
  writeFileSync(
    join(webDistDir, "live2d", "motionsync", "basic-cri.motionsync3.json"),
    JSON.stringify({ Version: 1 })
  );
}

/**
 * @description 验证 identity、Brotli、gzip 协商和缺失预压缩文件回退。
 * @returns {Promise<void>} 全部响应断言通过后兑现。
 * @throws {AssertionError|Error} HTTP 请求或响应断言失败时抛出。
 */
async function testPrecompressedDelivery() {
  const identity = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "identity" }
  });
  assert.equal(identity.statusCode, 200);
  assert.equal(identity.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.equal(Number(identity.headers["content-length"]), scriptBody.length);
  assert.match(identity.headers.vary || "", /(?:^|,)\s*Accept-Encoding\s*(?:,|$)/iu);
  assert.deepEqual(identity.body, scriptBody);

  const brotli = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "br, gzip" }
  });
  assert.equal(brotli.statusCode, 200);
  assert.equal(brotli.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(brotli.headers["content-encoding"], "br");
  assert.equal(Number(brotli.headers["content-length"]), scriptBrotliBody.length);
  assert.deepEqual(brotliDecompressSync(brotli.body), scriptBody);
  assert.notEqual(brotli.headers.etag, identity.headers.etag, "content codings need distinct ETags");

  const gzip = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "gzip" }
  });
  assert.equal(gzip.statusCode, 200);
  assert.equal(gzip.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(gzip.headers["content-encoding"], "gzip");
  assert.equal(Number(gzip.headers["content-length"]), scriptGzipBody.length);
  assert.deepEqual(gunzipSync(gzip.body), scriptBody);
  assert.notEqual(gzip.headers.etag, identity.headers.etag, "content codings need distinct ETags");
  assert.notEqual(gzip.headers.etag, brotli.headers.etag, "br and gzip need distinct ETags");

  const gzipDisabled = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "br;q=0, gzip;q=0, *;q=1" }
  });
  assert.equal(gzipDisabled.statusCode, 200);
  assert.equal(gzipDisabled.headers["content-encoding"], undefined);
  assert.deepEqual(gzipDisabled.body, scriptBody);

  const noPrecompressedVariant = await requestRaw("/assets/styles-8765dcba.css", {
    headers: { "accept-encoding": "gzip" }
  });
  assert.equal(noPrecompressedVariant.statusCode, 200);
  assert.equal(noPrecompressedVariant.headers["content-encoding"], undefined);
  assert.equal(noPrecompressedVariant.headers["content-type"], "text/css; charset=utf-8");
  assert.deepEqual(noPrecompressedVariant.body, cssBody);
}

/**
 * @description 验证哈希资源、普通资源、图片、HTML 和 SPA 回退的 MIME 与缓存策略。
 * @returns {Promise<void>} 全部响应断言通过后兑现。
 * @throws {AssertionError|Error} HTTP 请求或响应断言失败时抛出。
 */
async function testMimeAndCachePolicies() {
  const hashedAsset = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "identity" }
  });
  assert.equal(hashedAsset.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.match(hashedAsset.headers.etag || "", /^W\/".+"$/u);
  assert.ok(Date.parse(hashedAsset.headers["last-modified"]));

  const nonHashedAsset = await requestRaw("/assets/runtime.js", {
    headers: { "accept-encoding": "identity" }
  });
  assert.equal(nonHashedAsset.statusCode, 200);
  assert.equal(nonHashedAsset.headers["cache-control"], "no-cache");
  assert.doesNotMatch(nonHashedAsset.headers["cache-control"], /immutable|31536000/u);

  const image = await requestRaw("/images/brand.svg", {
    headers: { "accept-encoding": "identity" }
  });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/svg+xml");
  assert.equal(image.headers["cache-control"], "no-cache");
  assert.deepEqual(image.body, svgBody);

  const html = await requestRaw("/", { headers: { "accept-encoding": "identity" } });
  assert.equal(html.statusCode, 200);
  assert.equal(html.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(html.headers["cache-control"], "no-cache");
  assert.doesNotMatch(html.headers["cache-control"], /immutable|31536000/u);
  assert.deepEqual(html.body, indexBody);

  const spaFallback = await requestRaw("/admin/dashboard", {
    headers: { "accept-encoding": "identity" }
  });
  assert.equal(spaFallback.statusCode, 200);
  assert.equal(spaFallback.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(spaFallback.headers["cache-control"], "no-cache");
  assert.deepEqual(spaFallback.body, indexBody);
}

/**
 * @description 验证 ETag、Last-Modified 和不同内容编码的条件请求行为。
 * @returns {Promise<void>} 全部 304 与优先级断言通过后兑现。
 * @throws {AssertionError|Error} HTTP 请求或响应断言失败时抛出。
 */
async function testConditionalRequests() {
  const html = await requestRaw("/", { headers: { "accept-encoding": "identity" } });
  const htmlNotModified = await requestRaw("/", {
    headers: {
      "accept-encoding": "identity",
      "if-none-match": html.headers.etag
    }
  });
  assert.equal(htmlNotModified.statusCode, 304);
  assert.equal(htmlNotModified.headers["cache-control"], "no-cache");
  assert.equal(htmlNotModified.headers.etag, html.headers.etag);
  assert.equal(htmlNotModified.body.length, 0);

  const identity = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "identity" }
  });
  const identityNotModified = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "identity",
      "if-none-match": identity.headers.etag
    }
  });
  assert.equal(identityNotModified.statusCode, 304);
  assert.equal(identityNotModified.body.length, 0);
  assert.equal(identityNotModified.headers["content-length"], undefined);
  assert.equal(identityNotModified.headers.etag, identity.headers.etag);
  assert.equal(identityNotModified.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.match(identityNotModified.headers.vary || "", /Accept-Encoding/iu);

  const brotli = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "br, gzip" }
  });
  const brotliNotModified = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "br, gzip",
      "if-none-match": brotli.headers.etag
    }
  });
  assert.equal(brotliNotModified.statusCode, 304);
  assert.equal(brotliNotModified.body.length, 0);
  assert.equal(brotliNotModified.headers["content-encoding"], "br");
  assert.equal(brotliNotModified.headers.etag, brotli.headers.etag);

  const gzip = await requestRaw("/assets/app-1234abcd.js", {
    headers: { "accept-encoding": "gzip" }
  });
  const gzipNotModified = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "gzip",
      "if-none-match": gzip.headers.etag
    }
  });
  assert.equal(gzipNotModified.statusCode, 304);
  assert.equal(gzipNotModified.body.length, 0);
  assert.equal(gzipNotModified.headers["content-encoding"], "gzip");
  assert.equal(gzipNotModified.headers.etag, gzip.headers.etag);

  const wrongRepresentationEtag = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "gzip",
      "if-none-match": identity.headers.etag
    }
  });
  assert.equal(wrongRepresentationEtag.statusCode, 200);
  assert.equal(wrongRepresentationEtag.headers["content-encoding"], "gzip");

  const dateNotModified = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "identity",
      "if-modified-since": identity.headers["last-modified"]
    }
  });
  assert.equal(dateNotModified.statusCode, 304);
  assert.equal(dateNotModified.body.length, 0);

  const etagPrecedence = await requestRaw("/assets/app-1234abcd.js", {
    headers: {
      "accept-encoding": "identity",
      "if-none-match": 'W/"not-the-current-etag"',
      "if-modified-since": identity.headers["last-modified"]
    }
  });
  assert.equal(etagPrecedence.statusCode, 200, "If-None-Match must take precedence over the date");
}

/**
 * @description 验证 HEAD 响应以及缺失哈希资源的安全 404 策略。
 * @returns {Promise<void>} 全部响应断言通过后兑现。
 * @throws {AssertionError|Error|SyntaxError} HTTP、JSON 解析或响应断言失败时抛出。
 */
async function testHeadAndMissingResources() {
  const head = await requestRaw("/assets/app-1234abcd.js", {
    method: "HEAD",
    headers: { "accept-encoding": "br, gzip" }
  });
  assert.equal(head.statusCode, 200);
  assert.equal(head.headers["content-encoding"], "br");
  assert.equal(Number(head.headers["content-length"]), scriptBrotliBody.length);
  assert.equal(head.body.length, 0);

  const missing = await requestRaw("/assets/missing-deadbeef.js", {
    headers: { "accept-encoding": "gzip" }
  });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers["content-type"] || "", /application\/json/iu);
  assert.equal(missing.headers["cache-control"], "no-store");
  assert.doesNotMatch(missing.headers["cache-control"], /immutable|31536000/u);
  assert.equal(JSON.parse(missing.body.toString()).success, false);
}

/**
 * @description 验证 Live2D 图片、MotionSync 脚本与配置使用独立静态路由。
 * @returns {Promise<void>} 全部资源与 404 断言通过后兑现。
 * @throws {AssertionError|Error|SyntaxError} HTTP、JSON 解析或响应断言失败时抛出。
 */
async function testLive2dRoutesRemainIndependent() {
  const image = await requestRaw("/live2d/ui/loading-lotus.webp", {
    headers: { "accept-encoding": "gzip" }
  });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/webp");
  assert.equal(image.headers["content-encoding"], undefined);
  assert.match(image.headers["cache-control"] || "", /public/u);
  assert.deepEqual([...image.body.slice(0, 4)], [0x52, 0x49, 0x46, 0x46]);

  const head = await requestRaw("/live2d/ui/loading-lotus.webp", { method: "HEAD" });
  assert.equal(head.statusCode, 200);
  assert.equal(head.headers["content-type"], "image/webp");
  assert.ok(Number(head.headers["content-length"]) > 0);
  assert.equal(head.body.length, 0);

  const motionSyncCore = await requestRaw(
    "/live2d/motionsync/core/live2dcubismmotionsynccore.min.js"
  );
  assert.equal(motionSyncCore.statusCode, 200);
  assert.match(motionSyncCore.headers["content-type"] || "", /(?:text|application)\/javascript/iu);

  const motionSyncConfig = await requestRaw("/live2d/motionsync/basic-cri.motionsync3.json");
  assert.equal(motionSyncConfig.statusCode, 200);
  assert.match(motionSyncConfig.headers["content-type"] || "", /application\/json/iu);
  assert.equal(JSON.parse(motionSyncConfig.body.toString()).Version, 1);

  const missing = await requestRaw("/live2d/ui/missing.webp");
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers["content-type"] || "", /application\/json/iu);
  assert.doesNotMatch(missing.headers["cache-control"] || "", /immutable|31536000/u);
}

/**
 * @description 通过 Node.js HTTP 客户端请求测试服务并收集原始响应体。
 * @param {string} pathname 请求路径。
 * @param {{method?: string, headers?: object}} [options={}] HTTP 方法和请求头。
 * @returns {Promise<{statusCode: number|undefined, headers: object, body: Buffer}>} 原始响应。
 * @throws {Error} 请求建立或传输失败时 Promise 拒绝。
 */
function requestRaw(pathname, { method = "GET", headers = {} } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request(`${origin}${pathname}`, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolveRequest({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on("error", rejectRequest);
    req.end();
  });
}

/**
 * @description 轮询健康检查，直至测试服务可用、提前退出或超时。
 * @returns {Promise<void>} 健康检查成功时兑现。
 * @throws {Error} 子进程提前退出或十五秒内未启动时抛出。
 */
async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("server did not start before timeout");
}
