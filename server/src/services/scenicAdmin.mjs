/**
 * @fileoverview 基于 SQLite 的景点目录管理服务，支持创建、编辑、停用和别名维护。
 *
 * @description 目录初始数据来自生成的知识库，导入后可由管理员独立维护。
 */

/**
 * @typedef {object} ManagedScenicSpot
 * @description 管理端维护并持久化的完整景点资料。
 * @property {string} id 景点 ID。
 * @property {string} scenicArea 所属景区。
 * @property {string} name 景点名称。
 * @property {string[]} aliases 景点别名。
 * @property {string} locationText 位置说明。
 * @property {string} parameters 参数信息。
 * @property {string} coreFunction 核心功能。
 * @property {string} culture 文化背景。
 * @property {string} detail 详细介绍。
 * @property {string} highlights 游览亮点。
 * @property {string} openInfo 开放信息。
 * @property {string} notes 注意事项。
 * @property {string} source 数据来源。
 * @property {boolean} enabled 是否启用。
 * @property {string} updatedAt 更新时间。
 */

import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * @description 将景点数据库行转换为管理端对象。
 * @private
 * @param {Record<string, *>} row 景点数据库行。
 * @returns {ManagedScenicSpot} 规范化景点对象。
 */
function toSpot(row) {
  return {
    id: row.id,
    scenicArea: row.scenic_area || "灵山胜境",
    name: row.name || "",
    aliases: parseJson(row.aliases, []),
    locationText: row.location_text || "",
    parameters: row.parameters || "",
    coreFunction: row.core_function || "",
    culture: row.culture || "",
    detail: row.detail || "",
    highlights: row.highlights || "",
    openInfo: row.open_info || "",
    notes: row.notes || "",
    source: row.source || "admin",
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at
  };
}

/**
 * @description 安全解析数据库中的 JSON 字段。
 * @private
 * @template T
 * @param {*} value JSON 文本。
 * @param {T} fallback 解析失败或结果为 `null` 时的回退值。
 * @returns {*|T} 解析结果或回退值。
 */
function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * @description 列出全部启用景点。
 * @returns {ManagedScenicSpot[]} 按 ID 升序排列的景点列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const spots = listManagedScenicSpots();
 */
export function listManagedScenicSpots() {
  return getDb()
    .prepare("SELECT * FROM scenic_spots WHERE enabled = 1 ORDER BY id ASC")
    .all()
    .map(toSpot);
}

/**
 * @description 列出全部景点，包括已停用记录。
 * @returns {ManagedScenicSpot[]} 按 ID 升序排列的完整景点列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const allSpots = listAllManagedScenicSpots();
 */
export function listAllManagedScenicSpots() {
  return getDb().prepare("SELECT * FROM scenic_spots ORDER BY id ASC").all().map(toSpot);
}

/**
 * @description 创建一个管理员维护的景点。
 * @param {Partial<ManagedScenicSpot>} [input={}] 景点输入；未提供 ID 时自动生成。
 * @returns {ManagedScenicSpot} 已持久化的新景点。
 * @throws {Error & {statusCode: 400, code: "SCENIC_NAME_REQUIRED"}} 景点名称为空时抛出。
 * @throws {Error} 数据库写入或约束校验失败时透传异常。
 * @example
 * const spot = createScenicSpot({ name: "新景点", aliases: ["别名"] });
 */
export function createScenicSpot(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) {
    const error = new Error("Scenic spot name is required.");
    error.statusCode = 400;
    error.code = "SCENIC_NAME_REQUIRED";
    throw error;
  }

  const record = normalizeSpot({
    id: input.id || `LS-CUSTOM-${randomBytes(3).toString("hex").toUpperCase()}`,
    scenicArea: input.scenicArea || "灵山胜境",
    source: "admin",
    enabled: true,
    ...input,
    name
  });
  writeSpot(record);
  return record;
}

