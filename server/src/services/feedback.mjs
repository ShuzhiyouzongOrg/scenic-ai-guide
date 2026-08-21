/**
 * @fileoverview 基于 SQLite 的游客反馈创建与查询服务。
 *
 * @typedef {object} Feedback
 * @property {string} id 反馈记录 ID。
 * @property {string} sessionId 会话 ID。
 * @property {string} messageId 被评价的消息 ID。
 * @property {number|null} rating 1 至 5 的整数评分；未提供时为 `null`。
 * @property {"up"|"down"|""} vote 点赞、点踩或未选择。
 * @property {string} emotion 用户情绪标签。
 * @property {string} comment 文本意见。
 * @property {string} createdAt ISO 8601 创建时间。
 */
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * 将数据库字段转换为对外反馈对象。
 * @private
 * @param {Record<string, *>} row SQLite 行对象或待写入记录。
 * @returns {Feedback} 使用驼峰字段名的反馈对象。
 */
function toFeedback(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    rating: row.rating,
    vote: row.vote || "",
    emotion: row.emotion || "",
    comment: row.comment || "",
    createdAt: row.created_at
  };
}

/**
 * 规范化并保存一条游客反馈。
 * @param {{sessionId?: *, messageId?: *, rating?: *, vote?: *, emotion?: *, comment?: *}} [input={}] 反馈输入。
 * @returns {Feedback} 已保存的反馈记录。
 * @throws {Error} 当数据库初始化或写入失败时透传底层异常。
 * @example
 * const feedback = createFeedback({ sessionId: "session-1", rating: 5, vote: "up" });
 */
export function createFeedback(input = {}) {
  const rating = Number(input.rating);
  const normalizedRating = Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : null;
  const record = {
    id: `fb_${Date.now()}_${randomBytes(4).toString("hex")}`,
    session_id: String(input.sessionId || ""),
    message_id: String(input.messageId || ""),
    rating: normalizedRating,
    vote: input.vote === "down" ? "down" : input.vote === "up" ? "up" : "",
    emotion: String(input.emotion || ""),
    comment: String(input.comment || "").trim(),
    created_at: new Date().toISOString()
  };
  getDb()
    .prepare(
      `INSERT INTO feedback (id, session_id, message_id, rating, vote, emotion, comment, created_at)
       VALUES (@id, @session_id, @message_id, @rating, @vote, @emotion, @comment, @created_at)`
    )
    .run(record);
  return toFeedback(record);
}

/**
 * 按创建顺序列出反馈，可限定到指定会话。
 * @param {{sessionId?: string}} [options={}] 查询选项。
 * @param {string} [options.sessionId=""] 会话 ID；为空时查询全部反馈。
 * @returns {Feedback[]} 反馈列表。
 * @throws {Error} 当数据库查询失败时透传底层异常。
 * @example
 * const feedback = listFeedback({ sessionId: "session-1" });
 */
export function listFeedback({ sessionId = "" } = {}) {
  const db = getDb();
  const rows = sessionId
    ? db.prepare("SELECT * FROM feedback WHERE session_id = ? ORDER BY created_at ASC, rowid ASC").all(sessionId)
    : db.prepare("SELECT * FROM feedback ORDER BY created_at ASC, rowid ASC").all();
  return rows.map(toFeedback);
}
