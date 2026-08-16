import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.mjs";
import { getAdminUserProfile, updateAdminUserProfile } from "./userAdmin.mjs";

export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;

const avatarDir = join(config.dataDir, "profile-avatars");
const storedAvatarPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

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

export function getProfileAvatar(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  if (!storedAvatarPattern.test(normalized)) return null;
  const filePath = join(avatarDir, normalized);
  if (!existsSync(filePath)) return null;
  const extension = normalized.slice(normalized.lastIndexOf(".") + 1);
  const mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return { buffer: readFileSync(filePath), mimeType };
}

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

function removePreviousAvatar(previousUrl, nextFileName) {
  const match = String(previousUrl || "").match(/^\/api\/auth\/avatar\/([^/?#]+)$/);
  const previousFileName = match?.[1]?.toLowerCase() || "";
  if (!storedAvatarPattern.test(previousFileName) || previousFileName === nextFileName) return;
  try {
    unlinkSync(join(avatarDir, previousFileName));
  } catch {}
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
