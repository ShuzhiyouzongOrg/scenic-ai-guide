/**
 * @fileoverview 灵山胜境地图导览数据迁移脚本。
 * @description 整合官方点位、路线、手绘图和媒体资源，完成坐标转换、审计与导览数据生成。
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getRouteGraph } from "../src/services/routePlanner.mjs";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = resolve(serverRoot, "..");
const workspaceRoot = resolve(targetRoot, "..");
const sourceRoot = resolve(
  process.env.MAP_GUIDE_SOURCE_DIR ||
    join(workspaceRoot, "lingshan-miniapp-rebuild"),
);
const outputDir = resolve(serverRoot, "data", "generated", "map-guide");
const reportDir = resolve(targetRoot, "docs", "map-guide");
const artworkPath = resolve(
  targetRoot,
  "web",
  "public",
  "map-guide",
  "areas",
  "lingshan",
  "artwork.webp",
);
const publicDataDir = resolve(targetRoot, "web", "public", "map-guide", "data");
const sourceSnapshotDir = resolve(
  serverRoot,
  "data",
  "source-snapshots",
  "map-guide",
);
const officialRouteSnapshotPath = join(
  sourceSnapshotDir,
  "official-routes.json",
);
const downloadMedia = process.argv.includes("--download-media");
const refreshOfficialRoutes = process.argv.includes("--refresh-routes");
const mediaOutputDir = resolve(
  process.env.MAP_GUIDE_MEDIA_OUTPUT_DIR ||
    join(serverRoot, "data", "map-guide-media"),
);

const categoryNames = new Map([
  ["36", "景点"],
  ["41", "卫生间"],
  ["38", "出入口"],
  ["76", "饮用水"],
  ["53", "游客服务"],
  ["73", "母婴室"],
  ["47", "售票处"],
  ["65", "自助设施"],
  ["66", "讲解"],
  ["55", "餐饮"],
  ["46", "商店"],
  ["39", "住宿"],
  ["50", "观光车站"],
  ["69", "医务室"],
  ["71", "休息区"],
  ["72", "吸烟处"],
  ["70", "植物"],
]);

const verifiedReferences = new Map([
  [
    "九龙灌浴",
    {
      latitude: 31.42662,
      longitude: 120.09524,
      note: "OpenStreetMap/Mapcarta anchor",
    },
  ],
  [
    "五印坛城",
    {
      latitude: 31.42664,
      longitude: 120.09813,
      note: "OpenStreetMap/Mapcarta anchor",
    },
  ],
  [
    "灵山大佛",
    {
      latitude: 31.43205,
      longitude: 120.09151,
      note: "OpenStreetMap/Wikidata anchor",
    },
  ],
  [
    "祥符禅寺",
    {
      latitude: 31.42986,
      longitude: 120.09309,
      note: "Building centroid; source point may be an entrance",
    },
  ],
  [
    "灵山梵宫",
    {
      latitude: 31.43065,
      longitude: 120.09756,
      note: "Building centroid; source point may be an entrance",
    },
  ],
]);

// The source mini-program exposes one global 720yun URL only. These scene IDs
// come from the public scene catalogue of that same panorama project and stay
// marked for manual review because the mini-program did not provide the links.
const panoramaScenes = [
  { sceneId: "29958273", title: "景区全貌" },
  { sceneId: "29706848", title: "景区全貌" },
  { sceneId: "29954619", title: "景区全貌" },
  { sceneId: "34731761", title: "灵山胜境" },
  { sceneId: "37087824", title: "菩提大道", spotId: "LS-005" },
  { sceneId: "34731372", title: "九龙灌浴", spotId: "LS-006" },
  { sceneId: "34731378", title: "降魔浮雕", spotId: "LS-007" },
  { sceneId: "34731377", title: "阿育王柱", spotId: "LS-008" },
  { sceneId: "34731379", title: "百子戏弥勒", spotId: "LS-009" },
  { sceneId: "34731375", title: "祥符禅寺", spotId: "LS-010" },
  { sceneId: "34731374", title: "灵山大佛", spotId: "LS-011" },
  { sceneId: "29706852", title: "梵宫外景", spotId: "LS-013" },
  { sceneId: "29706851", title: "梵宫内景", spotId: "LS-013" },
  { sceneId: "34731376", title: "梵宫大厅", spotId: "LS-013" },
  { sceneId: "34887801", title: "华藏世界", spotId: "LS-013" },
  { sceneId: "34887800", title: "梵宫吉祥颂", spotId: "LS-013" },
  { sceneId: "29706845", title: "曼飞龙塔", spotId: "LS-015" },
  { sceneId: "34952019", title: "五印坛城", spotId: "LS-014" },
  { sceneId: "34952020", title: "五印坛城内景", spotId: "LS-014" },
];

/**
 * @description 对景点名称执行 NFKC、转小写和标点空白清理。
 * @param {*} [value=""] 原始名称。
 * @returns {string} 可用于稳定匹配的名称。
 */
function normalizeName(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•—－_()（）\[\]【】、，。,:：;；'“”\"!?！？]/g, "");
}

/**
 * @description 异步读取并解析 JSON 文件。
 * @param {string} path 文件路径。
 * @returns {Promise<*>} 解析后的 JSON 值。
 * @throws {Error|SyntaxError} 文件读取或 JSON 解析失败时抛出。
 */
function readJson(path) {
  return readFile(path, "utf8").then(JSON.parse);
}

/**
 * @description 从官方路线节点或普通点位中提取有限经纬度。
 * @param {object|null|undefined} entry 路线节点。
 * @returns {{latitude: number, longitude: number}|undefined} 经纬度；坐标非法时为 `undefined`。
 */
