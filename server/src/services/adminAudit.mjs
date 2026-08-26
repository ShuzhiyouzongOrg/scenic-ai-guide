/**
 * @fileoverview 高权限知识操作的 SQLite 审计记录服务。
 */
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * 写入不含正文和凭据的操作审计。
 * @param {object} input 操作者、动作、目标和状态。
 * @returns {object} 已保存的审计摘要。
 */
export function recordAdminAudit(input = {}) {
  const record = {
    id: `audit_${Date.now()}_${randomBytes(4).toString("hex")}`,
    actor_id: String(input.actorId || "") || null,
    actor_role: String(input.actorRole || "") || null,
    action: String(input.action || "unknown").slice(0, 80),
    target_type: String(input.targetType || "") || null,
    target_id: String(input.targetId || "").slice(0, 160) || null,
    status: ["success", "rejected", "failed"].includes(input.status) ? input.status : "failed",
    details: JSON.stringify(sanitizeDetails(input.details)),
    created_at: new Date().toISOString()
  };
  getDb().prepare(
    `INSERT INTO admin_audit_logs
      (id, actor_id, actor_role, action, target_type, target_id, status, details, created_at)
     VALUES
      (@id, @actor_id, @actor_role, @action, @target_type, @target_id, @status, @details, @created_at)`
  ).run(record);
  return {
    id: record.id,
    action: record.action,
    targetId: record.target_id,
    status: record.status,
    createdAt: record.created_at
  };
}

/** @param {{limit?: number}} [options={}] 查询选项。 @returns {object[]} 最近审计记录。 */
export function listAdminAudits({ limit = 100 } = {}) {
  return getDb().prepare(
    "SELECT * FROM admin_audit_logs ORDER BY created_at DESC, rowid DESC LIMIT ?"
  ).all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    details: parseJson(row.details),
    createdAt: row.created_at
  }));
}

function sanitizeDetails(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (/key|secret|token|password|content|question/iu.test(key)) return [];
    const safe = typeof item === "string" ? item.slice(0, 200) : item;
    return [[key, safe]];
  }));
}

function parseJson(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
