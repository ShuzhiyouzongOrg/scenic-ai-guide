/**
 * @fileoverview 数据库账号注册、角色感知登录、HMAC Token 与匿名游客会话服务。
 *
 * @description Token 是无状态的 `base64url(payload).signature`，但每次验证仍会查询账号和角色状态，
 * 因此禁用账号、禁用角色或变更账号角色会立即使旧 Token 失效。
 */

/**
 * @typedef {object} AuthTokenPayload
 * @description 通过签名、有效期和账号状态验证的身份载荷。
 * @property {string} sub Token 主体名称。
 * @property {string} uid 用户 ID。
 * @property {"admin"|"operator"|"visitor"} role 用户角色。
 * @property {number} exp 过期 Unix 秒时间戳。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.mjs";
import { getDb } from "../db/database.mjs";
import { verifyPassword } from "../db/password.mjs";
import { createAdminUser } from "./userAdmin.mjs";

/**
 * @description 定义注册用户名允许的最短字符数。
 * @type {number} 注册用户名最短字符数。
 */
const REGISTER_USERNAME_MIN_LENGTH = 3;
/**
 * @description 定义注册用户名允许的最长字符数。
 * @type {number} 注册用户名最长字符数。
 */
const REGISTER_USERNAME_MAX_LENGTH = 20;
/**
 * @description 定义注册密码允许的最短字符数。
 * @type {number} 注册密码最短字符数。
 */
const REGISTER_PASSWORD_MIN_LENGTH = 6;
/**
 * @description 定义注册密码允许的最长字符数。
 * @type {number} 注册密码最长字符数。
 */
const REGISTER_PASSWORD_MAX_LENGTH = 128;
/**
 * @description 定义登录页面允许提交的角色代码集合。
 * @type {Set<string>} 登录页面允许提交的角色代码。
 */
const LOGIN_ROLES = new Set(["admin", "operator", "visitor"]);

/**
 * @description 注册一个游客角色账号，并限制头像为内置安全资源。
 * @param {object} [input={}] 注册输入。
 * @param {string} [input.username=""] 登录名。
 * @param {string} [input.password=""] 登录密码。
 * @param {string} [input.avatar=""] 内置头像资源路径。
 * @returns {{userId: string, userName: string, avatar: string, role: string}} 新账号摘要。
 * @throws {Error & {statusCode: number, code: string}} 用户名或密码长度无效时抛出
 * `USERNAME_INVALID`/`PASSWORD_INVALID`；重复账号等错误由用户服务透传。
 * @example
 * const user = register({ username: "visitor01", password: "visit123" });
 */
export function register(input = {}) {
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (username.length < REGISTER_USERNAME_MIN_LENGTH || username.length > REGISTER_USERNAME_MAX_LENGTH) {
    const error = new Error("Username must contain 3 to 20 characters.");
    error.statusCode = 400;
    error.code = "USERNAME_INVALID";
    throw error;
  }
  if (password.length < REGISTER_PASSWORD_MIN_LENGTH || password.length > REGISTER_PASSWORD_MAX_LENGTH) {
    const error = new Error("Password must contain 6 to 128 characters.");
    error.statusCode = 400;
    error.code = "PASSWORD_INVALID";
    throw error;
  }

  const avatar = String(input.avatar || "");
  const safeAvatar = /^\/(?:assets\/ling-avatar-[1-6][^/]*\.webp|src\/assets\/images\/avatar\/ling-avatar-[1-6]\.webp)(?:\?.*)?$/.test(avatar)
    ? avatar
    : "";
  const user = createAdminUser({
    username,
    password,
    displayName: username,
    avatar: safeAvatar,
    role: "visitor"
  });
  return {
    userId: user.id,
    userName: user.username,
    avatar: user.avatar,
    role: user.role
  };
}

/**
 * @description 校验账号密码、用户选择角色及角色启用状态，并签发 8 小时 Token。
 * @param {string} username 登录名。
 * @param {string} password 明文密码。
 * @param {"admin"|"operator"|"visitor"} expectedRole 登录页选择的角色。
 * @returns {{token: string, user: {id: string, username: string, displayName: string, role: string, avatar: string}}|null} 登录结果；账号或密码错误时返回 `null`。
 * @throws {Error & {statusCode: number, code: string}} 角色无效、不匹配或已禁用时分别抛出
 * `LOGIN_ROLE_INVALID`、`LOGIN_ROLE_MISMATCH` 或 `LOGIN_ROLE_DISABLED`。
 * @example
 * const result = login("admin", "admin123", "admin");
 * if (!result) throw new Error("invalid credentials");
 */
