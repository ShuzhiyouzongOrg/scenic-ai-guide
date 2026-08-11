import { getDb } from "../db/database.mjs";

function toRole(row) {
  let permissions = [];
  try {
    permissions = JSON.parse(row.permissions || "[]");
  } catch {
    permissions = [];
  }
  return {
    roleId: row.id,
    roleName: row.role_name,
    roleCode: row.role_code,
    description: row.description || "",
    enabled: Boolean(row.enabled),
    permissions,
    createTime: row.created_at
  };
}

function requireRole(id) {
  const row = getDb().prepare("SELECT * FROM system_roles WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("Role not found.");
    error.statusCode = 404;
    error.code = "ROLE_NOT_FOUND";
    throw error;
  }
  return row;
}

export function listRoles(filters = {}) {
  const conditions = [];
  const values = {};
  for (const [key, column] of [["roleName", "role_name"], ["roleCode", "role_code"], ["description", "description"]]) {
    const value = String(filters[key] || "").trim();
    if (value) {
      conditions.push(`${column} LIKE @${key}`);
      values[key] = `%${value}%`;
    }
  }
  if (filters.enabled !== undefined && filters.enabled !== "") {
    conditions.push("enabled = @enabled");
    values.enabled = filters.enabled === true || filters.enabled === "true" ? 1 : 0;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return getDb().prepare(`SELECT * FROM system_roles ${where} ORDER BY id ASC`).all(values).map(toRole);
}

export function createRole(input = {}) {
  const roleName = String(input.roleName || "").trim();
  const roleCode = String(input.roleCode || "").trim();
  if (!roleName || !roleCode) {
    const error = new Error("Role name and code are required.");
    error.statusCode = 400;
    error.code = "ROLE_REQUIRED";
    throw error;
  }
  const now = new Date().toISOString();
  try {
    const result = getDb().prepare(
      `INSERT INTO system_roles (role_name, role_code, description, enabled, permissions, created_at)
       VALUES (@roleName, @roleCode, @description, @enabled, @permissions, @createdAt)`
    ).run({
      roleName,
      roleCode,
      description: String(input.description || "").trim(),
      enabled: input.enabled === false ? 0 : 1,
      permissions: JSON.stringify(Array.isArray(input.permissions) ? input.permissions : []),
      createdAt: now
    });
    return toRole(requireRole(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) {
      error.statusCode = 409;
      error.code = "ROLE_EXISTS";
    }
    throw error;
  }
}

export function updateRole(id, input = {}) {
  const row = requireRole(id);
  const db = getDb();
  const roleName = input.roleName !== undefined ? String(input.roleName).trim() : row.role_name;
  const roleCode = input.roleCode !== undefined ? String(input.roleCode).trim() : row.role_code;
  const description = input.description !== undefined ? String(input.description).trim() : row.description;
  const enabled = input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0;
  db.prepare(
    `UPDATE system_roles SET role_name=@roleName, role_code=@roleCode, description=@description, enabled=@enabled WHERE id=@id`
  ).run({ id, roleName, roleCode, description, enabled });
  return toRole(requireRole(id));
}

export function updateRolePermissions(id, permissions) {
  requireRole(id);
  const normalized = Array.isArray(permissions) ? permissions.map(String) : [];
  getDb().prepare("UPDATE system_roles SET permissions = ? WHERE id = ?").run(JSON.stringify(normalized), id);
  return toRole(requireRole(id));
}

export function deleteRole(id) {
  const row = requireRole(id);
  if (["admin", "operator", "visitor"].includes(row.role_code)) {
    const error = new Error("Built-in roles cannot be deleted.");
    error.statusCode = 400;
    error.code = "ROLE_PROTECTED";
    throw error;
  }
  getDb().prepare("DELETE FROM system_roles WHERE id = ?").run(id);
  return { roleId: Number(id) };
}
