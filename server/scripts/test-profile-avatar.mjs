import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-profile-avatar-"));
process.env.DATA_DIR = tempDir;
process.env.SQLITE_PATH = join(tempDir, "avatar-test.sqlite");
process.env.JWT_SECRET = "profile-avatar-test-secret";
process.env.CONFIG_ENV_FILE = join(tempDir, "missing.env");

const { startServer, stopServer } = await import("../src/app.mjs");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let baseUrl = "";
try {
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  await jsonRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "avatarvisitor", password: "avatar123" }),
    headers: { "content-type": "application/json" }
  }, 201);
  const login = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "avatarvisitor", password: "avatar123", role: "visitor" }),
    headers: { "content-type": "application/json" }
  }, 200);
  const token = login.data.token;

  const unauthorizedForm = new FormData();
  unauthorizedForm.append("avatar", new Blob([png], { type: "image/png" }), "avatar.png");
  await jsonRequest("/api/auth/avatar", { method: "POST", body: unauthorizedForm }, 401);

  const invalidForm = new FormData();
  invalidForm.append("avatar", new Blob([Buffer.from("not-an-image")], { type: "image/png" }), "fake.png");
  const invalid = await jsonRequest("/api/auth/avatar", {
    method: "POST",
    body: invalidForm,
    headers: { authorization: `Bearer ${token}` }
  }, 415);
  assert.equal(invalid.error.code, "AVATAR_TYPE_INVALID");

  const oversizedPng = Buffer.alloc(5 * 1024 * 1024 + 1);
  png.copy(oversizedPng, 0, 0, 8);
  const oversizedForm = new FormData();
  oversizedForm.append("avatar", new Blob([oversizedPng], { type: "image/png" }), "oversized.png");
  const oversized = await jsonRequest("/api/auth/avatar", {
    method: "POST",
    body: oversizedForm,
    headers: { authorization: `Bearer ${token}` }
  }, 413);
  assert.equal(oversized.error.code, "AVATAR_TOO_LARGE");

  const avatarForm = new FormData();
  avatarForm.append("avatar", new Blob([png], { type: "application/octet-stream" }), "profile.bin");
  const uploaded = await jsonRequest("/api/auth/avatar", {
    method: "POST",
    body: avatarForm,
    headers: { authorization: `Bearer ${token}` }
  }, 201);
  assert.match(uploaded.data.avatar, /^\/api\/auth\/avatar\/[0-9a-f-]+\.png$/);

  const imageResponse = await fetch(baseUrl + uploaded.data.avatar);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  assert.equal(imageResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);

  const profile = await jsonRequest("/api/auth/me", {
    headers: { authorization: `Bearer ${token}` }
  }, 200);
  assert.equal(profile.data.avatar, uploaded.data.avatar);

  console.log("PASS  profile avatar upload requires auth, validates bytes, persists, and serves safely");
} finally {
  await stopServer();
  rmSync(tempDir, { recursive: true, force: true });
}

async function jsonRequest(pathname, init, expectedStatus) {
  const response = await fetch(baseUrl + pathname, init);
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}
