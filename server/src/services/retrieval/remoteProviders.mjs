/**
 * @fileoverview 远程 RAG 服务适配模块。
 * @description
 * 提供托管 Embedding、Qdrant 与 Reranker 的轻量 HTTP 适配层。
 * 模块不缓存或输出密钥，也不会在导入时访问网络。所有请求都支持注入 `fetch`，
 * 便于在未配置真实凭据时执行确定性测试。
 */
import { createHash } from "node:crypto";

/**
 * @description 远程请求可进行短暂重试的 HTTP 状态码集合。
 * @type {ReadonlySet<number>}
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * @description 从环境变量构建冻结的远程 RAG 配置及脱敏问题列表。
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env=process.env] 环境变量。
 * @returns {object} 不包含派生外部状态的只读配置快照。
 * @example
 * const config = buildRemoteRagConfig(process.env);
 */
export function buildRemoteRagConfig(env = process.env) {
  const workspaceId = String(env.RAG_DASHSCOPE_WORKSPACE_ID || "").trim();
  const region = String(env.RAG_DASHSCOPE_REGION || "cn-beijing").trim();
  const enabled = toBoolean(env.RAG_REMOTE_ENABLED, false);
  const configuredApiHostRaw = String(env.RAG_DASHSCOPE_API_HOST || "").trim();
  const configuredApiHost = normalizeApiHost(configuredApiHostRaw);
  const workspaceBase = configuredApiHost || (workspaceId
    ? `https://${workspaceId}.${region}.maas.aliyuncs.com`
    : "");
  const dashscopeApiKey = normalizeCredential(env.RAG_DASHSCOPE_API_KEY);
  const qdrantApiKey = normalizeCredential(env.RAG_QDRANT_API_KEY);
  const embeddingEndpoint = String(env.RAG_EMBEDDING_ENDPOINT || (workspaceBase
    ? `${workspaceBase}/compatible-mode/v1/embeddings`
    : "")).trim();
  const rerankerEndpoint = String(env.RAG_RERANK_ENDPOINT || (workspaceBase
    ? `${workspaceBase}/compatible-api/v1/reranks`
    : "")).trim();
  const qdrantUrl = String(env.RAG_QDRANT_URL || "").replace(/\/+$/u, "");
  const issues = enabled ? buildConfigurationIssues({
    configuredApiHostRaw,
    configuredApiHost,
    dashscopeApiKey,
    embeddingEndpoint,
    rerankerEndpoint,
    qdrantUrl,
    qdrantApiKey
  }) : [];
  return Object.freeze({
    enabled,
    issues: Object.freeze(issues),
    timeoutMs: boundedNumber(env.RAG_REMOTE_TIMEOUT_MS, 3_000, 300, 30_000),
    maxRetries: boundedNumber(env.RAG_REMOTE_MAX_RETRIES, 1, 0, 3),
    candidateLimit: boundedNumber(env.RAG_REMOTE_CANDIDATE_LIMIT, 20, 5, 100),
    subqueryTimeoutMs: boundedNumber(env.RAG_SUBQUERY_TIMEOUT_MS, 4_500, 500, 30_000),
    embedding: Object.freeze({
      provider: String(env.RAG_EMBEDDING_PROVIDER || "dashscope").trim(),
      apiKey: dashscopeApiKey,
      model: String(env.RAG_EMBEDDING_MODEL || "qwen3.7-text-embedding").trim(),
      dimensions: boundedNumber(env.RAG_EMBEDDING_DIMENSIONS, 1024, 64, 4096),
      endpoint: embeddingEndpoint,
      batchSize: boundedNumber(env.RAG_EMBEDDING_BATCH_SIZE, 10, 1, 25)
    }),
    vector: Object.freeze({
      provider: String(env.RAG_VECTOR_PROVIDER || "qdrant").trim(),
      url: qdrantUrl,
      apiKey: qdrantApiKey,
      collection: String(env.RAG_QDRANT_COLLECTION || "scenic_knowledge").trim(),
      minScore: boundedDecimal(env.RAG_DENSE_MIN_SCORE, 0.35, 0, 1)
    }),
    retainIndexVersions: boundedNumber(env.RAG_REMOTE_RETAIN_INDEX_VERSIONS, 2, 1, 10),
    reranker: Object.freeze({
      provider: String(env.RAG_RERANK_PROVIDER || "dashscope").trim(),
      apiKey: dashscopeApiKey,
      model: String(env.RAG_RERANK_MODEL || "qwen3-rerank").trim(),
      endpoint: rerankerEndpoint,
      instruct: String(env.RAG_RERANK_INSTRUCT || "Retrieve evidence that answers the scenic-area visitor question.").trim(),
      timeoutMs: boundedNumber(env.RAG_RERANK_TIMEOUT_MS, 1_200, 300, 10_000)
    })
  });
}

