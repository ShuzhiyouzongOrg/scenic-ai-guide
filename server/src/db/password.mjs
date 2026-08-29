/**
 * @fileoverview 管理员与游客账号密码散列工具。
 * @description 使用带独立随机盐的 scrypt 格式生成和校验管理员及游客密码。
 *
 * 使用 scrypt 和每个密码独立的随机盐，存储格式为 `scrypt$<saltHex>$<hashHex>`。
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * @description 生成带随机盐的 scrypt 密码散列。
 *
 * @param {string|number} plain 明文密码；非字符串值按字符串处理。
 * @returns {string} 可直接持久化的版本化散列字符串。
 * @throws {Error} 系统随机源或 scrypt 计算失败时透传 Node.js 加密异常。
 * @example
 * const stored = hashPassword("admin123");
 */
export function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * @description 以恒定时间比较明文密码和已存储的 scrypt 散列。
 *
 * @param {string|number} plain 待验证的明文密码。
 * @param {string} stored `hashPassword` 生成的存储值。
 * @returns {boolean} 密码匹配且存储格式有效时返回 `true`。
 * @throws {Error} 格式表面合法但十六进制数据无法用于 scrypt 时可能透传加密异常。
 * @example
 * if (!verifyPassword(inputPassword, user.password_hash)) throw new Error("invalid credentials");
 */
export function verifyPassword(plain, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) {
    return false;
  }
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(String(plain), salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
