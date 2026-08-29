/**
 * @fileoverview 系统角色、权限集合和层级权限匹配的管理服务。
 * @description 提供角色查询、创建、更新、删除及层级权限判定能力。
 */

/**
 * @typedef {object} SystemRole
 * @description 管理端使用的系统角色对象。
 * @property {number} roleId 角色主键。
 * @property {string} roleName 角色显示名称。
 * @property {string} roleCode 登录和鉴权使用的唯一代码。
 * @property {string} description 角色说明。
 * @property {boolean} enabled 是否允许该角色登录和授权。
 * @property {string[]} permissions 权限路径或通配符列表。
 * @property {string} createTime 创建时间。
 */
import { getDb } from "../db/database.mjs";

/**
 * @description 将角色数据库行转换为 API 对象，并容错无效权限 JSON。
 * @private
 * @param {Record<string, *>} row 角色数据库行。
 * @returns {SystemRole} 角色对象。
 */
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

/**
 * @description 查询必须存在的角色。
 * @private
 * @param {string|number} id 角色主键。
 * @returns {Record<string, *>} 原始数据库行。
 * @throws {Error & {statusCode: 404, code: "ROLE_NOT_FOUND"}} 角色不存在时抛出。
 * @throws {Error} 数据库查询失败时透传异常。
 */
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

/**
 * @description 按名称、代码、描述和启用状态筛选角色。
 * @param {object} [filters={}] 查询条件。
 * @param {*} [filters.roleName] 角色名称模糊筛选值。
 * @param {*} [filters.roleCode] 角色代码模糊筛选值。
 * @param {*} [filters.description] 角色描述模糊筛选值。
 * @param {boolean|string} [filters.enabled] 启用状态筛选值。
 * @returns {SystemRole[]} 按主键升序排列的角色列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const enabledRoles = listRoles({ enabled: true });
 */
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

/**
 * @description 获取已启用角色的有效权限字符串。
 * @param {*} roleCode 角色代码。
 * @returns {string[]} 权限列表；角色不存在、未启用或权限 JSON 无效时为空数组。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const permissions = getRolePermissions("operator");
 */
export function getRolePermissions(roleCode) {
  const row = getDb()
    .prepare("SELECT permissions FROM system_roles WHERE role_code = ? AND enabled = 1")
    .get(String(roleCode || ""));
  if (!row) return [];
  try {
    const permissions = JSON.parse(row.permissions || "[]");
    return Array.isArray(permissions)
      ? permissions.map((permission) => String(permission).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/**
 * @description 判断角色是否拥有某项精确权限、父路径权限或全局通配权限。
 * @param {*} roleCode 角色代码。
 * @param {*} requiredPermission 待校验的权限路径，末尾斜杠会被忽略。
 * @returns {boolean} 已启用角色的任一权限覆盖目标时为 `true`。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * hasRolePermission("operator", "/api/admin/scenic-spots");
 */
export function hasRolePermission(roleCode, requiredPermission) {
  const required = String(requiredPermission || "").replace(/\/$/, "");
  if (!required) return false;
  return getRolePermissions(roleCode).some((permission) => {
    const normalized = permission.replace(/\/$/, "");
    return Boolean(
      normalized &&
      (normalized === "*" || normalized === required || required.startsWith(`${normalized}/`))
    );
  });
}

/**
 * @description 创建系统角色。
 * @param {object} [input={}] 角色输入。
 * @param {*} [input.roleName] 角色名称。
 * @param {*} [input.roleCode] 角色代码。
 * @param {*} [input.description] 角色描述。
 * @param {boolean} [input.enabled=true] 是否启用角色。
 * @param {Array<*>} [input.permissions=[]] 角色权限集合。
 * @returns {SystemRole} 新建角色。
 * @throws {Error & {statusCode: 400, code: "ROLE_REQUIRED"}} 名称或代码为空时抛出。
 * @throws {Error & {statusCode: 409, code: "ROLE_EXISTS"}} 唯一约束冲突时抛出。
 * @throws {Error} 其他数据库写入错误会原样透传。
 * @example
 * const role = createRole({ roleName: "讲解员", roleCode: "guide", permissions: ["/api/admin/faq"] });
 */
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

/**
 * @description 更新角色的基础信息和启用状态。
 * @param {string|number} id 角色主键。
 * @param {object} [input={}] 需要更新的字段。
 * @param {*} [input.roleName] 角色名称。
 * @param {*} [input.roleCode] 角色代码。
 * @param {*} [input.description] 角色描述。
 * @param {boolean} [input.enabled] 是否启用角色。
 * @returns {SystemRole} 更新后的角色。
 * @throws {Error & {statusCode: 404, code: "ROLE_NOT_FOUND"}} 角色不存在时抛出。
 * @throws {Error} 数据库更新失败时透传异常。
 * @example
 * const role = updateRole(2, { enabled: false });
 */
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

/**
 * @description 整体替换角色权限列表。
 * @param {string|number} id 角色主键。
 * @param {Array<*>} permissions 新权限集合；非数组会归一化为空数组。
 * @returns {SystemRole} 更新后的角色。
 * @throws {Error & {statusCode: 404, code: "ROLE_NOT_FOUND"}} 角色不存在时抛出。
 * @throws {Error} 数据库更新失败时透传异常。
 * @example
 * const role = updateRolePermissions(2, ["/api/admin/scenic-spots"]);
 */
export function updateRolePermissions(id, permissions) {
  requireRole(id);
  const normalized = Array.isArray(permissions) ? permissions.map(String) : [];
  getDb().prepare("UPDATE system_roles SET permissions = ? WHERE id = ?").run(JSON.stringify(normalized), id);
  return toRole(requireRole(id));
}

/**
 * @description 删除自定义角色；内置管理员、运营人员和游客角色受保护。
 * @param {string|number} id 角色主键。
 * @returns {{roleId: number}} 被删除角色的数值 ID。
 * @throws {Error & {statusCode: 404, code: "ROLE_NOT_FOUND"}} 角色不存在时抛出。
 * @throws {Error & {statusCode: 400, code: "ROLE_PROTECTED"}} 尝试删除内置角色时抛出。
 * @throws {Error} 数据库删除失败时透传异常。
 * @example
 * const result = deleteRole(8);
 */
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