/**
 * @description 判断远程 Dense 检索是否显式启用且具备完整、有效的最小配置。
 * @param {object} config 远程 RAG 配置。
 * @returns {boolean} 配置完整且显式启用时为 `true`。
 */
export function isRemoteDenseReady(config) {
  return config?.enabled === true
    && config.embedding?.provider === "dashscope"
    && Boolean(config.embedding.apiKey && config.embedding.endpoint)
    && config.vector?.provider === "qdrant"
    && Boolean(config.vector.url && config.vector.apiKey && config.vector.collection)
    && getRemoteRagConfigIssues(config, ["shared", "embedding", "vector"]).length === 0;
}

/**
 * @description 判断远程重排是否显式启用且具备完整、有效的最小配置。
 * @param {object} config 远程 RAG 配置。
 * @returns {boolean} 配置完整且显式启用时为 `true`。
 */
export function isRemoteRerankerReady(config) {
  return config?.enabled === true
    && config.reranker?.provider === "dashscope"
    && Boolean(config.reranker.apiKey && config.reranker.endpoint)
    && getRemoteRagConfigIssues(config, ["shared", "reranker"]).length === 0;
}

/**
 * @description 返回不包含任何凭证值的远程 RAG 配置问题码。
 * @param {object} config 远程 RAG 配置。
 * @param {string[]} [components] 需要筛选的组件。
 * @returns {string[]} 可安全写入日志和管理端状态的稳定问题码。
 */
export function getRemoteRagConfigIssues(config, components = []) {
  const allowed = new Set(components);
  return (config?.issues || [])
    .filter((issue) => allowed.size === 0 || allowed.has(issue.component))
    .map((issue) => issue.code);
}

/**
 * @description 调用百炼 OpenAI 兼容 Embeddings API，并验证和单位化返回向量。
 * @param {string[]} texts 待向量化文本。
 * @param {object} config 远程 RAG 配置。
 * @param {{fetchImpl?: typeof fetch}} [dependencies={}] 可注入依赖。
 * @returns {Promise<{vectors: number[][], usage: object, model: string}>} 单位化向量和用量。
 * @throws {Error & {code:string,statusCode:number}} 输入为空、配置缺失、响应异常或远程请求失败时抛出。
 * @example
 * const result = await embedTexts(["灵山大佛高度"], config);
 */
export async function embedTexts(texts, config, { fetchImpl = globalThis.fetch } = {}) {
  const input = Array.isArray(texts) ? texts.map((text) => String(text || "").trim()) : [];
  if (input.length === 0 || input.some((text) => !text)) {
    throw providerError("EMBEDDING_INPUT_INVALID", "Embedding input must contain non-empty text.");
  }
  if (!isRemoteDenseReady(config)) {
    throw providerError("EMBEDDING_NOT_CONFIGURED", "Remote embedding is not configured.");
  }
  const response = await requestJson(config.embedding.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.embedding.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.embedding.model,
      input,
      dimensions: config.embedding.dimensions,
      encoding_format: "float"
    })
  }, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    errorCode: "EMBEDDING_REQUEST_FAILED"
  });
  const ordered = [...(response.data || [])].sort((left, right) => Number(left.index) - Number(right.index));
  if (ordered.length !== input.length) {
    throw providerError("EMBEDDING_RESPONSE_INVALID", "Embedding response count does not match the request.");
  }
  const vectors = ordered.map((item) => normalizeVector(item.embedding, config.embedding.dimensions));
  return {
    vectors,
    usage: response.usage || {},
    model: response.model || config.embedding.model
  };
}