/**
 * @description 合并并更新已有景点。
 * @param {string} id 景点 ID。
 * @param {Partial<ManagedScenicSpot>} [input={}] 待更新字段。
 * @returns {ManagedScenicSpot} 更新后的景点。
 * @throws {Error & {statusCode: 404, code: "SCENIC_NOT_FOUND"}} 景点不存在时抛出。
 * @throws {Error} 数据库写入失败时透传异常。
 * @example
 * const spot = updateScenicSpot("LS-001", { openInfo: "07:00-17:30" });
 */
export function updateScenicSpot(id, input = {}) {
  const current = getDb().prepare("SELECT * FROM scenic_spots WHERE id = ?").get(id);
  if (!current) {
    const error = new Error("Scenic spot not found.");
    error.statusCode = 404;
    error.code = "SCENIC_NOT_FOUND";
    throw error;
  }

  const next = normalizeSpot({ ...toSpot(current), ...input, id });
  writeSpot(next);
  return next;
}

/**
 * @description 将景点标记为停用。
 * @param {string} id 景点 ID。
 * @returns {ManagedScenicSpot} 停用后的景点。
 * @throws {Error & {statusCode: 404, code: "SCENIC_NOT_FOUND"}} 景点不存在时抛出。
 * @throws {Error} 数据库写入失败时透传异常。
 * @example
 * const spot = disableScenicSpot("LS-CUSTOM-ABC123");
 */
export function disableScenicSpot(id) {
  return updateScenicSpot(id, { enabled: false });
}

/**
 * @description 以 upsert 方式写入景点数据库。
 * @private
 * @param {ManagedScenicSpot} spot 已规范化的景点。
 * @returns {void} 无返回值。
 * @throws {Error} 数据库写入或约束校验失败时透传异常。
 */
function writeSpot(spot) {
  getDb()
    .prepare(
      `INSERT INTO scenic_spots
         (id, scenic_area, name, aliases, location_text, parameters, core_function,
          culture, detail, highlights, open_info, notes, source, enabled, updated_at)
       VALUES
         (@id, @scenic_area, @name, @aliases, @location_text, @parameters, @core_function,
          @culture, @detail, @highlights, @open_info, @notes, @source, @enabled, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         scenic_area = @scenic_area, name = @name, aliases = @aliases,
         location_text = @location_text, parameters = @parameters, core_function = @core_function,
         culture = @culture, detail = @detail, highlights = @highlights, open_info = @open_info,
         notes = @notes, source = @source, enabled = @enabled, updated_at = @updated_at`
    )
    .run({
      id: spot.id,
      scenic_area: spot.scenicArea,
      name: spot.name,
      aliases: JSON.stringify(spot.aliases || []),
      location_text: spot.locationText,
      parameters: spot.parameters,
      core_function: spot.coreFunction,
      culture: spot.culture,
      detail: spot.detail,
      highlights: spot.highlights,
      open_info: spot.openInfo,
      notes: spot.notes,
      source: spot.source,
      enabled: spot.enabled ? 1 : 0,
      updated_at: spot.updatedAt
    });
}

/**
 * @description 清理景点字段并补充更新时间。
 * @private
 * @param {Partial<ManagedScenicSpot>} input 原始景点输入。
 * @returns {ManagedScenicSpot} 可直接持久化的景点对象。
 */
function normalizeSpot(input) {
  return {
    id: String(input.id || "").trim(),
    scenicArea: String(input.scenicArea || "灵山胜境").trim(),
    name: String(input.name || "").trim(),
    aliases: Array.isArray(input.aliases) ? input.aliases.map((item) => String(item).trim()).filter(Boolean) : [],
    locationText: String(input.locationText || "").trim(),
    parameters: String(input.parameters || "").trim(),
    coreFunction: String(input.coreFunction || "").trim(),
    culture: String(input.culture || "").trim(),
    detail: String(input.detail || "").trim(),
    highlights: String(input.highlights || "").trim(),
    openInfo: String(input.openInfo || "").trim(),
    notes: String(input.notes || "").trim(),
    source: input.source || "admin",
    enabled: input.enabled !== false,
    updatedAt: new Date().toISOString()
  };
}
