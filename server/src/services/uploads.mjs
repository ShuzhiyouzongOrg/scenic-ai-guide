// SQLite-backed upload metadata store (P0-07 / A7-02). File bytes are written to
// the upload directory; document metadata and processing status live in the
// knowledge_documents table.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { config } from "../config.mjs";
import { getDb } from "../db/database.mjs";
import { extractDocxText } from "./docx.mjs";
import {
  indexTextKnowledgeDocument,
  removeIndexedKnowledgeDocuments
} from "./knowledgeBuild.mjs";

const allowedExtensions = new Set([".docx", ".xlsx", ".txt", ".md", ".pdf"]);
const indexableExtensions = new Set([".docx", ".txt", ".md"]);
const previewableExtensions = new Set([".docx", ".txt", ".md"]);
const previewCharacterLimit = 100_000;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function storedPathFor(row) {
  const uploadRoot = resolve(config.uploadDir);
  const storedPath = resolve(uploadRoot, String(row.stored_name || ""));
  if (storedPath !== uploadRoot && !storedPath.startsWith(`${uploadRoot}${sep}`)) {
    const error = new Error("Invalid uploaded file path.");
    error.statusCode = 400;
    error.code = "INVALID_UPLOAD_PATH";
    throw error;
  }
  return storedPath;
}

function backfillContentHashes(db) {
  const rows = db
    .prepare("SELECT * FROM knowledge_documents WHERE content_hash IS NULL OR content_hash = ''")
    .all();
  const update = db.prepare("UPDATE knowledge_documents SET content_hash = ? WHERE id = ?");

  for (const row of rows) {
    try {
      const storedPath = storedPathFor(row);
      if (existsSync(storedPath)) {
        update.run(sha256(readFileSync(storedPath)), row.id);
      }
    } catch {
      // A damaged legacy metadata row remains independently visible for manual
      // review instead of preventing the rest of the upload list from loading.
    }
  }
}

function hasStoredFile(row) {
  try {
    return existsSync(storedPathFor(row));
  } catch {
    return false;
  }
}

function statusRank(status) {
  return { processed: 4, uploaded: 3, processing: 2, failed: 1 }[status] || 0;
}

function deduplicateRows(rows) {
  const selected = new Map();
  const duplicateIds = [];

  for (const row of rows) {
    const key = row.content_hash || `id:${row.id}`;
    const current = selected.get(key);
    if (!current) {
      selected.set(key, row);
      continue;
    }

    const candidateWins =
      statusRank(row.status) > statusRank(current.status) ||
      (statusRank(row.status) === statusRank(current.status) && row.created_at > current.created_at);
    if (candidateWins) {
      duplicateIds.push(current.id);
      selected.set(key, row);
    } else {
      duplicateIds.push(row.id);
    }
  }

  return { rows: [...selected.values()], duplicateIds };
}

function toUpload(row, extra = {}) {
  return {
    id: row.id,
    fileName: row.file_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    size: row.size,
    fileType: row.file_type,
    status: row.status,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    ...extra
  };
}

function processIndexableUpload(db, row, storedPath, buffer) {
  const extension = `.${String(row.file_type || "").toLowerCase()}`;
  const text = extension === ".docx" ? extractDocxText(storedPath) : buffer.toString("utf8");
  const document = indexTextKnowledgeDocument({
    documentId: row.id,
    fileName: row.file_name,
    text,
    fileType: row.file_type
  });
  db.prepare(
    "UPDATE knowledge_documents SET status = 'processed', chunk_count = ? WHERE id = ?"
  ).run(document.chunkCount, row.id);
  row.status = "processed";
  row.chunk_count = document.chunkCount;
}

