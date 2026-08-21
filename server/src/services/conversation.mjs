/**
 * @fileoverview 多轮对话消息的 SQLite 存储和上下文查询服务。
 *
 * 每条消息同时记录意图、情绪和耗时，供追问消解、反馈和服务质量分析复用。
 *
 * @typedef {{id: string, sessionId: string, role: string, content: string, intentLabel: string|null, emotionLabel: string|null, latencyMs: number|null, createdAt: string}} ConversationMessage
 */

import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * 确保游客会话存在；已存在时不修改原记录。
 * @param {string} sessionId 会话 ID。
 * @returns {void}
 * @throws {Error} 数据库写入失败时透传异常。
 * @private
 */
function ensureSession(sessionId) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO visitor_sessions (id, started_at, channel, message_count)
     VALUES (?, ?, 'web', 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(sessionId, now);
}

/**
 * 将消息数据库行转换为 API 结构。
 * @param {Record<string, any>} row `messages` 数据库行。
 * @returns {ConversationMessage} 规范化消息。
 * @private
 */
function toMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    intentLabel: row.intent_label,
    emotionLabel: row.emotion_label,
    latencyMs: row.latency_ms,
    createdAt: row.created_at
  };
}

/**
 * 向会话追加消息，并同步增加会话消息计数。
 * @param {string} sessionId 会话 ID；为空时不写入。
 * @param {{role: string, content: string, intentLabel?: string, emotionLabel?: string, latencyMs?: number}} message 消息数据。
 * @returns {ConversationMessage|null} 已保存消息；会话 ID 为空时返回 `null`。
 * @throws {Error} 会话或消息数据库写入失败时透传异常。
 * @example
 * appendMessage(sessionId, { role: "user", content: "梵宫在哪里？" });
 */
export function appendMessage(sessionId, message) {
  if (!sessionId) {
    return null;
  }
  const db = getDb();
  ensureSession(sessionId);
  const record = {
    id: `msg_${Date.now()}_${randomBytes(4).toString("hex")}`,
    session_id: sessionId,
    role: message.role,
    content: message.content,
    intent_label: message.intentLabel || null,
    emotion_label: message.emotionLabel || null,
    latency_ms: message.latencyMs ?? null,
    created_at: new Date().toISOString()
  };
  db.prepare(
    `INSERT INTO messages
       (id, session_id, role, content, intent_label, emotion_label, latency_ms, created_at)
     VALUES
       (@id, @session_id, @role, @content, @intent_label, @emotion_label, @latency_ms, @created_at)`
  ).run(record);
  db.prepare(
    "UPDATE visitor_sessions SET message_count = message_count + 1 WHERE id = ?"
  ).run(sessionId);
  return toMessage({ ...record });
}

/**
 * 获取适合发送给模型的最近多轮上下文，结果按时间正序排列。
 * @param {string} sessionId 会话 ID。
 * @param {number} [limit=6] 最大消息数。
 * @returns {Array<{role: string, content: string}>} 精简历史消息。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const history = getHistory(sessionId, 8);
 */
export function getHistory(sessionId, limit = 6) {
  if (!sessionId) {
    return [];
  }
  const rows = getDb()
    .prepare(
      "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
    )
    .all(sessionId, limit);
  return rows.reverse().map((row) => ({ role: row.role, content: row.content }));
}

/**
 * 从历史消息中查找最近提及的景点，用于将“它多高”等追问重新锚定到主题。
 * @param {string} sessionId 会话 ID。
 * @param {string[]} [spotNames=[]] 可识别景点名称。
 * @returns {string|null} 最近命中的景点名。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const spot = getLastSpotName(sessionId, ["灵山大佛", "梵宫"]);
 */
export function getLastSpotName(sessionId, spotNames = []) {
  if (!sessionId) {
    return null;
  }
  const rows = getDb()
    .prepare("SELECT content FROM messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(sessionId);
  for (const row of rows) {
    const content = String(row.content || "").normalize("NFKC").toLowerCase();
    const hit = spotNames.find((name) =>
      name && content.includes(String(name).normalize("NFKC").toLowerCase())
    );
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * 获取会话内全部完整消息。
 * @param {string} sessionId 会话 ID。
 * @returns {ConversationMessage[]} 按时间正序排列的消息。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const messages = getMessages(sessionId);
 */
export function getMessages(sessionId) {
  return getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(sessionId)
    .map(toMessage);
}

/**
 * 事务性删除会话消息及其标注、关联反馈，并重置消息计数。
 * @param {string} sessionId 会话 ID。
 * @returns {{sessionId: string, deleted: number}} 删除结果。
 * @throws {Error} 数据库事务失败时透传异常并回滚。
 * @example
 * const result = clearMessages(sessionId);
 */
export function clearMessages(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return { sessionId: "", deleted: 0 };
  }

  const db = getDb();
  return db.transaction(() => {
    db.prepare(
      `DELETE FROM message_annotations
       WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)`
    ).run(id);
    db.prepare(
      `DELETE FROM feedback
       WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)`
    ).run(id);
    const result = db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("UPDATE visitor_sessions SET message_count = 0 WHERE id = ?").run(id);
    return { sessionId: id, deleted: result.changes };
  })();
}

/**
 * 列出系统内全部消息，供运营分析使用。
 * @returns {ConversationMessage[]} 全量消息。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const allMessages = listAllMessages();
 */
export function listAllMessages() {
  return getDb()
    .prepare("SELECT * FROM messages ORDER BY created_at ASC, rowid ASC")
    .all()
    .map(toMessage);
}
