/**
 * @fileoverview 知识文档异步任务 Worker。
 * @description 领取并处理文档解析、知识索引和远程向量同步任务，同时维护单实例运行锁。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../src/config.mjs";
import { runDocumentParserTasks } from "../src/services/documentParserTasks.mjs";
import { runKnowledgeIndexTasks } from "../src/services/uploads.mjs";
import { loadKnowledge } from "../src/services/knowledgeBuild.mjs";
import { syncRemoteVectorIndex } from "../src/services/retrieval/remoteIndex.mjs";
import {
  buildRemoteRagConfig,
  getRemoteRagConfigIssues,
  isRemoteDenseReady
} from "../src/services/retrieval/remoteProviders.mjs";

const indexing = await runKnowledgeIndexTasks({
  limit: Number(process.env.KNOWLEDGE_INDEX_WORKER_BATCH || 1)
});
const result = await runDocumentParserTasks({
  limit: Number(process.env.DOCUMENT_PARSER_WORKER_BATCH || 1)
});
const remoteSync = await syncChangedKnowledgeVersion();
console.log(JSON.stringify({ indexing, parser: result, remoteSync }, null, 2));

/**
 * @description 仅在活动知识版本变化时同步 Qdrant，并在成功后原子更新本地 marker。
 * 同步失败时不更新 marker，使下一轮定时任务能够自动重试。
 * @returns {Promise<{status: string, indexVersion?: string, chunks?: number, batches?: number, issues?: string[], cleanedIndexVersions?: number}>} 同步状态。
 * @throws {Error} 知识快照读取、远程向量同步或 marker 原子写入失败时抛出。
 */
async function syncChangedKnowledgeVersion() {
  const remoteConfig = buildRemoteRagConfig();
  if (!isRemoteDenseReady(remoteConfig)) {
    const issues = getRemoteRagConfigIssues(remoteConfig, ["shared", "embedding", "vector"]);
    return {
      status: remoteConfig.enabled ? "misconfigured" : "disabled",
      issues
    };
  }
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

/**
 * @description 读取 Worker 状态 JSON；文件不存在、内容为空或 JSON 无效时返回空值。
 * @param {string} filePath Worker 状态文件路径。
 * @returns {object|null} 已解析的状态对象；无可用状态时返回 `null`。
 */
function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @description 先写入同目录临时文件再重命名，原子更新 Worker 状态 JSON。
 * @param {string} filePath 目标状态文件路径。
 * @param {object} value 待持久化的任务统计与锁信息。
 * @returns {void}
 * @throws {Error} 目录创建、临时文件写入或重命名失败时抛出。
 */
function writeJsonAtomic(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o640 });
  renameSync(temporaryPath, filePath);
}