export function createUpload({ fileName, mimeType = "application/octet-stream", contentBase64 = "" }) {
  if (!fileName || typeof fileName !== "string") {
    const error = new Error("fileName is required.");
    error.statusCode = 400;
    error.code = "UPLOAD_FILE_NAME_REQUIRED";
    throw error;
  }

  const extension = extname(fileName).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    const error = new Error("Unsupported file type.");
    error.statusCode = 400;
    error.code = "UNSUPPORTED_UPLOAD_TYPE";
    throw error;
  }

  const buffer = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.alloc(0);
  const contentHash = sha256(buffer);
  const db = getDb();
  backfillContentHashes(db);

  const duplicateRows = db
    .prepare(
      `SELECT * FROM knowledge_documents
       WHERE content_hash = ?
       ORDER BY
         CASE status WHEN 'processed' THEN 0 WHEN 'uploaded' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END,
         created_at DESC, rowid DESC`
    )
    .all(contentHash);
  const duplicate = duplicateRows.find(hasStoredFile);
  if (duplicate) {
    const duplicateExtension = `.${String(duplicate.file_type || "").toLowerCase()}`;
    if (indexableExtensions.has(duplicateExtension) && duplicate.status !== "processed") {
      try {
        processIndexableUpload(db, duplicate, storedPathFor(duplicate), readFileSync(storedPathFor(duplicate)));
      } catch {
        // Keep the original status: an exact duplicate must not create another row
        // merely because its prior indexing attempt failed.
      }
    }
    return toUpload(duplicate, { duplicate: true, duplicateOf: duplicate.id });
  }

  const id = `upload_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const storedName = `${id}${extension}`;
  const storedPath = storedPathFor({ stored_name: storedName });
  writeFileSync(storedPath, buffer);

  const record = {
    id,
    file_name: fileName,
    stored_name: storedName,
    mime_type: mimeType,
    size: buffer.length,
    file_type: extension.replace(".", ""),
    content_hash: contentHash,
    status: indexableExtensions.has(extension) ? "processing" : "uploaded",
    chunk_count: 0,
    created_at: new Date().toISOString()
  };
  db
    .prepare(
      `INSERT INTO knowledge_documents
         (id, file_name, stored_name, mime_type, size, file_type, content_hash, status, chunk_count, created_at)
       VALUES
         (@id, @file_name, @stored_name, @mime_type, @size, @file_type, @content_hash, @status, @chunk_count, @created_at)`
    )
    .run(record);

  if (indexableExtensions.has(extension)) {
    try {
      processIndexableUpload(db, record, storedPath, buffer);
    } catch (error) {
      db.prepare(
        "UPDATE knowledge_documents SET status = 'failed', chunk_count = 0 WHERE id = ?"
      ).run(id);
      error.statusCode ||= 422;
      error.code ||= "KNOWLEDGE_INDEX_FAILED";
      throw error;
    }
  }

  return toUpload(record);
}

export function listUploads() {
  const db = getDb();
  backfillContentHashes(db);
  const { rows } = deduplicateRows(
    db
      .prepare("SELECT * FROM knowledge_documents ORDER BY created_at DESC, rowid DESC")
      .all()
  );
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(toUpload);
}

export function getUploadPreview(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Uploaded document not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_NOT_FOUND";
    throw error;
  }

  const extension = `.${String(row.file_type || "").toLowerCase()}`;
  const base = {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    size: row.size
  };
  if (!previewableExtensions.has(extension)) {
    return { ...base, previewable: false, truncated: false, content: "" };
  }

  const storedPath = storedPathFor(row);
  if (!existsSync(storedPath)) {
    const error = new Error("Uploaded source file not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_SOURCE_FILE_NOT_FOUND";
    throw error;
  }

  const text = extension === ".docx" ? extractDocxText(storedPath) : readFileSync(storedPath, "utf8");
  return {
    ...base,
    previewable: true,
    truncated: text.length > previewCharacterLimit,
    content: text.slice(0, previewCharacterLimit)
  };
}

/**
 * Re-process document uploads after a knowledge-base rebuild or recovery.
 * Binary uploads remain stored and are reported as skipped until a parser is
 * supported for their file type.
 */
export function reindexUploads() {
  const db = getDb();
  backfillContentHashes(db);
  const allUploads = db.prepare("SELECT * FROM knowledge_documents ORDER BY created_at ASC, rowid ASC").all();
  const { rows, duplicateIds } = deduplicateRows(allUploads);
  const uploads = rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  removeIndexedKnowledgeDocuments(duplicateIds);
  const result = { processed: 0, failed: 0, skipped: 0, duplicates: duplicateIds.length };

  for (const upload of uploads) {
    const extension = `.${String(upload.file_type || "").toLowerCase()}`;
    if (!indexableExtensions.has(extension)) {
      result.skipped += 1;
      continue;
    }

    try {
      const storedPath = storedPathFor(upload);
      if (!existsSync(storedPath)) {
        const error = new Error(`Uploaded source file not found: ${upload.file_name}`);
        error.code = "UPLOAD_SOURCE_FILE_NOT_FOUND";
        throw error;
      }

      processIndexableUpload(db, upload, storedPath, readFileSync(storedPath));
      result.processed += 1;
    } catch {
      db.prepare(
        "UPDATE knowledge_documents SET status = 'failed', chunk_count = 0 WHERE id = ?"
      ).run(upload.id);
      result.failed += 1;
    }
  }

  return result;
}