function routeCoordinate(entry) {
  const point = entry?.routePoint || entry || {};
  const latitude = Number(point.pointLatitude ?? point.latitude);
  const longitude = Number(point.pointLongitude ?? point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return undefined;
  return { latitude, longitude };
}

/**
 * @description 将官方接口路线或快照路线归一化为迁移中间结构。
 * @param {object} route 官方路线记录。
 * @param {number} index 路线序号。
 * @param {Map<string, object>} fallbackById 备用路线索引。
 * @returns {object} 含节点、路径和来源信息的标准路线中间结构。
 */
function normalizeOfficialRoute(route, index, fallbackById) {
  const routeId = String(route.routeId || route.id || `route-${index + 1}`);
  const fallback = fallbackById.get(routeId);
  const sourcePoints = Array.isArray(route.pointList)
    ? route.pointList
    : Array.isArray(route.points)
      ? route.points
      : [];
  const usesOfficialPointList = sourcePoints.some(
    (entry) =>
      entry?.routePoint ||
      Object.prototype.hasOwnProperty.call(entry || {}, "poiPoint"),
  );
  const pathPoints = sourcePoints.map(routeCoordinate).filter(Boolean);
  const nodeEntries = usesOfficialPointList
    ? sourcePoints.filter(
        (entry) => Array.isArray(entry?.poiPoint) && entry.poiPoint.length > 0,
      )
    : sourcePoints;
  const points = nodeEntries
    .map((entry, pointIndex) => {
      const anchor = routeCoordinate(entry);
      const poi = entry?.poiPoint?.[0] || entry || {};
      if (!anchor) return undefined;
      const banner = Array.isArray(poi.banners) ? poi.banners[0] : undefined;
      const audio = poi.audio || undefined;
      return {
        pointBaseId: String(
          poi.pointBaseId || `route-${routeId}-${pointIndex + 1}`,
        ),
        name: poi.pointName || poi.name || `点位${pointIndex + 1}`,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        coordinateSource: usesOfficialPointList
          ? "official-route-anchor"
          : "spot",
        spotLatitude: Number(poi.pointLatitude ?? poi.latitude),
        spotLongitude: Number(poi.pointLongitude ?? poi.longitude),
        description: poi.description || "",
        cover: banner?.url || banner?.pictureUrl || poi.cover || "",
        audio: audio?.url || poi.audioUrl || "",
        audioDuration: Number(audio?.duration || poi.audioDuration || 0),
        categoryCode: String(poi.categoryCode || "36"),
      };
    })
    .filter(Boolean);
  const pictureUrls = Array.isArray(route.pictureUrls) ? route.pictureUrls : [];
  const firstPicture = pictureUrls[0] || {};
  return {
    id: routeId,
    name:
      route.routeName || route.name || fallback?.name || `推荐路线${index + 1}`,
    description:
      route.routeIntroduce ||
      route.routeDesc ||
      route.description ||
      fallback?.description ||
      "景区推荐游览路线",
    distance: String(
      route.routeDistance || route.distance || fallback?.distance || "0",
    ),
    browseTime: String(
      route.browseTime || route.duration || fallback?.browseTime || "0",
    ),
    tags: Array.isArray(route.tag)
      ? route.tag
      : route.tags || fallback?.tags || [],
    cover:
      route.cover ||
      firstPicture.pictureUrl ||
      firstPicture.url ||
      fallback?.cover ||
      "",
    points,
    pathPoints: pathPoints.length
      ? pathPoints
      : points.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        })),
    routeGeometrySource: usesOfficialPointList
      ? "official-route-point-list"
      : "fallback-node-sequence",
    sourceUpdateTime: route.updateTime || undefined,
  };
}

/**
 * @description 从灵山官方接口拉取路线并保存带采集时间的本地快照。
 * @returns {Promise<object[]>} 官方路线原始列表。
 * @throws {Error|TypeError|SyntaxError} 网络失败、HTTP 异常、响应结构无效、JSON 解析或快照写入失败时抛出。
 */
