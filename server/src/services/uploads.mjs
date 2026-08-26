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
 * @property {string} status 处理状态。
 * @property {number} chunkCount 生成的知识分块数。
 * @property {string} createdAt 创建时间。
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { config } from "../config.mjs";
import { getDb, syncKnowledgeSnapshot } from "../db/database.mjs";
import { extractDocxText } from "./docx.mjs";
import {
  activateKnowledgeVersion,
  getActiveKnowledgeVersion,
  indexKnowledgeChunksDocument,
  indexTextKnowledgeDocument,
  loadKnowledge,
  removeIndexedKnowledgeDocuments
} from "./knowledgeBuild.mjs";
import { extractPdfKnowledge, PDF_LIMITS } from "./pdfKnowledge.mjs";
import { extractXlsxKnowledge } from "./xlsxKnowledge.mjs";
import {
  documentTypeFor,
  normalizeAccessScope,
  normalizeKnowledgeScope,
  normalizeTenantId,
  sanitizeProcessingError
} from "./knowledgeMetadata.mjs";
import { buildDocumentParserConfig, isDocumentParserReady } from "./documentParser.mjs";
import { enqueueDocumentParserTask } from "./documentParserTasks.mjs";

/** @type {Set<string>} 接受上传的文件扩展名。 */
const allowedExtensions = new Set([".docx", ".xlsx", ".txt", ".md", ".pdf"]);
/** @type {Set<string>} 当前能够提取文本并写入知识索引的扩展名。 */
const indexableExtensions = new Set([".docx", ".txt", ".md", ".xlsx", ".pdf"]);
/** @type {Set<string>} 当前能够生成文本预览的扩展名。 */
const previewableExtensions = new Set([".docx", ".txt", ".md"]);
/** @type {number} 文本预览允许返回的最大字符数。 */
const previewCharacterLimit = 100_000;
/** @type {number} 上传文件允许写入磁盘的最大字节数。 */
const maxUploadBytes = 32 * 1024 * 1024;
/** @type {number} 单个文档本地提取、分块与索引的默认处理时限。 */
const defaultProcessingTimeoutMs = 30_000;
/** @type {ReadonlyMap<string, ReadonlySet<string>>} 扩展名允许的规范 MIME。 */
const allowedMimeTypes = new Map([
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".txt", new Set(["text/plain"])],
  [".md", new Set(["text/markdown", "text/x-markdown"])],
  [".pdf", new Set(["application/pdf"])]
]);
/** @type {Readonly<Record<string, number>>} Office ZIP 容器安全上限。 */
const officeArchiveLimits = Object.freeze({
  maxEntries: 4_096,
  maxUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 150
});

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
    .prepare("SELECT * FROM knowledge_documents WHERE stored_name IS NOT NULL AND (content_hash IS NULL OR content_hash = '')")
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
  return { processed: 5, indexing: 4, chunking: 3, extracting: 3, classified: 2, uploaded: 2, skipped: 1, needs_ocr: 1, failed: 1 }[status] || 0;
}

/**
 * 校验扩展名对应的最小文件签名，防止伪造扩展名进入解析器。
 * @private
 * @param {string} extension 小写扩展名。
 * @param {Buffer} buffer 文件字节。
 * @throws {Error & {statusCode: 422, code: "UPLOAD_SIGNATURE_INVALID"}} 签名不匹配时抛出。
 */
function validateUploadSignature(extension, buffer) {
  const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if ((extension === ".docx" || extension === ".xlsx") && !isZip) {
    const error = new Error("The uploaded Office file signature is invalid.");
    error.statusCode = 422;
    error.code = "UPLOAD_SIGNATURE_INVALID";
    throw error;
  }
  if (extension === ".pdf" && !isPdf) {
    const error = new Error("The uploaded PDF signature is invalid.");
    error.statusCode = 422;
    error.code = "UPLOAD_SIGNATURE_INVALID";
    throw error;
  }
  if (extension === ".docx" || extension === ".xlsx") {
    inspectOfficeArchive(extension, buffer);
  }
  if (extension === ".pdf") {
    inspectPdfSafety(buffer);
  }
}

/**
 * 校验声明 MIME 是否与文件扩展名严格一致。
 * @private
 * @param {string} extension 小写扩展名。
 * @param {*} mimeType 客户端声明的 MIME。
 * @returns {string} 去除参数并转为小写的规范 MIME。
 * @throws {Error & {statusCode: 422, code: "UPLOAD_MIME_MISMATCH"}} MIME 缺失或不匹配时抛出。
 */
function validateUploadMimeType(extension, mimeType) {
  const normalized = String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
  if (!allowedMimeTypes.get(extension)?.has(normalized)) {
    const error = new Error("The declared MIME type does not match the file extension.");
    error.statusCode = 422;
    error.code = "UPLOAD_MIME_MISMATCH";
    throw error;
  }
  return normalized;
}

