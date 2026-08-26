import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-rag-trace-test-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.DEMO_MODE = "true";
process.env.RAG_TRACE_SAMPLE_RATE = "1";

try {
  const { answerQuestion } = await import("../src/services/chat.mjs");
  const { config } = await import("../src/config.mjs");
  const {
    clearRetrievalCache,
    hybridSearch
  } = await import("../src/services/retrieval.mjs");
  const { listRetrievalTraces } = await import("../src/services/retrievalTrace.mjs");

  const answer = await answerQuestion({
    question: "灵山大佛多高？手机号13800138000，身份证320101199001011234，密钥LTAI1234567890ABCDE",
    sessionId: "trace-session",
    locale: "zh"
  });
  const traces = listRetrievalTraces({ limit: 20 });
  const answerTrace = traces.find((trace) => trace.eventType === "answer");
  const retrievalTrace = traces.find((trace) => trace.eventType === "retrieval");
  assert.ok(answerTrace);
  assert.ok(retrievalTrace);
  assert.ok(answerTrace.citations.length > 0);
  assert.equal(answerTrace.model, answer.model);
  assert.equal(answerTrace.indexVersion, answer.retrieval.indexVersion);
  assert.ok(retrievalTrace.candidates.length > 0);
  assert.equal(retrievalTrace.candidates.some((candidate) => "content" in candidate), false);
  const serialized = JSON.stringify(traces);
  assert.doesNotMatch(serialized, /13800138000|320101199001011234|LTAI1234567890ABCDE/u);
  assert.match(answerTrace.queryPreview, /\[phone\]/u);
  assert.match(answerTrace.queryPreview, /\[id-card\]/u);
  assert.match(answerTrace.queryPreview, /\[access-key\]/u);

  const beforeSampling = listRetrievalTraces({ limit: 200 }).length;
  config.rag.traceSampleRate = 0;
  clearRetrievalCache();
  hybridSearch("灵山梵宫有什么看点", { limit: 3 });
  assert.equal(listRetrievalTraces({ limit: 200 }).length, beforeSampling, "successful traces should honor sampling");
  clearRetrievalCache();
  hybridSearch("介绍一下故宫", { limit: 3 });
  assert.ok(listRetrievalTraces({ limit: 200 }).length > beforeSampling, "blocked traces must bypass sampling");

  console.log("PASS  trace sampling, redaction, candidate replay and final citation/model attribution");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
