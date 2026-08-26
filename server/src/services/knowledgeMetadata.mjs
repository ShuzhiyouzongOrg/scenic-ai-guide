/**
 * @fileoverview 知识文档和分块共用的准入、状态与元数据约束。
 */

/** @type {ReadonlySet<string>} 允许的知识用途范围。 */
export const KNOWLEDGE_SCOPES = new Set([
  "visitor_qa",
  "operations_analytics",
  "internal_reference"
]);

/** @type {ReadonlySet<string>} 允许的知识访问范围。 */
export const ACCESS_SCOPES = new Set(["public", "authenticated", "admin", "internal"]);

/** @type {ReadonlySet<string>} 文档处理状态机允许的状态。 */
export const KNOWLEDGE_STATUSES = new Set([
  "uploaded",
  "classified",
  "extracting",
  "chunking",
  "indexing",
  "processed",
  "needs_ocr",
  "skipped",
  "failed"
]);

/**
 * 根据显式值和文件名确定知识用途；行为分析类资料默认隔离。
 * @param {*} value 显式用途。
 * @param {string} fileName 文件名。
 * @returns {"visitor_qa"|"operations_analytics"|"internal_reference"} 规范化用途。
 */
export function normalizeKnowledgeScope(value, fileName = "") {
  if (KNOWLEDGE_SCOPES.has(String(value || ""))) {
    return String(value);
  }
  if (/(行为分析|游客行为|消费分析|运营统计|旅游数据)/u.test(String(fileName))) {
    return "operations_analytics";
  }
  return "visitor_qa";
}

/**
 * 规范化文档访问范围；游客问答默认公开，运营与内部资料默认仅管理员可见。
 * @param {*} value 显式访问范围。
 * @param {*} knowledgeScope 知识用途。
 * @returns {"public"|"authenticated"|"admin"|"internal"} 访问范围。
 */
export function normalizeAccessScope(value, knowledgeScope = "visitor_qa") {
  const normalized = String(value || "").trim().toLowerCase();
  if (ACCESS_SCOPES.has(normalized)) return normalized;
  return knowledgeScope === "visitor_qa" ? "public" : "admin";
}

/** @param {*} value 租户标识。 @returns {string} 不含控制字符的稳定租户标识。 */
export function normalizeTenantId(value) {
  const normalized = String(value || "default").trim().replace(/[\u0000-\u001f\u007f]/gu, "");
  return normalized.slice(0, 64) || "default";
}

/**
 * 将扩展名映射为审计用文档类型。
 * @param {*} extension 扩展名，可带点号。
 * @returns {string} 文档类型。
 */
export function documentTypeFor(extension) {
  return String(extension || "").replace(/^\./u, "").toLowerCase() || "unknown";
}

/**
 * 判断文档是否允许进入游客问答索引。
 * @param {object} document 文档元数据。
 * @returns {boolean} 允许进入游客问答时为 `true`。
 */
export function isVisitorKnowledgeDocument(document) {
  return document?.knowledgeScope === "visitor_qa" && document?.enabled !== false;
}

/**
 * 将错误文本限制为可返回给管理员的短消息，避免泄露本地路径和凭据。
 * @param {*} value 原始错误文本。
 * @returns {string} 脱敏后的错误消息。
 */
export function sanitizeProcessingError(value) {
  return String(value || "Processing failed.")
    .replace(/[A-Za-z]:\\[^\n]*/gu, "[path]")
    .replace(/(?:\/|\\)(?:[^\s\/\\]+[\/\\])+[^\s]*/gu, "[path]")
    .slice(0, 240);
}
