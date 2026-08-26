import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import XLSX from "xlsx";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-upload-security-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.DOCUMENT_PARSER_ENABLED = "false";

try {
  const { createUpload, listUploads } = await import("../src/services/uploads.mjs");
  const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const safeWorkbook = createWorkbookBuffer();

  assert.throws(
    () => createUpload({
      fileName: "spoofed.xlsx",
      mimeType: "application/pdf",
      contentBase64: safeWorkbook.toString("base64")
    }),
    hasCode("UPLOAD_MIME_MISMATCH")
  );
  assert.throws(
    () => createUpload({
      fileName: "missing-mime.xlsx",
      contentBase64: safeWorkbook.toString("base64")
    }),
    hasCode("UPLOAD_MIME_MISMATCH")
  );
  assert.throws(
    () => createUpload({
      fileName: "spoofed.docx",
      mimeType: docxMime,
      contentBase64: safeWorkbook.toString("base64")
    }),
    hasCode("UPLOAD_SIGNATURE_INVALID")
  );
  assert.throws(
    () => createUpload({
      fileName: "macro.xlsx",
      mimeType: xlsxMime,
      contentBase64: appendZipDirectoryEntry(safeWorkbook, "xl/vbaProject.bin").toString("base64")
    }),
    hasCode("XLSX_MACRO_REJECTED")
  );
  assert.throws(
    () => createUpload({
      fileName: "external-link.xlsx",
      mimeType: xlsxMime,
      contentBase64: appendZipDirectoryEntry(safeWorkbook, "xl/externalLinks/externalLink1.xml").toString("base64")
    }),
    hasCode("XLSX_EXTERNAL_LINK_REJECTED")
  );
  assert.throws(
    () => createUpload({
      fileName: "path-traversal.xlsx",
      mimeType: xlsxMime,
      contentBase64: appendZipDirectoryEntry(safeWorkbook, "../outside.xml").toString("base64")
    }),
    hasCode("XLSX_PATH_TRAVERSAL")
  );
  assert.throws(
    () => createUpload({
      fileName: "encrypted-archive.xlsx",
      mimeType: xlsxMime,
      contentBase64: appendZipDirectoryEntry(safeWorkbook, "xl/secret.xml", { flags: 1 }).toString("base64")
    }),
    hasCode("XLSX_ARCHIVE_ENCRYPTED")
  );
  assert.throws(
    () => createUpload({
      fileName: "zip-bomb.xlsx",
      mimeType: xlsxMime,
      contentBase64: appendZipDirectoryEntry(safeWorkbook, "xl/sharedStrings.xml", {
        compressedSize: 1,
        uncompressedSize: 200 * 1024 * 1024
      }).toString("base64")
    }),
    (error) => error?.code === "XLSX_EXPANDED_SIZE_LIMIT" && error.statusCode === 413
  );
  assert.throws(
    () => createUpload({
      fileName: "encrypted.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("%PDF-1.4\n1 0 obj << /Encrypt 2 0 R /Type /Page >> endobj\n%%EOF", "ascii").toString("base64")
    }),
    hasCode("PDF_ENCRYPTED")
  );
  assert.throws(
    () => createUpload({
      fileName: "too-many-pages.pdf",
      mimeType: "application/pdf",
      contentBase64: createOversizedPageCountPdf(501).toString("base64")
    }),
    hasCode("PDF_TOO_MANY_PAGES")
  );
  assert.equal(listUploads().length, 0, "dangerous files must be rejected before persistence");

  process.env.DOCUMENT_PROCESSING_TIMEOUT_MS = "0";
  assert.throws(
    () => createUpload({
      fileName: "timeout.md",
      mimeType: "text/markdown; charset=utf-8",
      contentBase64: Buffer.from("# Timeout fixture\nThis content must not reach the active index.").toString("base64")
    }),
    (error) => error?.code === "DOCUMENT_PROCESSING_TIMEOUT" && error.statusCode === 504
  );
  delete process.env.DOCUMENT_PROCESSING_TIMEOUT_MS;
  const timedOut = listUploads().find((item) => item.fileName === "timeout.md");
  assert.equal(timedOut?.status, "failed");
  assert.equal(timedOut?.errorCode, "DOCUMENT_PROCESSING_TIMEOUT");

  console.log("PASS  strict MIME, Office ZIP/PDF preflight, dangerous fixtures and processing timeout");
} finally {
  delete process.env.DOCUMENT_PROCESSING_TIMEOUT_MS;
  rmSync(tempDir, { recursive: true, force: true });
}

function createWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["景点", "开放时间"], ["灵山大佛", "08:30-17:00"]]),
    "景点问答"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function appendZipDirectoryEntry(buffer, fileName, {
  flags = 0,
  compressedSize = 1,
  uncompressedSize = 1
} = {}) {
  const name = Buffer.from(fileName, "utf8");
  const entry = Buffer.alloc(46 + name.length);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(flags, 8);
  entry.writeUInt32LE(compressedSize, 20);
  entry.writeUInt32LE(uncompressedSize, 24);
  entry.writeUInt16LE(name.length, 28);
  name.copy(entry, 46);
  return Buffer.concat([buffer, entry]);
}

function createOversizedPageCountPdf(pageCount) {
  const pages = Array.from(
    { length: pageCount },
    (_, index) => `${index + 1} 0 obj << /Type /Page >> endobj`
  ).join("\n");
  return Buffer.from(`%PDF-1.4\n${pages}\n%%EOF`, "ascii");
}

function hasCode(code) {
  return (error) => error?.code === code && error.statusCode === 422;
}
