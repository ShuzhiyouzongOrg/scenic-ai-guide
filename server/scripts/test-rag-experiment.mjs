/**
 * @fileoverview RAG A/B 实验服务测试脚本。
 * @description 验证稳定分流、样本聚合、质量门禁、重置操作和隐私处理。
 */
import assert from "node:assert/strict";

process.env.SQLITE_PATH = ":memory:";
process.env.RAG_AB_ENABLED = "true";
process.env.RAG_AB_EXPERIMENT_ID = "rag-test-live";
process.env.RAG_AB_TREATMENT_PERCENT = "50";
process.env.RAG_AB_SALT = "deterministic-test-salt";
process.env.RAG_AB_MIN_SAMPLES = "5";
process.env.RAG_AB_MIN_FEEDBACK_SAMPLES = "3";
process.env.RAG_AB_MAX_P95_RATIO = "1.2";
process.env.LLM_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.DEMO_MODE = "true";

const { getDb } = await import("../src/db/database.mjs");
const { answerQuestion } = await import("../src/services/chat.mjs");
const { createFeedback } = await import("../src/services/feedback.mjs");
const {
  getRagExperimentReport,
  recordRagCitationClick,
  recordRagExperimentAnswer,
  resetRagExperiment,
  resolveRagExperiment
} = await import("../src/services/ragExperiment.mjs");

const first = resolveRagExperiment("stable-session");
const second = resolveRagExperiment("stable-session");
assert.equal(first.variant, second.variant, "the same session must keep the same variant");
assert.equal(first.bucket, second.bucket, "the same session must keep the same bucket");
assert.equal(first.sessionHash.length, 64);

const sessions = findSessionsForBothVariants();
const answer = await answerQuestion({
  question: "灵山大佛多高？",
  sessionId: sessions.treatment,
  locale: "zh"
});
assert.equal(answer.experiment.enabled, true);
assert.equal(answer.experiment.variant, "treatment");
assert.ok(answer.messageId?.startsWith("msg_"));
assert.ok(answer.model);
assert.ok(answer.retrieval.indexVersion);

createFeedback({
  sessionId: sessions.treatment,
  messageId: answer.messageId,
  rating: 5,
  vote: "up"
});
assert.equal(recordRagCitationClick({
  sessionId: sessions.treatment,
  messageId: answer.messageId
}).recorded, true);

const liveReport = getRagExperimentReport();
assert.equal(liveReport.variants.treatment.feedbackSamples, 1);
assert.equal(liveReport.variants.treatment.acceptanceRate, 1);
assert.equal(liveReport.variants.treatment.citationClicks, 1);
assert.ok(liveReport.variants.treatment.models[answer.model] >= 1);
assert.ok(liveReport.variants.treatment.indexVersions[answer.retrieval.indexVersion] >= 1);

const rollbackPolicy = {
  enabled: true,
  id: "rag-test-rollback",
  treatmentPercent: 50,
  salt: "rollback-test-salt",
  minSamples: 5,
  minFeedbackSamples: 3,
  maxP95Ratio: 1.2,
  maxRefusalRateIncrease: 0.5,
  maxAcceptanceRateDrop: 0.5,
  maxCostRatio: 10
};
resetRagExperiment(rollbackPolicy);
for (let index = 0; index < 5; index += 1) {
  recordRagExperimentAnswer({
    assignment: assignment("control", index, rollbackPolicy.id),
    messageId: `control-${index}`,
    scenario: "grounded",
    latencyMs: 100,
    model: "control-model",
    indexVersion: "index-control"
  }, rollbackPolicy);
}
let rollback = null;
for (let index = 0; index < 5; index += 1) {
  rollback = recordRagExperimentAnswer({
    assignment: assignment("treatment", index, rollbackPolicy.id),
    messageId: `treatment-${index}`,
    scenario: "grounded",
    latencyMs: 500,
    model: "treatment-model",
    indexVersion: "index-treatment"
  }, rollbackPolicy).rollback;
}
assert.equal(rollback?.status, "rolled_back");
assert.match(rollback.rollbackReason, /p95_latency_regression/u);
const forcedControl = resolveRagExperiment("new-session-after-rollback", rollbackPolicy);
assert.equal(forcedControl.variant, "control");
assert.equal(forcedControl.reason, "automatic_rollback");

const columns = getDb().pragma("table_info(rag_experiment_events)").map((column) => column.name);
assert.equal(columns.includes("question"), false, "experiment storage must not contain question text");
assert.equal(columns.includes("question_preview"), false, "experiment storage must not contain question previews");
assert.equal(getDb().prepare(
  "SELECT COUNT(*) AS count FROM rag_experiment_events WHERE session_hash = ?"
).get(sessions.treatment).count, 0, "raw session IDs must not be persisted");

console.log(JSON.stringify({
  ok: true,
  stableVariant: first.variant,
  liveMetrics: liveReport.variants.treatment,
  rollback
}, null, 2));

/**
 * @description 枚举测试会话，直到找到分别命中 control 和 treatment 的会话 ID。
 * @returns {{control: string, treatment: string}} 两个实验分组的测试会话。
 * @throws {AssertionError} 一万次枚举内未找到两个分组时抛出。
 */
function findSessionsForBothVariants() {
  const found = {};
  for (let index = 0; index < 10_000 && (!found.control || !found.treatment); index += 1) {
    const sessionId = `experiment-session-${index}`;
    const result = resolveRagExperiment(sessionId);
    found[result.variant] ||= sessionId;
  }
  assert.ok(found.control && found.treatment, "test setup must find both variants");
  return found;
}

/**
 * @description 构造可写入实验事件的固定测试分组。
 * @param {"control"|"treatment"} variant 实验分组。
 * @param {number} index 样本序号。
 * @param {string} experimentId 实验 ID。
 * @returns {object} 测试实验分组对象。
 */
function assignment(variant, index, experimentId) {
  return {
    id: experimentId,
    enabled: true,
    variant,
    sessionHash: `${variant}-${index}`,
    status: "active"
  };
}
