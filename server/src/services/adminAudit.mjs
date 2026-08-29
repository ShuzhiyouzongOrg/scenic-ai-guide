/**
 * @fileoverview 高权限知识操作的 SQLite 审计记录服务。
 * @description 高权限知识操作的 SQLite 审计记录服务。
 */

/**
 * @typedef {object} AdminAuditInput
 * @description 高权限操作审计输入。
 * @property {string} [actorId] 操作者用户 ID。
 * @property {string} [actorRole] 操作者角色。
 * @property {string} [action] 操作名称；为空时记录为 `unknown`。
 * @property {string} [targetType] 目标资源类型。
 * @property {string} [targetId] 目标资源 ID。
 * @property {"success"|"rejected"|"failed"} [status] 操作状态；非法值按 `failed` 记录。
 * @property {Record<string, *>} [details] 将经脱敏和截断后保存的附加信息。
 */

/**
 * @typedef {object} AdminAuditSummary
 * @description 新增审计记录后返回的摘要。
 * @property {string} id 审计记录 ID。
 * @property {string} action 操作名称。
 * @property {string|null} targetId 目标资源 ID。
 * @property {"success"|"rejected"|"failed"} status 操作状态。
 * @property {string} createdAt ISO 8601 创建时间。
 */

/**
 * @typedef {object} AdminAuditRecord
 * @description 管理端查询得到的完整审计记录。
 * @property {string} id 审计记录 ID。
 * @property {string|null} actorId 操作者用户 ID。
 * @property {string|null} actorRole 操作者角色。
 * @property {string} action 操作名称。
 * @property {string|null} targetType 目标资源类型。
 * @property {string|null} targetId 目标资源 ID。
 * @property {"success"|"rejected"|"failed"} status 操作状态。
 * @property {Record<string, *>} details 已脱敏的附加信息。
 * @property {string} createdAt ISO 8601 创建时间。
 */
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * @description 写入不含正文和凭据的操作审计。
 * @param {AdminAuditInput} [input={}] 操作者、动作、目标和状态。
 * @returns {AdminAuditSummary} 已保存的审计摘要。
 * @throws {Error} 附加信息无法序列化或数据库写入失败时透传异常。
 * @example
 * const audit = recordAdminAudit({
 *   actorId: "admin-1",
 *   action: "knowledge.rebuild",
 *   status: "success"
 * });
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

/**
 * @description 按创建时间倒序查询最近的高权限操作审计记录。
 * @param {{limit?: number}} [options={}] 查询选项。
 * @returns {AdminAuditRecord[]} 最近审计记录。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const recentAudits = listAdminAudits({ limit: 20 });
 */
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

/**
 * @description 清理审计详情中的敏感字段，并限制字符串字段长度。
 * @private
 * @param {*} value 原始审计详情。
 * @returns {Record<string, *>} 可安全持久化和展示的审计详情。
 */
function sanitizeDetails(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (/key|secret|token|password|content|question/iu.test(key)) return [];
    const safe = typeof item === "string" ? item.slice(0, 200) : item;
    return [[key, safe]];
  }));
}

/**
 * @description 将审计详情 JSON 转换为对象，格式无效时返回空对象。
 * @private
 * @param {*} value 待解析的 JSON 文本。
 * @returns {Record<string, *>} 解析后的审计详情。
 */
function parseJson(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
