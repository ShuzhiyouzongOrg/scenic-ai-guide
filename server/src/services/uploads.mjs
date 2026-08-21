/**
 * @fileoverview 知识文档上传、内容去重、文本索引、预览、下载与批量重建服务。
 *
 * 文件字节写入上传目录，元数据和处理状态保存在 `knowledge_documents` 表。
 *
 * @typedef {object} KnowledgeUpload
 * @property {string} id 上传 ID。
 * @property {string} fileName 原始文件名。
 * @property {string} storedName 服务端文件名。
 * @property {string} mimeType 媒体类型。
 * @property {number} size 字节数。
 * @property {string} fileType 扩展名，不含点号。
 * @property {"processing"|"processed"|"uploaded"|"failed"} status 处理状态。
 * @property {number} chunkCount 生成的知识分块数。
 * @property {string} createdAt 创建时间。
 */
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

/** @type {Set<string>} 接受上传的文件扩展名。 */
const allowedExtensions = new Set([".docx", ".xlsx", ".txt", ".md", ".pdf"]);
/** @type {Set<string>} 当前能够提取文本并写入知识索引的扩展名。 */
const indexableExtensions = new Set([".docx", ".txt", ".md"]);
/** @type {Set<string>} 当前能够生成文本预览的扩展名。 */
const previewableExtensions = new Set([".docx", ".txt", ".md"]);
/** @type {number} 文本预览允许返回的最大字符数。 */
const previewCharacterLimit = 100_000;

/**
 * 计算上传内容的 SHA-256 十六进制摘要。
 * @private
 * @param {Buffer} buffer 文件内容。
 * @returns {string} 64 位十六进制摘要。
 */
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * 将数据库中的存储文件名解析为上传目录内的安全绝对路径。
 * @private
 * @param {{stored_name?: *}} row 上传数据库行。
 * @returns {string} 上传目录内的绝对路径。
 * @throws {Error & {statusCode: 400, code: "INVALID_UPLOAD_PATH"}} 路径逃逸上传目录时抛出。
 */
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

/**
 * 为旧版无内容摘要的记录尽力回填 SHA-256；单条损坏记录不会阻止其余列表加载。
 * @private
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @returns {void}
 * @throws {Error} 初始查询或更新语句准备失败时透传数据库异常。
 */
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

/**
 * 安全判断上传记录对应的文件是否仍存在。
 * @private
 * @param {Record<string, *>} row 上传数据库行。
 * @returns {boolean} 路径合法且文件存在时为 `true`。
 */
function hasStoredFile(row) {
  try {
    return existsSync(storedPathFor(row));
  } catch {
    return false;
  }
}

/**
 * 将处理状态映射为去重选择优先级。
 * @private
 * @param {*} status 处理状态。
 * @returns {number} 数值优先级，未知状态为 `0`。
 */
function statusRank(status) {
  return { processed: 4, uploaded: 3, processing: 2, failed: 1 }[status] || 0;
}

/**
 * 按内容摘要去重，优先保留处理状态更高或时间更新的记录。
 * @private
 * @param {Array<Record<string, *>>} rows 上传数据库行。
 * @returns {{rows: Array<Record<string, *>>, duplicateIds: string[]}} 保留记录和重复记录 ID。
 */
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

/**
 * 将上传数据库行转换为 API 对象，并合并附加字段。
 * @private
 * @param {Record<string, *>} row 上传数据库行。
 * @param {Record<string, *>} [extra={}] 附加响应字段。
 * @returns {KnowledgeUpload & Record<string, *>} 上传对象。
 */
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

/**
 * 提取可索引文件的文本、写入知识索引并更新处理状态。
 * @private
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @param {Record<string, *>} row 可变的上传数据库行。
 * @param {string} storedPath 文件绝对路径。
 * @param {Buffer} buffer 文件内容。
 * @returns {void}
 * @throws {Error} 文本提取、知识索引或数据库更新失败时透传异常。
 */
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

/**
 * 保存上传文件，按内容摘要复用重复记录，并立即索引支持的文本格式。
 * @param {{fileName: string, mimeType?: string, contentBase64?: string}} input 上传输入。
 * @returns {KnowledgeUpload & {duplicate?: boolean, duplicateOf?: string}} 上传结果；命中重复内容时带去重字段。
 * @throws {Error & {statusCode: 400, code: "UPLOAD_FILE_NAME_REQUIRED"|"UNSUPPORTED_UPLOAD_TYPE"|"INVALID_UPLOAD_PATH"}} 文件名、类型或存储路径无效时抛出。
 * @throws {Error & {statusCode: 422, code: "KNOWLEDGE_INDEX_FAILED"}|Error} 索引、文件写入或数据库写入失败时抛出。
 * @example
 * const upload = createUpload({ fileName: "guide.md", mimeType: "text/markdown", contentBase64 });
 */
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

/**
 * 列出按内容去重后的上传记录。
 * @returns {KnowledgeUpload[]} 按创建时间降序排列的上传列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const uploads = listUploads();
 */
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

/**
 * 获取上传元数据和原始文件字节。
 * @param {string} id 上传 ID。
 * @returns {KnowledgeUpload & {buffer: Buffer}} 上传信息和文件内容。
 * @throws {Error & {statusCode: 404, code: "UPLOAD_NOT_FOUND"|"UPLOAD_SOURCE_FILE_NOT_FOUND"}} 记录或文件不存在时抛出。
 * @throws {Error & {statusCode: 400, code: "INVALID_UPLOAD_PATH"}|Error} 路径非法、数据库或文件读取失败时抛出。
 * @example
 * const { buffer, mimeType } = getUploadContent("upload-1");
 */
export function getUploadContent(id) {
  const row = getDb().prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Uploaded document not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_NOT_FOUND";
    throw error;
  }

  const storedPath = storedPathFor(row);
  if (!existsSync(storedPath)) {
    const error = new Error("Uploaded source file not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_SOURCE_FILE_NOT_FOUND";
    throw error;
  }

  return {
    ...toUpload(row),
    buffer: readFileSync(storedPath)
  };
}

/**
 * 获取支持格式的文本预览，最多返回十万字符。
 * @param {string} id 上传 ID。
 * @returns {{id: string, fileName: string, fileType: string, mimeType: string, size: number, previewable: boolean, truncated: boolean, content: string}} 预览信息。
 * @throws {Error & {statusCode: 404, code: "UPLOAD_NOT_FOUND"|"UPLOAD_SOURCE_FILE_NOT_FOUND"}} 记录或源文件不存在时抛出。
 * @throws {Error} DOCX 解析、数据库或文件读取失败时透传异常。
 * @example
 * const preview = getUploadPreview("upload-1");
 */
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
 * 在知识库重建或恢复后重新处理全部文档上传。
 * 暂不支持解析的二进制格式继续保留，并计入 `skipped`。
 * 单个文件失败会标记为 `failed`，但不会中断其余文件处理。
 * @returns {{processed: number, failed: number, skipped: number, duplicates: number}} 重建统计。
 * @throws {Error} 初始数据库查询、去重索引清理或公共数据库操作失败时透传异常。
 * @example
 * const result = reindexUploads();
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
