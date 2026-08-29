/**
 * @fileoverview 知识缺口聚合、人工状态流转和安全导出服务。
 * @description
 * 负责聚合低相关或低满意度问题、维护人工处理状态，并安全导出知识缺口。
 *
 * 本模块只维护待分析队列，不调用上传、FAQ 或索引写入接口。确认缺口仅表示人工已受理，
 * 后续补充资料仍必须走知识文档审核与上传流程。
 */

/**
 * @typedef {object} KnowledgeGapLabelCount
 * @description 知识缺口原因或来源的聚合计数。
 * @property {string} label 规范化标签。
 * @property {number} count 出现次数。
 */

/**
 * @typedef {object} KnowledgeGap
 * @description 管理端使用的知识缺口记录。
 * @property {string} id 缺口 ID。
 * @property {string} questionHash 规范化问题的 SHA-256 摘要。
 * @property {string} questionPreview 已脱敏的问题预览。
 * @property {string} scenicArea 景区范围。
 * @property {string} intent 问题意图。
 * @property {KnowledgeGapLabelCount[]} reasons 触发原因及次数。
 * @property {KnowledgeGapLabelCount[]} sources 记录来源及次数。
 * @property {number} occurrenceCount 累计出现次数。
 * @property {"pending"|"confirmed"|"dismissed"} status 人工处理状态。
 * @property {string} firstSeenAt 首次出现时间。
 * @property {string} lastSeenAt 最近出现时间。
 * @property {string|null} confirmedAt 确认时间。
 * @property {string|null} dismissedAt 忽略时间。
 * @property {"manual_document_review_required"|null} nextAction 下一步人工动作。
 */

/**
 * @typedef {object} KnowledgeGapInput
 * @description 待聚合问题的来源信息。
 * @property {*} [question] 用户问题。
 * @property {*} [scenicArea] 显式景区标识。
 * @property {*} [intent] 显式问题意图。
 * @property {*} [reason] 触发缺口记录的原因。
 * @property {*} [source] 缺口来源。
 */

/**
 * @typedef {object} KnowledgeGapFeedback
 * @description 用于回溯用户问题的负向反馈。
 * @property {*} [sessionId] 会话 ID。
 * @property {*} [messageId] 被反馈的回答消息 ID。
 * @property {*} [rating] 数值评分。
 * @property {*} [vote] 点赞或点踩标识。
 */
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * @description 定义知识缺口允许使用的审核状态。
 * @type {ReadonlySet<"pending"|"confirmed"|"dismissed">} 合法知识缺口状态集合。
 */
const ALLOWED_STATUSES = new Set(["pending", "confirmed", "dismissed"]);

/**
 * @description
 * 聚合一条低相关、无答案或低满意度问题。
 * @param {KnowledgeGapInput} [input={}] 缺口来源。
 * @returns {KnowledgeGap|null} 聚合后的缺口；空问题不记录。
 * @throws {Error} SQLite 查询或写入失败时透传数据库异常。
 * @example
 * const gap = recordKnowledgeGap({
 *   question: "拈花湾夜场几点开放？",
 *   scenicArea: "nianhuawan",
 *   reason: "low_relevance"
 * });
 */
export function recordKnowledgeGap(input = {}) {
  const normalized = normalizeQuestion(input.question);
  if (!normalized) return null;
  const scenicArea = normalizeScenicArea(input.scenicArea, normalized);
  const intent = normalizeIntent(input.intent, normalized);
  const questionHash = createHash("sha256").update(normalized).digest("hex");
  const reason = normalizeLabel(input.reason, "unknown");
  const source = normalizeLabel(input.source, "retrieval");
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM knowledge_gaps WHERE question_hash = ? AND scenic_area = ? AND intent = ?"
  ).get(questionHash, scenicArea, intent);
  const semanticExisting = existing || findSimilarGap(db, normalized, scenicArea, intent);
  const now = new Date().toISOString();
  if (semanticExisting) {
    db.prepare(
      `UPDATE knowledge_gaps
       SET question_preview = ?, reasons = ?, sources = ?,
           occurrence_count = occurrence_count + 1, last_seen_at = ?
       WHERE id = ?`
    ).run(
      sanitizeQuestion(input.question),
      JSON.stringify(incrementLabelCounts(semanticExisting.reasons, reason)),
      JSON.stringify(incrementLabelCounts(semanticExisting.sources, source)),
      now,
      semanticExisting.id
    );
    return getKnowledgeGap(semanticExisting.id);
  }

  const id = `gap_${Date.now()}_${randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO knowledge_gaps
      (id, question_hash, question_preview, scenic_area, intent, reasons, sources,
       occurrence_count, status, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)`
  ).run(
    id,
    questionHash,
    sanitizeQuestion(input.question),
    scenicArea,
    intent,
    JSON.stringify([{ label: reason, count: 1 }]),
    JSON.stringify([{ label: source, count: 1 }]),
    now,
    now
  );
  return getKnowledgeGap(id);
}

