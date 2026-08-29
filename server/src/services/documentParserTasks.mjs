/**
 * @fileoverview 文档解析任务的 SQLite 持久化与单步 worker。
 *
 * @description worker 每次只提交或查询一个短步骤，不在上传 HTTP 请求中长时间轮询；进程重启后，
 * `pending/waiting/running` 任务可继续执行。外部解析结果成功后才切换知识快照。
 */

/**
 * @typedef {object} DocumentParserTaskInput
 * @description 文档解析任务的幂等入队元数据。
 * @property {string} documentId 知识文档 ID。
 * @property {string} contentHash 文档内容哈希。
 * @property {string} fileName 原始文件名。
 * @property {string} [mimeType] MIME 类型。
 */

/**
 * @typedef {object} DocumentParserTask
 * @description 文档解析任务的管理端结构。
 * @property {string} id 解析任务 ID。
 * @property {string} documentId 知识文档 ID。
 * @property {string} taskType 任务类型。
 * @property {string} contentHash 文档内容哈希。
 * @property {string} fileName 原始文件名。
 * @property {string} mimeType MIME 类型。
 * @property {string} status 当前任务状态。
 * @property {string|null} externalJobId 云端任务 ID。
 * @property {number} attempts 已尝试次数。
 * @property {string} nextAttemptAt 下次执行时间。
 * @property {string|null} leaseUntil 当前租约到期时间。
 * @property {string|null} lastErrorCode 最近错误码。
 * @property {string|null} lastErrorMessage 最近脱敏错误信息。
 * @property {object|null} resultMetadata 解析结果元数据。
 * @property {string} createdAt ISO 8601 创建时间。
 * @property {string} updatedAt ISO 8601 更新时间。
 */

/**
 * @typedef {object} DocumentParserWorkerOptions
 * @description 单轮文档解析 worker 的可注入配置。
 * @property {object} [config] 文档解析配置。
 * @property {object} [client] 可注入的云解析客户端。
 * @property {number} [limit] 单轮最大处理任务数。
 * @property {number} [now] 可注入的 Unix 毫秒时间戳。
 */

/**
 * @typedef {object} DocumentParserWorkerResult
 * @description 单轮文档解析 worker 的执行统计。
 * @property {"disabled"|"not_configured"|"not_ready"|"ok"} status worker 状态。
 * @property {string} [errorCode] 客户端初始化失败时的稳定错误码。
 * @property {number} processed 已抢占任务数。
 * @property {number} waiting 等待或重试任务数。
 * @property {number} succeeded 成功任务数。
 * @property {number} failed 失败任务数。
 * @property {number} skipped 因并发抢占而跳过的任务数。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { config } from "../config.mjs";
import { getDb, syncKnowledgeSnapshot } from "../db/database.mjs";
import {
  activateKnowledgeVersion,
  getActiveKnowledgeVersion,
  indexTextKnowledgeDocument,
  loadKnowledge
} from "./knowledgeBuild.mjs";
import {
  buildDocumentParserConfig,
  createAliyunDocMindClient,
  getDocumentParsingResult,
  isDocumentParserReady,
  queryDocumentParsingStatus,
  submitDocumentParsing
} from "./documentParser.mjs";
import { documentTypeFor, sanitizeProcessingError } from "./knowledgeMetadata.mjs";

/**
 * @description 把文档加入幂等解析队列。
 * @param {DocumentParserTaskInput} input 文档任务元数据。
 * @returns {DocumentParserTask} 已存在或新建的任务。
 * @throws {Error & {code: "DOCUMENT_PARSER_TASK_INVALID", statusCode: 422}} 必要任务元数据缺失时抛出。
 * @throws {Error} 数据库初始化、写入或查询失败时透传异常。
 * @example
 * const task = enqueueDocumentParserTask({
 *   documentId: "doc-1",
 *   contentHash: "sha256-value",
 *   fileName: "guide.pdf"
 * });
 */
export function enqueueDocumentParserTask({ documentId, contentHash, fileName, mimeType = "application/pdf" }) {
  if (!documentId || !contentHash || !fileName) {
    const error = new Error("Document parser task metadata is incomplete.");
    error.code = "DOCUMENT_PARSER_TASK_INVALID";
    error.statusCode = 422;
    throw error;
  }
  const db = getDb();
  const id = `docparser_${documentId}_${String(contentHash).slice(0, 16)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO knowledge_processing_tasks
      (id, document_id, task_type, content_hash, file_name, mime_type, status,
       external_job_id, attempts, next_attempt_at, lease_until, last_error_code,
       last_error_message, result_metadata, created_at, updated_at)
     VALUES (?, ?, 'document_parser', ?, ?, ?, 'pending', NULL, 0, ?, NULL, NULL, NULL, NULL, ?, ?)`
  ).run(id, documentId, contentHash, fileName, mimeType, now, now, now);
  return toTask(db.prepare("SELECT * FROM knowledge_processing_tasks WHERE id = ?").get(id));
}

