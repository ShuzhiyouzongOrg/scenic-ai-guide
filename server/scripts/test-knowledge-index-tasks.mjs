/**
 * @fileoverview 知识索引异步任务测试脚本。
 * @description 覆盖任务入队、租约领取、重试、完成状态和活动索引版本更新。
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-knowledge-index-tasks-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.DOCUMENT_PARSER_ENABLED = "false";
process.env.KNOWLEDGE_ASYNC_INDEXING_ENABLED = "true";

try {
  const {
    createUpload,
    listUploads,
    runKnowledgeIndexTasks,
    setUploadEnabled
  } = await import("../src/services/uploads.mjs");
  const { getDb } = await import("../src/db/database.mjs");
  const { hybridSearch } = await import("../src/services/retrieval.mjs");
  const contentBase64 = Buffer.from("# 异步索引\nasync-index-unique-fact 位于灵山胜境。", "utf8").toString("base64");
  const upload = createUpload({
    fileName: "async-index.md",
    mimeType: "text/markdown",
    contentBase64
  });
  assert.equal(upload.status, "classified");
  assert.ok(upload.taskId);
  const duplicate = createUpload({
    fileName: "async-index-renamed.md",
    mimeType: "text/markdown",
    contentBase64
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS n FROM knowledge_processing_tasks WHERE task_type = 'knowledge_index'").get().n,
    1,
    "content-hash idempotency must prevent duplicate tasks"
  );
  getDb().prepare("UPDATE knowledge_processing_tasks SET status = 'running', lease_until = ? WHERE id = ?")
    .run(new Date(0).toISOString(), upload.taskId);
  const processed = await runKnowledgeIndexTasks({ now: Date.now(), limit: 1 });
  assert.equal(processed.succeeded, 1);
  assert.equal(listUploads().find((item) => item.id === upload.id).status, "processed");
  assert.ok(hybridSearch("async-index-unique-fact", { limit: 5 }).results.some(
    (item) => item.documentId === upload.id
  ));
  assert.equal((await runKnowledgeIndexTasks({ now: Date.now() + 60_000 })).processed, 0);
  assert.equal(setUploadEnabled(upload.id, false).enabled, false);
  const reenabled = setUploadEnabled(upload.id, true);
  assert.equal(reenabled.status, "classified");
  assert.ok(reenabled.taskId);
  assert.equal((await runKnowledgeIndexTasks({ now: Date.now() + 90_000 })).succeeded, 1);
  assert.ok(hybridSearch("async-index-unique-fact", { limit: 5 }).results.some(
    (item) => item.documentId === upload.id
  ));

  const stale = createUpload({
    fileName: "stale-index.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from("stale source", "utf8").toString("base64")
  });
  getDb().prepare("UPDATE knowledge_documents SET content_hash = 'changed' WHERE id = ?").run(stale.id);
  const failed = await runKnowledgeIndexTasks({ now: Date.now() + 120_000, maxAttempts: 1 });
  assert.equal(failed.failed, 1);
  assert.equal(
    getDb().prepare("SELECT status FROM knowledge_processing_tasks WHERE id = ?").get(stale.taskId).status,
    "failed"
  );
  console.log("PASS  general knowledge indexing queue, idempotency, lease recovery and failure state");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