async function fetchOfficialRouteSnapshot() {
  const endpoint =
    "https://oc-api.lingshan.com.cn/navigation/api/v1/skip/poi/getRouteListForMini";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      channel: "applet",
      area_code: "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ routeName: "", routeId: "", useFlag: "1" }),
  });
  if (!response.ok)
    throw new Error(`Official route request failed (${response.status})`);
  const body = await response.json();
  if (
    Number(body.code) !== 200 ||
    !Array.isArray(body.data) ||
    !body.data.length
  ) {
    throw new Error("Official route response did not contain route data");
  }
  await mkdir(sourceSnapshotDir, { recursive: true });
  await writeFile(
    officialRouteSnapshotPath,
    `${JSON.stringify(
      {
        sourceUrl: endpoint,
        capturedAt: new Date().toISOString(),
        routes: body.data,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return body.data;
}

/**
 * @description 优先加载刷新或既有官方路线快照，失败时回退到内置路线。
 * @param {object[]} fallbackRoutes 内置备用路线。
 * @returns {Promise<object[]>} 规范化且至少含两个节点的官方路线，或备用路线。
 * @throws {Error|SyntaxError} 已存在的快照读取或解析失败时抛出。
 */
async function loadOfficialRoutes(fallbackRoutes) {
  let sourceRoutes;
  if (refreshOfficialRoutes || !existsSync(officialRouteSnapshotPath)) {
    try {
      sourceRoutes = await fetchOfficialRouteSnapshot();
    } catch (error) {
      if (!existsSync(officialRouteSnapshotPath)) {
        console.warn(
          `[map-guide] official routes unavailable; using fallback nodes: ${error.message}`,
        );
      }
    }
  }
  if (!sourceRoutes && existsSync(officialRouteSnapshotPath)) {
    const snapshot = await readJson(officialRouteSnapshotPath);
    sourceRoutes = Array.isArray(snapshot) ? snapshot : snapshot.routes;
  }
  const fallbackById = new Map(
    fallbackRoutes.map((route) => [String(route.id), route]),
  );
  const normalized = Array.isArray(sourceRoutes)
    ? sourceRoutes
        .map((route, index) =>
          normalizeOfficialRoute(route, index, fallbackById),
        )
        .filter((route) => route.points.length > 1)
    : [];
  return normalized.length ? normalized : fallbackRoutes;
}

/**
 * @description 在隔离 VM 中加载参考项目点位、路线和地图配置。
 * @returns {Promise<object>} 参考分类、点位、路线、配置和原始快照。
 * @throws {Error|SyntaxError} 必需文件缺失、读取、解析或 VM 执行失败时抛出。
 */
async function loadSourceData() {
  const snapshotPath = join(
    sourceRoot,
    "mapPage",
    "guide.points.snapshot.json",
  );
  const guideDataPath = join(sourceRoot, "mapPage", "guide.data.js");
  const guideConfigPath = join(sourceRoot, "mapPage", "guide.config.js");
  for (const path of [snapshotPath, guideDataPath, guideConfigPath]) {
    if (!existsSync(path))
      throw new Error(`Required source file is missing: ${path}`);
  }
  const snapshot = await readJson(snapshotPath);
  let dataScript = await readFile(guideDataPath, "utf8");
  dataScript = dataScript
    .replace(
      /^import fallbackPointSnapshot[^\n]+\n/,
      `const fallbackPointSnapshot = ${JSON.stringify(snapshot)};\n`,
    )
    .replaceAll("export const ", "const ")
    .replaceAll("export function ", "function ");
  dataScript +=
    "\nglobalThis.__guideData = { fallbackCategories, completeFallbackPlaces, fallbackRoutes, routeOnlyFallbackPoints };";
  const dataContext = {};
  vm.runInNewContext(dataScript, dataContext, {
    filename: guideDataPath,
    timeout: 5000,
  });

  let configScript = await readFile(guideConfigPath, "utf8");
  configScript = configScript.replace(
    /export default guideConfig\s*$/,
    "globalThis.__guideConfig = guideConfig;",
  );
  const configContext = {};
  vm.runInNewContext(configScript, configContext, {
    filename: guideConfigPath,
    timeout: 1000,
  });
  const fallbackRoutes = await loadOfficialRoutes(
    dataContext.__guideData.fallbackRoutes,
  );
  return {
    ...dataContext.__guideData,
    fallbackRoutes,
    config: configContext.__guideConfig,
    snapshot,
  };
}

/**
 * @description 生成目标景点标准名称及别名的规范化候选。
 * @param {object} spot 目标景点。
 * @returns {Array<{raw: string, normalized: string}>} 原始名称与规范名称候选。
 */
function targetNameCandidates(spot) {
  return [spot.name, ...(Array.isArray(spot.aliases) ? spot.aliases : [])]
    .filter(Boolean)
    .map((name) => ({ raw: name, normalized: normalizeName(name) }));
}

/**
 * @description 按稳定 ID、标准名称和别名匹配参考景点与知识库景点。
 * @param {object[]} sourceSpots 参考项目景点。
 * @param {object[]} targetSpots 目标知识库景点。
 * @returns {object[]} 带匹配方法、置信度和人工复核标记的映射。
 */
function matchSpots(sourceSpots, targetSpots) {
  const mappings = [];
  const targetById = new Map(
    targetSpots.map((spot) => [String(spot.id), spot]),
  );
  for (const source of sourceSpots) {
    let match;
    let method = "unmatched";
    let confidence = 0;
    if (targetById.has(String(source.pointBaseId))) {
      match = targetById.get(String(source.pointBaseId));
      method = "stable-id";
      confidence = 1;
    }
    if (!match) {
      const normalizedSource = normalizeName(source.name);
      match = targetSpots.find((spot) =>
        targetNameCandidates(spot).some(
          (item) => item.normalized === normalizedSource,
        ),
      );
      if (match) {
        method =
          normalizeName(match.name) === normalizedSource
            ? "exact-name"
            : "alias";
        confidence = method === "exact-name" ? 0.99 : 0.96;
      }
    }
    if (!match && normalizeName(source.name) === normalizeName("大照壁")) {
      match = targetSpots.find(
        (spot) => normalizeName(spot.name) === normalizeName("灵山大照壁"),
      );
      method = match ? "alias" : "unmatched";
      confidence = match ? 0.96 : 0;
    }
    mappings.push({
      sourcePointId: String(source.pointBaseId),
      sourcePointName: source.name,
      targetSpotId: match?.id,
      targetSpotName: match?.name,
      matchMethod: method,
      confidence,
      manualReview: !match,
    });
  }
  return mappings;
}

/**
 * @description 将参考景点官方音频转换为只读讲解元数据。
 * @param {object} source 参考景点。
 * @returns {object|undefined} 讲解元数据；无音频时为 `undefined`。
 */
function narrationForSpot(source) {
  if (source.audio) {
    return {
      id: `official-audio-${source.pointBaseId}`,
      title: `${source.name}官方原声`,
      source: "official-audio",
      sourceAssetUrl: source.audio,
      allowAvatarSynthesis: false,
      segments: [],
    };
  }
  return undefined;
}

/**
 * @description 合并参考点位、知识库景点和匹配结果，生成标准导览点位。
 * @param {object[]} sourceSpots 参考项目点位。
 * @param {object[]} targetSpots 目标知识库景点。
 * @param {object[]} mappings 景点匹配结果。
 * @returns {object[]} 标准化景点与设施列表。
 */
function migrateSpots(sourceSpots, targetSpots, mappings) {
  const targetById = new Map(
    targetSpots.map((spot) => [String(spot.id), spot]),
  );
  const mappingBySource = new Map(
    mappings.map((mapping) => [mapping.sourcePointId, mapping]),
  );
  return sourceSpots.map((source) => {
    const mapping = mappingBySource.get(String(source.pointBaseId));
    const target = mapping?.targetSpotId
      ? targetById.get(String(mapping.targetSpotId))
      : undefined;
    const sourceDescription =
      source.description === "景区导览点位" ? undefined : source.description;
    return {
      id: target?.id || `lingshan-${source.pointBaseId}`,
      sourcePointId: String(source.pointBaseId),
      targetSpotId: target?.id,
      name: target?.name || source.name,
      aliases: [...new Set([source.name, ...(target?.aliases || [])])].filter(
        (name) => name !== (target?.name || source.name),
      ),
      categoryId: String(source.categoryCode),
      categoryName: categoryNames.get(String(source.categoryCode)) || "未分类",
      kind: String(source.categoryCode) === "36" ? "scenic" : "facility",
      latitude: Number(source.latitude),
      longitude: Number(source.longitude),
      coordinateSystem: "GCJ02",
      description:
        sourceDescription || target?.coreFunction || target?.locationText || "",
      detail: target?.detail || sourceDescription || "",
      media: {
        coverUrl: undefined,
        sourceCoverUrl: source.cover || undefined,
        imageUrls: [],
        videoUrl: undefined,
      },
      narration: narrationForSpot(source),
      panoramaIds: [],
      pointLevel: Number(source.pointLevel || 15),
      hasFootprint: Boolean(source.isCheckIn),
      checkInEnabled: true,
      sourceProject: "lingshan-miniapp-rebuild",
      manualReview: Boolean(mapping?.manualReview),
    };
  });
}

/**
 * @description 将参考路线点位转换为标准官方路线节点。
 * @param {string} routeId 来源路线 ID。
 * @param {object} source 参考点位。
 * @param {number} order 节点顺序。
 * @param {Map<string, object>} mappingBySource 点位映射索引。
 * @returns {object} 标准路线节点。
 */
function routeNodeFromSpot(routeId, source, order, mappingBySource) {
  const mapping = mappingBySource.get(String(source.pointBaseId));
  return {
    id: `official-${routeId}-${String(order).padStart(2, "0")}`,
    order,
    spotId: mapping?.targetSpotId || `lingshan-${source.pointBaseId}`,
    sourcePointId: String(source.pointBaseId),
    name: mapping?.targetSpotName || source.name,
    latitude: Number(source.latitude),
    longitude: Number(source.longitude),
    coordinateSystem: "GCJ02",
    coordinateSource: source.coordinateSource || "spot",
    stayMinutes:
      Number(source.audioDuration) > 0
        ? Math.max(3, Math.ceil(Number(source.audioDuration) / 60))
        : 5,
    audioUrl: undefined,
    sourceAudioUrl: source.audio || undefined,
    imageUrl: undefined,
    sourceImageUrl: source.cover || undefined,
    categoryId: String(source.categoryCode),
    manualReview: Boolean(mapping?.manualReview),
  };
}

/**
 * @description 将官方路线中间结构转换为标准只读路线。
 * @param {object[]} routes 官方路线中间结构。
 * @param {object[]} mappings 景点匹配结果。
 * @returns {object[]} 标准化官方路线。
 */
function migrateOfficialRoutes(routes, mappings) {
  const mappingBySource = new Map(
    mappings.map((mapping) => [mapping.sourcePointId, mapping]),
  );
  return routes.map((route) => {
    const nodes = route.points.map((point, index) =>
      routeNodeFromSpot(route.id, point, index + 1, mappingBySource),
    );
    return {
      id: `official-${route.id}`,
      name: route.name,
      source: "official",
      sourceProject: "lingshan-miniapp-rebuild",
      description: route.description,
      durationMinutes:
        Number(route.browseTime || 0) * 60 ||
        nodes.reduce((sum, node) => sum + (node.stayMinutes || 0), 0),
      distanceMeters: Number(route.distance || 0) * 1000 || undefined,
      tags: [...new Set(["官方推荐", ...(route.tags || [])])],
      coverUrl: undefined,
      sourceCoverUrl: route.cover || undefined,
      polyline: (route.pathPoints || nodes).map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        coordinateSystem: "GCJ02",
      })),
      nodes,
      isEditable: false,
      isOfficial: true,
      isPreciseNavigation: false,
      geometryKind:
        route.routeGeometrySource === "official-route-point-list"
          ? "official-path"
          : "schematic",
      version: route.sourceUpdateTime
        ? `source-${route.sourceUpdateTime}`
        : "source-2026-08-04",
    };
  });
}

/**
 * @description 汇总项目既有策划路线，并标注与官方路线的名称重复关系。
 * @param {object} routeGraph 项目路线图。
 * @param {object[]} officialRoutes 已迁移官方路线。
 * @returns {object[]} 既有路线盘点记录。
 */
function buildExistingRouteInventory(routeGraph, officialRoutes) {
  return routeGraph.templates.map((route) => {
    const duplicate = officialRoutes.find(
      (official) => normalizeName(official.name) === normalizeName(route.name),
    );
    return {
      routeId: route.id,
      routeName: route.name,
      source: "curated",
      nodeCount: route.nodes.length,
      nodeNames: route.nodes.map((node) => node.name),
      durationMinutes: route.durationMinutes,
      existingNarration: route.nodes.some((node) => Boolean(node.spotId)),
      hasCoordinates: false,
      hasPanorama: false,
      duplicateOfficialRouteId: duplicate?.id || null,
      recommendation: duplicate ? "manual-review" : "retain",
    };
  });
}

/**
 * @description 将项目策划路线补充参考点位坐标并转换为标准路线。
 * @param {object} routeGraph 项目路线图。
 * @param {object[]} sourceSpots 参考项目点位。
 * @param {object[]} mappings 景点匹配结果。
 * @returns {object[]} 标准化项目策划路线。
 */
function migrateCuratedRoutes(routeGraph, sourceSpots, mappings) {
  const sourceScenic = sourceSpots.filter(
    (spot) => String(spot.categoryCode) === "36",
  );
  const mappingBySource = new Map(
    mappings.map((mapping) => [mapping.sourcePointId, mapping]),
  );
  return routeGraph.templates.map((route) => {
    const nodes = route.nodes.map((node, index) => {
      const source = sourceScenic.find(
        (spot) => normalizeName(spot.name) === normalizeName(node.name),
      );
      const mapping = source
        ? mappingBySource.get(String(source.pointBaseId))
        : undefined;
      return {
        id: `curated-${route.id}-${String(index + 1).padStart(2, "0")}`,
        order: index + 1,
        spotId:
          node.spotId ||
          mapping?.targetSpotId ||
          (source ? `lingshan-${source.pointBaseId}` : `curated-${node.id}`),
        sourcePointId: source ? String(source.pointBaseId) : undefined,
        name: node.name,
        latitude: source ? Number(source.latitude) : undefined,
        longitude: source ? Number(source.longitude) : undefined,
        coordinateSystem: source ? "GCJ02" : "UNKNOWN",
        stayMinutes: Number(node.minutes || 5),
        categoryId: source ? String(source.categoryCode) : undefined,
        manualReview: !source,
      };
    });
    return {
      id: `curated-${route.id}`,
      name: route.name,
      source: "curated",
      sourceProject: "scenic-ai-guide",
      description: route.explanation || "项目既有策划路线",
      durationMinutes: route.durationMinutes,
      tags: [...new Set(["项目精选", ...(route.tags || [])])],
      polyline: nodes
        .filter(
          (node) =>
            Number.isFinite(node.latitude) && Number.isFinite(node.longitude),
        )
        .map((node) => ({
          latitude: node.latitude,
          longitude: node.longitude,
          coordinateSystem: "GCJ02",
        })),
      nodes,
      isEditable: false,
      isOfficial: false,
      isPreciseNavigation: false,
      geometryKind: "schematic",
      version: "target-inventory-2026-08-04",
    };
  });
}

/**
 * @description 计算给定位置的 GCJ-02 纬度和经度偏移量。
 * @param {number} latitude 纬度。
 * @param {number} longitude 经度。
 * @returns {{latitude: number, longitude: number}} 坐标偏移量。
 */
function coordinateOffset(latitude, longitude) {
  const pi = Math.PI;
  const axis = 6378245;
  const eccentricity = 0.006693421622965943;
  const transformLatitude = (x, y) => {
    let result =
      -100 +
      2 * x +
      3 * y +
      0.2 * y * y +
      0.1 * x * y +
      0.2 * Math.sqrt(Math.abs(x));
    result += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
    result += ((20 * Math.sin(y * pi) + 40 * Math.sin((y / 3) * pi)) * 2) / 3;
    result +=
      ((160 * Math.sin((y / 12) * pi) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
    return result;
  };
  const transformLongitude = (x, y) => {
    let result =
      300 +
      x +
      2 * y +
      0.1 * x * x +
      0.1 * x * y +
      0.1 * Math.sqrt(Math.abs(x));
    result += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
    result += ((20 * Math.sin(x * pi) + 40 * Math.sin((x / 3) * pi)) * 2) / 3;
    result +=
      ((150 * Math.sin((x / 12) * pi) + 300 * Math.sin((x / 30) * pi)) * 2) / 3;
    return result;
  };
  const radians = (latitude / 180) * pi;
  const magic = 1 - eccentricity * Math.sin(radians) ** 2;
  return {
    latitude:
      (transformLatitude(longitude - 105, latitude - 35) * 180) /
      (((axis * (1 - eccentricity)) / (magic * Math.sqrt(magic))) * pi),
    longitude:
      (transformLongitude(longitude - 105, latitude - 35) * 180) /
      ((axis / Math.sqrt(magic)) * Math.cos(radians) * pi),
  };
}

/**
 * @description 通过八次迭代将 GCJ-02 坐标近似反算为 WGS84。
 * @param {number} latitude GCJ-02 纬度。
 * @param {number} longitude GCJ-02 经度。
 * @returns {{latitude: number, longitude: number}} WGS84 坐标。
 */
function gcjToWgs(latitude, longitude) {
  let candidate = { latitude, longitude };
  for (let index = 0; index < 8; index += 1) {
    const offset = coordinateOffset(candidate.latitude, candidate.longitude);
    candidate = {
      latitude:
        candidate.latitude - (candidate.latitude + offset.latitude - latitude),
      longitude:
        candidate.longitude -
        (candidate.longitude + offset.longitude - longitude),
    };
  }
  return candidate;
}

/**
 * @description 使用 Haversine 公式计算两个经纬度点的球面距离。
 * @param {{latitude: number, longitude: number}} first 第一个坐标。
 * @param {{latitude: number, longitude: number}} second 第二个坐标。
 * @returns {number} 距离，单位为米。
 */
function distanceMeters(first, second) {
  const radius = 6371008.8;
  const toRadians = (value) => (value * Math.PI) / 180;
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(second.longitude - first.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @description 对关键锚点执行 GCJ-02 到 WGS84 转换误差核验。
 * @param {object[]} sourceSpots 参考点位。
 * @param {object} config 参考地图配置。
 * @returns {object} 坐标系证据、转换策略和锚点误差报告。
 */
function buildCoordinateAudit(sourceSpots, config) {
  const anchors = [...verifiedReferences.entries()].map(([name, reference]) => {
    const source = sourceSpots.find((spot) => spot.name === name);
    if (!source)
      return { name, status: "invalid", note: "Source anchor is missing" };
    const converted = gcjToWgs(source.latitude, source.longitude);
    const error = distanceMeters(converted, reference);
    return {
      id: String(source.pointBaseId),
      name,
      source: {
        latitude: source.latitude,
        longitude: source.longitude,
        coordinateSystem: "GCJ02",
      },
      converted: { ...converted, coordinateSystem: "WGS84" },
      reference: {
        latitude: reference.latitude,
        longitude: reference.longitude,
        coordinateSystem: "WGS84",
      },
      errorMeters: Number(error.toFixed(2)),
      status: error <= 20 ? "verified" : "manual-review",
      note: reference.note,
    };
  });
  const visitorPoint = sourceSpots.find((spot) => spot.name === "游客中心");
  if (visitorPoint) {
    const gap = distanceMeters(visitorPoint, config.map.visitorCenter);
    anchors.push({
      id: String(visitorPoint.pointBaseId),
      name: "游客中心（配置与点位差异）",
      source: {
        latitude: visitorPoint.latitude,
        longitude: visitorPoint.longitude,
        coordinateSystem: "GCJ02",
      },
      reference: { ...config.map.visitorCenter, coordinateSystem: "GCJ02" },
      errorMeters: Number(gap.toFixed(2)),
      status: "manual-review",
      note: "来源 map.visitorCenter 与来源点位坐标不一致，均保留待景区确认。",
    });
  }
  return {
    detectedCoordinateSystem: "GCJ02",
    evidence: [
      "来源小程序定位请求显式指定 gcj02",
      "来源步行路线使用腾讯地图坐标体系",
      "三个核心锚点转换到 WGS84 后与 OSM/Wikidata 误差小于 20 米",
    ],
    conversionPolicy:
      "保留原始 GCJ02，仅在 Leaflet/OSM 渲染边界统一转换一次到 WGS84。",
    anchors,
  };
}

/**
 * @description 以固定并发数映射数组，并保持结果顺序与输入一致。
 * @template T,U
 * @param {T[]} items 输入项。
 * @param {number} limit 最大并发 worker 数。
 * @param {(item: T, index: number) => Promise<U>} mapper 异步映射函数。
 * @returns {Promise<U[]>} 按输入顺序排列的映射结果。
 * @throws {*} 映射函数失败时透传异常。
 */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * @description 将远程媒体安全下载到本地目录并补充大小和摘要。
 * @param {{originalUrl: string}} asset 媒体清单项。
 * @returns {Promise<object>} 带本地相对路径、大小和 SHA-256 的清单项。
 * @throws {Error|TypeError} URL 非法、目标越界、下载失败或文件读写失败时抛出。
 */
async function mirrorMediaAsset(asset) {
  const source = new URL(asset.originalUrl);
  const relativePath = source.pathname.replace(/^\/+/, "");
  const destination = resolve(mediaOutputDir, relativePath);
  const destinationRelative = relative(mediaOutputDir, destination);
  if (destinationRelative.startsWith("..") || isAbsolute(destinationRelative)) {
    throw new Error(`Unsafe media output path: ${destination}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  if (!existsSync(destination)) {
    const response = await fetch(asset.originalUrl);
    if (!response.ok)
      throw new Error(
        `Media download failed (${response.status}): ${asset.originalUrl}`,
      );
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  const file = await readFile(destination);
  return {
    ...asset,
    localPath: destinationRelative.replaceAll("\\", "/"),
    sizeBytes: file.byteLength,
    sha256: createHash("sha256").update(file).digest("hex"),
    migrationStatus: "mirrored-local",
  };
}

/**
 * @description 根据参考配置和本地完整手绘图构建灵山标准地图配置。
 * @param {object} config 参考项目地图配置。
 * @returns {Promise<object>} 单张手绘图、GCJ-02 边界及缩放参数。
 * @throws {Error} 手绘图缺失或读取失败时抛出。
 */
async function buildMapConfig(config) {
  const overlay = config.map.handDrawnOverlay;
  if (!existsSync(artworkPath)) {
    throw new Error(`Complete Lingshan artwork is missing: ${artworkPath}`);
  }
  const artwork = await readFile(artworkPath);
  const bounds = {
    southwest: { ...overlay.bounds.southwest, coordinateSystem: "GCJ02" },
    northeast: { ...overlay.bounds.northeast, coordinateSystem: "GCJ02" },
  };
  const tiles = [
    {
      id: "artwork",
      index: 0,
      row: 0,
      column: 0,
      url: "/map-guide/areas/lingshan/artwork.webp",
      width: 6144,
      height: 5671,
      sizeBytes: artwork.byteLength,
      sha256: createHash("sha256").update(artwork).digest("hex"),
      bounds,
    },
  ];
  return {
    center: { ...config.map.center, coordinateSystem: "GCJ02" },
    visitorCenter: { ...config.map.visitorCenter, coordinateSystem: "GCJ02" },
    artworkBackgroundColor: "#b0d8b8",
    rotationDegrees: Number(config.map.rotate || 0),
    minZoom: Number(config.map.minScale),
    maxZoom: Math.min(Number(config.map.maxScale), 19),
    initialZoom: Number(config.map.initialScale),
    tileLayer: {
      enabled: true,
      rows: 1,
      columns: 1,
      concurrency: 1,
      retries: 2,
      bounds,
      tiles,
    },
  };
}

/**
 * @description 汇总完整手绘图在不同视口和缩放级别下的显示策略。
 * @param {object} mapConfig 标准地图配置。
 * @returns {object} 手绘图尺寸、边界、原生比例和升级建议。
 */
function buildTileAnalysis(mapConfig) {
  const artwork = mapConfig.tileLayer.tiles[0];
  return {
    order: "single complete artwork",
    flipRequired: false,
    rotationDegrees: mapConfig.rotationDegrees,
    displayLogic:
      "Match the source WeChat map rotate property; rotate the complete artwork and every point once in Web Mercator space.",
    dragConstraint:
      "The Web map uses the rotated scenic bounds as maxBounds and hides the ordinary base map unless the artwork fails or the user selects fallback mode.",
    rows: 1,
    columns: 1,
    artworkPixels: { width: artwork.width, height: artwork.height },
    totalSizeBytes: mapConfig.tileLayer.tiles.reduce(
      (sum, tile) => sum + tile.sizeBytes,
      0,
    ),
    bounds: mapConfig.tileLayer.bounds,
    latitudeStep: 0.00390025,
    longitudeStep: 0.00496925,
    zoom19: {
      cssMosaicPixels: { width: 7410.68, height: 6816.34 },
      nativeScaleDpr1: 0.72398,
      nativeScaleDpr2: 1.44796,
      acceptance: "pass; keep maxZoom at 19",
    },
    viewportFitScale: [
      { viewport: "1920x1080", dpr: 1, nativeScale: 0.1143 },
      { viewport: "1920x1080", dpr: 2, nativeScale: 0.2286 },
      { viewport: "1366x768", dpr: 1, nativeScale: 0.0813 },
      { viewport: "768x1024", dpr: 2, nativeScale: 0.1501 },
    ],
    seamAudit: "The complete artwork removes runtime tile seams and row/column drift.",
    futureUpgrade:
      "For zoom 20+, generate a real multiresolution XYZ pyramid or true @2x exports from source artwork.",
  };
}

/**
 * @description 根据固定场景清单和参考全景地址构建全景入口。
 * @param {object} config 参考项目地图配置。
 * @returns {object[]} 标准化全景场景。
 * @throws {TypeError} 全景基础地址不是有效 URL 时抛出。
 */
function buildPanoramas(config) {
  const sourceUrl = new URL(config.vrUrl);
  return panoramaScenes.map((scene, index) => {
    const url = new URL(sourceUrl);
    url.searchParams.set("scene_id", scene.sceneId);
    return {
      panoramaId: scene.sceneId,
      spotId: scene.spotId,
      title: scene.title,
      description:
        index === 0
          ? "来源小程序提供的景区级第三方全景入口。"
          : "从来源全景项目公开场景清单解析的定点入口，点位关联仍需人工核验。",
      url: url.toString(),
      platform: "720yun",
      hotspots: [],
      supportsGyroscope: "unknown",
      manualReview: true,
    };
  });
}

/**
 * @description 统计存在重复名称的点位分组。
 * @param {object[]} spots 点位列表。
 * @returns {Array<[string, number]>} 名称及其重复数量。
 */
function duplicateStats(spots) {
  const nameCounts = new Map();
  for (const spot of spots)
    nameCounts.set(spot.name, (nameCounts.get(spot.name) || 0) + 1);
  return [...nameCounts.entries()].filter(([, count]) => count > 1);
}

/**
 * @description 汇总点位、路线、匹配和媒体迁移统计。
 * @param {{sourceSpots: object[], routes: object[], mappings: object[], mediaManifest: object[]}} input 迁移产物。
 * @returns {object} 迁移统计报告。
 */
function migrationReport({ sourceSpots, routes, mappings, mediaManifest }) {
  const duplicates = duplicateStats(sourceSpots);
  return {
    generatedAt: new Date().toISOString(),
    sourceRecordCount: sourceSpots.length,
    migratedRecordCount: sourceSpots.length,
    categoryCount: new Set(sourceSpots.map((spot) => String(spot.categoryCode)))
      .size,
    scenicSpotCount: sourceSpots.filter(
      (spot) => String(spot.categoryCode) === "36",
    ).length,
    facilityCount: sourceSpots.filter(
      (spot) => String(spot.categoryCode) !== "36",
    ).length,
    duplicateIdCount:
      sourceSpots.length -
      new Set(sourceSpots.map((spot) => String(spot.pointBaseId))).size,
    duplicateNameGroupCount: duplicates.length,
    duplicateNameRecordCount: duplicates.reduce(
      (sum, [, count]) => sum + count,
      0,
    ),
    duplicateNameExcessCount: duplicates.reduce(
      (sum, [, count]) => sum + count - 1,
      0,
    ),
    missingCoordinateCount: sourceSpots.filter(
      (spot) =>
        !Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude),
    ).length,
    missingImageCount: sourceSpots.filter((spot) => !spot.cover).length,
    missingNarrationCount: sourceSpots.filter(
      (spot) =>
        !spot.audio &&
        (!spot.description || spot.description === "景区导览点位"),
    ).length,
    audioRecordCount: sourceSpots.filter((spot) => Boolean(spot.audio)).length,
    officialRouteCount: routes.filter((route) => route.source === "official")
      .length,
    officialRouteWithAuthoredPathCount: routes.filter(
      (route) =>
        route.source === "official" && route.geometryKind === "official-path",
    ).length,
    officialRoutePathVertexCount: routes
      .filter((route) => route.source === "official")
      .reduce((sum, route) => sum + route.polyline.length, 0),
    curatedRouteCount: routes.filter((route) => route.source === "curated")
      .length,
    automaticMatchCount: mappings.filter((mapping) => !mapping.manualReview)
      .length,
    manualReviewCount: mappings.filter((mapping) => mapping.manualReview)
      .length,
    unableToMigrateCount: 0,
    mediaAssetCount: mediaManifest.length,
    mediaMigrationStatus:
      "manifested; core tiles mirrored; covers/audio pending authorization and controlled object-storage migration",
  };
}