/**
 * 在解析器运行前检查 Office ZIP 中央目录、资源上限和包类型。
 * @private
 * @param {".docx"|".xlsx"} extension Office 扩展名。
 * @param {Buffer} buffer Office ZIP 字节。
 * @returns {void}
 * @throws {Error & {statusCode: number, code: string}} ZIP 损坏、加密、越界、宏、外链或类型伪造时抛出。
 */
function inspectOfficeArchive(extension, buffer) {
  const prefix = extension === ".xlsx" ? "XLSX" : "DOCX";
  const directorySignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  let entries = 0;
  let totalUncompressed = 0;
  let packageMarkerFound = false;

  while ((offset = buffer.indexOf(directorySignature, offset)) !== -1) {
    if (offset + 46 > buffer.length) {
      throw uploadSecurityError(`${prefix}_ZIP_DIRECTORY_INVALID`, "The Office ZIP directory is truncated.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
    if (nextOffset > buffer.length) {
      throw uploadSecurityError(`${prefix}_ZIP_DIRECTORY_INVALID`, "The Office ZIP entry is truncated.");
    }

    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8")
      .replaceAll("\\", "/")
      .toLowerCase();
    const segments = fileName.split("/");
    if (fileName.startsWith("/") || /^[a-z]:\//u.test(fileName) || segments.includes("..")) {
      throw uploadSecurityError(`${prefix}_PATH_TRAVERSAL`, "The Office package contains an unsafe ZIP path.");
    }
    if ((flags & 0x0001) !== 0) {
      throw uploadSecurityError(`${prefix}_ARCHIVE_ENCRYPTED`, "Encrypted Office packages are not accepted.");
    }
    if (fileName.endsWith("vbaproject.bin") || fileName.includes("/macrosheets/")) {
      throw uploadSecurityError(`${prefix}_MACRO_REJECTED`, "Macro-enabled Office packages are not accepted.");
    }
    if (fileName.includes("/externallinks/")) {
      throw uploadSecurityError(`${prefix}_EXTERNAL_LINK_REJECTED`, "Office packages with external links are not accepted.");
    }

    entries += 1;
    totalUncompressed += uncompressedSize;
    if (entries > officeArchiveLimits.maxEntries || totalUncompressed > officeArchiveLimits.maxUncompressedBytes) {
      throw uploadSecurityError(`${prefix}_EXPANDED_SIZE_LIMIT`, "The expanded Office package exceeds the processing limit.", 413);
    }
    if (uncompressedSize > 1024 * 1024
      && uncompressedSize / Math.max(compressedSize, 1) > officeArchiveLimits.maxCompressionRatio) {
      throw uploadSecurityError(`${prefix}_COMPRESSION_RATIO_LIMIT`, "The Office package compression ratio is unsafe.");
    }

    if ((extension === ".xlsx" && fileName === "xl/workbook.xml")
      || (extension === ".docx" && fileName === "word/document.xml")) {
      packageMarkerFound = true;
    }
    offset = nextOffset;
  }

  if (entries === 0) {
    throw uploadSecurityError(`${prefix}_ZIP_DIRECTORY_INVALID`, "The Office ZIP directory is missing.");
  }
  if (!packageMarkerFound) {
    throw uploadSecurityError("UPLOAD_SIGNATURE_INVALID", "The Office package type does not match its extension.");
  }
}

/**
 * 在 PDF 文本提取前拒绝过大、加密或页数超限文件。
 * @private
 * @param {Buffer} buffer PDF 字节。
 * @returns {void}
 */
function inspectPdfSafety(buffer) {
  if (buffer.length > PDF_LIMITS.maxBytes) {
    throw uploadSecurityError("PDF_TOO_LARGE", "The PDF exceeds the processing size limit.", 413);
  }
  const source = buffer.toString("latin1");
  if (/\/Encrypt\b/u.test(source)) {
    throw uploadSecurityError("PDF_ENCRYPTED", "Encrypted PDFs require manual review before indexing.");
  }
  const pageCount = (source.match(/\/Type\s*\/Page(?!s)\b/gu) || []).length || 1;
  if (pageCount > PDF_LIMITS.maxPages) {
    throw uploadSecurityError("PDF_TOO_MANY_PAGES", "The PDF has too many pages.");
  }
}

/** @param {string} code 错误码。 @param {string} message 错误消息。 @param {number} [statusCode=422] HTTP 状态码。 @returns {Error & {code:string,statusCode:number}} */
function uploadSecurityError(code, message, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/** @returns {{expiresAt:number,timeoutMs:number}} 当前文档处理截止时间。 */
function createProcessingDeadline() {
  const configured = Number(process.env.DOCUMENT_PROCESSING_TIMEOUT_MS ?? defaultProcessingTimeoutMs);
  const timeoutMs = Number.isFinite(configured)
    ? Math.max(0, Math.min(120_000, Math.trunc(configured)))
    : defaultProcessingTimeoutMs;
  return { expiresAt: Date.now() + timeoutMs, timeoutMs };
}

/** @param {{expiresAt:number,timeoutMs:number}} deadline 截止时间。 @param {string} stage 当前处理阶段。 @returns {void} */
function assertProcessingDeadline(deadline, stage) {
  if (Date.now() < deadline.expiresAt) return;
  throw uploadSecurityError(
    "DOCUMENT_PROCESSING_TIMEOUT",
    `Document processing exceeded the ${deadline.timeoutMs} ms limit during ${stage}.`,
    504
  );
}

/** @param {Record<string, *>} row 上传记录。 @returns {boolean} 是否进入游客RAG。 */
function shouldIndexUpload(row) {
  const extension = `.${String(row.file_type || "").toLowerCase()}`;
  return indexableExtensions.has(extension)
    && normalizeKnowledgeScope(row.knowledge_scope, row.file_name) === "visitor_qa"
    && Number(row.enabled ?? 1) !== 0;
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
    processingStage: row.processing_stage || row.status,
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    attemptCount: row.attempt_count || 0,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    knowledgeScope: row.knowledge_scope || normalizeKnowledgeScope(undefined, row.file_name),
    accessScope: row.access_scope || normalizeAccessScope(undefined, row.knowledge_scope),
    tenantId: row.tenant_id || "default",
    scenicArea: row.scenic_area || "",
    language: row.language || "und",
    documentType: row.document_type || documentTypeFor(row.file_type),
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    enabled: Number(row.enabled ?? 1) !== 0,
    indexVersion: row.index_version || null,
    chunkCount: row.chunk_count,
    updatedAt: row.finished_at || row.started_at || row.created_at,
    createdAt: row.created_at,
    ...extra
  };
}

/**
 * 提取可索引文件的文本或结构化分块、写入知识索引并更新处理状态。
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
  const deadline = createProcessingDeadline();
  const metadata = {
    knowledgeScope: normalizeKnowledgeScope(row.knowledge_scope, row.file_name),
    accessScope: normalizeAccessScope(row.access_scope, row.knowledge_scope),
    tenantId: normalizeTenantId(row.tenant_id),
    scenicArea: row.scenic_area || "",
    language: row.language || undefined,
    documentType: row.document_type || documentTypeFor(row.file_type),
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    enabled: Number(row.enabled ?? 1) !== 0,
    contentHash: row.content_hash || null
  };
  const startedAt = new Date().toISOString();
  updateProcessingState(db, row.id, "extracting", { errorCode: null, errorMessage: null, startedAt });
  assertProcessingDeadline(deadline, "extraction");
  row.attempt_count = Number(row.attempt_count || 0) + 1;
  row.started_at = startedAt;
  let document;
  if (extension === ".xlsx") {
    const extracted = extractXlsxKnowledge({
      buffer,
      documentId: row.id,
      fileName: row.file_name,
      ...metadata
    });
    assertProcessingDeadline(deadline, "XLSX extraction");
    updateProcessingState(db, row.id, "chunking");
    document = indexKnowledgeChunksDocument({
      documentId: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      chunks: extracted.chunks,
      metadata
    });
    assertProcessingDeadline(deadline, "XLSX indexing");
    row.parser_metadata = JSON.stringify({ sheets: extracted.sheets, skippedSheets: extracted.skippedSheets });
  } else if (extension === ".pdf") {
    const extracted = extractPdfKnowledge({
      buffer,
      documentId: row.id,
      fileName: row.file_name,
      ...metadata
    });
    assertProcessingDeadline(deadline, "PDF extraction");
    if (extracted.needsOcr) {
      const parserConfig = buildDocumentParserConfig();
      if (isDocumentParserReady(parserConfig)) {
        const task = enqueueDocumentParserTask({
          documentId: row.id,
          contentHash: row.content_hash,
          fileName: row.file_name,
          mimeType: row.mime_type
        });
        row.parser_metadata = JSON.stringify({
          pageCount: extracted.pageCount,
          parser: extracted.parser,
          cloudParser: parserConfig.provider,
          taskId: task.id
        });
        updateProcessingState(db, row.id, "needs_ocr", {
          errorCode: "PDF_OCR_QUEUED",
          errorMessage: "The PDF is queued for external OCR and has not entered the active index."
        });
        db.prepare("UPDATE knowledge_documents SET metadata = ? WHERE id = ?")
          .run(row.parser_metadata, row.id);
        row.status = "needs_ocr";
        row.processing_stage = "needs_ocr";
        row.error_code = "PDF_OCR_QUEUED";
        row.error_message = "The PDF is queued for external OCR and has not entered the active index.";
        return { queued: true, taskId: task.id };
      }
      const error = new Error("The PDF requires OCR before it can enter the knowledge index.");
      error.statusCode = 422;
      error.code = "PDF_NEEDS_OCR";
      error.pageCount = extracted.pageCount;
      throw error;
    }
    updateProcessingState(db, row.id, "chunking");
    document = indexKnowledgeChunksDocument({
      documentId: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      chunks: extracted.chunks,
      metadata
    });
    assertProcessingDeadline(deadline, "PDF indexing");
    row.parser_metadata = JSON.stringify({ pageCount: extracted.pageCount, parser: extracted.parser });
  } else {
    const text = extension === ".docx" ? extractDocxText(storedPath) : buffer.toString("utf8");
    assertProcessingDeadline(deadline, `${extension.slice(1).toUpperCase()} extraction`);
    updateProcessingState(db, row.id, "chunking");
    document = indexTextKnowledgeDocument({
      documentId: row.id,
      fileName: row.file_name,
      text,
      fileType: row.file_type,
      metadata
    });
    assertProcessingDeadline(deadline, `${extension.slice(1).toUpperCase()} indexing`);
  }
  updateProcessingState(db, row.id, "processed", {
    chunkCount: document.chunkCount,
    indexVersion: document.indexVersion,
    finishedAt: new Date().toISOString()
  });
  db.prepare(
    "UPDATE knowledge_documents SET metadata = ? WHERE id = ?"
  ).run(row.parser_metadata || null, row.id);
  row.status = "processed";
  row.processing_stage = "processed";
  row.chunk_count = document.chunkCount;
  row.index_version = document.indexVersion;
  row.finished_at = new Date().toISOString();
  assertProcessingDeadline(deadline, "snapshot synchronization");
  syncKnowledgeSnapshot(db, loadKnowledge());
  return document;
}

/**
 * 更新文档处理状态和可审计字段。
 * @private
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @param {string} id 文档 ID。
 * @param {string} stage 新状态。
 * @param {Record<string, *>} [extra={}] 额外字段。
 * @returns {void}
 */
function updateProcessingState(db, id, stage, extra = {}) {
  const startedAt = stage === "extracting" ? new Date().toISOString() : undefined;
  db.prepare(
    `UPDATE knowledge_documents
     SET status = @status,
         processing_stage = @status,
         attempt_count = CASE WHEN @status = 'extracting' THEN attempt_count + 1 ELSE attempt_count END,
         started_at = COALESCE(@started_at, started_at),
         finished_at = COALESCE(@finished_at, finished_at),
         error_code = COALESCE(@error_code, error_code),
         error_message = COALESCE(@error_message, error_message),
         chunk_count = COALESCE(@chunk_count, chunk_count),
         index_version = COALESCE(@index_version, index_version)
     WHERE id = @id`
  ).run({
    id,
    status: stage,
    started_at: extra.startedAt || startedAt || null,
    finished_at: extra.finishedAt || null,
    error_code: extra.errorCode === null ? "" : extra.errorCode || null,
    error_message: extra.errorMessage === null ? "" : extra.errorMessage || null,
    chunk_count: extra.chunkCount ?? null,
    index_version: extra.indexVersion || null
  });
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
export function createUpload({
  fileName,
  mimeType = "",
  contentBase64 = "",
  knowledgeScope,
  accessScope,
  tenantId = "default",
  scenicArea = "",
  language,
  validFrom = null,
  validTo = null,
  enabled = true
}) {
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

  const normalizedMimeType = validateUploadMimeType(extension, mimeType);
  const buffer = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.alloc(0);
  if (buffer.length > maxUploadBytes) {
    throw uploadSecurityError("UPLOAD_SIZE_LIMIT", "The uploaded document exceeds the size limit.", 413);
  }
  validateUploadSignature(extension, buffer);
  const contentHash = sha256(buffer);
  const db = getDb();
  backfillContentHashes(db);
  const normalizedScope = normalizeKnowledgeScope(knowledgeScope, fileName);
  const normalizedAccessScope = normalizeAccessScope(accessScope, normalizedScope);
  const normalizedTenantId = normalizeTenantId(tenantId);
  const canIndex = indexableExtensions.has(extension) && normalizedScope === "visitor_qa" && enabled !== false;

  const duplicateRows = db
    .prepare(
      `SELECT * FROM knowledge_documents
       WHERE content_hash = ? AND knowledge_scope = ? AND access_scope = ? AND tenant_id = ?
       ORDER BY
         CASE status WHEN 'processed' THEN 0 WHEN 'uploaded' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END,
         created_at DESC, rowid DESC`
    )
    .all(contentHash, normalizedScope, normalizedAccessScope, normalizedTenantId);
  const duplicate = duplicateRows.find(hasStoredFile);
  if (duplicate) {
    const duplicateExtension = `.${String(duplicate.file_type || "").toLowerCase()}`;
    if (indexableExtensions.has(duplicateExtension) && shouldIndexUpload(duplicate) && duplicate.status !== "processed") {
      if (asyncKnowledgeIndexingEnabled()) {
        enqueueKnowledgeIndexTask({
          documentId: duplicate.id,
          contentHash: duplicate.content_hash,
          fileName: duplicate.file_name,
          mimeType: duplicate.mime_type
        });
      } else {
        try {
          processIndexableUpload(db, duplicate, storedPathFor(duplicate), readFileSync(storedPathFor(duplicate)));
        } catch {
          // Keep the original status: an exact duplicate must not create another row
          // merely because its prior indexing attempt failed.
        }
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
    mime_type: normalizedMimeType,
    size: buffer.length,
    file_type: extension.replace(".", ""),
    content_hash: contentHash,
    status: canIndex ? "classified" : indexableExtensions.has(extension) ? "skipped" : "uploaded",
    processing_stage: canIndex ? "classified" : indexableExtensions.has(extension) ? "classified" : "uploaded",
    knowledge_scope: normalizedScope,
    access_scope: normalizedAccessScope,
    tenant_id: normalizedTenantId,
    scenic_area: scenicArea,
    language: language || "und",
    document_type: documentTypeFor(extension),
    valid_from: validFrom,
    valid_to: validTo,
    enabled: enabled === false ? 0 : 1,
    error_code: null,
    error_message: indexableExtensions.has(extension) && !canIndex ? "Document scope does not permit visitor QA indexing." : null,
    attempt_count: 0,
    started_at: null,
    finished_at: null,
    index_version: null,
    metadata: null,
    chunk_count: 0,
    created_at: new Date().toISOString()
  };
  db
    .prepare(
       `INSERT INTO knowledge_documents
         (id, file_name, stored_name, mime_type, size, file_type, content_hash, status, processing_stage,
          knowledge_scope, access_scope, tenant_id, scenic_area, language, document_type, valid_from, valid_to, enabled,
          error_code, error_message, attempt_count, started_at, finished_at, index_version, metadata, chunk_count, created_at)
       VALUES
         (@id, @file_name, @stored_name, @mime_type, @size, @file_type, @content_hash, @status, @processing_stage,
          @knowledge_scope, @access_scope, @tenant_id, @scenic_area, @language, @document_type, @valid_from, @valid_to, @enabled,
          @error_code, @error_message, @attempt_count, @started_at, @finished_at, @index_version, @metadata, @chunk_count, @created_at)`
    )
    .run(record);

  if (canIndex) {
    if (asyncKnowledgeIndexingEnabled()) {
      const task = enqueueKnowledgeIndexTask({
        documentId: record.id,
        contentHash: record.content_hash,
        fileName: record.file_name,
        mimeType: record.mime_type
      });
      record.metadata = JSON.stringify({ taskId: task.id, taskType: task.taskType });
      db.prepare("UPDATE knowledge_documents SET metadata = ? WHERE id = ?")
        .run(record.metadata, record.id);
      return toUpload(record, { taskId: task.id });
    }
    const previousIndexVersion = getActiveKnowledgeVersion();
    try {
      const indexed = processIndexableUpload(db, record, storedPath, buffer);
      if (indexed?.queued) {
        return toUpload(record);
      }
    } catch (error) {
      if (previousIndexVersion !== "unbuilt" && getActiveKnowledgeVersion() !== previousIndexVersion) {
        try {
          const restored = activateKnowledgeVersion(previousIndexVersion);
          syncKnowledgeSnapshot(db, restored);
        } catch {
          // Preserve the original processing error. A startup consistency check
          // can still detect and repair the snapshot if the database is unavailable.
        }
      }
      db.prepare(
        `UPDATE knowledge_documents
         SET status = @status, processing_stage = @status, chunk_count = 0,
             error_code = @error_code, error_message = @error_message,
             finished_at = @finished_at
         WHERE id = @id`
      ).run({
        id,
        status: error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed",
        error_code: error.code || "KNOWLEDGE_INDEX_FAILED",
        error_message: sanitizeProcessingError(error.message),
        finished_at: new Date().toISOString()
      });
      record.status = error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed";
      record.processing_stage = record.status;
      record.error_code = error.code || "KNOWLEDGE_INDEX_FAILED";
      record.error_message = sanitizeProcessingError(error.message);
      error.statusCode ||= 422;
      error.code ||= "KNOWLEDGE_INDEX_FAILED";
      throw error;
    }
  }

  return toUpload(record);
}

/**
 * 将普通解析、分块和索引工作加入幂等队列。
 * @param {{documentId:string,contentHash:string,fileName:string,mimeType?:string}} input 任务元数据。
 * @returns {object} 队列任务。
 */
export function enqueueKnowledgeIndexTask({ documentId, contentHash, fileName, mimeType = "" }) {
  if (!documentId || !contentHash || !fileName) {
    const error = new Error("Knowledge index task metadata is incomplete.");
    error.code = "KNOWLEDGE_INDEX_TASK_INVALID";
    error.statusCode = 422;
    throw error;
  }
  const db = getDb();
  const id = `knowledge_index_${documentId}_${String(contentHash).slice(0, 16)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO knowledge_processing_tasks
      (id, document_id, task_type, content_hash, file_name, mime_type, status,
       external_job_id, attempts, next_attempt_at, lease_until, last_error_code,
       last_error_message, result_metadata, created_at, updated_at)
     VALUES (?, ?, 'knowledge_index', ?, ?, ?, 'pending', NULL, 0, ?, NULL, NULL, NULL, NULL, ?, ?)`
  ).run(id, documentId, contentHash, fileName, mimeType, now, now, now);
  return toKnowledgeIndexTask(db.prepare("SELECT * FROM knowledge_processing_tasks WHERE id = ?").get(id));
}

/**
 * 执行一轮普通知识索引任务；默认每轮一个任务，适合低配置服务器定时 worker。
 * @param {{limit?:number,now?:number,maxAttempts?:number,leaseMs?:number}} [options={}] worker 配置。
 * @returns {Promise<{status:string,processed:number,succeeded:number,failed:number,waiting:number,skipped:number}>}
 */
export async function runKnowledgeIndexTasks(options = {}) {
  const db = getDb();
  const nowMs = Number(options.now || Date.now());
  const now = new Date(nowMs).toISOString();
  const limit = Math.max(1, Math.min(20, Number(options.limit) || 1));
  const maxAttempts = Math.max(1, Math.min(10, Number(options.maxAttempts || process.env.KNOWLEDGE_INDEX_MAX_ATTEMPTS || 3)));
  const leaseMs = Math.max(1_000, Number(options.leaseMs || process.env.KNOWLEDGE_INDEX_LEASE_MS || 60_000));
  const rows = db.prepare(
    `SELECT * FROM knowledge_processing_tasks
     WHERE task_type = 'knowledge_index' AND attempts < ? AND next_attempt_at <= ?
       AND (status = 'pending' OR (status = 'running' AND lease_until < ?))
     ORDER BY created_at ASC LIMIT ?`
  ).all(maxAttempts, now, now, limit);
  const result = { status: "ok", processed: 0, succeeded: 0, failed: 0, waiting: 0, skipped: 0 };
  for (const row of rows) {
    const leaseUntil = new Date(nowMs + leaseMs).toISOString();
    const claim = db.prepare(
      `UPDATE knowledge_processing_tasks
       SET status = 'running', attempts = attempts + 1, lease_until = ?, updated_at = ?
       WHERE id = ? AND (status = 'pending' OR (status = 'running' AND lease_until < ?))`
    ).run(leaseUntil, now, row.id, now);
    if (!claim.changes) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const task = db.prepare("SELECT * FROM knowledge_processing_tasks WHERE id = ?").get(row.id);
    const outcome = processKnowledgeIndexTask(db, task, { nowMs, maxAttempts });
    result[outcome] += 1;
  }
  return result;
}

/** @param {import("better-sqlite3").Database} db 数据库。 @param {object} task 任务。 @param {object} options 选项。 @returns {"succeeded"|"failed"|"waiting"} */
function processKnowledgeIndexTask(db, task, { nowMs, maxAttempts }) {
  const previousVersion = getActiveKnowledgeVersion();
  try {
    const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(task.document_id);
    if (!row || row.content_hash !== task.content_hash) {
      const error = new Error("The source document changed before indexing.");
      error.code = "KNOWLEDGE_INDEX_SOURCE_CHANGED";
      error.retryable = false;
      throw error;
    }
    const storedPath = storedPathFor(row);
    if (!existsSync(storedPath)) {
      const error = new Error("The uploaded source file is missing.");
      error.code = "UPLOAD_SOURCE_FILE_NOT_FOUND";
      error.retryable = false;
      throw error;
    }
    const indexed = processIndexableUpload(db, row, storedPath, readFileSync(storedPath));
    markKnowledgeIndexTask(db, task.id, "succeeded", {
      indexVersion: row.index_version || getActiveKnowledgeVersion(),
      delegatedTaskId: indexed?.taskId || null
    });
    return "succeeded";
  } catch (error) {
    if (previousVersion !== "unbuilt" && getActiveKnowledgeVersion() !== previousVersion) {
      try {
        const restored = activateKnowledgeVersion(previousVersion);
        syncKnowledgeSnapshot(db, restored);
      } catch {
        // Preserve the task failure and let the consistency verifier report recovery issues.
      }
    }
    const code = error.code || "KNOWLEDGE_INDEX_TASK_FAILED";
    const message = sanitizeProcessingError(error.message);
    if (error.retryable === false || Number(task.attempts) >= maxAttempts) {
      markKnowledgeIndexTask(db, task.id, "failed", null, code, message);
      db.prepare(
        `UPDATE knowledge_documents SET status = 'failed', processing_stage = 'failed',
         error_code = ?, error_message = ?, finished_at = ? WHERE id = ?`
      ).run(code, message, new Date().toISOString(), task.document_id);
      return "failed";
    }
    const nextAt = new Date(nowMs + Math.min(60_000, 1_000 * (2 ** Math.max(0, Number(task.attempts) - 1)))).toISOString();
    markKnowledgeIndexTask(db, task.id, "pending", null, code, message, nextAt);
    return "waiting";
  }
}

/** @param {import("better-sqlite3").Database} db 数据库。 @param {string} id ID。 @param {string} status 状态。 @param {object|null} metadata 元数据。 @param {string|null} code 错误码。 @param {string|null} message 消息。 @param {string|null} nextAt 下次时间。 @returns {void} */
function markKnowledgeIndexTask(db, id, status, metadata = null, code = null, message = null, nextAt = null) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE knowledge_processing_tasks SET status = ?, lease_until = NULL,
     next_attempt_at = ?, last_error_code = ?, last_error_message = ?,
     result_metadata = COALESCE(?, result_metadata), updated_at = ? WHERE id = ?`
  ).run(status, nextAt || now, code, message, metadata ? JSON.stringify(metadata) : null, now, id);
}

/** @param {object} row 数据库任务。 @returns {object} API 任务。 */
function toKnowledgeIndexTask(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    taskType: row.task_type,
    contentHash: row.content_hash,
    fileName: row.file_name,
    mimeType: row.mime_type,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseUntil: row.lease_until,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** @returns {boolean} 是否启用上传快速返回的普通索引队列。 */
function asyncKnowledgeIndexingEnabled() {
  return String(process.env.KNOWLEDGE_ASYNC_INDEXING_ENABLED || "false").toLowerCase() === "true";
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
    .prepare("SELECT * FROM knowledge_documents WHERE stored_name IS NOT NULL ORDER BY created_at DESC, rowid DESC")
      .all()
  );
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(toUpload);
}

/**
 * 重新处理单个游客问答文档。
 *
 * 已完成文档在新解析成功前仍保留于当前快照；失败时只更新该文档的错误状态，
 * 不切换活动知识版本。适合管理端对 `failed` 或 `needs_ocr` 文档执行重试。
 * @param {string} id 上传文档 ID。
 * @returns {KnowledgeUpload} 最新文档状态。
 * @throws {Error & {statusCode: number, code: string}} 文档不存在、范围不允许、任务正在运行或解析失败时抛出。
 */
export function reprocessUpload(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Uploaded document not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_NOT_FOUND";
    throw error;
  }
  if (!shouldIndexUpload(row)) {
    const error = new Error("Only enabled visitor QA documents can be reprocessed.");
    error.statusCode = 409;
    error.code = "UPLOAD_REPROCESS_SCOPE_BLOCKED";
    throw error;
  }

  const runningTask = db.prepare(
    `SELECT id FROM knowledge_processing_tasks
     WHERE document_id = ? AND task_type IN ('document_parser', 'knowledge_index')
       AND status IN ('pending', 'running', 'waiting')
     LIMIT 1`
  ).get(id);
  if (runningTask) {
    const error = new Error("This document already has a pending or running processing task.");
    error.statusCode = 409;
    error.code = "UPLOAD_REPROCESS_IN_PROGRESS";
    throw error;
  }

  const storedPath = storedPathFor(row);
  if (!existsSync(storedPath)) {
    const error = new Error("Uploaded source file not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_SOURCE_FILE_NOT_FOUND";
    throw error;
  }

  const previousVersion = getActiveKnowledgeVersion();
  db.prepare(
    `DELETE FROM knowledge_processing_tasks
     WHERE document_id = ? AND task_type IN ('document_parser', 'knowledge_index')`
  ).run(id);
  db.prepare(
    `UPDATE knowledge_documents
     SET status = 'classified', processing_stage = 'classified', error_code = NULL,
         error_message = NULL, finished_at = NULL
     WHERE id = ?`
  ).run(id);

  try {
    if (asyncKnowledgeIndexingEnabled()) {
      const task = enqueueKnowledgeIndexTask({
        documentId: row.id,
        contentHash: row.content_hash,
        fileName: row.file_name,
        mimeType: row.mime_type
      });
      return {
        ...(listUploads().find((item) => item.id === id) || toUpload(row)),
        taskId: task.id
      };
    }
    processIndexableUpload(db, row, storedPath, readFileSync(storedPath));
    return listUploads().find((item) => item.id === id) || toUpload(row);
  } catch (error) {
    if (previousVersion !== "unbuilt" && getActiveKnowledgeVersion() !== previousVersion) {
      const restored = activateKnowledgeVersion(previousVersion);
      syncKnowledgeSnapshot(db, restored);
    }
    const status = error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed";
    db.prepare(
      `UPDATE knowledge_documents
       SET status = ?, processing_stage = ?, error_code = ?, error_message = ?, finished_at = ?
       WHERE id = ?`
    ).run(
      status,
      status,
      error.code || "KNOWLEDGE_INDEX_FAILED",
      sanitizeProcessingError(error.message),
      new Date().toISOString(),
      id
    );
    error.statusCode ||= 422;
    throw error;
  }
}

/**
 * 切换上传文档是否参与游客问答知识索引。
 *
 * 禁用只移除当前活动快照中的该文档，源文件、元数据和失败记录继续保留，便于之后重新启用。
 * 重新启用时仅重建当前文档，不触发全量知识库重建。
 * @param {string} id 上传文档 ID。
 * @param {boolean} enabled 是否启用。
 * @returns {KnowledgeUpload} 最新文档状态。
 * @throws {Error & {statusCode: number, code: string}} 文档不存在、参数非法、源文件缺失或重建失败时抛出。
 */
export function setUploadEnabled(id, enabled) {
  if (typeof enabled !== "boolean") {
    const error = new Error("The enabled field must be a boolean.");
    error.statusCode = 400;
    error.code = "UPLOAD_ENABLED_INVALID";
    throw error;
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Uploaded document not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_NOT_FOUND";
    throw error;
  }

  const currentlyEnabled = Number(row.enabled ?? 1) !== 0;
  if (currentlyEnabled === enabled) {
    return listUploads().find((item) => item.id === id) || toUpload(row);
  }

  db.prepare("UPDATE knowledge_documents SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  if (!enabled) {
    removeIndexedKnowledgeDocuments([id]);
    syncKnowledgeSnapshot(db, loadKnowledge());
    return listUploads().find((item) => item.id === id) || toUpload({ ...row, enabled: 0 });
  }

  try {
    const updated = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
    if (shouldIndexUpload(updated)) {
      return reprocessUpload(id);
    }
    return listUploads().find((item) => item.id === id) || toUpload(updated);
  } catch (error) {
    db.prepare(
      "UPDATE knowledge_documents SET enabled = 0, status = ?, processing_stage = ?, error_code = ?, error_message = ?, finished_at = ? WHERE id = ?"
    ).run(
      error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed",
      error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed",
      error.code || "KNOWLEDGE_ENABLE_FAILED",
      sanitizeProcessingError(error.message),
      new Date().toISOString(),
      id
    );
    removeIndexedKnowledgeDocuments([id]);
    syncKnowledgeSnapshot(db, loadKnowledge());
    throw error;
  }
}

/**
 * 获取文档当前活动索引中的引用入口。
 *
 * 返回页码、工作表、单元格范围和稳定 citation ID，供管理端核对文档是否真正进入 RAG。
 * @param {string} id 上传文档 ID。
 * @returns {{document: KnowledgeUpload, indexVersion: string|null, citations: Array<Record<string, *>>}} 引用摘要。
 * @throws {Error & {statusCode: 404, code: "UPLOAD_NOT_FOUND"}} 文档不存在时抛出。
 */
export function listUploadCitations(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Uploaded document not found.");
    error.statusCode = 404;
    error.code = "UPLOAD_NOT_FOUND";
    throw error;
  }

  const active = db.prepare(
    "SELECT index_version FROM knowledge_index_versions WHERE active = 1 LIMIT 1"
  ).get();
  const indexVersion = active?.index_version || null;
  if (!indexVersion) {
    return { document: toUpload(row), indexVersion: null, citations: [] };
  }

  const citations = db.prepare(
    `SELECT id, document_id, title, section_path, content, page, sheet_name, cell_range,
            row_start, row_end, knowledge_scope, scenic_area, language, document_type,
            index_version
     FROM knowledge_chunks
     WHERE document_id = ? AND index_version = ?
     ORDER BY id ASC`
  ).all(id, indexVersion).map((chunk) => ({
    citationId: `C-${chunk.id.replace(`${indexVersion}:`, "")}`,
    chunkId: chunk.id,
    documentId: chunk.document_id,
    sectionTitle: chunk.title || chunk.section_path || "",
    quote: String(chunk.content || "").replace(/\s+/gu, " ").trim().slice(0, 240),
    page: chunk.page || null,
    sheetName: chunk.sheet_name || null,
    range: chunk.cell_range || null,
    rowStart: chunk.row_start || null,
    rowEnd: chunk.row_end || null,
    knowledgeScope: chunk.knowledge_scope || "visitor_qa",
    scenicArea: chunk.scenic_area || "",
    language: chunk.language || "und",
    documentType: chunk.document_type || null,
    indexVersion: chunk.index_version
  }));

  return { document: toUpload(row), indexVersion, citations };
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
  const allUploads = db
    .prepare("SELECT * FROM knowledge_documents WHERE stored_name IS NOT NULL ORDER BY created_at ASC, rowid ASC")
    .all();
  const { rows, duplicateIds } = deduplicateRows(allUploads);
  const uploads = rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  removeIndexedKnowledgeDocuments(duplicateIds);
  const result = { processed: 0, failed: 0, skipped: 0, queued: 0, duplicates: duplicateIds.length };

  for (const upload of uploads) {
    const extension = `.${String(upload.file_type || "").toLowerCase()}`;
    if (!shouldIndexUpload(upload)) {
      if (indexableExtensions.has(extension)) {
        db.prepare(
          `UPDATE knowledge_documents
           SET status = 'skipped', processing_stage = 'classified',
               error_code = 'KNOWLEDGE_SCOPE_BLOCKED',
               error_message = 'Document scope does not permit visitor QA indexing.'
           WHERE id = ?`
        ).run(upload.id);
      }
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

      const indexed = processIndexableUpload(db, upload, storedPath, readFileSync(storedPath));
      if (indexed?.queued) {
        result.queued += 1;
      } else {
        result.processed += 1;
      }
    } catch (error) {
      db.prepare(
        `UPDATE knowledge_documents
         SET status = ?, processing_stage = ?, chunk_count = 0,
             error_code = ?, error_message = ?, finished_at = ?
         WHERE id = ?`
      ).run(
        error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed",
        error.code === "PDF_NEEDS_OCR" ? "needs_ocr" : "failed",
        error.code || "KNOWLEDGE_INDEX_FAILED",
        sanitizeProcessingError(error.message),
        new Date().toISOString(),
        upload.id
      );
      result.failed += 1;
    }
  }

  return result;
}
