/**
 * @fileoverview RAG 检索 A/B 分流、匿名指标聚合和自动回滚服务。
 *
 * 实验默认关闭。启用后，同一会话通过带盐 SHA-256 哈希稳定命中 control
 * 或 treatment；数据库仅保存不可逆会话哈希与质量指标，不保存问题正文。
 */
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.mjs";
import { getDb } from "../db/database.mjs";

const VARIANTS = new Set(["control", "treatment"]);

/**
 * 读取并规范化当前实验策略。
 * @param {object} [override] 测试或运维显式传入的策略覆盖。
 * @returns {object} 可直接用于分流和回滚判断的策略。
 */
export function getRagExperimentPolicy(override) {
  const source = override || config.rag.experiment || {};
  return {
    enabled: source.enabled === true,
    id: String(source.id || "rag-retrieval-v1"),
    treatmentPercent: clampNumber(source.treatmentPercent, 0, 100, 10),
    salt: String(source.salt || "local-rag-experiment"),
    minSamples: Math.max(5, Math.round(Number(source.minSamples) || 50)),
    minFeedbackSamples: Math.max(3, Math.round(Number(source.minFeedbackSamples) || 15)),
    maxP95Ratio: Math.max(1, Number(source.maxP95Ratio) || 1.5),
    maxRefusalRateIncrease: clampNumber(source.maxRefusalRateIncrease, 0, 1, 0.1),
    maxAcceptanceRateDrop: clampNumber(source.maxAcceptanceRateDrop, 0, 1, 0.1),
    maxCostRatio: Math.max(1, Number(source.maxCostRatio) || 1.5),
    inputCostPerMillion: Math.max(0, Number(source.inputCostPerMillion) || 0),
    outputCostPerMillion: Math.max(0, Number(source.outputCostPerMillion) || 0),
    embeddingCostPerMillion: Math.max(0, Number(source.embeddingCostPerMillion) || 0)
  };
}

/**
 * 为匿名会话返回稳定实验分组；实验关闭、缺少会话或已回滚时统一走 control。
 * @param {*} sessionId 游客会话 ID。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {{id: string, enabled: boolean, variant: "control"|"treatment", sessionHash: string, bucket: number|null, status: string, reason: string|null}}
 */
export function resolveRagExperiment(sessionId, policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  if (!policy.enabled) return disabledAssignment(policy, "disabled");
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return disabledAssignment(policy, "missing_session");

  const state = ensureExperimentState(policy);
  if (state.status === "rolled_back") {
    return {
      ...disabledAssignment(policy, "automatic_rollback"),
      enabled: true,
      status: state.status
    };
  }

  const sessionHash = hashSession(normalizedSessionId, policy.salt);
  const bucket = Number.parseInt(sessionHash.slice(0, 8), 16) % 10_000;
  const variant = bucket < Math.round(policy.treatmentPercent * 100) ? "treatment" : "control";
  return {
    id: policy.id,
    enabled: true,
    variant,
    sessionHash,
    bucket,
    status: state.status,
    reason: null
  };
}

/**
 * 保存一条匿名回答指标，并在达到最小样本后执行回滚检查。
 * @param {object} input 回答及实验归因信息。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {{recorded: boolean, eventId?: string, rollback?: object|null}}
 */
export function recordRagExperimentAnswer(input = {}, policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  const assignment = input.assignment || {};
  if (!policy.enabled || assignment.enabled !== true || !assignment.sessionHash || !VARIANTS.has(assignment.variant)) {
    return { recorded: false };
  }

  const now = new Date().toISOString();
  const usage = normalizeUsage(input.usage);
  const embeddingUsage = normalizeUsage(input.embeddingUsage);
  const estimatedCostUsd = estimateCost(usage, embeddingUsage, policy);
  const event = {
    id: `ragev_${Date.now()}_${randomBytes(5).toString("hex")}`,
    experiment_id: policy.id,
    session_hash: assignment.sessionHash,
    message_id: String(input.messageId || "") || null,
    variant: assignment.variant,
    scenario: String(input.scenario || "unknown"),
    refused: input.refused === true ? 1 : 0,
    citation_count: Math.max(0, Number(input.citationCount) || 0),
    latency_ms: Math.max(0, Number(input.latencyMs) || 0),
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    embedding_tokens: embeddingUsage.totalTokens,
    estimated_cost_usd: estimatedCostUsd,
    provider: String(input.provider || "") || null,
    model: String(input.model || "") || null,
    index_version: String(input.indexVersion || "") || null,
    cached: input.cached === true ? 1 : 0,
    created_at: now,
    updated_at: now
  };
  getDb().prepare(
    `INSERT INTO rag_experiment_events
      (id, experiment_id, session_hash, message_id, variant, scenario, refused,
       citation_count, latency_ms, input_tokens, output_tokens, embedding_tokens,
       estimated_cost_usd, provider, model, index_version, cached, created_at, updated_at)
     VALUES
      (@id, @experiment_id, @session_hash, @message_id, @variant, @scenario, @refused,
       @citation_count, @latency_ms, @input_tokens, @output_tokens, @embedding_tokens,
       @estimated_cost_usd, @provider, @model, @index_version, @cached, @created_at, @updated_at)`
  ).run(event);
  pruneExperimentEvents(policy.id);
  return {
    recorded: true,
    eventId: event.id,
    rollback: evaluateRagExperimentRollback(policy)
  };
}

