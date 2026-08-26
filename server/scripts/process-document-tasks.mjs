import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../src/config.mjs";
import { runDocumentParserTasks } from "../src/services/documentParserTasks.mjs";
import { runKnowledgeIndexTasks } from "../src/services/uploads.mjs";
import { loadKnowledge } from "../src/services/knowledgeBuild.mjs";
import { syncRemoteVectorIndex } from "../src/services/retrieval/remoteIndex.mjs";
import { buildRemoteRagConfig, isRemoteDenseReady } from "../src/services/retrieval/remoteProviders.mjs";

const indexing = await runKnowledgeIndexTasks({
  limit: Number(process.env.KNOWLEDGE_INDEX_WORKER_BATCH || 1)
});
const result = await runDocumentParserTasks({
  limit: Number(process.env.DOCUMENT_PARSER_WORKER_BATCH || 1)
});
const remoteSync = await syncChangedKnowledgeVersion();
console.log(JSON.stringify({ indexing, parser: result, remoteSync }, null, 2));

/**
 * 仅在活动知识版本变化时同步 Qdrant，并在成功后原子更新本地 marker。
 * 同步失败时不更新 marker，使下一轮定时任务能够自动重试。
 * @returns {Promise<{status: string, indexVersion?: string, chunks?: number, batches?: number}>} 同步状态。
 */
async function syncChangedKnowledgeVersion() {
  const remoteConfig = buildRemoteRagConfig();
  if (!isRemoteDenseReady(remoteConfig)) return { status: "disabled" };
  const knowledge = loadKnowledge();
  if (!knowledge?.indexVersion) return { status: "knowledge_unavailable" };
  const markerPath = join(config.dataDir, "generated", "remote-index.json");
  const marker = readJson(markerPath);
  if (marker?.indexVersion === knowledge.indexVersion) {
    return { status: "current", indexVersion: knowledge.indexVersion };
  }
  const retainCount = remoteConfig.retainIndexVersions || 2;
  const history = [
    knowledge.indexVersion,
    ...(Array.isArray(marker?.history) ? marker.history : [marker?.indexVersion])
  ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const cleanupIndexVersions = history.slice(retainCount);
  const synced = await syncRemoteVectorIndex(knowledge, {
    config: remoteConfig,
    cleanupIndexVersions
  });
  writeJsonAtomic(markerPath, {
    indexVersion: synced.indexVersion,
    chunks: synced.chunks,
    history: history.slice(0, retainCount),
    cleanedIndexVersions: synced.cleanedIndexVersions || 0,
    syncedAt: new Date().toISOString()
  });
  return { status: "synced", ...synced };
}

/** @param {string} filePath JSON路径。 @returns {object|null} 读取结果。 */
function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} filePath JSON路径。 @param {object} value JSON值。 @returns {void} */
function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o640 });
  renameSync(temporaryPath, filePath);
}
