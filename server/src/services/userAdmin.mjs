// Admin user management (product closed-loop: account administration).
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";
import { hashPassword, verifyPassword } from "../db/password.mjs";

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

export function listAdminUsers() {
  return getDb()
    .prepare("SELECT * FROM admin_users ORDER BY created_at ASC")
    .all()
    .map(toUser);
}

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

export function getAdminUserProfile(id) {
  const row = getDb().prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  return row ? toUser(row) : null;
}

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

function isConfiguredRole(db, role) {
  return Boolean(
    db.prepare("SELECT 1 FROM system_roles WHERE role_code = ? AND enabled = 1").get(role)
  );
}