/**
 * 将游客反馈关联到该会话最近一次回答，不保存反馈文本。
 * @param {object} feedback 已规范化反馈。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {{recorded: boolean, eventId?: string, rollback?: object|null}}
 */
export function recordRagExperimentFeedback(feedback = {}, policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  if (!policy.enabled || !feedback.sessionId) return { recorded: false };
  const sessionHash = hashSession(String(feedback.sessionId), policy.salt);
  const db = getDb();
  const row = feedback.messageId
    ? db.prepare(
      `SELECT id FROM rag_experiment_events
       WHERE experiment_id = ? AND session_hash = ? AND message_id = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(policy.id, sessionHash, String(feedback.messageId))
    : db.prepare(
      `SELECT id FROM rag_experiment_events
       WHERE experiment_id = ? AND session_hash = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(policy.id, sessionHash);
  if (!row) return { recorded: false };

  const rating = Number(feedback.rating);
  const hasSignal = feedback.vote === "up" || feedback.vote === "down" || Number.isFinite(rating);
  if (!hasSignal) return { recorded: false };
  const accepted = feedback.vote === "up" || rating >= 4 ? 1 : 0;
  db.prepare(
    `UPDATE rag_experiment_events
     SET feedback_recorded = 1, accepted = ?, updated_at = ?
     WHERE id = ?`
  ).run(accepted, new Date().toISOString(), row.id);
  return {
    recorded: true,
    eventId: row.id,
    rollback: evaluateRagExperimentRollback(policy)
  };
}

/**
 * 记录一次引用点击；同一回答多次点击只计为已点击一次。
 * @param {{sessionId?: *, messageId?: *}} input 匿名会话和回答消息标识。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {{recorded: boolean, eventId?: string}}
 */
export function recordRagCitationClick(input = {}, policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  if (!policy.enabled || !input.sessionId) return { recorded: false };
  const sessionHash = hashSession(String(input.sessionId), policy.salt);
  const db = getDb();
  const row = input.messageId
    ? db.prepare(
      `SELECT id FROM rag_experiment_events
       WHERE experiment_id = ? AND session_hash = ? AND message_id = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(policy.id, sessionHash, String(input.messageId))
    : db.prepare(
      `SELECT id FROM rag_experiment_events
       WHERE experiment_id = ? AND session_hash = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(policy.id, sessionHash);
  if (!row) return { recorded: false };
  db.prepare(
    "UPDATE rag_experiment_events SET citation_clicked = 1, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), row.id);
  return { recorded: true, eventId: row.id };
}

/**
 * 返回实验状态、两组聚合指标与 treatment 相对 control 的差值。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {object} 管理端可展示的匿名实验摘要。
 */
export function getRagExperimentReport(policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  const state = policy.enabled ? ensureExperimentState(policy) : null;
  const rows = getDb().prepare(
    "SELECT * FROM rag_experiment_events WHERE experiment_id = ? ORDER BY created_at ASC"
  ).all(policy.id);
  const control = summarizeVariant(rows.filter((row) => row.variant === "control"));
  const treatment = summarizeVariant(rows.filter((row) => row.variant === "treatment"));
  return {
    experimentId: policy.id,
    enabled: policy.enabled,
    treatmentPercent: policy.treatmentPercent,
    state: state ? toState(state) : { status: "disabled", rollbackReason: null },
    thresholds: {
      minSamples: policy.minSamples,
      minFeedbackSamples: policy.minFeedbackSamples,
      maxP95Ratio: policy.maxP95Ratio,
      maxRefusalRateIncrease: policy.maxRefusalRateIncrease,
      maxAcceptanceRateDrop: policy.maxAcceptanceRateDrop,
      maxCostRatio: policy.maxCostRatio
    },
    variants: { control, treatment },
    comparison: compareMetrics(control, treatment)
  };
}

/**
 * 重新激活当前实验并清空其历史事件，供管理员在修复 treatment 后重新灰度。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {object} 重置后的实验报告。
 */
export function resetRagExperiment(policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  const now = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM rag_experiment_events WHERE experiment_id = ?").run(policy.id);
    db.prepare(
      `INSERT INTO rag_experiment_state
        (experiment_id, status, rollback_reason, started_at, updated_at, rolled_back_at)
       VALUES (?, 'active', NULL, ?, ?, NULL)
       ON CONFLICT(experiment_id) DO UPDATE SET
         status = 'active', rollback_reason = NULL, started_at = excluded.started_at,
         updated_at = excluded.updated_at, rolled_back_at = NULL`
    ).run(policy.id, now, now);
  })();
  return getRagExperimentReport(policy);
}

/**
 * 检查 treatment 是否超过回滚阈值；首次命中后原子写入 rolled_back。
 * @param {object} [policyOverride] 可选策略覆盖。
 * @returns {object|null} 本次回滚结果；样本不足或未退化时为 null。
 */
export function evaluateRagExperimentRollback(policyOverride) {
  const policy = getRagExperimentPolicy(policyOverride);
  if (!policy.enabled) return null;
  const state = ensureExperimentState(policy);
  if (state.status === "rolled_back") return toState(state);
  const report = getRagExperimentReport(policy);
  const { control, treatment } = report.variants;
  if (control.answers < policy.minSamples || treatment.answers < policy.minSamples) return null;

  const reasons = [];
  if (control.p95LatencyMs > 0 && treatment.p95LatencyMs / control.p95LatencyMs > policy.maxP95Ratio) {
    reasons.push("p95_latency_regression");
  }
  if (treatment.refusalRate - control.refusalRate > policy.maxRefusalRateIncrease) {
    reasons.push("refusal_rate_regression");
  }
  if (
    control.feedbackSamples >= policy.minFeedbackSamples
    && treatment.feedbackSamples >= policy.minFeedbackSamples
    && control.acceptanceRate - treatment.acceptanceRate > policy.maxAcceptanceRateDrop
  ) {
    reasons.push("acceptance_rate_regression");
  }
  if (
    control.averageEstimatedCostUsd > 0
    && treatment.averageEstimatedCostUsd / control.averageEstimatedCostUsd > policy.maxCostRatio
  ) {
    reasons.push("estimated_cost_regression");
  }
  if (reasons.length === 0) return null;

  const now = new Date().toISOString();
  getDb().prepare(
    `UPDATE rag_experiment_state
     SET status = 'rolled_back', rollback_reason = ?, updated_at = ?, rolled_back_at = ?
     WHERE experiment_id = ? AND status = 'active'`
  ).run(reasons.join(","), now, now, policy.id);
  return toState(getDb().prepare(
    "SELECT * FROM rag_experiment_state WHERE experiment_id = ?"
  ).get(policy.id));
}

function ensureExperimentState(policy) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO rag_experiment_state
      (experiment_id, status, rollback_reason, started_at, updated_at, rolled_back_at)
     VALUES (?, 'active', NULL, ?, ?, NULL)
     ON CONFLICT(experiment_id) DO NOTHING`
  ).run(policy.id, now, now);
  return db.prepare("SELECT * FROM rag_experiment_state WHERE experiment_id = ?").get(policy.id);
}

function disabledAssignment(policy, reason) {
  return {
    id: policy.id,
    enabled: false,
    variant: "control",
    sessionHash: "",
    bucket: null,
    status: reason === "disabled" ? "disabled" : "control_only",
    reason
  };
}

function hashSession(sessionId, salt) {
  return createHash("sha256").update(`${salt}:${sessionId}`).digest("hex");
}

function normalizeUsage(usage) {
  const inputTokens = Math.max(0, Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0);
  const outputTokens = Math.max(0, Number(usage?.completion_tokens ?? usage?.output_tokens) || 0);
  const totalTokens = Math.max(inputTokens + outputTokens, Number(usage?.total_tokens) || 0);
  return { inputTokens, outputTokens, totalTokens };
}

function estimateCost(usage, embeddingUsage, policy) {
  if (
    policy.inputCostPerMillion <= 0
    && policy.outputCostPerMillion <= 0
    && policy.embeddingCostPerMillion <= 0
  ) return null;
  const value = (
    usage.inputTokens * policy.inputCostPerMillion
    + usage.outputTokens * policy.outputCostPerMillion
    + embeddingUsage.totalTokens * policy.embeddingCostPerMillion
  ) / 1_000_000;
  return Number(value.toFixed(8));
}

function summarizeVariant(rows) {
  const latencies = rows
    .map((row) => Number(row.latency_ms))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const feedbackRows = rows.filter((row) => Number(row.feedback_recorded) === 1);
  const costs = rows.map((row) => Number(row.estimated_cost_usd)).filter((value) => Number.isFinite(value));
  const totalTokens = rows.reduce((sum, row) => sum
    + Number(row.input_tokens || 0)
    + Number(row.output_tokens || 0)
    + Number(row.embedding_tokens || 0), 0);
  return {
    answers: rows.length,
    refusals: rows.filter((row) => Number(row.refused) === 1).length,
    refusalRate: rate(rows.filter((row) => Number(row.refused) === 1).length, rows.length),
    feedbackSamples: feedbackRows.length,
    acceptedAnswers: feedbackRows.filter((row) => Number(row.accepted) === 1).length,
    acceptanceRate: rate(feedbackRows.filter((row) => Number(row.accepted) === 1).length, feedbackRows.length),
    answersWithCitations: rows.filter((row) => Number(row.citation_count) > 0).length,
    citationClicks: rows.filter((row) => Number(row.citation_clicked) === 1).length,
    citationClickRate: rate(
      rows.filter((row) => Number(row.citation_clicked) === 1).length,
      rows.filter((row) => Number(row.citation_count) > 0).length
    ),
    p95LatencyMs: percentile(latencies, 0.95),
    averageLatencyMs: average(latencies),
    totalTokens,
    averageTokens: rows.length ? Number((totalTokens / rows.length).toFixed(2)) : 0,
    averageEstimatedCostUsd: average(costs, 8),
    models: countValues(rows.map((row) => row.model).filter(Boolean)),
    indexVersions: countValues(rows.map((row) => row.index_version).filter(Boolean))
  };
}

function compareMetrics(control, treatment) {
  return {
    acceptanceRateDelta: round(treatment.acceptanceRate - control.acceptanceRate),
    refusalRateDelta: round(treatment.refusalRate - control.refusalRate),
    citationClickRateDelta: round(treatment.citationClickRate - control.citationClickRate),
    p95LatencyRatio: ratio(treatment.p95LatencyMs, control.p95LatencyMs),
    averageTokenRatio: ratio(treatment.averageTokens, control.averageTokens),
    averageEstimatedCostRatio: ratio(
      treatment.averageEstimatedCostUsd,
      control.averageEstimatedCostUsd
    )
  };
}

function toState(row) {
  return {
    status: row?.status || "active",
    rollbackReason: row?.rollback_reason || null,
    startedAt: row?.started_at || null,
    updatedAt: row?.updated_at || null,
    rolledBackAt: row?.rolled_back_at || null
  };
}

function percentile(values, point) {
  if (values.length === 0) return 0;
  return Number(values[Math.max(0, Math.ceil(values.length * point) - 1)].toFixed(3));
}

function average(values, digits = 3) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits));
}

function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function round(value) {
  return Number(value.toFixed(4));
}

function countValues(values) {
  return Object.fromEntries([...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function pruneExperimentEvents(experimentId) {
  const count = Number(getDb().prepare(
    "SELECT COUNT(*) AS count FROM rag_experiment_events WHERE experiment_id = ?"
  ).get(experimentId)?.count || 0);
  if (count <= 50_000) return;
  getDb().prepare(
    `DELETE FROM rag_experiment_events WHERE id IN (
       SELECT id FROM rag_experiment_events
       WHERE experiment_id = ? ORDER BY created_at ASC LIMIT ?
     )`
  ).run(experimentId, count - 40_000);
}