/**
 * @description 列出文档解析任务，供管理端或运维检查使用。
 * @param {{status?: string, limit?: number}} [options={}] 过滤与数量限制。
 * @returns {DocumentParserTask[]} 任务列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const waitingTasks = listDocumentParserTasks({ status: "waiting", limit: 20 });
 */
export function listDocumentParserTasks({ status, limit = 50 } = {}) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = status
    ? db.prepare("SELECT * FROM knowledge_processing_tasks WHERE task_type = 'document_parser' AND status = ? ORDER BY created_at DESC LIMIT ?").all(status, safeLimit)
    : db.prepare("SELECT * FROM knowledge_processing_tasks WHERE task_type = 'document_parser' ORDER BY created_at DESC LIMIT ?").all(safeLimit);
  return rows.map(toTask);
}

/**
 * @description 执行一轮文档解析任务。
 *
 * 每个任务只做一次提交或状态查询；适合由 cron、systemd timer 或进程内定时器周期调用。
 * @param {DocumentParserWorkerOptions} [options={}] worker 选项。
 * @returns {Promise<DocumentParserWorkerResult>} 本轮统计。
 * @throws {Error} 数据库初始化或任务查询失败时透传异常；单个任务错误会转换为任务状态。
 * @example
 * const result = await runDocumentParserTasks({ limit: 1 });
 */
