import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = resolve(serverRoot, "..");
const workspaceRoot = resolve(targetRoot, "..");
const sourceRoot = resolve(
  process.env.NIANHUAWAN_MAP_GUIDE_SOURCE_DIR ||
    join(workspaceRoot, "nianhuawan-miniapp-rebuild"),
);
const sourceMapDir = join(sourceRoot, "mapPage");
const outputDir = join(
  serverRoot,
  "data",
  "generated",
  "map-guide",
  "nianhuawan",
);
const sourceSnapshotDir = join(
  serverRoot,
  "data",
  "source-snapshots",
  "map-guide",
  "nianhuawan",
);
const reportDir = join(targetRoot, "docs", "map-guide", "nianhuawan");
const publicDataDir = join(
  targetRoot,
  "web",
  "public",
  "map-guide",
  "data",
  "nianhuawan",
);
const tileDir = join(
  targetRoot,
  "web",
  "public",
  "map-guide",
  "areas",
  "nianhuawan",
  "tiles",
);
const downloadTiles = process.argv.includes("--download-tiles");

const panoramaScenes = [
  ["50158908", "29546616", "航拍全景", -291.75091840583787, 19.079337297330802, 121.32357656931525],
  ["50158909", "29546615", "花海航拍", -291.75091840583787, 19.079337297330802, 121.32357656931525],
  ["49906871", "29412761", "花海一角", -291.75091840583787, 19.079337297330802, 121.32357656931525],
  ["49906872", "29412733", "花海一角", -291.75091840583787, 19.079337297330802, 121.32357656931525],
  ["49906876", "29412649", "五灯湖广场", -352.16823503593554, 17.713026624815072, 121.32357656931525, "175"],
  ["49906878", "29412610", "小火车站", -355.89619284144686, 8.368197410673954, 121.32357656931525],
  ["49906875", "29412683", "拈花塔", -365.9751261885981, -25.280942856972445, 121.32357656931525, "169"],
  ["49906874", "29412703", "妙音台", -182.76885272075975, -3.4508955531554637, 121.32357656931525, "170"],
  ["49906877", "29412621", "香月花街", -428.38687456121716, -7.931908263544028, 121.32357656931525, "658"],
  ["49906869", "29412786", "禅乐馆", -417.8841223809514, 4.9791714052887395, 151.4, "181"],
  ["49906870", "29412776", "福田阁", -362.75362238497377, -17.46394793116714, 121.32357656931525, "167"],
  ["49906879", "29412598", "游船码头", -291.75091840583787, 19.079337297330802, 121.32357656931525],
  ["49906867", "29412824", "半山衔日", -365.321693590391, 5.84798745624236, 121.32357656931525, "166"],
  ["49906873", "29412716", "会议中心", -359.86896194451515, -10.410994844252185, 151.4],
  ["49906868", "29412803", "波罗蜜多酒店", -364.89855863935315, -38.82115445642912, 151.4, "206"],
];