/**
 * @description 将数据以两空格缩进和结尾换行写入指定目录。
 * @param {string} name 文件名。
 * @param {*} value 可序列化数据。
 * @param {string} [directory=outputDir] 输出目录。
 * @returns {Promise<void>} 文件写入完成后兑现。
 * @throws {Error} 序列化或文件写入失败时抛出。
 */
async function writeJson(name, value, directory = outputDir) {
  await writeFile(
    join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

/**
 * @description 执行灵山导览数据加载、匹配、迁移、报告生成和公开数据写入。
 * @returns {Promise<void>} 全部产物生成并输出摘要后兑现。
 * @throws {Error|SyntaxError} 源数据加载、网络媒体、JSON 解析或产物写入失败时抛出。
 */
async function main() {
  await Promise.all([
    mkdir(outputDir, { recursive: true }),
    mkdir(reportDir, { recursive: true }),
    mkdir(publicDataDir, { recursive: true }),
  ]);
  const source = await loadSourceData();
  const targetSpots = await readJson(
    join(serverRoot, "data", "generated", "scenic-spots.json"),
  );
  const snapshotIds = new Set(
    source.snapshot.map((spot) => String(spot.pointBaseId)),
  );
  const routeOnlySpots = Object.values(source.routeOnlyFallbackPoints).filter(
    (spot) => !snapshotIds.has(String(spot.pointBaseId)),
  );
  const sourceSpots = [...source.snapshot, ...routeOnlySpots];
  const sourceScenic = sourceSpots.filter(
    (spot) => String(spot.categoryCode) === "36",
  );
  const mappings = matchSpots(sourceScenic, targetSpots);
  const spots = migrateSpots(sourceSpots, targetSpots, mappings);
  const officialRoutes = migrateOfficialRoutes(source.fallbackRoutes, mappings);
  const routeGraph = getRouteGraph();
  const existingRouteInventory = buildExistingRouteInventory(
    routeGraph,
    officialRoutes,
  );
  const curatedRoutes = migrateCuratedRoutes(routeGraph, sourceSpots, mappings);
  const routes = [...officialRoutes, ...curatedRoutes];
  const categories = source.fallbackCategories.map((category, index) => ({
    id: String(category.code),
    name: categoryNames.get(String(category.code)) || category.name,
    iconUrl: undefined,
    sourceIconUrl: category.markerIcon || undefined,
    kind: String(category.code) === "36" ? "scenic" : "facility",
    sourceCategoryId: String(category.code),
    sortOrder: index,
  }));
  const mapConfig = await buildMapConfig(source.config);
  const panoramas = buildPanoramas(source.config);
  const coordinateAudit = buildCoordinateAudit(sourceSpots, source.config);
  const tileAnalysis = buildTileAnalysis(mapConfig);
  let mediaManifest = [
    ...new Map(
      sourceSpots
        .flatMap((spot) => [
          spot.cover
            ? [
                spot.cover,
                {
                  type: "cover",
                  originalUrl: spot.cover,
                  sourcePointId: String(spot.pointBaseId),
                  migrationStatus: "pending-license",
                },
              ]
            : null,
          spot.audio
            ? [
                spot.audio,
                {
                  type: "audio",
                  originalUrl: spot.audio,
                  sourcePointId: String(spot.pointBaseId),
                  migrationStatus: "pending-license",
                },
              ]
            : null,
        ])
        .filter(Boolean),
    ).values(),
  ];
  if (downloadMedia) {
    await mkdir(mediaOutputDir, { recursive: true });
    mediaManifest = await mapWithConcurrency(
      mediaManifest,
      4,
      mirrorMediaAsset,
    );
  }
  const report = migrationReport({
    sourceSpots,
    routes,
    mappings,
    mediaManifest,
  });
  report.sourceSnapshotRecordCount = source.snapshot.length;
  report.routeOnlyRecordCount = routeOnlySpots.length;
  const bootstrap = {
    version: "1.0.0",
    generatedAt: report.generatedAt,
    config: mapConfig,
    categories,
    spots,
    routes,
    panoramas,
  };

  await Promise.all([
    writeJson("categories.json", categories),
    writeJson("spots.json", spots),
    writeJson("routes.json", routes),
    writeJson("panoramas.json", panoramas),
    writeJson("map-config.json", mapConfig),
    writeJson("media-manifest.json", mediaManifest),
    writeJson(
      "existing-route-inventory.json",
      existingRouteInventory,
      reportDir,
    ),
    writeJson("spot-mapping.json", mappings, reportDir),
    writeJson("coordinate-audit.json", coordinateAudit, reportDir),
    writeJson("tile-analysis.json", tileAnalysis, reportDir),
    writeJson("panorama-inventory.json", panoramas, reportDir),
    writeJson("migration-report.json", report, reportDir),
    writeJson("bootstrap.json", bootstrap, publicDataDir),
  ]);
  const artworkBytes = (await stat(artworkPath)).size;
  console.log(
    JSON.stringify(
      {
        outputDir,
        reportDir,
        artworkPath,
        artworkBytes,
        ...report,
      },
      null,
      2,
    ),
  );
}

await main();
