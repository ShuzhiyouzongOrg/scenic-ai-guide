/**
 * @fileoverview 知识缺口聚合、人工状态流转和安全导出服务。
 *
 * 本模块只维护待分析队列，不调用上传、FAQ 或索引写入接口。确认缺口仅表示人工已受理，
 * 后续补充资料仍必须走知识文档审核与上传流程。
 */
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

const ALLOWED_STATUSES = new Set(["pending", "confirmed", "dismissed"]);

/**
 * 聚合一条低相关、无答案或低满意度问题。
 * @param {{question?: *, scenicArea?: *, intent?: *, reason?: *, source?: *}} [input={}] 缺口来源。
 * @returns {Record<string, *>|null} 聚合后的缺口；空问题不记录。
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
 * 根据低分或点踩反馈，将对应会话最近的用户问题加入缺口队列。
 * @param {{sessionId?: *, messageId?: *, rating?: *, vote?: *}} feedback 已保存反馈。
 * @returns {Record<string, *>|null} 缺口；正向反馈或无法定位问题时返回 null。
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

/** @param {{status?: string, limit?: number}} [options={}] 查询条件。 @returns {Record<string, *>[]} 缺口列表。 */
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
 * 更新人工受理状态；该操作不会创建知识内容。
 * @param {string} id 缺口 ID。
 * @param {string} status pending、confirmed 或 dismissed。
 * @returns {Record<string, *>} 更新后的缺口。
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

/** @param {{status?: string, limit?: number}} [options={}] 导出范围。 @returns {string} UTF-8 CSV。 */
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

/** @param {string} id 缺口ID。 @returns {Record<string, *>|null} 缺口。 */
function getKnowledgeGap(id) {
  const row = getDb().prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(id);
  return row ? toKnowledgeGap(row) : null;
}

/** @param {Record<string, *>} row SQLite行。 @returns {Record<string, *>} API对象。 */
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

/** @param {*} value 问题。 @returns {string} 聚类规范文本。 */
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

/** @param {*} value 问题。 @returns {string} 脱敏样本。 */
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
 * 在同景区、同意图缺口中执行轻量语义聚类，避免同义问法各占一条。
 * @param {import("better-sqlite3").Database} db 数据库。
 * @param {string} normalized 已规范化问题。
 * @param {string} scenicArea 景区。
 * @param {string} intent 意图。
 * @returns {Record<string, *>|null} 相似度达到阈值的最佳缺口。
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

/** @param {string} left 左问题。 @param {string} right 右问题。 @returns {number} 0 至 1 相似度。 */
function questionSimilarity(left, right) {
  const a = semanticTerms(left);
  const b = semanticTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((term) => b.has(term)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/** @param {string} question 问题。 @returns {Set<string>} 同义归一后的词与中文二元组。 */
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

/** @param {*} explicit 显式景区。 @param {string} question 问题。 @returns {string} 景区。 */
function normalizeScenicArea(explicit, question) {
  const value = String(explicit || "").toLowerCase();
  if (["lingshan", "nianhuawan", "general"].includes(value)) return value;
  if (/拈花湾|拈花灣|nianhuawan|nian hua wan/iu.test(question)) return "nianhuawan";
  if (/灵山|靈山|lingshan|ling shan/iu.test(question)) return "lingshan";
  return "general";
}

/** @param {*} explicit 显式意图。 @param {string} question 问题。 @returns {string} 意图。 */
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

/** @param {*} value 标签。 @param {string} fallback 默认值。 @returns {string} 安全标签。 */
function normalizeLabel(value, fallback) {
  const label = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/gu, "_").slice(0, 64);
  return label || fallback;
}

/** @param {*} value JSON。 @returns {Array<{label: string, count: number}>} 标签计数。 */
function parseLabelCounts(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {*} current 原计数。 @param {string} label 新标签。 @returns {Array<{label: string, count: number}>} 新计数。 */
function incrementLabelCounts(current, label) {
  const counts = parseLabelCounts(current);
  const existing = counts.find((item) => item.label === label);
  if (existing) existing.count = Number(existing.count || 0) + 1;
  else counts.push({ label, count: 1 });
  return counts.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

/** @param {*} value CSV值。 @returns {string} 防公式注入的CSV单元格。 */
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