/**
 * @description
 * 根据低分或点踩反馈，将对应会话最近的用户问题加入缺口队列。
 * @param {KnowledgeGapFeedback} [feedback={}] 已保存反馈。
 * @returns {KnowledgeGap|null} 缺口；正向反馈或无法定位问题时返回 `null`。
 * @throws {Error} SQLite 消息查询或缺口写入失败时透传数据库异常。
 * @example
 * const gap = recordKnowledgeGapFromFeedback({ sessionId: "session-1", vote: "down" });
 */
export function recordKnowledgeGapFromFeedback(feedback = {}) {
  if (feedback.vote !== "down" && !(Number(feedback.rating) <= 2)) return null;
  const db = getDb();
  const sessionId = String(feedback.sessionId || "");
  let question;
  if (feedback.messageId) {
    const message = db.prepare("SELECT rowid, session_id FROM messages WHERE id = ?").get(feedback.messageId);
    if (message) {
      question = db.prepare(
        `SELECT content FROM messages
         WHERE session_id = ? AND role = 'user' AND rowid < ?
         ORDER BY rowid DESC LIMIT 1`
      ).get(message.session_id, message.rowid)?.content;
    }
  }
  if (!question && sessionId) {
    question = db.prepare(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY rowid DESC LIMIT 1"
    ).get(sessionId)?.content;
  }
  if (!question) return null;
  return recordKnowledgeGap({
    question,
    reason: feedback.vote === "down" ? "downvote" : "low_rating",
    source: "feedback"
  });
}

/**
 * @description
 * 按处理状态和数量上限查询知识缺口。
 * @param {{status?: string, limit?: number}} [options={}] 查询条件。
 * @returns {KnowledgeGap[]} 缺口列表。
 * @throws {Error} SQLite 查询失败时透传数据库异常。
 * @example
 * const pending = listKnowledgeGaps({ status: "pending", limit: 20 });
 */
export function listKnowledgeGaps({ status = "", limit = 100 } = {}) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  const rows = status && ALLOWED_STATUSES.has(status)
    ? db.prepare(
      "SELECT * FROM knowledge_gaps WHERE status = ? ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT ?"
    ).all(status, safeLimit)
    : db.prepare(
      "SELECT * FROM knowledge_gaps ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT ?"
    ).all(safeLimit);
  return rows.map(toKnowledgeGap);
}

/**
 * @description
 * 更新人工受理状态；该操作不会创建知识内容。
 * @param {string} id 缺口 ID。
 * @param {string} status pending、confirmed 或 dismissed。
 * @returns {KnowledgeGap} 更新后的缺口。
 * @throws {Error & {statusCode: 400, code: "KNOWLEDGE_GAP_STATUS_INVALID"}} 状态不受支持时抛出。
 * @throws {Error & {statusCode: 404, code: "KNOWLEDGE_GAP_NOT_FOUND"}} 缺口不存在时抛出。
 * @throws {Error} SQLite 更新或查询失败时透传数据库异常。
 * @example
 * const confirmed = updateKnowledgeGapStatus("gap_1", "confirmed");
 */
