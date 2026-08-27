import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRemoteRagConfig,
  deleteQdrantPointsByIndexVersions,
  embedTexts,
  ensureQdrantCollection,
  getRemoteRagConfigIssues,
  isRemoteDenseReady,
  isRemoteRerankerReady,
  queryQdrant,
  rerankDocuments,
  stablePointId
} from "../src/services/retrieval/remoteProviders.mjs";
import { syncRemoteVectorIndex } from "../src/services/retrieval/remoteIndex.mjs";
import { embeddingCacheEntry } from "../src/services/retrieval/embeddingCache.mjs";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-remote-rag-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";

try {
  const config = buildRemoteRagConfig({
    RAG_REMOTE_ENABLED: "true",
    RAG_DASHSCOPE_WORKSPACE_ID: "workspace-test",
    RAG_DASHSCOPE_REGION: "cn-beijing",
    RAG_DASHSCOPE_API_KEY: "secret-test-key",
    RAG_EMBEDDING_DIMENSIONS: "64",
    RAG_EMBEDDING_BATCH_SIZE: "2",
    RAG_QDRANT_URL: "https://qdrant.test",
    RAG_QDRANT_API_KEY: "qdrant-secret",
    RAG_QDRANT_COLLECTION: "test-knowledge",
    RAG_REMOTE_MAX_RETRIES: "0"
  });
  const apiHostConfig = buildRemoteRagConfig({
    RAG_REMOTE_ENABLED: "true",
    RAG_DASHSCOPE_API_HOST: "workspace-host.cn-beijing.maas.aliyuncs.com/",
    RAG_DASHSCOPE_API_KEY: "valid_key",
    RAG_QDRANT_URL: "https://qdrant.test",
    RAG_QDRANT_API_KEY: "qdrant-key"
  });
  assert.equal(
    apiHostConfig.embedding.endpoint,
    "https://workspace-host.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/embeddings"
  );
  assert.equal(
    apiHostConfig.reranker.endpoint,
    "https://workspace-host.cn-beijing.maas.aliyuncs.com/compatible-api/v1/reranks"
  );
  const escapedCredentialConfig = buildRemoteRagConfig({
    RAG_REMOTE_ENABLED: "true",
    RAG_DASHSCOPE_API_HOST: "workspace-host.cn-beijing.maas.aliyuncs.com",
    RAG_DASHSCOPE_API_KEY: "sk-ws-example\\_escaped",
    RAG_QDRANT_URL: "https://qdrant.test",
    RAG_QDRANT_API_KEY: "qdrant-key"
  });
  assert.equal(isRemoteDenseReady(escapedCredentialConfig), false);
  assert.equal(isRemoteRerankerReady(escapedCredentialConfig), false);
  assert.deepEqual(
    getRemoteRagConfigIssues(escapedCredentialConfig),
    ["DASHSCOPE_API_KEY_MARKDOWN_ESCAPE"]
  );
  const invalidHostConfig = buildRemoteRagConfig({
    RAG_REMOTE_ENABLED: "true",
    RAG_DASHSCOPE_API_HOST: "http://insecure.example.com",
    RAG_DASHSCOPE_API_KEY: "valid-key",
    RAG_QDRANT_URL: "https://qdrant.test",
    RAG_QDRANT_API_KEY: "qdrant-key"
  });
  assert.ok(getRemoteRagConfigIssues(invalidHostConfig).includes("DASHSCOPE_API_HOST_INVALID"));
  const mismatchedEndpointConfig = buildRemoteRagConfig({
    RAG_REMOTE_ENABLED: "true",
    RAG_DASHSCOPE_API_HOST: "workspace-host.cn-beijing.maas.aliyuncs.com",
    RAG_DASHSCOPE_API_KEY: "valid-key",
    RAG_EMBEDDING_ENDPOINT: "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    RAG_QDRANT_URL: "https://qdrant.test",
    RAG_QDRANT_API_KEY: "qdrant-key"
  });
  assert.ok(getRemoteRagConfigIssues(mismatchedEndpointConfig).includes("EMBEDDING_API_HOST_MISMATCH"));
  const calls = [];
  let collectionExists = false;
  let queryChunkIds = ["chunk-a"];
  let expectedIndexVersion = "version-test";
  const fakeFetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: init.method || "GET", body, headers: init.headers || {} });
    if (String(url).endsWith("/embeddings")) {
      assert.equal(init.headers.authorization, "Bearer secret-test-key");
      return jsonResponse(200, {
        model: "qwen3.7-text-embedding",
        data: body.input.map((_, index) => ({ index, embedding: vector64(index + 1) })),
        usage: { prompt_tokens: body.input.length * 8, total_tokens: body.input.length * 8 }
      });
    }
    if (String(url).endsWith("/reranks")) {
      assert.equal(init.headers.authorization, "Bearer secret-test-key");
      return jsonResponse(200, {
        results: body.documents.map((_, index) => ({
          index: body.documents.length - index - 1,
          relevance_score: 0.95 - index * 0.01
        }))
      });
    }
    if (String(url).includes("/collections/test-knowledge") && (init.method || "GET") === "GET") {
      return jsonResponse(collectionExists ? 200 : 404, collectionExists ? {
        result: { status: "green", config: { params: { vectors: { size: 64 } } } }
      } : {});
    }
    if (String(url).endsWith("/collections/test-knowledge") && init.method === "PUT") {
      assert.equal(body.vectors.size, 64);
      collectionExists = true;
      return jsonResponse(200, { result: true });
    }
    if (String(url).endsWith("/collections/test-knowledge/index?wait=true") && init.method === "PUT") {
      assert.ok(["keyword", "bool"].includes(body.field_schema));
      return jsonResponse(200, { result: { status: "completed" } });
    }
    if (String(url).includes("/points?wait=true") && init.method === "PUT") {
      assert.ok(body.points.every((point) => point.vector.length === 64));
      return jsonResponse(200, { result: { status: "completed" } });
    }
    if (String(url).includes("/points/delete?wait=true") && init.method === "POST") {
      assert.equal(body.points.filter.must[0].key, "indexVersion");
      assert.equal(body.points.filter.must[0].match.value, "old-version");
      return jsonResponse(200, { result: { status: "completed" } });
    }
    if (String(url).endsWith("/points/query") && init.method === "POST") {
      const actualIndexVersion = body.filter.must.find((item) => item.key === "indexVersion").match.value;
      if (actualIndexVersion !== expectedIndexVersion) {
        const error = new Error(`index version mismatch: ${actualIndexVersion} !== ${expectedIndexVersion}`);
        error.code = "INDEX_VERSION_MISMATCH";
        throw error;
      }
      assert.equal(
        actualIndexVersion,
        expectedIndexVersion,
        "Qdrant filter must use the active index version"
      );
      assert.equal(body.score_threshold, 0.35);
      assert.deepEqual(
        body.filter.must.find((item) => item.key === "accessScope").match.any,
        ["public"]
      );
      assert.equal(body.filter.must.find((item) => item.key === "tenantId").match.value, "default");
      return jsonResponse(200, {
        result: {
          points: queryChunkIds.map((chunkId, index) => ({
            id: stablePointId(`${expectedIndexVersion}:${chunkId}`),
            score: 0.91 - index * 0.02,
            payload: { chunkId }
          }))
        }
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const embedded = await embedTexts(["灵山大佛", "九龙灌浴"], config, { fetchImpl: fakeFetch });
  assert.equal(embedded.vectors.length, 2);
  assert.equal(embedded.vectors[0].length, 64);
  assert.ok(Math.abs(vectorNorm(embedded.vectors[0]) - 1) < 1e-9);
  assert.equal((await ensureQdrantCollection(config, { fetchImpl: fakeFetch })).created, true);
  assert.equal((await ensureQdrantCollection(config, { fetchImpl: fakeFetch })).created, false);
  await assert.rejects(
    () => ensureQdrantCollection({
      ...config,
      embedding: { ...config.embedding, dimensions: 128 }
    }, { fetchImpl: fakeFetch }),
    (error) => error?.code === "VECTOR_COLLECTION_DIMENSION_MISMATCH"
      && error.statusCode === 409
      && error.retryable === false
  );
  assert.equal(calls.filter((call) => call.url.endsWith("/index?wait=true")).length, 16);
  await assert.rejects(
    () => embedTexts(["鉴权测试"], config, { fetchImpl: async () => jsonResponse(401, {}) }),
    (error) => error?.code === "REMOTE_AUTHENTICATION_FAILED"
      && error?.operation === "EMBEDDING_REQUEST_FAILED"
  );
  await assert.rejects(
    () => rerankDocuments("权限测试", ["候选"], config, {
      fetchImpl: async () => jsonResponse(403, {})
    }),
    (error) => error?.code === "REMOTE_ACCESS_DENIED"
      && error?.operation === "RERANK_REQUEST_FAILED"
  );
  const dense = await queryQdrant(embedded.vectors[0], config, {
    indexVersion: "version-test",
    knowledgeScope: "visitor_qa",
    limit: 5
  }, { fetchImpl: fakeFetch });
  assert.equal(dense[0].chunkId, "chunk-a");
  const reranked = await rerankDocuments("开放时间", ["A", "B"], config, {
    topN: 2,
    fetchImpl: fakeFetch
  });
  assert.deepEqual(reranked.map((item) => item.index), [1, 0]);

  collectionExists = false;
  const embeddingCallsBeforeSync = calls.filter((call) => call.url.endsWith("/embeddings")).length;
  const syncResult = await syncRemoteVectorIndex({
    indexVersion: "version-test",
    chunks: [
      knowledgeChunk("chunk-a", "灵山大佛高88米"),
      knowledgeChunk("chunk-b", "九龙灌浴演出时间")
    ]
  }, { config, fetchImpl: fakeFetch });
  assert.equal(syncResult.chunks, 2);
  assert.equal(syncResult.batches, 1);
  assert.equal(syncResult.inputTokens, 16);
  assert.equal(syncResult.cacheHits, 0);
  assert.equal(syncResult.embeddedChunks, 2);
  assert.ok(calls.some((call) => call.url.includes("/points?wait=true")));
  const repeatedSync = await syncRemoteVectorIndex({
    indexVersion: "version-reused",
    chunks: [
      knowledgeChunk("chunk-a", "灵山大佛高88米"),
      knowledgeChunk("chunk-b", "九龙灌浴演出时间")
    ]
  }, { config, fetchImpl: fakeFetch });
  assert.equal(repeatedSync.cacheHits, 2);
  assert.equal(repeatedSync.embeddedChunks, 0);
  assert.equal(
    calls.filter((call) => call.url.endsWith("/embeddings")).length,
    embeddingCallsBeforeSync + 1,
    "unchanged chunks must reuse model/dimension/content-hash vectors"
  );
  const changedSync = await syncRemoteVectorIndex({
    indexVersion: "version-one-changed",
    chunks: [
      knowledgeChunk("chunk-a", "灵山大佛高88米"),
      knowledgeChunk("chunk-b", "九龙灌浴演出时间调整为上午")
    ]
  }, { config, fetchImpl: fakeFetch });
  assert.equal(changedSync.cacheHits, 1);
  assert.equal(changedSync.embeddedChunks, 1);
  assert.notEqual(
    embeddingCacheEntry("model-a", 64, "same").key,
    embeddingCacheEntry("model-a", 128, "same").key,
    "dimension upgrades must not reuse incompatible vectors"
  );
  assert.notEqual(
    embeddingCacheEntry("model-a", 64, "same").key,
    embeddingCacheEntry("model-b", 64, "same").key,
    "model upgrades must not reuse vectors from another model"
  );
  const cleanup = await deleteQdrantPointsByIndexVersions(["old-version", "old-version"], config, {
    fetchImpl: fakeFetch
  });
  assert.equal(cleanup.versions, 1);
  assert.equal(calls.filter((call) => call.url.includes("/points/delete?wait=true")).length, 1);

  const { restoreBundledKnowledge, loadKnowledge } = await import("../src/services/knowledgeBuild.mjs");
  const { hybridSearch, hybridSearchAsync } = await import("../src/services/retrieval.mjs");
  restoreBundledKnowledge({ force: true });
  const knowledge = loadKnowledge();
  const target = knowledge.chunks.find((chunk) => chunk.title.includes("灵山大佛")) || knowledge.chunks[0];
  queryChunkIds = [target.id];
  expectedIndexVersion = hybridSearch("灵山大佛多高", { limit: 3 }).indexVersion;
  const runtimeConfig = {
    ...config,
    vector: { ...config.vector },
    embedding: { ...config.embedding },
    reranker: { ...config.reranker }
  };
  const ready = await hybridSearchAsync("灵山大佛多高", { limit: 3 }, {
    config: runtimeConfig,
    fetchImpl: fakeFetch
  });
  assert.equal(ready.remote.status, "ready");
  assert.equal(ready.remote.dense, true);
  assert.equal(ready.remote.reranked, true);
  assert.equal(ready.channels.find((channel) => channel.name === "dense")?.count, 1);

  const strictCallStart = calls.length;
  const strictLanguageReady = await hybridSearchAsync(
    "灵山大佛多高",
    { limit: 3, locale: "zh-CN", strictLanguage: true },
    { config: runtimeConfig, fetchImpl: fakeFetch }
  );
  assert.equal(strictLanguageReady.remote.status, "ready");
  const strictQuery = calls.slice(strictCallStart).find((call) => call.url.endsWith("/points/query"));
  assert.equal(
    strictQuery.body.filter.must.find((item) => item.key === "language").match.value,
    "zh"
  );
  for (const [locale, expectedLanguage] of [
    ["en-US", "en"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["th-TH", "th"],
    ["zh-Hant", "zh-TW"]
  ]) {
    const callStart = calls.length;
    await hybridSearchAsync(
      "灵山大佛多高",
      { limit: 3, locale, strictLanguage: true },
      { config: runtimeConfig, fetchImpl: fakeFetch }
    );
    const queryCall = calls.slice(callStart).find((call) => call.url.endsWith("/points/query"));
    assert.equal(
      queryCall.body.filter.must.find((item) => item.key === "language").match.value,
      expectedLanguage
    );
  }

  const callStart = calls.length;
  const complexReady = await hybridSearchAsync("灵山胜境演出时间，并且推荐亲子路线", { limit: 3 }, {
    config: runtimeConfig,
    fetchImpl: fakeFetch
  });
  assert.equal(complexReady.remote.status, "ready");
  assert.equal(complexReady.remote.queryCount, 2);
  const complexCalls = calls.slice(callStart);
  assert.equal(complexCalls.find((call) => call.url.endsWith("/embeddings"))?.body.input.length, 2);
  assert.equal(complexCalls.filter((call) => call.url.endsWith("/points/query")).length, 2);

  const timeoutConfig = { ...runtimeConfig, subqueryTimeoutMs: 20 };
  const timedOut = await hybridSearchAsync("灵山胜境演出时间，并且推荐亲子路线", { limit: 3 }, {
    config: timeoutConfig,
    fetchImpl: async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return fakeFetch(...args);
    }
  });
  assert.equal(timedOut.remote.status, "degraded");
  assert.equal(timedOut.remote.reason, "SUBQUERY_TIMEOUT");

  const degraded = await hybridSearchAsync("灵山大佛多高", { limit: 3 }, {
    config: runtimeConfig,
    fetchImpl: async () => { throw new Error("network unavailable"); }
  });
  assert.equal(degraded.remote.status, "degraded");
  assert.ok(degraded.results.length > 0);
  assert.doesNotMatch(JSON.stringify(degraded), /secret-test-key|qdrant-secret/u);

  const disabled = await hybridSearchAsync("灵山大佛多高", { limit: 3 }, {
    config: buildRemoteRagConfig({ RAG_REMOTE_ENABLED: "false" })
  });
  assert.equal(disabled.remote.status, "disabled");
  assert.ok(disabled.results.length > 0);

  console.log("PASS  managed Embedding, Qdrant sync/query, Reranker and deterministic degradation");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; }
  };
}

function vector64(seed) {
  return Array.from({ length: 64 }, (_, index) => ((index + seed) % 11) - 5 || 0.25);
}

function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function knowledgeChunk(id, content) {
  return {
    id,
    documentId: "doc-test",
    parentId: `parent-${id}`,
    title: id,
    content,
    source: "test.md",
    language: "zh",
    documentType: "md",
    knowledgeScope: "visitor_qa",
    scenicArea: "lingshan",
    enabled: true
  };
}