/**
 * @description 使用单位化查询向量和权限过滤条件查询 Qdrant Dense 候选。
 * @param {number[]} vector 查询向量。
 * @param {object} config 远程 RAG 配置。
 * @param {object} options 查询参数。
 * @param {number} [options.limit] 最大候选数。
 * @param {string} options.indexVersion 活动知识索引版本。
 * @param {string} [options.knowledgeScope="visitor_qa"] 知识用途范围。
 * @param {string[]} [options.accessScopes] 允许访问的权限范围。
 * @param {string} [options.tenantId="default"] 租户标识。
 * @param {string|null} [options.scenicArea] 景区过滤条件。
 * @param {string|null} [options.documentType] 文档类型过滤条件。
 * @param {string|null} [options.language] 文档语言过滤条件。
 * @param {object} [dependencies={}] 可注入依赖。
 * @param {typeof fetch} [dependencies.fetchImpl] 可替换的 Fetch 实现。
 * @returns {Promise<Array<{chunkId: string, score: number, payload: object}>>} 向量候选。
 * @throws {Error & {code:string,statusCode:number}} 配置缺失、向量无效或远程查询失败时抛出。
 * @example
 * const candidates = await queryQdrant(vector, config, { indexVersion: "v1" });
 */
export async function queryQdrant(vector, config, options, { fetchImpl = globalThis.fetch } = {}) {
  if (!isRemoteDenseReady(config)) {
    throw providerError("VECTOR_STORE_NOT_CONFIGURED", "Remote vector store is not configured.");
  }
  const normalizedVector = normalizeVector(vector, config.embedding.dimensions);
  const filter = buildQdrantFilter(options);
  const endpoint = `${config.vector.url}/collections/${encodeURIComponent(config.vector.collection)}/points/query`;
  const response = await requestJson(endpoint, {
    method: "POST",
    headers: qdrantHeaders(config),
    body: JSON.stringify({
      query: normalizedVector,
      limit: boundedNumber(options?.limit, config.candidateLimit, 1, 100),
      with_payload: true,
      with_vector: false,
      score_threshold: config.vector.minScore,
      filter
    })
  }, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    errorCode: "VECTOR_QUERY_FAILED"
  });
  const points = Array.isArray(response.result?.points)
    ? response.result.points
    : Array.isArray(response.result)
      ? response.result
      : [];
  return points
    .map((point) => ({
      chunkId: String(point.payload?.chunkId || ""),
      score: Number(point.score || 0),
      payload: point.payload || {}
    }))
    .filter((point) => point.chunkId && Number.isFinite(point.score));
}

/**
 * @description 确保 Qdrant 集合存在、向量维度一致，并补齐查询所需载荷索引。
 * @param {object} config 远程 RAG 配置。
 * @param {{fetchImpl?: typeof fetch}} [dependencies={}] 可注入依赖。
 * @returns {Promise<{created: boolean, indexes: string[]}>} 集合创建状态和已确认的索引字段。
 * @throws {Error & {code:string,statusCode:number}} 配置缺失、维度冲突或远程操作失败时抛出。
 * @example
 * const state = await ensureQdrantCollection(config);
 */
export async function ensureQdrantCollection(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!isRemoteDenseReady(config)) {
    throw providerError("VECTOR_STORE_NOT_CONFIGURED", "Remote vector store is not configured.");
  }
  const endpoint = `${config.vector.url}/collections/${encodeURIComponent(config.vector.collection)}`;
  const probe = await requestJson(endpoint, {
    method: "GET",
    headers: qdrantHeaders(config)
  }, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    maxRetries: 0,
    errorCode: "VECTOR_COLLECTION_PROBE_FAILED",
    acceptedStatuses: new Set([200, 404])
  });
  const created = probe.__status !== 200;
  const existingDimensions = Number(
    probe.result?.config?.params?.vectors?.size
      ?? probe.result?.config?.params?.vectors?.default?.size
  );
  if (!created && Number.isFinite(existingDimensions) && existingDimensions !== config.embedding.dimensions) {
    const error = providerError(
      "VECTOR_COLLECTION_DIMENSION_MISMATCH",
      `The vector collection uses ${existingDimensions} dimensions; configure a new collection for ${config.embedding.dimensions} dimensions.`,
      409
    );
    error.retryable = false;
    throw error;
  }
  if (created) {
    await requestJson(endpoint, {
      method: "PUT",
      headers: qdrantHeaders(config),
      body: JSON.stringify({
        vectors: { size: config.embedding.dimensions, distance: "Cosine" },
        on_disk_payload: true
      })
    }, {
      fetchImpl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      errorCode: "VECTOR_COLLECTION_CREATE_FAILED"
    });
  }
  const indexes = await ensureQdrantPayloadIndexes(config, { fetchImpl });
  return { created, indexes };
}

