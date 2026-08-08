import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-upload-test-"));

try {
  process.env.DATA_DIR = tempDir;
  process.env.UPLOAD_DIR = join(tempDir, "uploads");
  process.env.SQLITE_PATH = ":memory:";

  const { createUpload, getUploadContent, getUploadPreview, listUploads, reindexUploads } = await import("../src/services/uploads.mjs");
  const { buildKnowledge, loadKnowledge, restoreBundledKnowledge } = await import("../src/services/knowledgeBuild.mjs");
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
  const preview = getUploadPreview(upload.id);
  assert.equal(preview.previewable, true);
  assert.match(preview.content, /Moonlight Garden/);

  const duplicate = createUpload({
    fileName: "renamed-copy.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from(markdown).toString("base64")
  });
  assert.equal(duplicate.duplicate, true, "identical bytes should be detected regardless of file name");
  assert.equal(duplicate.id, upload.id);
  assert.equal(listUploads().length, 1, "an exact duplicate should not create another visible row");

  const revisedUpload = createUpload({
    fileName: "custom-guide.en.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from(`${markdown}\n\nA revised paragraph.`).toString("base64")
  });
  assert.notEqual(revisedUpload.id, upload.id, "the same file name with changed content must remain uploadable");

  const binaryUpload = createUpload({
    fileName: "reference.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: Buffer.from("binary-placeholder").toString("base64")
  });
  assert.equal(getUploadPreview(binaryUpload.id).previewable, false);
  const binaryContent = getUploadContent(binaryUpload.id);
  assert.equal(binaryContent.fileName, "reference.xlsx");
  assert.equal(binaryContent.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(binaryContent.buffer.toString("utf8"), "binary-placeholder");

  const legacyDuplicateId = "upload_legacy_duplicate";
  const legacyStoredName = `${legacyDuplicateId}.md`;
  writeFileSync(join(tempDir, "uploads", legacyStoredName), markdown);
  getDb()
    .prepare(
      `INSERT INTO knowledge_documents
        (id, file_name, stored_name, mime_type, size, file_type, status, chunk_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      legacyDuplicateId,
      "legacy-copy.md",
      legacyStoredName,
      "text/markdown",
      Buffer.byteLength(markdown),
      "md",
      "processed",
      upload.chunkCount,
      new Date(Date.now() - 1_000).toISOString()
    );
  assert.equal(listUploads().length, 3, "historical duplicates should be folded in the document list");
  assert.ok(existsSync(join(tempDir, "generated", "knowledge.json")), "the bundled snapshot should seed DATA_DIR");
  assert.equal(
    hybridSearch("Where is the Moonlight Garden reflection pool?", { locale: "en" }).results[0]?.source,
    "custom-guide.en.md"
  );

  buildKnowledge({ sourceDir: resolve("..", "docs", "scenic-materials") });
  assert.equal(
    loadKnowledge().documents.find((document) => document.fileName === "lingshan-guide.th.md")?.language,
    "th",
    "the Thai guide should be included and classified as Thai"
  );
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
  assert.equal(reindexed.processed, 2, "unique text uploads should be recoverable after a rebuild");
  assert.equal(reindexed.skipped, 1, "binary uploads should remain stored without unsafe parsing");
  assert.equal(reindexed.duplicates, 1, "historical duplicate content should only be indexed once");
  const visibleUploads = listUploads();
  assert.equal(visibleUploads.length, 3);
  assert.equal(
    visibleUploads.filter((item) => item.status === "processed").length,
    2,
    "each unique text document should have one processed representative"
  );

  console.log("PASS  uploads preview, deduplicate, index Thai content, rebuild, and recover");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
