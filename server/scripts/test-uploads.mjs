import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-upload-test-"));

try {
  process.env.DATA_DIR = tempDir;
  process.env.UPLOAD_DIR = join(tempDir, "uploads");
  process.env.SQLITE_PATH = ":memory:";

  const { createUpload, listUploads, reindexUploads } = await import("../src/services/uploads.mjs");
  const { buildKnowledge, restoreBundledKnowledge } = await import("../src/services/knowledgeBuild.mjs");
  const { getDb } = await import("../src/db/database.mjs");
  const { hybridSearch } = await import("../src/services/retrieval.mjs");

  const markdown = [
    "# Custom English guide",
    "",
    "## Quiet garden",
    "The Moonlight Garden has a silent reflection pool and evening lantern walk."
  ].join("\n");
  const upload = createUpload({
    fileName: "custom-guide.en.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from(markdown).toString("base64")
  });

  assert.equal(upload.status, "processed");
  assert.ok(upload.chunkCount > 0, "the uploaded Markdown should produce chunks");
  assert.ok(existsSync(join(tempDir, "generated", "knowledge.json")), "the bundled snapshot should seed DATA_DIR");
  assert.equal(
    hybridSearch("Where is the Moonlight Garden reflection pool?", { locale: "en" }).results[0]?.source,
    "custom-guide.en.md"
  );

  buildKnowledge({ sourceDir: resolve("..", "docs", "scenic-materials") });
  assert.equal(
    hybridSearch("Where is the Moonlight Garden reflection pool?", { locale: "en" }).results[0]?.source,
    "custom-guide.en.md",
    "uploaded chunks should survive a base knowledge rebuild"
  );

  assert.throws(
    () => buildKnowledge({ sourceDir: join(tempDir, "missing-sources") }),
    (error) => error?.code === "SOURCE_FILE_NOT_FOUND",
    "a release without source documents should use the bundled snapshot"
  );
  restoreBundledKnowledge({ force: true });
  getDb().prepare("UPDATE knowledge_documents SET status = 'failed', chunk_count = 0 WHERE id = ?").run(upload.id);
  const reindexed = reindexUploads();
  assert.equal(reindexed.processed, 1, "failed text uploads should be recoverable after a rebuild");
  assert.equal(listUploads()[0]?.status, "processed");

  console.log("PASS  uploaded Markdown seeds, indexes, rebuilds, and recovers");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
