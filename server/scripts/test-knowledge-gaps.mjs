import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-rag-gap-test-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.DEMO_MODE = "true";

try {
  const {
    exportKnowledgeGapsCsv,
    listKnowledgeGaps,
    recordKnowledgeGap,
    updateKnowledgeGapStatus
  } = await import("../src/services/knowledgeGaps.mjs");
  const { appendMessage } = await import("../src/services/conversation.mjs");
  const { createFeedback } = await import("../src/services/feedback.mjs");
  const { getDb } = await import("../src/db/database.mjs");

  const first = recordKnowledgeGap({
    question: "拈花湾夜场几点开放？手机号 13800138000",
    reason: "no_candidate",
    source: "retrieval"
  });
  const repeated = recordKnowledgeGap({
    question: "拈花湾夜场几点开放! 手机号 13800138000",
    reason: "low_relevance",
    source: "retrieval"
  });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.occurrenceCount, 2);
  assert.equal(repeated.scenicArea, "nianhuawan");
  assert.equal(repeated.intent, "time");
  assert.match(repeated.questionPreview, /\[phone\]/u);
  assert.equal(repeated.reasons.length, 2);
  const paraphrased = recordKnowledgeGap({
    question: "拈花湾夜间开放时间是什么？",
    reason: "no_candidate",
    source: "retrieval"
  });
  assert.equal(paraphrased.id, first.id, "semantically equivalent questions should share one gap cluster");
  assert.equal(paraphrased.occurrenceCount, 3);

  const sessionId = "gap-feedback-session";
  appendMessage(sessionId, { role: "user", content: "灵山停车场能停房车吗？" });
  const assistant = appendMessage(sessionId, { role: "assistant", content: "当前资料没有覆盖具体内容。" });
  createFeedback({ sessionId, messageId: assistant.id, rating: 2, vote: "down" });
  createFeedback({ sessionId, messageId: assistant.id, rating: 5, vote: "up" });
  const feedbackGap = listKnowledgeGaps().find((gap) => gap.questionPreview.includes("房车"));
  assert.ok(feedbackGap);
  assert.equal(feedbackGap.occurrenceCount, 1, "positive feedback must not create another gap event");
  assert.ok(feedbackGap.sources.some((item) => item.label === "feedback"));

  const { answerQuestionStream } = await import("../src/services/chat.mjs");
  for await (const _delta of answerQuestionStream({
    question: "灵山是否提供量子充电舱？",
    sessionId: "gap-stream-session"
  })) {
    // 只消费流，断言由下方缺口队列完成。
  }
  const streamGap = listKnowledgeGaps().find((gap) => gap.questionPreview.includes("量子充电舱"));
  assert.ok(streamGap, "streaming no-data answers must enter the gap queue");
  assert.ok(streamGap.sources.some((item) => item.label === "stream_retrieval"));

  const documentCountBefore = getDb().prepare("SELECT COUNT(*) AS count FROM knowledge_documents").get().count;
  const chunkCountBefore = getDb().prepare("SELECT COUNT(*) AS count FROM knowledge_chunks").get().count;
  const confirmed = updateKnowledgeGapStatus(first.id, "confirmed");
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.nextAction, "manual_document_review_required");
  assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM knowledge_documents").get().count, documentCountBefore);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM knowledge_chunks").get().count, chunkCountBefore);

  recordKnowledgeGap({ question: "=SUM(A1:A2)", reason: "no_candidate", source: "retrieval" });
  const csv = exportKnowledgeGapsCsv();
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv, /"'=SUM\(A1:A2\)"/u);
  assert.ok(csv.includes("no_candidate"));
  assert.throws(
    () => updateKnowledgeGapStatus(first.id, "indexed"),
    (error) => error.code === "KNOWLEDGE_GAP_STATUS_INVALID"
  );
  console.log("PASS  RAG-028 gap aggregation, feedback linkage, review state, and safe CSV export");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