export function login(username, password, expectedRole) {
  const role = String(expectedRole || "").trim();
  if (!LOGIN_ROLES.has(role)) {
    const error = new Error("A valid login role is required.");
    error.statusCode = 400;
    error.code = "LOGIN_ROLE_INVALID";
    throw error;
  }

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM admin_users WHERE username = ? AND status = 'active'")
    .get(String(username || ""));
  if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
    return null;
  }
  if (user.role !== role) {
    const error = new Error("The selected role does not match this account.");
    error.statusCode = 403;
    error.code = "LOGIN_ROLE_MISMATCH";
    throw error;
  }
  const configuredRole = db
    .prepare("SELECT 1 FROM system_roles WHERE role_code = ? AND enabled = 1")
    .get(user.role);
  if (!configuredRole) {
    const error = new Error("This account role is disabled.");
    error.statusCode = 403;
    error.code = "LOGIN_ROLE_DISABLED";
    throw error;
  }

  const token = signToken({
    sub: user.username,
    uid: user.id,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 8
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      avatar: user.avatar || ""
    }
  };
}

/**
 * @description 验证 Token 的签名、有效期及数据库中的实时账号/角色状态。
 * @param {string} token Bearer Token 文本。
 * @returns {AuthTokenPayload|null} 可信载荷；任一校验失败时返回 `null`。
 * @example
 * const identity = verifyToken(token);
 * if (!identity) throw new Error("unauthorized");
 */
export function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadEncoded, signature] = parts;
  const expected = sign(payloadEncoded);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.uid || payload.exp < Date.now()) {
    return null;
  }

  const account = getDb()
    .prepare(
      `SELECT users.role
       FROM admin_users AS users
       INNER JOIN system_roles AS roles ON roles.role_code = users.role AND roles.enabled = 1
       WHERE users.id = ? AND users.status = 'active'`
    )
    .get(payload.uid);
  if (!account || account.role !== payload.role) return null;

  return payload;
}

/**
 * @description 创建并持久化匿名 Web 游客会话。
 * @returns {{id: string, createdAt: string, messageCount: number}} 新会话。
 * @example
 * const session = createVisitorSession();
 */
export function createVisitorSession() {
  const id = `visitor_${Date.now()}_${randomBytes(6).toString("hex")}`;
  const startedAt = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO visitor_sessions (id, started_at, channel, message_count) VALUES (?, ?, 'web', 0)"
    )
    .run(id, startedAt);
  return { id, createdAt: startedAt, messageCount: 0 };
}

/**
 * @description 查询游客会话摘要。
 * @param {string} id 会话 ID。
 * @returns {{id: string, createdAt: string, messageCount: number}|null} 会话摘要或 `null`。
 * @example
 * const session = getVisitorSession("visitor_123");
 */
export function getVisitorSession(id) {
  const row = getDb().prepare("SELECT * FROM visitor_sessions WHERE id = ?").get(id);
  return row
    ? { id: row.id, createdAt: row.started_at, messageCount: row.message_count }
    : null;
}

/**
 * @description 序列化载荷并附加 HMAC 签名。
 * @param {AuthTokenPayload} payload Token 载荷。
 * @returns {string} 完整 Token。
 * @private
 */
function signToken(payload) {
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadEncoded}.${sign(payloadEncoded)}`;
}

/**
 * @description 为已编码载荷生成 SHA-256 HMAC。
 * @param {string} payloadEncoded base64url 载荷。
 * @returns {string} base64url 签名。
 * @private
 */
function sign(payloadEncoded) {
  return createHmac("sha256", config.jwtSecret).update(payloadEncoded).digest("base64url");
}

/**
 * @description 恒定时间比较两个签名，长度不同时安全返回 `false`。
 * @param {string} left 实际签名。
 * @param {string} right 期望签名。
 * @returns {boolean} 两者完全相同时为 `true`。
 * @private
 */
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
