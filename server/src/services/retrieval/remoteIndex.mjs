/**
 * @fileoverview 将活动知识快照增量同步到托管 Embedding 与 Qdrant。
 */
import {
  buildRemoteRagConfig,
  deleteQdrantPointsByIndexVersions,
  embedTexts,
  ensureQdrantCollection,
  isRemoteDenseReady,
  stablePointId,
  upsertQdrantPoints
} from "./remoteProviders.mjs";
import { createSqliteEmbeddingCache, embeddingCacheEntry } from "./embeddingCache.mjs";

/**
 * 将游客问答分块同步到远程向量索引。
 *
 * Qdrant 查询始终按 `indexVersion` 过滤，因此新版本写完前不会影响活动检索，
 * 旧版本向量也可以支持知识快照回滚。
 *
 * @param {object} knowledge 活动知识快照。
 * @param {{config?: object, fetchImpl?: typeof fetch, onProgress?: (event: object) => void, cleanupIndexVersions?: string[], embeddingCache?: object|null}} [options={}] 同步选项。
 * @returns {Promise<{indexVersion:string, chunks:number, batches:number, inputTokens:number|null, collectionCreated:boolean, cacheHits:number, embeddedChunks:number, cleanedIndexVersions?: number}>} 同步统计。
 */
export async function syncRemoteVectorIndex(knowledge, options = {}) {
  if (!knowledge?.indexVersion || !Array.isArray(knowledge.chunks)) {
    throw indexError("KNOWLEDGE_SNAPSHOT_INVALID", "A valid versioned knowledge snapshot is required.", 422);
  }
  const config = options.config || buildRemoteRagConfig();
  if (!isRemoteDenseReady(config)) {
    throw indexError("REMOTE_RAG_NOT_CONFIGURED", "Remote embedding and Qdrant must be configured before synchronization.", 409);
  }
  const chunks = knowledge.chunks.filter((chunk) => (
    (chunk.knowledgeScope || "visitor_qa") === "visitor_qa"
    && chunk.enabled !== false
    && String(chunk.content || "").trim()
  ));
  const collection = await ensureQdrantCollection(config, { fetchImpl: options.fetchImpl });
  const embeddingCache = options.embeddingCache === null
    ? null
    : options.embeddingCache || await defaultEmbeddingCache();
  let batches = 0;
  let inputTokens = 0;
  let hasUsage = false;
  let cacheHits = 0;
  let embeddedChunks = 0;
  for (let offset = 0; offset < chunks.length; offset += config.embedding.batchSize) {
    const batch = chunks.slice(offset, offset + config.embedding.batchSize);
    const texts = batch.map(buildEmbeddingText);
    const entries = texts.map((text) => embeddingCacheEntry(
      config.embedding.model,
      config.embedding.dimensions,
      text
    ));
    const cached = embeddingCache?.getMany(entries) || new Map();
    const vectors = new Array(batch.length);
    const missingIndexes = [];
    for (let index = 0; index < entries.length; index += 1) {
      const vector = cached.get(entries[index].key);
      if (vector) {
        vectors[index] = vector;
        cacheHits += 1;
      } else {
        missingIndexes.push(index);
      }
    }
    if (missingIndexes.length > 0) {
      const embedded = await embedTexts(
        missingIndexes.map((index) => texts[index]),
        config,
        { fetchImpl: options.fetchImpl }
      );
      const reportedTokens = Number(embedded.usage?.prompt_tokens ?? embedded.usage?.total_tokens);
      if (Number.isFinite(reportedTokens)) {
        inputTokens += reportedTokens;
        hasUsage = true;
      }
      const cacheWrites = missingIndexes.map((batchIndex, embeddedIndex) => {
        vectors[batchIndex] = embedded.vectors[embeddedIndex];
        return { ...entries[batchIndex], vector: embedded.vectors[embeddedIndex] };
      });
      embeddingCache?.setMany(cacheWrites);
      embeddedChunks += missingIndexes.length;
    }
    const points = batch.map((chunk, index) => ({
      id: stablePointId(`${knowledge.indexVersion}:${chunk.id}`),
      vector: vectors[index],
      payload: chunkPayload(chunk, knowledge.indexVersion)
    }));
    await upsertQdrantPoints(points, config, { fetchImpl: options.fetchImpl });
    batches += 1;
    options.onProgress?.({
      indexVersion: knowledge.indexVersion,
      completed: Math.min(offset + batch.length, chunks.length),
      total: chunks.length,
      batches
    });
  }
  const cleanup = await deleteQdrantPointsByIndexVersions(
    options.cleanupIndexVersions || [],
    config,
    { fetchImpl: options.fetchImpl }
  );
  return {
    indexVersion: knowledge.indexVersion,
    chunks: chunks.length,
    batches,
    inputTokens: hasUsage ? inputTokens : null,
    collectionCreated: collection.created,
    cacheHits,
    embeddedChunks,
    cleanedIndexVersions: cleanup.versions
  };
}

/** @returns {Promise<object|null>} 默认 SQLite 缓存；初始化失败时仅禁用缓存。 */
async function defaultEmbeddingCache() {
  try {
    const { getDb } = await import("../../db/database.mjs");
    return createSqliteEmbeddingCache(getDb());
  } catch {
    return null;
  }
}

/**
 * 为 Embedding 增加来源、景区和章节上下文，减少孤立短片段歧义。
 * @param {object} chunk 知识分块。
 * @returns {string} 向量化文本。
 */
export function buildEmbeddingText(chunk) {
  return [
    chunk.scenicArea ? `景区：${chunk.scenicArea}` : "",
    chunk.source ? `文档：${chunk.source}` : "",
    chunk.sectionPath ? `章节：${chunk.sectionPath}` : "",
    chunk.title ? `标题：${chunk.title}` : "",
    String(chunk.content || "").trim()
  ].filter(Boolean).join("\n");
}

/** @param {object} chunk 分块。 @param {string} indexVersion 版本。 @returns {object} Qdrant载荷。 */
function chunkPayload(chunk, indexVersion) {
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    parentId: chunk.parentId || null,
    indexVersion,
    knowledgeScope: chunk.knowledgeScope || "visitor_qa",
    accessScope: chunk.accessScope || "public",
    tenantId: chunk.tenantId || "default",
    scenicArea: chunk.scenicArea || "",
    language: chunk.language || "und",
    documentType: chunk.documentType || chunk.fileType || "unknown",
    enabled: chunk.enabled !== false,
    validFrom: chunk.validFrom || null,
    validTo: chunk.validTo || null,
    contentHash: chunk.contentHash || null
  };
}

/** @param {string} code 错误码。 @param {string} message 消息。 @param {number} statusCode HTTP状态。 @returns {Error & {code:string,statusCode:number}} 错误。 */
function indexError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