/**
 * @description
 * 为所有查询过滤字段建立 Qdrant payload index。
 * Qdrant Cloud 会拒绝未建索引的过滤查询，因此集合已存在时也必须幂等执行。
 * @param {object} config 远程 RAG 配置。
 * @param {{fetchImpl?: typeof fetch}} [dependencies={}] 可注入依赖。
 * @returns {Promise<string[]>} 已确认的索引字段。
 * @throws {Error & {code:string,statusCode:number}} 配置缺失或远程索引创建失败时抛出。
 */
export async function ensureQdrantPayloadIndexes(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!isRemoteDenseReady(config)) {
    throw providerError("VECTOR_STORE_NOT_CONFIGURED", "Remote vector store is not configured.");
  }
  const fields = [
    ["indexVersion", "keyword"],
    ["knowledgeScope", "keyword"],
    ["accessScope", "keyword"],
    ["tenantId", "keyword"],
    ["enabled", "bool"],
    ["scenicArea", "keyword"],
    ["documentType", "keyword"],
    ["language", "keyword"]
  ];
  const endpoint = `${config.vector.url}/collections/${encodeURIComponent(config.vector.collection)}/index?wait=true`;
  for (const [fieldName, fieldSchema] of fields) {
    await requestJson(endpoint, {
      method: "PUT",
      headers: qdrantHeaders(config),
      body: JSON.stringify({ field_name: fieldName, field_schema: fieldSchema })
    }, {
      fetchImpl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      errorCode: "VECTOR_PAYLOAD_INDEX_CREATE_FAILED"
    });
  }
  return fields.map(([fieldName]) => fieldName);
}

/**
 * @description 校验并单位化每个向量后，批量写入 Qdrant 向量点。
 * @param {Array<{id: string, vector: number[], payload: object}>} points 向量点。
 * @param {string} points[].id 稳定向量点 ID。
 * @param {number[]} points[].vector 待单位化的向量。
 * @param {object} points[].payload 可供过滤和还原分块的载荷。
 * @param {object} config 远程 RAG 配置。
 * @param {object} [dependencies={}] 可注入依赖。
 * @param {typeof fetch} [dependencies.fetchImpl] 可替换的 Fetch 实现。
 * @returns {Promise<{count: number}>} 写入数量。
 * @throws {Error & {code:string,statusCode:number}} 配置缺失、向量无效或远程写入失败时抛出。
 * @example
 * await upsertQdrantPoints([{ id, vector, payload }], config);
 */
export async function upsertQdrantPoints(points, config, { fetchImpl = globalThis.fetch } = {}) {
  if (!isRemoteDenseReady(config)) {
    throw providerError("VECTOR_STORE_NOT_CONFIGURED", "Remote vector store is not configured.");
  }
  if (!Array.isArray(points) || points.length === 0) return { count: 0 };
  const endpoint = `${config.vector.url}/collections/${encodeURIComponent(config.vector.collection)}/points?wait=true`;
  await requestJson(endpoint, {
    method: "PUT",
    headers: qdrantHeaders(config),
    body: JSON.stringify({
      points: points.map((point) => ({
        id: point.id,
        vector: normalizeVector(point.vector, config.embedding.dimensions),
        payload: point.payload || {}
      }))
    })
  }, {
    fetchImpl,
    timeoutMs: Math.max(config.timeoutMs, 10_000),
    maxRetries: config.maxRetries,
    errorCode: "VECTOR_UPSERT_FAILED"
  });
  return { count: points.length };
}

/**
 * @description 删除 Qdrant 中指定知识版本的向量，避免长期保留已退出活动索引的点。
 * @param {string[]} indexVersions 待清理的知识版本。
 * @param {object} config 远程 RAG 配置。
 * @param {{fetchImpl?: typeof fetch}} [dependencies={}] 可注入依赖。
 * @returns {Promise<{versions: number}>} 已提交删除请求的版本数。
 * @throws {Error & {code:string,statusCode:number}} 配置缺失或远程删除失败时抛出。
 */
