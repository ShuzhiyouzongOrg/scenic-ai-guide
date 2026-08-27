/**
 * 只读探测百炼 Embedding、Qdrant 活动版本和 Reranker。
 * 不创建集合、不写向量、不修改知识快照，也不输出密钥或原始远程响应。
 */
import "../src/config.mjs";
import { loadKnowledge } from "../src/services/knowledgeBuild.mjs";
import {
  buildRemoteRagConfig,
  embedTexts,
  getRemoteRagConfigIssues,
  isRemoteDenseReady,
  isRemoteRerankerReady,
  queryQdrant,
  rerankDocuments
} from "../src/services/retrieval/remoteProviders.mjs";

const remote = buildRemoteRagConfig();
const knowledge = loadKnowledge();
const report = {
  enabled: remote.enabled,
  indexVersion: knowledge?.indexVersion || null,
  configurationIssues: getRemoteRagConfigIssues(remote),
  embedding: { status: "not_tested" },
  qdrant: { status: "not_tested" },
  denseQuery: { status: "not_tested" },
  reranker: { status: "not_tested" }
};

if (!isRemoteDenseReady(remote) || !isRemoteRerankerReady(remote) || !knowledge?.indexVersion) {
  if (!knowledge?.indexVersion) report.configurationIssues.push("KNOWLEDGE_INDEX_VERSION_MISSING");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
} else {
  const embedding = await probe("embedding", async () => {
    const result = await embedTexts(["灵山大佛多高"], remote);
    return {
      model: result.model,
      dimensions: result.vectors[0]?.length || 0,
      vector: result.vectors[0]
    };
  });

  await probe("qdrant", async () => {
    const response = await fetch(
      `${remote.vector.url}/collections/${encodeURIComponent(remote.vector.collection)}`,
      {
        headers: { "api-key": remote.vector.apiKey },
        signal: AbortSignal.timeout(remote.timeoutMs)
      }
    );
    if (!response.ok) throw remoteProbeError("VECTOR_COLLECTION_PROBE_FAILED", response.status);
    const body = await response.json();
    return {
      collectionStatus: body.result?.status || null,
      pointsCount: body.result?.points_count ?? null,
      dimensions: Number(body.result?.config?.params?.vectors?.size || 0) || null
    };
  });

  if (embedding?.vector) {
    await probe("denseQuery", async () => {
      const rows = await queryQdrant(embedding.vector, remote, {
        indexVersion: knowledge.indexVersion,
        knowledgeScope: "visitor_qa",
        accessScopes: ["public"],
        tenantId: "default",
        limit: 3
      });
      return { candidates: rows.length };
    });
  }

  await probe("reranker", async () => {
    const rows = await rerankDocuments(
      "灵山大佛多高",
      ["灵山大佛通高88米。", "拈花湾是禅意小镇。"],
      remote,
      { topN: 2 }
    );
    return { candidates: rows.length, model: remote.reranker.model };
  });

  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report).some((item) => item?.status === "failed")) process.exitCode = 1;
}

/** @param {string} name 探测项。 @param {() => Promise<object>} action 探测函数。 @returns {Promise<object|null>} 探测详情。 */
async function probe(name, action) {
  const started = Date.now();
  try {
    const details = await action();
    const { vector: _privateVector, ...publicDetails } = details;
    report[name] = { status: "ready", latencyMs: Date.now() - started, ...publicDetails };
    return details;
  } catch (error) {
    report[name] = {
      status: "failed",
      latencyMs: Date.now() - started,
      code: error?.code || "REMOTE_PROBE_FAILED",
      httpStatus: Number(error?.statusCode || 0) || null
    };
    return null;
  }
}

/** @param {string} code 错误码。 @param {number} statusCode HTTP 状态。 @returns {Error & {code:string,statusCode:number}} 探测错误。 */
function remoteProbeError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
