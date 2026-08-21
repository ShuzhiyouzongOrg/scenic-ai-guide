/**
 * @fileoverview 管理端账号、个人资料、角色、状态和密码维护服务。
 *
 * @typedef {object} AdminUser
 * @property {string} id 用户 ID。
 * @property {string} username 登录名。
 * @property {string} displayName 显示名称。
 * @property {string} avatar 头像 URL。
 * @property {string} realName 真实姓名。
 * @property {string} gender 性别。
 * @property {string} nickname 昵称。
 * @property {string} email 邮箱。
 * @property {string} phone 手机号。
 * @property {string} address 地址。
 * @property {string} bio 个人简介。
 * @property {string} role 角色代码。
 * @property {"active"|"disabled"} status 账号状态。
 * @property {string} createdAt 创建时间。
 */
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";
import { hashPassword, verifyPassword } from "../db/password.mjs";

/**
 * 将用户数据库行转换为不含密码哈希的 API 对象。
 * @private
 * @param {Record<string, *>} row 用户数据库行。
 * @returns {AdminUser} 管理端用户对象。
 */
function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatar: row.avatar || "",
    realName: row.real_name || row.display_name || row.username,
    gender: row.gender || "",
    nickname: row.nickname || row.display_name || row.username,
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    bio: row.bio || "",
    role: row.role,
    status: row.status,
    createdAt: row.created_at
  };
}

/**
 * 列出全部管理端账号。
 * @returns {AdminUser[]} 按创建时间升序排列的用户列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const users = listAdminUsers();
 */
export function listAdminUsers() {
  return getDb()
    .prepare("SELECT * FROM admin_users ORDER BY created_at ASC")
    .all()
    .map(toUser);
}

/**
 * 创建管理端账号，并使用安全哈希保存密码。
 * @param {{username?: *, password?: *, displayName?: *, avatar?: *, role?: *}} [input={}] 用户输入。
 * @returns {AdminUser} 新建用户。
 * @throws {Error & {statusCode: 400, code: "USER_REQUIRED"|"ROLE_INVALID"}} 必填字段缺失或角色无效时抛出。
 * @throws {Error & {statusCode: 409, code: "USER_EXISTS"}} 登录名已存在时抛出。
 * @throws {Error} 密码哈希或数据库写入失败时透传异常。
 * @example
 * const user = createAdminUser({ username: "operator1", password: "secret123", role: "operator" });
 */
export function createAdminUser(input = {}) {
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (!username || !password) {
    const error = new Error("username and password are required.");
    error.statusCode = 400;
    error.code = "USER_REQUIRED";
    throw error;
  }
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM admin_users WHERE username = ?").get(username);
  if (exists) {
    const error = new Error("Username already exists.");
    error.statusCode = 409;
    error.code = "USER_EXISTS";
    throw error;
  }
  const role = String(input.role || "operator").trim();
  if (!isConfiguredRole(db, role)) {
    const error = new Error("Selected role does not exist or is disabled.");
    error.statusCode = 400;
    error.code = "ROLE_INVALID";
    throw error;
  }
  const record = {
    id: `user_${Date.now()}_${randomBytes(3).toString("hex")}`,
    username,
    password_hash: hashPassword(password),
    display_name: String(input.displayName || username).trim(),
    avatar: String(input.avatar || ""),
    role,
    status: "active",
    created_at: new Date().toISOString()
  };
  db.prepare(
    `INSERT INTO admin_users (id, username, password_hash, display_name, avatar, role, status, created_at)
     VALUES (@id, @username, @password_hash, @display_name, @avatar, @role, @status, @created_at)`
  ).run(record);
  return toUser(record);
}

/**
 * 更新账号显示名、角色、状态及可选的新密码。
 * @param {string} id 用户 ID。
 * @param {{displayName?: *, role?: *, status?: *, password?: *}} [input={}] 待更新字段。
 * @returns {AdminUser} 更新后的用户。
 * @throws {Error & {statusCode: 404, code: "USER_NOT_FOUND"}} 用户不存在时抛出。
 * @throws {Error & {statusCode: 400, code: "ROLE_INVALID"}} 目标角色不存在或已停用时抛出。
 * @throws {Error} 密码哈希或数据库更新失败时透传异常。
 * @example
 * const user = updateAdminUser("user-1", { status: "disabled" });
 */
export function updateAdminUser(id, input = {}) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  const displayName = input.displayName !== undefined ? String(input.displayName).trim() : row.display_name;
  const role = input.role === undefined ? row.role : String(input.role).trim();
  if (!isConfiguredRole(db, role)) {
    const error = new Error("Selected role does not exist or is disabled.");
    error.statusCode = 400;
    error.code = "ROLE_INVALID";
    throw error;
  }
  const status = ["active", "disabled"].includes(input.status) ? input.status : row.status;
  db.prepare("UPDATE admin_users SET display_name = ?, role = ?, status = ? WHERE id = ?").run(
    displayName,
    role,
    status,
    id
  );
  if (input.password) {
    db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(hashPassword(String(input.password)), id);
  }
  return toUser(db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id));
}