const panoramaHotspots = [
  ["50158908", "s_50158908_0", "五灯湖广场", "49906876", 120.45, 5.93],
  ["50158908", "s_50158908_1", "小火车站", "49906878", 128.87, 4.553],
  ["50158908", "s_50158908_2", "拈花塔", "49906875", 99.551, 58.593],
  ["50158908", "s_50158908_3", "妙音台", "49906874", -177.213, 61.176],
  ["50158908", "s_50158908_4", "香月花街", "49906877", -90.495, 58.428],
  ["50158908", "s_50158908_5", "禅乐馆", "49906869", -74.15, 20.251],
  ["50158908", "s_50158908_6", "福田阁", "49906870", -88.725, 19.655],
  ["50158908", "s_50158908_7", "游船码头", "49906879", -51.861, 17.636],
  ["50158908", "s_50158908_8", "半山衔日", "49906867", -70.382, 5.297],
  ["50158908", "s_50158908_9", "会议中心", "49906873", 153.89, -3.952],
  ["50158908", "s_50158908_10", "波罗蜜多酒店", "49906868", 170.174, -3.696],
  ["50158908", "s_50158908_11", "花海一角", "49906871", 165.885, 23.662],
  ["50158908", "s_50158908_12", "花海一角", "49906872", -172.955, 10.644],
  ["50158908", "s_50158908_13", "花海航拍", "50158909", -151.987, -3.407],
  ["50158909", "s_50158909_0", "航拍全景", "50158908", 117.361, -48.825],
  ["49906871", "s_49906871_0", "花海一角", "49906872", -43.912, -5.127],
  ["49906871", "s_49906871_1", "航拍全景", "50158908", -23.368, -29.714],
  ["49906872", "s_49906872_0", "花海一角", "49906871", 83.785, 10.254],
  ["49906872", "s_49906872_1", "航拍全景", "50158908", 76.5, -21.918],
  ["49906872", "s_49906872_2", "五灯湖广场", "49906876", -30.479, -5.53],
  ["49906872", "s_49906872_3", "小火车站", "49906878", 2.547, -5.241],
  ["49906872", "s_49906872_4", "拈花塔", "49906875", -138.369, 0.835],
  ["49906876", "s_49906876_0", "花海一角", "49906872", 109.074, -9.336],
  ["49906876", "s_49906876_1", "航拍全景", "50158908", 75.72, -37.439],
  ["49906876", "s_49906876_2", "拈花塔", "49906875", -154.997, -0.804],
  ["49906876", "s_49906876_3", "小火车站", "49906878", 82.685, -8.044],
  ["49906878", "s_49906878_0", "会议中心", "49906873", 51.181, -7.34],
  ["49906878", "s_49906878_1", "五灯湖广场", "49906876", -107.025, -2.837],
  ["49906878", "s_49906878_2", "航拍全景", "50158908", 1.755, -29.395],
  ["49906875", "s_49906875_0", "香月花街", "49906877", 161.974, -13.005],
  ["49906875", "s_49906875_1", "航拍全景", "50158908", 161.973, -39.768],
  ["49906875", "s_49906875_2", "妙音台", "49906874", 86.106, -29.025],
  ["49906875", "s_49906875_3", "五灯湖广场", "49906876", 60.043, -29.444],
  ["49906874", "s_49906874_0", "拈花塔", "49906875", -4.311, -2.011],
  ["49906874", "s_49906874_1", "航拍全景", "50158908", 8.359, -73.668],
  ["49906877", "s_49906877_0", "拈花塔", "49906875", -58.703, -11.417],
  ["49906877", "s_49906877_1", "航拍全景", "50158908", -66.564, -44.017],
  ["49906877", "s_49906877_2", "禅乐馆", "49906869", 124.517, -15.662],
  ["49906869", "s_49906869_0", "香月花街", "49906877", 35.027, 5.699],
  ["49906869", "s_49906869_1", "航拍全景", "50158908", 26.553, -41.036],
  ["49906869", "s_49906869_2", "福田阁", "49906870", 128.537, -12.278],
  ["49906869", "s_49906869_3", "游船码头", "49906879", -145.198, -13.983],
  ["49906870", "s_49906870_0", "禅乐馆", "49906869", -177.105, 5.12],
  ["49906870", "s_49906870_1", "航拍全景", "50158908", -10.46, -75.932],
  ["49906879", "s_49906879_0", "禅乐馆", "49906869", 15.605, -3.542],
  ["49906879", "s_49906879_1", "半山衔日", "49906867", 152.307, -9.424],
  ["49906879", "s_49906879_2", "航拍全景", "50158908", -10.654, -65.618],
  ["49906867", "s_49906867_0", "游船码头", "49906879", 104.388, -10.414],
  ["49906867", "s_49906867_1", "航拍全景", "50158908", 104.228, -36.263],
  ["49906873", "s_49906873_0", "波罗蜜多酒店", "49906868", -15.395, -6.419],
  ["49906873", "s_49906873_1", "小火车站", "49906878", 12.942, -6.192],
  ["49906873", "s_49906873_2", "航拍全景", "50158908", -0.265, -41.589],
  ["49906868", "s_49906868_0", "会议中心", "49906873", 172.326, 5.762],
  ["49906868", "s_49906868_1", "航拍全景", "50158908", 4.409, -75.254],
];