export function updateKnowledgeGapStatus(id, status) {
  if (!ALLOWED_STATUSES.has(status)) {
    const error = new Error("Knowledge gap status is invalid.");
    error.statusCode = 400;
    error.code = "KNOWLEDGE_GAP_STATUS_INVALID";
    throw error;
  }
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE knowledge_gaps
     SET status = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END,
         dismissed_at = CASE WHEN ? = 'dismissed' THEN ? ELSE dismissed_at END
     WHERE id = ?`
  ).run(status, status, now, status, now, id);
  if (!result.changes) {
    const error = new Error("Knowledge gap not found.");
    error.statusCode = 404;
    error.code = "KNOWLEDGE_GAP_NOT_FOUND";
    throw error;
  }
  return getKnowledgeGap(id);
}

/**
 * @description
 * 按筛选条件将知识缺口导出为防公式注入的 UTF-8 CSV。
 * @param {object} [options={}] 导出范围。
 * @param {string} [options.status=""] 知识缺口状态筛选值。
 * @param {number} [options.limit=1000] 最多导出记录数。
 * @returns {string} UTF-8 CSV。
 * @throws {Error} SQLite 查询失败时透传数据库异常。
 * @example
 * const csv = exportKnowledgeGapsCsv({ status: "confirmed" });
 */
export function exportKnowledgeGapsCsv(options = {}) {
  const header = ["id", "question", "scenicArea", "intent", "reasons", "sources", "frequency", "status", "firstSeenAt", "lastSeenAt"];
  const rows = listKnowledgeGaps({ ...options, limit: options.limit || 1000 }).map((gap) => [
    gap.id,
    gap.questionPreview,
    gap.scenicArea,
    gap.intent,
    gap.reasons.map((item) => `${item.label}:${item.count}`).join("|"),
    gap.sources.map((item) => `${item.label}:${item.count}`).join("|"),
    gap.occurrenceCount,
    gap.status,
    gap.firstSeenAt,
    gap.lastSeenAt
  ]);
  return `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * @description
 * 按唯一标识读取一条知识缺口。
 * @param {string} id 缺口ID。
 * @returns {KnowledgeGap|null} 缺口。
 */
function getKnowledgeGap(id) {
  const row = getDb().prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(id);
  return row ? toKnowledgeGap(row) : null;
}

/**
 * @description
 * 将 SQLite 知识缺口记录转换为对外对象。
 * @param {Record<string, *>} row SQLite行。
 * @returns {KnowledgeGap} API对象。
 */
function toKnowledgeGap(row) {
  return {
    id: row.id,
    questionHash: row.question_hash,
    questionPreview: row.question_preview,
    scenicArea: row.scenic_area,
    intent: row.intent,
    reasons: parseLabelCounts(row.reasons),
    sources: parseLabelCounts(row.sources),
    occurrenceCount: Number(row.occurrence_count || 0),
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    confirmedAt: row.confirmed_at || null,
    dismissedAt: row.dismissed_at || null,
    nextAction: row.status === "confirmed" ? "manual_document_review_required" : null
  };
}

/**
 * @description
 * 归一化问题文本，以便执行哈希和相似度聚类。
 * @param {*} value 问题。
 * @returns {string} 聚类规范文本。
 */
function normalizeQuestion(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[?？!！。,.，;；:："'“”‘’]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1000);
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)
    ? normalized.replace(/\s+/gu, "")
    : normalized;
}

/**
 * @description
 * 清理问题中的敏感片段并生成可存储预览。
 * @param {*} value 问题。
 * @returns {string} 脱敏样本。
 */
function sanitizeQuestion(value) {
  return String(value || "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[email]")
    .replace(/\b1\d{10}\b/gu, "[phone]")
    .replace(/\b\d{17}[\dXx]\b/gu, "[id-card]")
    .replace(/\b(?:LTAI|AKID)[A-Za-z0-9_-]{8,}\b/gu, "[access-key]")
    .replace(/\b(?:sk|eyJ)[A-Za-z0-9._-]{16,}\b/gu, "[token]")
    .trim()
    .slice(0, 500);
}

/**
 * @description
 * 在同景区、同意图缺口中执行轻量语义聚类，避免同义问法各占一条。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} normalized 已规范化问题。
 * @param {string} scenicArea 景区。
 * @param {string} intent 意图。
 * @returns {Record<string, *>|null} 相似度达到阈值的最佳 SQLite 缺口记录。
 */
function findSimilarGap(db, normalized, scenicArea, intent) {
  const rows = db.prepare(
    `SELECT * FROM knowledge_gaps
     WHERE scenic_area = ? AND intent = ?
     ORDER BY last_seen_at DESC LIMIT 200`
  ).all(scenicArea, intent);
  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const score = questionSimilarity(normalized, normalizeQuestion(row.question_preview));
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore >= 0.58 ? best : null;
}

/**
 * @description
 * 计算两个问题的语义词集合相似度。
 * @param {string} left 左问题。
 * @param {string} right 右问题。
 * @returns {number} 0 至 1 相似度。
 */
function questionSimilarity(left, right) {
  const a = semanticTerms(left);
  const b = semanticTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((term) => b.has(term)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/**
 * @description
 * 提取问题的同义归一词和中文二元组。
 * @param {string} question 问题。
 * @returns {Set<string>} 同义归一后的词与中文二元组。
 */
function semanticTerms(question) {
  const canonical = String(question || "")
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/手机号|手机|电话|邮箱|身份证/gu, "")
    .replace(/什么时候|幾點|几点|何时|時間/gu, "时间")
    .replace(/夜场|夜間|晚上/gu, "夜间")
    .replace(/开放|开门|营业/gu, "开放")
    .replace(/是否|能不能|可以吗|是什么|多少|请问/gu, "");
  const terms = new Set(canonical.match(/[a-z0-9]+/giu) || []);
  const chars = canonical.match(/[\u3400-\u9fff]/gu) || [];
  for (let index = 0; index + 1 < chars.length; index += 1) terms.add(chars[index] + chars[index + 1]);
  return terms;
}

/**
 * @description
 * 结合显式值和问题文本确定知识缺口所属景区。
 * @param {*} explicit 显式景区。
 * @param {string} question 问题。
 * @returns {string} 景区。
 */
function normalizeScenicArea(explicit, question) {
  const value = String(explicit || "").toLowerCase();
  if (["lingshan", "nianhuawan", "general"].includes(value)) return value;
  if (/拈花湾|拈花灣|nianhuawan|nian hua wan/iu.test(question)) return "nianhuawan";
  if (/灵山|靈山|lingshan|ling shan/iu.test(question)) return "lingshan";
  return "general";
}

/**
 * @description
 * 结合显式值和问题文本确定知识缺口意图。
 * @param {*} explicit 显式意图。
 * @param {string} question 问题。
 * @returns {string} 意图。
 */
function normalizeIntent(explicit, question) {
  const value = normalizeLabel(explicit, "");
  if (value) return value;
  if (/门票|票价|价格|費用|ticket|price/iu.test(question)) return "ticket";
  if (/几点|时间|开放|演出|表演|time|open/iu.test(question)) return "time";
  if (/路线|怎么走|游览|行程|route|itinerary/iu.test(question)) return "route";
  if (/餐饮|吃饭|美食|restaurant|food/iu.test(question)) return "dining";
  if (/厕所|卫生间|停车|服务|洗手间|service|parking/iu.test(question)) return "service";
  return "unknown";
}

/**
 * @description
 * 清理统计标签，并在空值时使用默认标签。
 * @param {*} value 标签。
 * @param {string} fallback 默认值。
 * @returns {string} 安全标签。
 */
function normalizeLabel(value, fallback) {
  const label = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/gu, "_").slice(0, 64);
  return label || fallback;
}

/**
 * @description
 * 解析按标签聚合的 JSON 计数数组。
 * @param {*} value JSON。
 * @returns {KnowledgeGapLabelCount[]} 标签计数。
 */
function parseLabelCounts(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @description
 * 递增指定标签的计数并返回新的排序结果。
 * @param {*} current 原计数。
 * @param {string} label 新标签。
 * @returns {KnowledgeGapLabelCount[]} 新计数。
 */
function incrementLabelCounts(current, label) {
  const counts = parseLabelCounts(current);
  const existing = counts.find((item) => item.label === label);
  if (existing) existing.count = Number(existing.count || 0) + 1;
  else counts.push({ label, count: 1 });
  return counts.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

/**
 * @description
 * 转义 CSV 单元格并阻止电子表格公式注入。
 * @param {*} value CSV值。
 * @returns {string} 防公式注入的CSV单元格。
 */
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