/**
 * 获取单个管理端用户的完整公开资料。
 * @param {string} id 用户 ID。
 * @returns {AdminUser|null} 用户资料；用户不存在时返回 `null`。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const profile = getAdminUserProfile("user-1");
 */
export function getAdminUserProfile(id) {
  const row = getDb().prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  return row ? toUser(row) : null;
}

/**
 * 部分更新用户的头像和个人资料字段。
 * @param {string} id 用户 ID。
 * @param {{nickname?: *, avatar?: *, realName?: *, gender?: *, email?: *, phone?: *, address?: *, bio?: *}} [input={}] 资料字段。
 * @returns {AdminUser} 更新后的用户资料。
 * @throws {Error & {statusCode: 404, code: "USER_NOT_FOUND"}} 用户不存在时抛出。
 * @throws {Error} 数据库更新失败时透传异常。
 * @example
 * const profile = updateAdminUserProfile("user-1", { nickname: "小灵" });
 */
export function updateAdminUserProfile(id, input = {}) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  const values = {
    display_name: input.nickname !== undefined ? String(input.nickname).trim() : row.display_name,
    avatar: input.avatar !== undefined ? String(input.avatar) : row.avatar,
    real_name: input.realName !== undefined ? String(input.realName).trim() : row.real_name,
    gender: input.gender !== undefined ? String(input.gender) : row.gender,
    nickname: input.nickname !== undefined ? String(input.nickname).trim() : row.nickname,
    email: input.email !== undefined ? String(input.email).trim() : row.email,
    phone: input.phone !== undefined ? String(input.phone).trim() : row.phone,
    address: input.address !== undefined ? String(input.address).trim() : row.address,
    bio: input.bio !== undefined ? String(input.bio).trim() : row.bio
  };
  db.prepare(
    `UPDATE admin_users SET display_name=@display_name, avatar=@avatar, real_name=@real_name,
      gender=@gender, nickname=@nickname, email=@email, phone=@phone, address=@address, bio=@bio
     WHERE id=@id`
  ).run({ ...values, id });
  return toUser(db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id));
}

/**
 * 校验当前密码后修改管理端用户密码。
 * @param {string} id 用户 ID。
 * @param {*} currentPassword 当前明文密码。
 * @param {*} newPassword 新明文密码，至少 6 个字符。
 * @returns {{ok: true}} 修改成功标记。
 * @throws {Error & {statusCode: 400, code: "PASSWORD_INVALID"}} 用户不存在或当前密码不正确时抛出。
 * @throws {Error & {statusCode: 400, code: "PASSWORD_TOO_SHORT"}} 新密码长度不足时抛出。
 * @throws {Error} 密码校验、哈希或数据库更新失败时透传异常。
 * @example
 * await changeAdminUserPassword("user-1", "old-pass", "new-pass");
 */
export function changeAdminUserPassword(id, currentPassword, newPassword) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  if (!row || !verifyPassword(String(currentPassword || ""), row.password_hash)) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 400;
    error.code = "PASSWORD_INVALID";
    throw error;
  }
  if (String(newPassword || "").length < 6) {
    const error = new Error("New password must contain at least 6 characters.");
    error.statusCode = 400;
    error.code = "PASSWORD_TOO_SHORT";
    throw error;
  }
  db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(hashPassword(String(newPassword)), id);
  return { ok: true };
}

/**
 * 删除管理端账号；内置 `admin` 账号受保护。
 * @param {string} id 用户 ID。
 * @returns {{id: string}} 被删除用户的 ID。
 * @throws {Error & {statusCode: 404, code: "USER_NOT_FOUND"}} 用户不存在时抛出。
 * @throws {Error & {statusCode: 400, code: "USER_PROTECTED"}} 尝试删除内置管理员时抛出。
 * @throws {Error} 数据库删除失败时透传异常。
 * @example
 * const result = deleteAdminUser("user-2");
 */
export function deleteAdminUser(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  if (row.username === "admin") {
    const error = new Error("The built-in admin account cannot be deleted.");
    error.statusCode = 400;
    error.code = "USER_PROTECTED";
    throw error;
  }
  db.prepare("DELETE FROM admin_users WHERE id = ?").run(id);
  return { id };
}

/**
 * 判断角色代码是否对应启用中的系统角色。
 * @private
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @param {string} role 角色代码。
 * @returns {boolean} 角色存在且启用时为 `true`。
 * @throws {Error} 数据库查询失败时透传异常。
 */
function isConfiguredRole(db, role) {
  return Boolean(
    db.prepare("SELECT 1 FROM system_roles WHERE role_code = ? AND enabled = 1").get(role)
  );
}
