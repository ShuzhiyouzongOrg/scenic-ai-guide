/**
 * @fileoverview 管理端用户头像的格式校验、安全落盘、读取与旧文件清理服务。
 *
 * @typedef {object} StoredAvatar
 * @property {Buffer} buffer 图片二进制内容。
 * @property {"image/jpeg"|"image/png"|"image/webp"} mimeType 图片媒体类型。
 * @typedef {Error & {statusCode: number, code: string}} AvatarHttpError
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.mjs";
import { getAdminUserProfile, updateAdminUserProfile } from "./userAdmin.mjs";

/**
 * 允许上传的头像最大字节数（5 MiB）。
 * @type {number}
 * @example
 * if (buffer.length > MAX_PROFILE_AVATAR_BYTES) throw new Error("头像过大");
 */
export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;

/** @type {string} 头像文件的持久化目录。 */
const avatarDir = join(config.dataDir, "profile-avatars");
/** @type {RegExp} 服务生成的 UUID v4 头像文件名白名单。 */
const storedAvatarPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

/**
 * 校验并保存用户头像，更新个人资料后清理旧头像文件。
 * @param {string|number} userId 管理端用户 ID。
 * @param {{buffer?: Buffer}} [file={}] 上传文件对象。
 * @returns {object} 更新后的用户资料。
 * @throws {AvatarHttpError} 用户不存在、文件为空、超过 5 MiB 或图片签名不受支持时抛出。
 * @throws {Error} 目录创建、文件写入或数据库更新失败时透传底层异常。
 * @example
 * const profile = saveProfileAvatar("user-1", { buffer: imageBuffer });
 */
export function saveProfileAvatar(userId, file = {}) {
  const current = getAdminUserProfile(userId);
  if (!current) {
    throw httpError(404, "USER_NOT_FOUND", "User not found.");
  }

  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.alloc(0);
  if (buffer.length === 0) {
    throw httpError(400, "AVATAR_FILE_REQUIRED", "An avatar image is required.");
  }
  if (buffer.length > MAX_PROFILE_AVATAR_BYTES) {
    throw httpError(413, "AVATAR_TOO_LARGE", "Avatar images must not exceed 5 MB.");
  }

  const image = detectImage(buffer);
  if (!image) {
    throw httpError(415, "AVATAR_TYPE_INVALID", "Only valid JPEG, PNG, or WebP images are supported.");
  }

  mkdirSync(avatarDir, { recursive: true });
  const fileName = `${randomUUID()}.${image.extension}`;
  const filePath = join(avatarDir, fileName);
  writeFileSync(filePath, buffer, { flag: "wx", mode: 0o600 });

  const avatar = `/api/auth/avatar/${fileName}`;
  let updated;
  try {
    updated = updateAdminUserProfile(userId, { avatar });
  } catch (error) {
    unlinkSync(filePath);
    throw error;
  }
  removePreviousAvatar(current.avatar, fileName);
  return updated;
}

/**
 * 按安全文件名读取已保存头像。
 * @param {*} fileName 头像文件名，不包含目录。
 * @returns {StoredAvatar|null} 图片内容与媒体类型；文件名非法或文件不存在时返回 `null`。
 * @throws {Error} 当已存在的头像文件无法读取时抛出文件系统异常。
 * @example
 * const avatar = getProfileAvatar("550e8400-e29b-41d4-a716-446655440000.png");
 */
export function getProfileAvatar(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  if (!storedAvatarPattern.test(normalized)) return null;
  const filePath = join(avatarDir, normalized);
  if (!existsSync(filePath)) return null;
  const extension = normalized.slice(normalized.lastIndexOf(".") + 1);
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return { buffer: readFileSync(filePath), mimeType };
}

/**
 * 根据文件头魔数识别 JPEG、PNG 或 WebP 图片。
 * @private
 * @param {Buffer} buffer 图片二进制内容。
 * @returns {{extension: "jpg"|"png"|"webp", mimeType: string}|null} 格式信息；无法识别时返回 `null`。
 */
function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return null;
}

/**
 * 在新头像保存成功后尽力删除同一用户的旧头像。
 * 删除失败会被忽略，避免影响已经完成的资料更新。
 * @private
 * @param {*} previousUrl 旧头像 API URL。
 * @param {string} nextFileName 新头像文件名，用于避免误删当前文件。
 * @returns {void}
 */
function removePreviousAvatar(previousUrl, nextFileName) {
  const match = String(previousUrl || "").match(/^\/api\/auth\/avatar\/([^/?#]+)$/);
  const previousFileName = match?.[1]?.toLowerCase() || "";
  if (!storedAvatarPattern.test(previousFileName) || previousFileName === nextFileName) return;
  try {
    unlinkSync(join(avatarDir, previousFileName));
  } catch {}
}

/**
 * 创建携带 HTTP 状态码和业务错误码的异常。
 * @private
 * @param {number} statusCode HTTP 状态码。
 * @param {string} code 业务错误码。
 * @param {string} message 错误说明。
 * @returns {AvatarHttpError} 可由 HTTP 层识别的异常。
 */
function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
