import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-rag-admin-test-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = join(tempDir, "scenic.sqlite");
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin123";
process.env.JWT_SECRET = "rag-admin-test-secret";

try {
  const { createUpload } = await import("../src/services/uploads.mjs");
  const { createAdminUser } = await import("../src/services/userAdmin.mjs");
  const { recordKnowledgeGap } = await import("../src/services/knowledgeGaps.mjs");
  const { server, startServer, stopServer } = await import("../src/app.mjs");
  const upload = createUpload({
    fileName: "admin-citation-test.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from("# Admin citation\n灵山胜境管理端引用测试事实。", "utf8").toString("base64")
  });
  const gap = recordKnowledgeGap({
    question: "灵山是否提供夜间行李寄存？",
    reason: "no_candidate",
    source: "retrieval"
  });
  createAdminUser({
    username: "knowledge-operator",
    password: "operator123",
    role: "operator",
    displayName: "Knowledge Operator"
  });

  await startServer({ host: "127.0.0.1", port: 0 });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const loginResponse = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "admin123", role: "admin" }
    });
    assert.equal(loginResponse.response.status, 200);
    const token = loginResponse.body.data.token;
    const auth = { authorization: `Bearer ${token}` };
    const operatorLogin = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "knowledge-operator", password: "operator123", role: "operator" }
    });
    assert.equal(operatorLogin.response.status, 200);
    const operatorAuth = { authorization: `Bearer ${operatorLogin.body.data.token}` };
    assert.equal((await request(origin, "/api/knowledge/summary", { headers: operatorAuth })).response.status, 200);
    assert.equal((await request(origin, "/api/knowledge/chunks", { headers: operatorAuth })).response.status, 403);
    assert.equal((await request(origin, "/api/knowledge/chunks")).response.status, 401);
    assert.equal((await request(origin, "/api/uploads", {
      method: "POST",
      headers: operatorAuth,
      body: {
        fileName: "operator-blocked.md",
        mimeType: "text/markdown",
        contentBase64: Buffer.from("blocked", "utf8").toString("base64")
      }
    })).response.status, 403);

    const rebuild = await request(origin, "/api/knowledge/rebuild", {
      method: "POST",
      headers: auth,
      body: {}
    });
    assert.equal(rebuild.response.status, 201);
    const rateLimited = await request(origin, "/api/knowledge/rebuild", {
      method: "POST",
      headers: auth,
      body: {}
    });
    assert.equal(rateLimited.response.status, 429);
    assert.equal(rateLimited.body.error.code, "KNOWLEDGE_REBUILD_RATE_LIMITED");
    const audits = await request(origin, "/api/admin/audit-logs", { headers: auth });
    assert.equal(audits.response.status, 200);
    assert.ok(audits.body.data.some((item) => item.action === "knowledge.rebuild" && item.status === "success"));
    assert.ok(audits.body.data.some((item) => item.action === "knowledge.rebuild" && item.status === "rejected"));

    const versions = await request(origin, "/api/admin/knowledge/index-versions", { headers: operatorAuth });
    assert.equal(versions.response.status, 200);
    assert.ok(versions.body.data.length >= 2);
    assert.equal(versions.body.data.filter((item) => item.active).length, 1);
    const currentVersion = versions.body.data.find((item) => item.active).indexVersion;
    const previousVersion = versions.body.data.find((item) => !item.active).indexVersion;
    const operatorRestore = await request(
      origin,
      `/api/admin/knowledge/index-versions/${encodeURIComponent(previousVersion)}/activate`,
      { method: "POST", headers: operatorAuth, body: {} }
    );
    assert.equal(operatorRestore.response.status, 403);
    const restoredVersion = await request(
      origin,
      `/api/admin/knowledge/index-versions/${encodeURIComponent(previousVersion)}/activate`,
      { method: "POST", headers: auth, body: {} }
    );
    assert.equal(restoredVersion.response.status, 200);
    assert.equal(restoredVersion.body.data.activeVersion, previousVersion);
    const switchedBack = await request(
      origin,
      `/api/admin/knowledge/index-versions/${encodeURIComponent(currentVersion)}/activate`,
      { method: "POST", headers: auth, body: {} }
    );
    assert.equal(switchedBack.response.status, 200);
    assert.equal(switchedBack.body.data.activeVersion, currentVersion);
    const activationAudits = await request(origin, "/api/admin/audit-logs", { headers: auth });
    assert.ok(activationAudits.body.data.some(
      (item) => item.action === "knowledge.version.activate" && item.status === "success"
    ));

    const experiment = await request(origin, "/api/admin/rag-experiment", { headers: auth });
    assert.equal(experiment.response.status, 200);
    assert.ok(experiment.body.data.variants.control);
    assert.ok(experiment.body.data.variants.treatment);

    const citations = await request(origin, `/api/uploads/${upload.id}/citations`, { headers: auth });
    assert.equal(citations.response.status, 200);
    assert.ok(citations.body.data.citations.length > 0);
    assert.match(citations.body.data.citations[0].citationId, /^C-/u);

    const disabled = await request(origin, `/api/uploads/${upload.id}`, {
      method: "PUT",
      headers: auth,
      body: { enabled: false }
    });
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.body.data.enabled, false);

    const disabledCitations = await request(origin, `/api/uploads/${upload.id}/citations`, { headers: auth });
    assert.equal(disabledCitations.response.status, 200);
    assert.equal(disabledCitations.body.data.citations.length, 0);

    const enabled = await request(origin, `/api/uploads/${upload.id}`, {
      method: "PUT",
      headers: auth,
      body: { enabled: true }
    });
    assert.equal(enabled.response.status, 200);
    assert.equal(enabled.body.data.enabled, true);
    assert.equal(enabled.body.data.status, "processed");

    const restoredCitations = await request(origin, `/api/uploads/${upload.id}/citations`, { headers: auth });
    assert.equal(restoredCitations.response.status, 200);
    assert.ok(restoredCitations.body.data.citations.length > 0);

    const gaps = await request(origin, "/api/admin/knowledge-gaps?status=pending", { headers: auth });
    assert.equal(gaps.response.status, 200);
    assert.ok(gaps.body.data.some((item) => item.id === gap.id));
    const confirmedGap = await request(origin, `/api/admin/knowledge-gaps/${gap.id}`, {
      method: "PUT",
      headers: auth,
      body: { status: "confirmed" }
    });
    assert.equal(confirmedGap.response.status, 200);
    assert.equal(confirmedGap.body.data.status, "confirmed");
    const exportResponse = await fetch(`${origin}/api/admin/knowledge-gaps/export`, { headers: auth });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/u);
    assert.match(await exportResponse.text(), /夜间行李寄存/u);
    console.log("PASS  RAG-027/028 admin document and knowledge-gap workflows");
  } finally {
    await stopServer();
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

async function request(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { response, body: await response.json() };
}
