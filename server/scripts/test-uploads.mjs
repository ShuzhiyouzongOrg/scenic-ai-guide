/**
 * @fileoverview 知识文档上传与检索集成测试脚本。
 * @description 验证上传、解析、启停、预览、引用、重处理和检索可见性。
 */
import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import XLSX from "xlsx";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-upload-test-"));

try {
  process.env.DATA_DIR = tempDir;
  process.env.UPLOAD_DIR = join(tempDir, "uploads");
  process.env.SQLITE_PATH = ":memory:";
  process.env.DOCUMENT_PARSER_ENABLED = "false";

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
    contentBase64: createWorkbookBuffer([
      ["景点", "开放时间"],
      ["灵山大佛", "08:30-17:00"]
    ]).toString("base64")
  });
  assert.equal(binaryUpload.status, "processed");
  assert.equal(binaryUpload.knowledgeScope, "visitor_qa");
  assert.equal(binaryUpload.chunkCount, 1);
  assert.equal(getUploadPreview(binaryUpload.id).previewable, false);
  const binaryContent = getUploadContent(binaryUpload.id);
  assert.equal(binaryContent.fileName, "reference.xlsx");
  assert.equal(binaryContent.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(binaryContent.buffer[0], 0x50);
  assert.equal(
    hybridSearch("灵山大佛开放时间", { locale: "zh", limit: 10 }).results.some((result) => result.source === "reference.xlsx"),
    true,
    "visitor-scoped XLSX rows should be searchable"
  );

  const analyticsUpload = createUpload({
    fileName: "景点景区旅游数据行为分析数据.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: createWorkbookBuffer([
      ["游客ID", "消费金额"],
      ["T-001", "210"]
    ]).toString("base64")
  });
  assert.equal(analyticsUpload.status, "skipped");
  assert.equal(analyticsUpload.knowledgeScope, "operations_analytics");
  assert.equal(
    hybridSearch("游客ID 消费金额", { limit: 5 }).results.some((result) => result.source === analyticsUpload.fileName),
    false,
    "operations analytics must stay outside visitor QA"
  );

  const pdfUpload = createUpload({
    fileName: "text-guide.pdf",
    mimeType: "application/pdf",
    contentBase64: createTextPdf("灵山大佛通高88米，位于祥符禅寺附近，是重要景点。").toString("base64")
  });
  assert.equal(pdfUpload.status, "processed");
  assert.equal(pdfUpload.chunkCount, 1);
  assert.equal(
    hybridSearch("重要景点 附近", { limit: 5, documentType: "pdf" }).results.some((result) => result.source === "text-guide.pdf"),
    true,
    "text PDF should be searchable"
  );

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
  assert.equal(listUploads().length, 5, "historical duplicates should be folded in the document list");
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
  assert.equal(reindexed.processed, 4, "unique text and structured uploads should be recoverable after a rebuild");
  assert.equal(reindexed.skipped, 1, "operations analytics should remain isolated from visitor QA");
  assert.equal(reindexed.duplicates, 1, "historical duplicate content should only be indexed once");
  const visibleUploads = listUploads();
  assert.equal(visibleUploads.length, 5);
  assert.equal(
    visibleUploads.filter((item) => item.status === "processed").length,
    4,
    "each unique indexable document should have one processed representative"
  );

  console.log("PASS  uploads preview, deduplicate, index Thai content, rebuild, and recover");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

/**
 * @description 将二维行数据写入单工作表 XLSX 夹具。
 * @param {Array<Array<*>>} rows 工作表行。
 * @returns {Buffer} XLSX 二进制内容。
 */
function createWorkbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "景点问答");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/**
 * @description 生成包含单个 UTF-16BE 文本操作符的最小 PDF 夹具。
 * @param {string} text 页面文本。
 * @returns {Buffer} PDF 二进制内容。
 */
function createTextPdf(text) {
  const bytes = Buffer.from(`\ufeff${text}`, "utf16le");
  const swapped = Buffer.alloc(bytes.length);
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1];
    swapped[index + 1] = bytes[index];
  }
  const stream = `BT /F1 12 Tf 72 720 Td <${swapped.toString("hex")}> Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`
  ];
  return Buffer.from(`%PDF-1.4\n${objects.join("\n")}\n%%EOF`, "latin1");
}