export async function deleteQdrantPointsByIndexVersions(indexVersions, config, { fetchImpl = globalThis.fetch } = {}) {
  const versions = [...new Set((indexVersions || []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (versions.length === 0) return { versions: 0 };
  if (!isRemoteDenseReady(config)) {
    throw providerError("VECTOR_STORE_NOT_CONFIGURED", "Remote vector store is not configured.");
  }
  const endpoint = `${config.vector.url}/collections/${encodeURIComponent(config.vector.collection)}/points/delete?wait=true`;
  for (const indexVersion of versions) {
    await requestJson(endpoint, {
      method: "POST",
      headers: qdrantHeaders(config),
      body: JSON.stringify({
        points: {
          filter: {
            must: [{ key: "indexVersion", match: { value: indexVersion } }]
          }
        }
      })
    }, {
      fetchImpl,
      timeoutMs: Math.max(config.timeoutMs, 10_000),
      maxRetries: config.maxRetries,
      errorCode: "VECTOR_CLEANUP_FAILED"
    });
  }
  return { versions: versions.length };
}

/**
 * @description 调用百炼兼容 Rerank API，并过滤无效或越界的重排结果。
 * @param {string} query 用户查询。
 * @param {string[]} documents 候选正文。
 * @param {object} config 远程 RAG 配置。
 * @param {{topN?: number, fetchImpl?: typeof fetch}} [options={}] 调用选项。
 * @returns {Promise<Array<{index: number, score: number, document?: string}>>} 重排结果。
 * @throws {Error & {code:string,statusCode:number}} 输入为空、配置缺失或远程请求失败时抛出。
 * @example
 * const reranked = await rerankDocuments("开放时间", documents, config);
 */
export async function rerankDocuments(query, documents, config, { topN = documents?.length || 0, fetchImpl = globalThis.fetch } = {}) {
  const candidates = Array.isArray(documents) ? documents.map((document) => String(document || "")) : [];
  if (!String(query || "").trim() || candidates.length === 0) {
    throw providerError("RERANK_INPUT_INVALID", "Rerank input must contain a query and documents.");
  }
  if (!isRemoteRerankerReady(config)) {
    throw providerError("RERANK_NOT_CONFIGURED", "Remote reranker is not configured.");
  }
  const response = await requestJson(config.reranker.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.reranker.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.reranker.model,
      query: String(query).trim(),
      documents: candidates,
      top_n: boundedNumber(topN, candidates.length, 1, candidates.length),
      instruct: config.reranker.instruct
    })
  }, {
    fetchImpl,
    timeoutMs: config.reranker.timeoutMs,
    maxRetries: 0,
    errorCode: "RERANK_REQUEST_FAILED"
  });
  const results = response.results || response.output?.results || response.data || [];
  return results.map((item) => ({
    index: Number(item.index),
    score: Number(item.relevance_score ?? item.score ?? 0),
    document: item.document?.text || item.document || undefined
  })).filter((item) => Number.isInteger(item.index)
    && item.index >= 0
    && item.index < candidates.length
    && Number.isFinite(item.score));
}

/**
 * @description 将分块 ID 的 SHA-256 摘要转换为 Qdrant 支持的稳定 UUID。
 * @param {string} chunkId 分块 ID。
 * @returns {string} 稳定 UUID。
 * @example
 * const pointId = stablePointId("knowledge-v1:chunk-1");
 */
