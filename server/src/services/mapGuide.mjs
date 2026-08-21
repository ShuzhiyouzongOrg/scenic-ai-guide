/**
 * @fileoverview 地图导览静态数据加载与按文件修改时间失效的内存缓存服务。
 *
 * @typedef {"lingshan"|"nianhuawan"} MapGuideAreaId
 * @typedef {object} MapGuideBootstrap
 * @property {string} version 数据协议版本。
 * @property {string} generatedAt 本次加载时间的 ISO 8601 字符串。
 * @property {{id: MapGuideAreaId, name: string, shortName: string, sourceProject: string}} area 景区元数据。
 * @property {*} config 地图配置数据。
 * @property {Array<*>} categories 景点分类数据。
 * @property {Array<*>} spots 景点数据。
 * @property {Array<*>} routes 路线数据。
 * @property {Array<*>} panoramas 全景点位数据。
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {string} 灵山地图导览生成数据的根目录。 */
const rootDataDir = resolve(
  fileURLToPath(new URL("../../data/generated/map-guide", import.meta.url)),
);
/** @type {Record<MapGuideAreaId, string>} 景区 ID 到数据目录的映射。 */
const areaDirectories = {
  lingshan: rootDataDir,
  nianhuawan: resolve(rootDataDir, "nianhuawan"),
};
/** @type {{config: string, categories: string, spots: string, routes: string, panoramas: string}} 地图数据文件名清单。 */
const files = {
  config: "map-config.json",
  categories: "categories.json",
  spots: "spots.json",
  routes: "routes.json",
  panoramas: "panoramas.json",
};

/** @type {Map<MapGuideAreaId, {signature: string, value: MapGuideBootstrap}>} 按景区保存的数据缓存。 */
const cache = new Map();

/**
 * 将任意景区 ID 归一化为地图服务支持的景区。
 * @param {*} areaId 候选景区 ID。
 * @returns {MapGuideAreaId} 受支持的景区 ID；未知值回退为 `lingshan`。
 * @example
 * normalizeMapGuideArea("nianhuawan"); // "nianhuawan"
 */
export function normalizeMapGuideArea(areaId) {
  return Object.hasOwn(areaDirectories, areaId) ? areaId : "lingshan";
}

/**
 * 获取景区对应的数据目录。
 * @private
 * @param {*} areaId 景区 ID。
 * @returns {string} 绝对数据目录。
 */
function dataDir(areaId) {
  return areaDirectories[normalizeMapGuideArea(areaId)];
}

/**
 * 组合景区全部地图文件的修改时间，供缓存失效判断使用。
 * @private
 * @param {*} areaId 景区 ID。
 * @returns {string} 文件签名。
 * @throws {Error} 当任一数据文件不存在或无法读取元数据时抛出文件系统异常。
 */
function signature(areaId) {
  return Object.values(files)
    .map((file) => `${file}:${statSync(resolve(dataDir(areaId), file)).mtimeMs}`)
    .join("|");
}

/**
 * 同步读取并解析指定景区的 JSON 数据文件。
 * @private
 * @param {*} areaId 景区 ID。
 * @param {string} file 数据文件名。
 * @returns {*} 解析后的 JSON 值。
 * @throws {Error|SyntaxError} 当文件不可读或内容不是合法 JSON 时抛出异常。
 */
function readJson(areaId, file) {
  return JSON.parse(readFileSync(resolve(dataDir(areaId), file), "utf8"));
}

/**
 * 获取地图导览启动所需的完整数据，并在源文件变化时自动刷新缓存。
 * @param {*} [areaId="lingshan"] 景区 ID。
 * @returns {MapGuideBootstrap} 地图配置、分类、景点、路线和全景点位数据。
 * @throws {Error|SyntaxError} 当数据文件缺失、不可读或 JSON 无效时抛出异常。
 * @example
 * const bootstrap = getMapGuideBootstrap("lingshan");
 */
export function getMapGuideBootstrap(areaId = "lingshan") {
  const area = normalizeMapGuideArea(areaId);
  const nextSignature = signature(area);
  const cached = cache.get(area);
  if (!cached || cached.signature !== nextSignature) {
    const value = {
      version: "2.0.0",
      generatedAt: new Date().toISOString(),
      area: {
        id: area,
        name: area === "lingshan" ? "灵山胜境" : "拈花湾",
        shortName: area === "lingshan" ? "灵山胜境" : "拈花湾",
        sourceProject:
          area === "lingshan"
            ? "lingshan-miniapp-rebuild"
            : "nianhuawan-miniapp-rebuild",
      },
      config: readJson(area, files.config),
      categories: readJson(area, files.categories),
      spots: readJson(area, files.spots),
      routes: readJson(area, files.routes),
      panoramas: readJson(area, files.panoramas),
    };
    cache.set(area, { signature: nextSignature, value });
    return value;
  }
  return cached.value;
}

/**
 * 获取景区景点列表。
 * @param {*} areaId 景区 ID。
 * @returns {Array<*>} 景点数据。
 * @throws {Error|SyntaxError} 当底层地图数据无法加载时抛出异常。
 * @example
 * const spots = getMapGuideSpots("lingshan");
 */
export function getMapGuideSpots(areaId) {
  return getMapGuideBootstrap(areaId).spots;
}

/**
 * 获取景区推荐路线列表。
 * @param {*} areaId 景区 ID。
 * @returns {Array<*>} 路线数据。
 * @throws {Error|SyntaxError} 当底层地图数据无法加载时抛出异常。
 * @example
 * const routes = getMapGuideRoutes("nianhuawan");
 */
export function getMapGuideRoutes(areaId) {
  return getMapGuideBootstrap(areaId).routes;
}

/**
 * 获取景区全景点位列表。
 * @param {*} areaId 景区 ID。
 * @returns {Array<*>} 全景点位数据。
 * @throws {Error|SyntaxError} 当底层地图数据无法加载时抛出异常。
 * @example
 * const panoramas = getMapGuidePanoramas("lingshan");
 */
export function getMapGuidePanoramas(areaId) {
  return getMapGuideBootstrap(areaId).panoramas;
}
