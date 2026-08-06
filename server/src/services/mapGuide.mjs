import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDataDir = resolve(
  fileURLToPath(new URL("../../data/generated/map-guide", import.meta.url)),
);
const areaDirectories = {
  lingshan: rootDataDir,
  nianhuawan: resolve(rootDataDir, "nianhuawan"),
};
const files = {
  config: "map-config.json",
  categories: "categories.json",
  spots: "spots.json",
  routes: "routes.json",
  panoramas: "panoramas.json",
};

const cache = new Map();

export function normalizeMapGuideArea(areaId) {
  return Object.hasOwn(areaDirectories, areaId) ? areaId : "lingshan";
}

function dataDir(areaId) {
  return areaDirectories[normalizeMapGuideArea(areaId)];
}

function signature(areaId) {
  return Object.values(files)
    .map((file) => `${file}:${statSync(resolve(dataDir(areaId), file)).mtimeMs}`)
    .join("|");
}

function readJson(areaId, file) {
  return JSON.parse(readFileSync(resolve(dataDir(areaId), file), "utf8"));
}

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

export function getMapGuideSpots(areaId) {
  return getMapGuideBootstrap(areaId).spots;
}

export function getMapGuideRoutes(areaId) {
  return getMapGuideBootstrap(areaId).routes;
}

export function getMapGuidePanoramas(areaId) {
  return getMapGuideBootstrap(areaId).panoramas;
}