const sourceFiles = {
  categories: join(sourceMapDir, "guide.categories.snapshot.json"),
  points: join(sourceMapDir, "guide.points.snapshot.json"),
  routes: join(sourceMapDir, "guide.routes.snapshot.json"),
  config: join(sourceMapDir, "guide.config.js"),
};

function readJson(path) {
  return readFile(path, "utf8").then(JSON.parse);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadConfig() {
  let script = await readFile(sourceFiles.config, "utf8");
  script = script.replace(
    /export default guideConfig\s*$/,
    "globalThis.__guideConfig = guideConfig;",
  );
  const context = {};
  vm.runInNewContext(script, context, {
    filename: sourceFiles.config,
    timeout: 1000,
  });
  return context.__guideConfig;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function tileBounds(bounds, rows, columns, index) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const latitudeStep =
    (bounds.northeast.latitude - bounds.southwest.latitude) / rows;
  const longitudeStep =
    (bounds.northeast.longitude - bounds.southwest.longitude) / columns;
  return {
    southwest: {
      latitude: bounds.northeast.latitude - (row + 1) * latitudeStep,
      longitude: bounds.southwest.longitude + column * longitudeStep,
      coordinateSystem: "GCJ02",
    },
    northeast: {
      latitude: bounds.northeast.latitude - row * latitudeStep,
      longitude: bounds.southwest.longitude + (column + 1) * longitudeStep,
      coordinateSystem: "GCJ02",
    },
  };
}

function pngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Downloaded hand-drawn tile is not a valid PNG image");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function downloadTile(url, destination) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const dimensions = pngDimensions(buffer);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, buffer);
      return {
        ...dimensions,
        sizeBytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Unable to mirror tile ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function inspectTile(destination) {
  const buffer = await readFile(destination);
  return {
    ...pngDimensions(buffer),
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

async function buildMapConfig(config) {
  const overlay = config.map.handDrawnOverlay;
  if (overlay.rows !== 4 || overlay.columns !== 4 || overlay.tiles.length !== 16) {
    throw new Error("Nianhuawan artwork must remain a 4x4, 16-tile layer");
  }
  const tileMetadata = await mapWithConcurrency(
    overlay.tiles,
    4,
    async (url, index) => {
      const id = String(index + 1).padStart(2, "0");
      const destination = join(tileDir, `${id}.png`);
      if (downloadTiles || !existsSync(destination)) {
        return downloadTile(url, destination);
      }
      return inspectTile(destination);
    },
  );
  const tiles = tileMetadata.map((metadata, index) => {
    const id = String(index + 1).padStart(2, "0");
    return {
      id,
      index,
      row: Math.floor(index / overlay.columns),
      column: index % overlay.columns,
      url: `/map-guide/areas/nianhuawan/tiles/${id}.png`,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: metadata.sizeBytes,
      sha256: metadata.sha256,
      bounds: tileBounds(overlay.bounds, overlay.rows, overlay.columns, index),
    };
  });
  return {
    center: { ...config.map.center, coordinateSystem: "GCJ02" },
    visitorCenter: {
      ...config.map.visitorCenter,
      coordinateSystem: "GCJ02",
    },
    artworkBackgroundColor: "#90d070",
    rotationDegrees: Number(config.map.rotate || 0),
    minZoom: Number(config.map.minScale),
    maxZoom: Number(config.map.maxScale),
    highDpiMaxZoom: 18,
    initialZoom: Number(config.map.initialScale),
    tileLayer: {
      enabled: true,
      rows: overlay.rows,
      columns: overlay.columns,
      concurrency: 4,
      retries: 2,
      bounds: {
        southwest: {
          ...overlay.bounds.southwest,
          coordinateSystem: "GCJ02",
        },
        northeast: {
          ...overlay.bounds.northeast,
          coordinateSystem: "GCJ02",
        },
      },
      tiles,
    },
  };
}

function migrateCategories(sourceCategories) {
  return sourceCategories.map((category, index) => ({
    id: String(category.code),
    name: category.name,
    iconUrl: undefined,
    sourceIconUrl: category.markerIcon || undefined,
    color: category.color || undefined,
    kind: String(category.code) === "36" ? "scenic" : "facility",
    sourceCategoryId: String(category.code),
    sortOrder: index,
  }));
}

function narrationForPoint(point) {
  if (!point.audio) return undefined;
  return {
    id: `nianhuawan-official-audio-${point.pointBaseId}`,
    title: point.name,
    source: "official-audio",
    sourceAssetUrl: point.audio,
    allowAvatarSynthesis: false,
    segments: [],
  };
}

function migrateSpots(sourcePoints, categories) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return sourcePoints.map((point) => {
    const categoryIds = unique([
      point.categoryCode,
      ...(Array.isArray(point.categoryCodes) ? point.categoryCodes : []),
    ]).filter((id) => categoryById.has(id));
    const categoryId = categoryById.has(String(point.categoryCode))
      ? String(point.categoryCode)
      : categoryIds[0] || "uncategorized";
    const category = categoryById.get(categoryId);
    const genericDescription = point.description === "拈花湾景区导览点位";
    return {
      id: `nianhuawan-${point.pointBaseId}`,
      sourcePointId: String(point.pointBaseId),
      name: point.name,
      aliases: [],
      categoryId,
      categoryIds,
      categoryName: category?.name || "其他设施",
      kind: categoryId === "36" ? "scenic" : "facility",
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      coordinateSystem: "GCJ02",
      description: genericDescription ? undefined : point.description || undefined,
      detail: undefined,
      media: {
        coverUrl: undefined,
        sourceCoverUrl: point.cover || undefined,
        imageUrls: [],
        videoUrl: undefined,
      },
      narration: narrationForPoint(point),
      panoramaIds: [],
      hasFootprint: Boolean(point.isCheckIn),
      checkInEnabled: true,
      pointLevel: Number(point.pointLevel || 15),
      sourceProject: "nianhuawan-miniapp-rebuild",
      manualReview: categoryId === "uncategorized",
    };
  });
}

function collectRouteOnlyPoints(sourceRoutes, sourcePoints) {
  const knownIds = new Set(sourcePoints.map((point) => String(point.pointBaseId)));
  const routeOnlyById = new Map();
  for (const route of sourceRoutes) {
    for (const point of route.points || []) {
      const id = String(point.pointBaseId || "");
      if (!id || knownIds.has(id) || routeOnlyById.has(id)) continue;
      routeOnlyById.set(id, {
        ...point,
        pointBaseId: id,
        categoryCodes: unique([
          point.categoryCode,
          ...(Array.isArray(point.categoryCodes) ? point.categoryCodes : []),
        ]),
      });
    }
  }
  return [...routeOnlyById.values()];
}

function migrateRoutes(sourceRoutes, spots) {
  const spotBySourceId = new Map(
    spots.map((spot) => [String(spot.sourcePointId), spot]),
  );
  return sourceRoutes.map((route) => {
    const nodes = route.points.map((routePoint, index) => {
      const spot = spotBySourceId.get(String(routePoint.pointBaseId));
      return {
        id: `nianhuawan-official-${route.id}-${String(index + 1).padStart(2, "0")}`,
        order: index + 1,
        spotId: spot?.id || `nianhuawan-${routePoint.pointBaseId}`,
        sourcePointId: String(routePoint.pointBaseId),
        name: spot?.name || routePoint.name,
        latitude: spot?.latitude ?? Number(routePoint.latitude),
        longitude: spot?.longitude ?? Number(routePoint.longitude),
        coordinateSystem: "GCJ02",
        coordinateSource: spot ? "spot" : "official-route-anchor",
        sourceRouteAnchor: {
          latitude: Number(routePoint.latitude),
          longitude: Number(routePoint.longitude),
          coordinateSystem: "GCJ02",
        },
        stayMinutes:
          Number(routePoint.audioDuration) > 0
            ? Math.max(3, Math.ceil(Number(routePoint.audioDuration) / 60))
            : 5,
        sourceAudioUrl: routePoint.audio || spot?.narration?.sourceAssetUrl,
        sourceImageUrl: routePoint.cover || spot?.media.sourceCoverUrl,
        categoryId: spot?.categoryId,
        manualReview: !spot,
      };
    });
    const polyline = (route.pathPoints || []).map((point) => ({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      coordinateSystem: "GCJ02",
    }));
    return {
      id: `nianhuawan-official-${route.id}`,
      name: route.name,
      source: "official",
      sourceProject: "nianhuawan-miniapp-rebuild",
      description: route.description,
      durationMinutes:
        Number(route.browseTime || 0) * 60 ||
        nodes.reduce((sum, node) => sum + (node.stayMinutes || 0), 0),
      distanceMeters: Number(route.distance || 0) * 1000 || undefined,
      tags: unique(["官方推荐", ...(route.tags || [])]),
      coverUrl: undefined,
      sourceCoverUrl: route.cover || undefined,
      polyline,
      nodes,
      isEditable: false,
      isOfficial: true,
      isPreciseNavigation: false,
      geometryKind: polyline.length > 1 ? "official-path" : "schematic",
      version: "source-snapshot-2026-08-06",
    };
  });
}

function buildPanoramas(config, spots) {
  const spotBySourceId = new Map(
    spots.map((spot) => [String(spot.sourcePointId), spot]),
  );
  const hotspotsBySceneId = new Map();
  for (const [sourceSceneId, id, title, targetPanoramaId, yaw, pitch] of panoramaHotspots) {
    const hotspots = hotspotsBySceneId.get(sourceSceneId) || [];
    hotspots.push({ id, title, targetPanoramaId, yaw, pitch });
    hotspotsBySceneId.set(sourceSceneId, hotspots);
  }
  return panoramaScenes.map(
    ([sceneId, sourcePanoId, title, yaw, pitch, fieldOfView, sourcePointId]) => {
      const url = new URL(config.vrUrl);
      url.searchParams.set("scene_id", sceneId);
      const spot = sourcePointId
        ? spotBySourceId.get(String(sourcePointId))
        : undefined;
      return {
        panoramaId: sceneId,
        sourcePanoId,
        spotId: spot?.id,
        title,
        description: "来源小程序 720 云全景项目中的场景入口。",
        url: url.toString(),
        platform: "720yun",
        hotspots: hotspotsBySceneId.get(sceneId) || [],
        initialView: { yaw, pitch, fieldOfView },
        supportsGyroscope: "unknown",
        manualReview: !spot,
      };
    },
  );
}

function duplicateNameGroups(spots) {
  const counts = new Map();
  for (const spot of spots) counts.set(spot.name, (counts.get(spot.name) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function buildCoordinateAudit(sourcePoints, config) {
  const anchorNames = ["游客中心", "景区入口", "拈花塔", "五灯湖广场", "微笑广场"];
  return {
    sourceCoordinateSystem: "GCJ02",
    targetCoordinateSystem: "GCJ02",
    conversionApplied: false,
    evidence: [
      "Source mini-program uses Tencent walking directions and Chinese web-map coordinates.",
      "No coordinate conversion is applied; a second conversion would introduce drift.",
    ],
    scenicBounds: config.map.handDrawnOverlay.bounds,
    anchors: anchorNames.map((name) => {
      const point = sourcePoints.find((item) => item.name === name);
      return {
        name,
        sourcePointId: point ? String(point.pointBaseId) : undefined,
        original: point
          ? { latitude: Number(point.latitude), longitude: Number(point.longitude) }
          : undefined,
        converted: point
          ? { latitude: Number(point.latitude), longitude: Number(point.longitude) }
          : undefined,
        estimatedErrorMeters: undefined,
        status: point ? "manual-map-verification-required" : "missing-anchor",
      };
    }),
  };
}

function buildTileAnalysis(mapConfig) {
  const widths = unique(mapConfig.tileLayer.tiles.map((tile) => tile.width));
  const heights = unique(mapConfig.tileLayer.tiles.map((tile) => tile.height));
  return {
    order: "row-major; rows north-to-south; columns west-to-east",
    flipRequired: false,
    rotationDegrees: mapConfig.rotationDegrees,
    rows: mapConfig.tileLayer.rows,
    columns: mapConfig.tileLayer.columns,
    tileWidths: widths.map(Number),
    tileHeights: heights.map(Number),
    totalSizeBytes: mapConfig.tileLayer.tiles.reduce(
      (sum, tile) => sum + tile.sizeBytes,
      0,
    ),
    bounds: mapConfig.tileLayer.bounds,
    seamStrategy:
      "Shared geographic edges plus the existing 1.2px DOM seam buffer; no CSS sharpening.",
    maxZoom: mapConfig.maxZoom,
    upgradeRecommendation:
      "Generate a true multiresolution XYZ pyramid or source-authored @2x tiles before enabling zoom levels above the source maximum.",
  };
}

function buildMigrationReport({
  sourcePoints,
  sourceSnapshotRecordCount,
  routeOnlyRecordCount,
  spots,
  categories,
  routes,
  panoramas,
}) {
  const duplicates = duplicateNameGroups(spots);
  return {
    generatedAt: new Date().toISOString(),
    sourceProject: "nianhuawan-miniapp-rebuild",
    sourceRecordCount: sourcePoints.length,
    sourceSnapshotRecordCount,
    routeOnlyRecordCount,
    migratedRecordCount: spots.length,
    categoryCount: categories.length,
    scenicSpotCount: spots.filter((spot) => spot.kind === "scenic").length,
    facilityCount: spots.filter((spot) => spot.kind === "facility").length,
    duplicateIdCount:
      spots.length - new Set(spots.map((spot) => spot.sourcePointId)).size,
    duplicateNameGroupCount: duplicates.length,
    duplicateNameRecordCount: duplicates.reduce(
      (sum, [, count]) => sum + count,
      0,
    ),
    missingCoordinateCount: spots.filter(
      (spot) =>
        !Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude),
    ).length,
    missingImageCount: sourcePoints.filter((spot) => !spot.cover).length,
    missingNarrationCount: spots.filter((spot) => !spot.narration).length,
    audioRecordCount: spots.filter((spot) => Boolean(spot.narration)).length,
    officialRouteCount: routes.length,
    officialRouteWithAuthoredPathCount: routes.filter(
      (route) => route.geometryKind === "official-path",
    ).length,
    officialRoutePathVertexCount: routes.reduce(
      (sum, route) => sum + route.polyline.length,
      0,
    ),
    routeNodeCount: routes.reduce((sum, route) => sum + route.nodes.length, 0),
    routeNodeManualReviewCount: routes.reduce(
      (sum, route) => sum + route.nodes.filter((node) => node.manualReview).length,
      0,
    ),
    panoramaCount: panoramas.length,
    panoramaSpotMappingCount: panoramas.filter((panorama) => panorama.spotId).length,
    panoramaHotspotCount: panoramas.reduce(
      (sum, panorama) => sum + panorama.hotspots.length,
      0,
    ),
    unableToMigrateCount: 0,
    mediaMigrationStatus:
      "core hand-drawn tiles mirrored locally; covers and official audio remain source URLs pending authorization",
  };
}

async function copySourceSnapshots() {
  await mkdir(sourceSnapshotDir, { recursive: true });
  await Promise.all(
    Object.entries(sourceFiles)
      .filter(([name]) => name !== "config")
      .map(async ([name, sourcePath]) => {
        const content = await readFile(sourcePath);
        await writeFile(join(sourceSnapshotDir, `${name}.json`), content);
      }),
  );
}

async function main() {
  for (const path of Object.values(sourceFiles)) {
    if (!existsSync(path)) throw new Error(`Required source file is missing: ${path}`);
  }
  const [sourceCategories, sourcePoints, sourceRoutes, config] = await Promise.all([
    readJson(sourceFiles.categories),
    readJson(sourceFiles.points),
    readJson(sourceFiles.routes),
    loadConfig(),
  ]);
  const routeOnlyPoints = collectRouteOnlyPoints(sourceRoutes, sourcePoints);
  const allSourcePoints = [...sourcePoints, ...routeOnlyPoints];
  const categories = migrateCategories(sourceCategories);
  const spots = migrateSpots(allSourcePoints, categories);
  const routes = migrateRoutes(sourceRoutes, spots);
  const panoramas = buildPanoramas(config, spots);
  for (const panorama of panoramas) {
    if (!panorama.spotId) continue;
    const spot = spots.find((item) => item.id === panorama.spotId);
    if (spot) spot.panoramaIds.push(panorama.panoramaId);
  }
  const mapConfig = await buildMapConfig(config);
  const coordinateAudit = buildCoordinateAudit(allSourcePoints, config);
  const tileAnalysis = buildTileAnalysis(mapConfig);
  const migrationReport = buildMigrationReport({
    sourcePoints: allSourcePoints,
    sourceSnapshotRecordCount: sourcePoints.length,
    routeOnlyRecordCount: routeOnlyPoints.length,
    spots,
    categories,
    routes,
    panoramas,
  });
  const area = {
    id: "nianhuawan",
    name: "拈花湾",
    shortName: "拈花湾",
    sourceProject: "nianhuawan-miniapp-rebuild",
  };
  const bootstrap = {
    version: "2.0.0",
    generatedAt: migrationReport.generatedAt,
    area,
    config: mapConfig,
    categories,
    spots,
    routes,
    panoramas,
  };

  await Promise.all([
    copySourceSnapshots(),
    writeJson(join(outputDir, "map-config.json"), mapConfig),
    writeJson(join(outputDir, "categories.json"), categories),
    writeJson(join(outputDir, "spots.json"), spots),
    writeJson(join(outputDir, "routes.json"), routes),
    writeJson(join(outputDir, "panoramas.json"), panoramas),
    writeJson(join(publicDataDir, "bootstrap.json"), bootstrap),
    writeJson(join(reportDir, "migration-report.json"), migrationReport),
    writeJson(join(reportDir, "coordinate-audit.json"), coordinateAudit),
    writeJson(join(reportDir, "tile-analysis.json"), tileAnalysis),
    writeJson(
      join(reportDir, "route-match-report.json"),
      routes.map((route) => ({
        routeId: route.id,
        routeName: route.name,
        nodeCount: route.nodes.length,
        authoredPathVertexCount: route.polyline.length,
        geometryKind: route.geometryKind,
        matchedNodeCount: route.nodes.filter((node) => !node.manualReview).length,
        manualReviewNodeCount: route.nodes.filter((node) => node.manualReview).length,
      })),
    ),
    writeJson(join(reportDir, "panorama-inventory.json"), panoramas),
  ]);

  const tileBytes = (
    await Promise.all(
      mapConfig.tileLayer.tiles.map((tile) =>
        stat(join(tileDir, `${tile.id}.png`)),
      ),
    )
  ).reduce((sum, entry) => sum + entry.size, 0);
  console.log(
    JSON.stringify(
      {
        area: area.id,
        categories: categories.length,
        spots: spots.length,
        routes: routes.length,
        routeVertices: migrationReport.officialRoutePathVertexCount,
        tiles: mapConfig.tileLayer.tiles.length,
        tileBytes,
        outputDir,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