export async function runDocumentParserTasks(options = {}) {
  const parserConfig = options.config || buildDocumentParserConfig();
  if (!parserConfig.enabled) {
    return { status: "disabled", processed: 0, waiting: 0, succeeded: 0, failed: 0, skipped: 0 };
  }
  if (!isDocumentParserReady(parserConfig, { clientProvided: Boolean(options.client) })) {
    return { status: "not_configured", processed: 0, waiting: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const db = getDb();
  const nowMs = Number(options.now || Date.now());
  const now = new Date(nowMs).toISOString();
  const limit = Math.max(1, Math.min(20, Number(options.limit) || 1));
  const tasks = db.prepare(
    `SELECT * FROM knowledge_processing_tasks
     WHERE task_type = 'document_parser'
       AND attempts < ?
       AND next_attempt_at <= ?
       AND (status IN ('pending', 'waiting') OR (status = 'running' AND lease_until < ?))
     ORDER BY created_at ASC LIMIT ?`
  ).all(parserConfig.maxAttempts, now, now, limit);
  const result = { status: "ok", processed: 0, waiting: 0, succeeded: 0, failed: 0, skipped: 0 };
  if (tasks.length === 0) return result;
  let client = options.client;
  if (!client) {
    try {
      client = await createAliyunDocMindClient(parserConfig);
    } catch (error) {
      return { ...result, status: "not_ready", errorCode: error.code || "DOCUMENT_PARSER_NOT_READY" };
    }
  }

  for (const task of tasks) {
    const claimed = claimTask(db, task.id, parserConfig.leaseMs, now);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const outcome = await processTask({ db, task: claimed, parserConfig, client, nowMs });
    result[outcome] += 1;
  }
  return result;
}

/**
 * @description 执行单个文档解析任务的一次提交、轮询或入库步骤。
 * @param {object} input worker处理输入。
 * @returns {Promise<"waiting"|"succeeded"|"failed">} 任务结果。
 * @throws {Error} 失败状态或重试状态无法写入数据库时透传异常。
 */
async function processTask({ db, task, parserConfig, client, nowMs }) {
  try {
    const row = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(task.document_id);
    if (!row || row.content_hash !== task.content_hash) {
      markTaskFailed(db, task.id, "DOCUMENT_PARSER_SOURCE_CHANGED", "The source document changed before parsing.");
      return "failed";
    }
    const storedPath = storedPathFor(row);
    if (!existsSync(storedPath)) {
      markTaskFailed(db, task.id, "UPLOAD_SOURCE_FILE_NOT_FOUND", "The uploaded source file is missing.");
      return "failed";
    }

    if (!task.external_job_id) {
      const submission = await submitDocumentParsing({
        buffer: readFileSync(storedPath),
        fileName: row.file_name,
        mimeType: row.mime_type,
        config: parserConfig,
        client
      });
      setTaskWaiting(db, task.id, submission.jobId, nextAttemptAt(nowMs, parserConfig.pollIntervalMs), {
        provider: submission.provider
      });
      updateDocumentParserState(db, row.id, "needs_ocr", "PDF_OCR_SUBMITTED", "Cloud document parsing task submitted.");
      return "waiting";
    }

    const status = await queryDocumentParsingStatus({
      jobId: task.external_job_id,
      config: parserConfig,
      client
    });
    if (status.status === "queued" || status.status === "processing" || status.status === "unknown") {
      setTaskWaiting(db, task.id, task.external_job_id, nextAttemptAt(nowMs, parserConfig.pollIntervalMs), {
        progress: status.progress
      });
      return "waiting";
    }
    if (status.status === "failed") {
      markTaskFailed(db, task.id, "DOCUMENT_PARSER_JOB_FAILED", "The cloud document parser reported a failed task.");
      updateDocumentParserState(db, row.id, "failed", "DOCUMENT_PARSER_JOB_FAILED", "The cloud document parser reported a failed task.");
      return "failed";
    }

    const parsed = await getDocumentParsingResult({
      jobId: task.external_job_id,
      config: parserConfig,
      client
    });
    const previousVersion = getActiveKnowledgeVersion();
    try {
      const document = indexTextKnowledgeDocument({
        documentId: row.id,
        fileName: row.file_name,
        text: parsed.text,
        fileType: row.file_type,
        metadata: {
          knowledgeScope: row.knowledge_scope,
          scenicArea: row.scenic_area || "",
          language: row.language || undefined,
          documentType: row.document_type || documentTypeFor(row.file_type),
          validFrom: row.valid_from || null,
          validTo: row.valid_to || null,
          enabled: Number(row.enabled ?? 1) !== 0
        }
      });
      syncKnowledgeSnapshot(db, loadKnowledge());
      updateDocumentParserState(db, row.id, "processed", null, null, {
        chunkCount: document.chunkCount,
        indexVersion: document.indexVersion,
        metadata: JSON.stringify({
          parser: "aliyun_docmind",
          jobId: task.external_job_id,
          layoutCount: parsed.layoutCount
        })
      });
      markTaskSucceeded(db, task.id, { layoutCount: parsed.layoutCount });
      return "succeeded";
    } catch (error) {
      if (previousVersion !== "unbuilt" && getActiveKnowledgeVersion() !== previousVersion) {
        try {
          const restored = activateKnowledgeVersion(previousVersion);
          syncKnowledgeSnapshot(db, restored);
        } catch {
          // 保留原始失败原因，下一次一致性校验负责发现恢复异常。
        }
      }
      throw error;
    }
  } catch (error) {
    if (error?.retryable === false || task.attempts >= parserConfig.maxAttempts) {
      markTaskFailed(db, task.id, error.code || "DOCUMENT_PARSER_FAILED", sanitizeProcessingError(error.message));
      updateDocumentParserState(db, task.document_id, "failed", error.code || "DOCUMENT_PARSER_FAILED", sanitizeProcessingError(error.message));
      return "failed";
    }
    setTaskRetry(db, task.id, nextAttemptAt(nowMs, retryDelay(task.attempts)), error.code || "DOCUMENT_PARSER_RETRY", sanitizeProcessingError(error.message));
    return "waiting";
  }
}

/**
 * @description 通过数据库租约原子抢占一个可执行的文档解析任务。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 任务ID。
 * @param {number} leaseMs 租约时长。
 * @param {string} now 当前时间。
 * @returns {Record<string, *> | null} 抢占后的任务。
 */
function claimTask(db, id, leaseMs, now) {
  const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
  const changed = db.prepare(
    `UPDATE knowledge_processing_tasks
     SET status = 'running', attempts = attempts + 1, lease_until = ?, updated_at = ?
     WHERE id = ? AND (status IN ('pending', 'waiting') OR (status = 'running' AND lease_until < ?))`
  ).run(leaseUntil, now, id, now);
  return changed.changes ? db.prepare("SELECT * FROM knowledge_processing_tasks WHERE id = ?").get(id) : null;
}

/**
 * @description 将任务更新为等待外部解析结果的状态。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 任务ID。
 * @param {string} externalJobId 外部ID。
 * @param {string} nextAt 下次时间。
 * @param {object} metadata 元数据。
 * @returns {void} 无返回值。
 */
function setTaskWaiting(db, id, externalJobId, nextAt, metadata = {}) {
  db.prepare(
    `UPDATE knowledge_processing_tasks
     SET status = 'waiting', external_job_id = ?, next_attempt_at = ?, lease_until = NULL,
         last_error_code = NULL, last_error_message = NULL, result_metadata = ?, updated_at = ?
     WHERE id = ?`
  ).run(externalJobId, nextAt, JSON.stringify(metadata), new Date().toISOString(), id);
}

/**
 * @description 将可重试任务恢复为待处理状态并记录错误。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 任务ID。
 * @param {string} nextAt 下次时间。
 * @param {string} code 错误码。
 * @param {string} message 错误消息。
 * @returns {void} 无返回值。
 */
function setTaskRetry(db, id, nextAt, code, message) {
  db.prepare(
    `UPDATE knowledge_processing_tasks
     SET status = 'pending', next_attempt_at = ?, lease_until = NULL,
         last_error_code = ?, last_error_message = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextAt, code, message, new Date().toISOString(), id);
}

/**
 * @description 将文档解析任务标记为成功并保存结果元数据。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 任务ID。
 * @param {object} metadata 结果元数据。
 * @returns {void} 无返回值。
 */
function markTaskSucceeded(db, id, metadata = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE knowledge_processing_tasks
     SET status = 'succeeded', lease_until = NULL, next_attempt_at = ?,
         result_metadata = ?, updated_at = ? WHERE id = ?`
  ).run(now, JSON.stringify(metadata), now, id);
}

/**
 * @description 将文档解析任务标记为失败并保存错误信息。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 任务ID。
 * @param {string} code 错误码。
 * @param {string} message 错误消息。
 * @returns {void} 无返回值。
 */
function markTaskFailed(db, id, code, message) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE knowledge_processing_tasks
     SET status = 'failed', lease_until = NULL, next_attempt_at = ?,
         last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?`
  ).run(now, code, message, now, id);
}

/**
 * @description 同步更新知识文档的解析阶段、错误和索引元数据。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} id 文档ID。
 * @param {string} status 文档状态。
 * @param {string|null} code 错误码。
 * @param {string|null} message 错误消息。
 * @param {object} [extra={}] 附加字段。
 * @returns {void} 无返回值。
 */
function updateDocumentParserState(db, id, status, code, message, extra = {}) {
  db.prepare(
    `UPDATE knowledge_documents SET status = ?, processing_stage = ?, error_code = ?,
       error_message = ?, chunk_count = COALESCE(?, chunk_count), index_version = COALESCE(?, index_version),
       metadata = COALESCE(?, metadata), finished_at = CASE WHEN ? IN ('processed', 'failed') THEN ? ELSE finished_at END
     WHERE id = ?`
  ).run(
    status,
    status,
    code,
    message,
    extra.chunkCount ?? null,
    extra.indexVersion || null,
    extra.metadata || null,
    status,
    new Date().toISOString(),
    id
  );
}

/**
 * @description 将文档解析任务数据库行转换为 API 结构。
 * @param {Record<string, *>} row 数据库任务行。
 * @returns {Record<string, *>} API任务。
 */
function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    taskType: row.task_type,
    contentHash: row.content_hash,
    fileName: row.file_name,
    mimeType: row.mime_type,
    status: row.status,
    externalJobId: row.external_job_id || null,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseUntil: row.lease_until,
    lastErrorCode: row.last_error_code || null,
    lastErrorMessage: row.last_error_message || null,
    resultMetadata: parseMetadata(row.result_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * @description 解析并校验上传文件位于受控上传目录内的存储路径。
 * @param {Record<string, *>} row 数据库上传行。
 * @returns {string} 安全文件路径。
 * @throws {Error & {code: "INVALID_UPLOAD_PATH"}} 文件路径越过受控上传目录时抛出。
 */
function storedPathFor(row) {
  const uploadRoot = resolve(config.uploadDir);
  const storedPath = resolve(uploadRoot, String(row.stored_name || ""));
  if (storedPath !== uploadRoot && !storedPath.startsWith(`${uploadRoot}${sep}`)) {
    const error = new Error("Invalid uploaded file path.");
    error.code = "INVALID_UPLOAD_PATH";
    throw error;
  }
  return storedPath;
}

/**
 * @description 根据基准时间和延迟计算下一次执行时间。
 * @param {number} nowMs 当前时间。
 * @param {number} delayMs 延迟。
 * @returns {string} ISO时间。
 */
function nextAttemptAt(nowMs, delayMs) {
  return new Date(nowMs + Math.max(0, delayMs)).toISOString();
}

/**
 * @description 按尝试次数计算有上限的指数退避时长。
 * @param {number} attempts 已尝试次数。
 * @returns {number} 退避毫秒数。
 */
function retryDelay(attempts) {
  return Math.min(60_000, 1_000 * (2 ** Math.max(0, attempts - 1)));
}

/**
 * @description 安全解析任务结果元数据 JSON。
 * @param {*} value JSON值。
 * @returns {object|null} 安全对象。
 */
function parseMetadata(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