export function stablePointId(chunkId) {
  const bytes = Buffer.from(createHash("sha256").update(String(chunkId)).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @description 构建包含 API Key 和 JSON 内容类型的 Qdrant 请求头。
 * @param {object} config 远程 RAG 配置。
 * @returns {Record<string,string>} Qdrant 请求头。
 */
function qdrantHeaders(config) {
  return { "api-key": config.vector.apiKey, "content-type": "application/json" };
}

/**
 * @description 根据知识版本、权限范围和可选元数据构建 Qdrant 过滤器。
 * @param {object} options 查询过滤选项。
 * @returns {object} Qdrant 过滤器。
 */
function buildQdrantFilter(options = {}) {
  const must = [
    { key: "indexVersion", match: { value: String(options.indexVersion || "") } },
    { key: "knowledgeScope", match: { value: String(options.knowledgeScope || "visitor_qa") } },
    { key: "enabled", match: { value: true } },
    { key: "tenantId", match: { value: String(options.tenantId || "default") } },
    { key: "accessScope", match: { any: normalizeAccessScopes(options.accessScopes) } }
  ];
  if (options.scenicArea) must.push({ key: "scenicArea", match: { value: String(options.scenicArea) } });
  if (options.documentType) must.push({ key: "documentType", match: { value: String(options.documentType) } });
  if (options.language) must.push({ key: "language", match: { value: String(options.language) } });
  return { must };
}

/**
 * @description 将访问范围归一化为去重的非空字符串列表。
 * @param {*} values 原始访问范围。
 * @returns {string[]} 非空访问范围；缺省时返回公开范围。
 */
function normalizeAccessScopes(values) {
  const scopes = Array.isArray(values) ? values.map(String).filter(Boolean) : [];
  return scopes.length > 0 ? [...new Set(scopes)] : ["public"];
}

/**
 * @description 执行带超时、有限重试、状态白名单和稳定错误码的 JSON 请求。
 * @param {string} url 请求地址。
 * @param {RequestInit} init Fetch 请求参数。
 * @param {{fetchImpl: typeof fetch, timeoutMs: number, maxRetries: number, errorCode: string, acceptedStatuses?: Set<number>}} options 请求策略。
 * @returns {Promise<object>} JSON 响应，附加不可枚举语义之外的 `__status` 字段。
 * @throws {Error & {code:string,statusCode:number}} Fetch 不可用、请求超时或远程服务返回失败状态时抛出。
 */
async function requestJson(url, init, options) {
  if (typeof options.fetchImpl !== "function") {
    throw providerError("FETCH_UNAVAILABLE", "A fetch implementation is required.");
  }
  let lastError;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.fetchImpl(url, { ...init, signal: controller.signal });
      const accepted = options.acceptedStatuses?.has(response.status) || response.ok;
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      if (accepted) return { ...payload, __status: response.status };
      const error = providerError(
        classifyRemoteHttpError(response.status, options.errorCode),
        `Remote service returned HTTP ${response.status}.`,
        response.status
      );
      error.operation = options.errorCode;
      if (!RETRYABLE_STATUS.has(response.status)) error.retryable = false;
      if (error.retryable === false || attempt >= options.maxRetries) throw error;
      lastError = error;
    } catch (error) {
      const normalized = error?.name === "AbortError"
        ? providerError(options.errorCode, "Remote service request timed out.", 504)
        : error?.code
          ? error
          : providerError(options.errorCode, "Remote service request failed.", 502);
      if (normalized.retryable === false || attempt >= options.maxRetries) throw normalized;
      lastError = normalized;
    } finally {
      clearTimeout(timer);
    }
    await delay(Math.min(100 * (2 ** attempt), 400));
  }
  throw lastError || providerError(options.errorCode, "Remote service request failed.");
}

/**
 * @description 校验向量维度和数值后，将其归一化为欧几里得范数为 1 的向量。
 * @param {*} vector 原始向量。
 * @param {number} dimensions 预期维度。
 * @returns {number[]} 单位向量。
 * @throws {Error & {code:string,statusCode:number}} 维度不匹配、存在非数值元素或向量范数为零时抛出。
 */
function normalizeVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions || vector.some((value) => !Number.isFinite(Number(value)))) {
    throw providerError("VECTOR_DIMENSION_MISMATCH", `Expected a ${dimensions}-dimension numeric vector.`);
  }
  const values = vector.map(Number);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw providerError("VECTOR_INVALID", "Vector norm must be greater than zero.");
  }
  return values.map((value) => value / norm);
}

/**
 * @description 将常见环境变量布尔文本转换为布尔值。
 * @param {*} value 原始配置值。
 * @param {boolean} fallback 空值时使用的默认值。
 * @returns {boolean} 归一化后的布尔值。
 */
function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

/**
 * @description 规范化 API Host，并拒绝非 HTTPS 协议或非法地址。
 * @param {*} value 原始 API Host。
 * @returns {string} HTTPS origin；非法值返回空字符串。
 */
