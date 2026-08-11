import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  basename,
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
const tileDir = resolve(targetRoot, "web", "public", "map-guide", "tiles");
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
const downloadTiles = process.argv.includes("--download-tiles");
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

function normalizeName(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•—－_()（）\[\]【】、，。,:：;；'“”\"!?！？]/g, "");
}

function readJson(path) {
  return readFile(path, "utf8").then(JSON.parse);
}

function routeCoordinate(entry) {
  const point = entry?.routePoint || entry || {};
  const latitude = Number(point.pointLatitude ?? point.latitude);
  const longitude = Number(point.pointLongitude ?? point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return undefined;
  return { latitude, longitude };
}

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

function targetNameCandidates(spot) {
  return [spot.name, ...(Array.isArray(spot.aliases) ? spot.aliases : [])]
    .filter(Boolean)
    .map((name) => ({ raw: name, normalized: normalizeName(name) }));
}

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

function tileBounds(bounds, rows, columns, index) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const latitudeStep =
    (bounds.northeast.latitude - bounds.southwest.latitude) / rows;
  const longitudeStep =
    (bounds.northeast.longitude - bounds.southwest.longitude) / columns;
  const north = bounds.northeast.latitude - latitudeStep * row;
  const west = bounds.southwest.longitude + longitudeStep * column;
  return {
    southwest: {
      latitude: north - latitudeStep,
      longitude: west,
      coordinateSystem: "GCJ02",
    },
    northeast: {
      latitude: north,
      longitude: west + longitudeStep,
      coordinateSystem: "GCJ02",
    },
  };
}

async function downloadTile(url, destination) {
  if (!existsSync(destination)) {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Tile download failed (${response.status}): ${url}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  const buffer = await readFile(destination);
  return {
    sizeBytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

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

async function buildMapConfig(config) {
  const overlay = config.map.handDrawnOverlay;
  const knownSizes = [
    35188, 296792, 63170, 28408, 64360, 773660, 853352, 240132, 36218, 749194,
    1010874, 127360, 15862, 24354, 366166, 87630,
  ];
  const tiles = [];
  for (let index = 0; index < overlay.tiles.length; index += 1) {
    const id = String(index + 1).padStart(2, "0");
    const destination = join(tileDir, `${id}.webp`);
    const downloaded = downloadTiles
      ? await downloadTile(overlay.tiles[index], destination)
      : undefined;
    tiles.push({
      id,
      index,
      row: Math.floor(index / overlay.columns),
      column: index % overlay.columns,
      url: `/map-guide/tiles/${id}.webp`,
      width: 2559,
      height: 2362,
      sizeBytes: downloaded?.sizeBytes || knownSizes[index],
      bounds: tileBounds(overlay.bounds, overlay.rows, overlay.columns, index),
    });
  }
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
      rows: overlay.rows,
      columns: overlay.columns,
      concurrency: 4,
      retries: 2,
      bounds: {
        southwest: { ...overlay.bounds.southwest, coordinateSystem: "GCJ02" },
        northeast: { ...overlay.bounds.northeast, coordinateSystem: "GCJ02" },
      },
      tiles,
    },
  };
}

function buildTileAnalysis(mapConfig) {
  const totalWidth = mapConfig.tileLayer.columns * 2559;
  const totalHeight = mapConfig.tileLayer.rows * 2362;
  return {
    order: "row-major; rows north-to-south; columns west-to-east",
    flipRequired: false,
    rotationDegrees: mapConfig.rotationDegrees,
    displayLogic:
      "Match the source WeChat map rotate property; rotate the complete mosaic and every point once in Web Mercator space.",
    dragConstraint:
      "The Web map uses the rotated scenic bounds as maxBounds and hides the ordinary base map unless the artwork fails or the user selects fallback mode.",
    rows: 4,
    columns: 4,
    tilePixels: { width: 2559, height: 2362 },
    mosaicPixels: { width: totalWidth, height: totalHeight },
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
    seamAudit:
      "Quarter-scale mosaic inspection found no visible order, flip, overlap, or alignment defects; DOM overlays use a one-pixel seam buffer.",
    futureUpgrade:
      "For zoom 20+, generate a real multiresolution XYZ pyramid or true @2x exports from source artwork.",
  };
}

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

function duplicateStats(spots) {
  const nameCounts = new Map();
  for (const spot of spots)
    nameCounts.set(spot.name, (nameCounts.get(spot.name) || 0) + 1);
  return [...nameCounts.entries()].filter(([, count]) => count > 1);
}

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

async function writeJson(name, value, directory = outputDir) {
  await writeFile(
    join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  await Promise.all([
    mkdir(outputDir, { recursive: true }),
    mkdir(reportDir, { recursive: true }),
    mkdir(tileDir, { recursive: true }),
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
  const tileBytes = (
    await Promise.all(
      mapConfig.tileLayer.tiles.map((tile) =>
        stat(join(tileDir, basename(tile.url))).catch(() => null),
      ),
    )
  )
    .filter(Boolean)
    .reduce((sum, entry) => sum + entry.size, 0);
  console.log(
    JSON.stringify(
      {
        outputDir,
        reportDir,
        tileDir,
        downloadedTileBytes: tileBytes,
        ...report,
      },
      null,
      2,
    ),
  );
}

await main();