function normalizeApiHost(value) {
  const raw = String(value || "").trim().replace(/\/+$/u, "");
  if (!raw) return "";
  try {
    const parsed = new URL(/^https?:\/\//iu.test(raw) ? raw : `https://${raw}`);
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

/**
 * @description 去除凭证首尾空白，不对凭证内容执行静默修复。
 * @param {*} value 原始凭证。
 * @returns {string} 归一化后的凭证字符串。
 */
function normalizeCredential(value) {
  return String(value || "").trim();
}

/**
 * @description
 * 构建脱敏配置诊断。反斜杠通常来自 Markdown 中对下划线的转义，
 * 不能作为真实 Key 发送。
 * @param {object} input 原始配置摘要。
 * @returns {Array<{component:string,code:string}>} 配置问题。
 */
function buildConfigurationIssues(input) {
  const issues = [];
  if (input.configuredApiHostRaw && !input.configuredApiHost) {
    issues.push({ component: "shared", code: "DASHSCOPE_API_HOST_INVALID" });
  }
  appendCredentialIssues(issues, "shared", "DASHSCOPE_API_KEY", input.dashscopeApiKey);
  appendCredentialIssues(issues, "vector", "QDRANT_API_KEY", input.qdrantApiKey);
  if (!input.embeddingEndpoint) issues.push({ component: "embedding", code: "EMBEDDING_ENDPOINT_MISSING" });
  if (!input.rerankerEndpoint) issues.push({ component: "reranker", code: "RERANK_ENDPOINT_MISSING" });
  if (input.configuredApiHost && input.embeddingEndpoint
    && !endpointUsesApiHost(input.embeddingEndpoint, input.configuredApiHost)) {
    issues.push({ component: "embedding", code: "EMBEDDING_API_HOST_MISMATCH" });
  }
  if (input.configuredApiHost && input.rerankerEndpoint
    && !endpointUsesApiHost(input.rerankerEndpoint, input.configuredApiHost)) {
    issues.push({ component: "reranker", code: "RERANK_API_HOST_MISMATCH" });
  }
  if (!input.qdrantUrl) issues.push({ component: "vector", code: "QDRANT_URL_MISSING" });
  return issues;
}

/**
 * @description 检查凭证是否缺失、包含 Markdown 转义或空白字符，并追加稳定问题码。
 * @param {Array<object>} issues 配置问题集合。
 * @param {string} component 所属组件。
 * @param {string} name 环境变量名称。
 * @param {string} value 待检查凭证。
 * @returns {void} 无返回值。
 */
function appendCredentialIssues(issues, component, name, value) {
  if (!value) {
    issues.push({ component, code: `${name}_MISSING` });
    return;
  }
  if (value.includes("\\")) issues.push({ component, code: `${name}_MARKDOWN_ESCAPE` });
  if (/\s/u.test(value)) issues.push({ component, code: `${name}_WHITESPACE` });
}

/**
 * @description 判断完整接口地址是否使用指定专属 API Host。
 * @param {string} endpoint 完整接口地址。
 * @param {string} apiHost 专属 API Host。
 * @returns {boolean} 两个地址的 origin 一致时为 `true`。
 */
function endpointUsesApiHost(endpoint, apiHost) {
  try {
    return new URL(endpoint).origin === new URL(apiHost).origin;
  } catch {
    return false;
  }
}

/**
 * @description 将常见远程 HTTP 失败状态映射为稳定业务错误码。
 * @param {number} status HTTP 状态码。
 * @param {string} fallback 未命中特定映射时使用的错误码。
 * @returns {string} 稳定业务错误码。
 */
function classifyRemoteHttpError(status, fallback) {
  if (status === 401) return "REMOTE_AUTHENTICATION_FAILED";
  if (status === 403) return "REMOTE_ACCESS_DENIED";
  if (status === 429) return "REMOTE_RATE_LIMITED";
  return fallback;
}

/**
 * @description 将配置值转换为指定闭区间内的整数。
 * @param {*} value 原始配置值。
 * @param {number} fallback 非有限数值时使用的默认值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 截断并限制范围后的整数。
 */
function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

/**
 * @description 将配置值转换为指定闭区间内的数值。
 * @param {*} value 原始配置值。
 * @param {number} fallback 非有限数值时使用的默认值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 限制范围后的数值。
 */
function boundedDecimal(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * @description 创建指定时长后完成的延迟 Promise。
 * @param {number} milliseconds 延迟毫秒数。
 * @returns {Promise<void>} 延迟完成信号。
 */
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * @description 创建带稳定业务错误码和 HTTP 状态码的远程服务异常。
 * @param {string} code 业务错误码。
 * @param {string} message 错误消息。
 * @param {number} [statusCode=502] HTTP 状态码。
 * @returns {Error & {code:string,statusCode:number}} 远程服务异常对象。
 */
function providerError(code, message, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
