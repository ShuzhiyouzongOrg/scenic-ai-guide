/**
 * @fileoverview RAG 检索 A/B 分流、匿名指标聚合和自动回滚服务。
 * @description
 * 管理 RAG 实验分流、匿名质量指标、成本统计和自动回滚判断。
 *
 * 实验默认关闭。启用后，同一会话通过带盐 SHA-256 哈希稳定命中 control
 * 或 treatment；数据库仅保存不可逆会话哈希与质量指标，不保存问题正文。
 */

/**
 * @typedef {object} RagExperimentPolicy
 * @description RAG 实验分流、成本与自动回滚策略。
 * @property {boolean} enabled 是否启用实验。
 * @property {string} id 实验 ID。
 * @property {number} treatmentPercent treatment 流量百分比。
 * @property {string} salt 会话哈希盐值。
 * @property {number} minSamples 每组触发回滚判断的最少回答样本数。
 * @property {number} minFeedbackSamples 每组评估接受率所需的最少反馈数。
 * @property {number} maxP95Ratio treatment 相对 control 的最大 P95 时延比。
 * @property {number} maxRefusalRateIncrease 最大拒答率增幅。
 * @property {number} maxAcceptanceRateDrop 最大接受率降幅。
 * @property {number} maxCostRatio 最大平均估算成本比。
 * @property {number} inputCostPerMillion 每百万输入 token 成本。
 * @property {number} outputCostPerMillion 每百万输出 token 成本。
 * @property {number} embeddingCostPerMillion 每百万向量 token 成本。
 */

/**
 * @typedef {object} RagExperimentAssignment
 * @description 匿名会话的稳定实验分组。
 * @property {string} id 实验 ID。
 * @property {boolean} enabled 当前会话是否参与实验。
 * @property {"control"|"treatment"} variant 实验分组。
 * @property {string} sessionHash 不可逆会话摘要；未参与时为空字符串。
 * @property {number|null} bucket 万分桶编号；未参与时为 `null`。
 * @property {string} status 实验状态。
 * @property {string|null} reason 未参与 treatment 的原因。
 */

/**
 * @typedef {object} RagExperimentState
 * @description 实验启用或自动回滚状态。
 * @property {string} status 当前状态。
 * @property {string|null} rollbackReason 回滚原因。
 * @property {string|null} startedAt 启动时间。
 * @property {string|null} updatedAt 最近更新时间。
 * @property {string|null} rolledBackAt 回滚时间。
 */

/**
 * @typedef {object} RagExperimentRecordResult
 * @description 实验指标或反馈记录结果。
 * @property {boolean} recorded 是否写入事件。
 * @property {string} [eventId] 事件 ID。
 * @property {RagExperimentState|null} [rollback] 本次回滚判断结果。
 */

/**
 * @typedef {object} RagVariantMetrics
 * @description 单个实验分组的匿名聚合指标。
 * @property {number} answers 回答数量。
 * @property {number} refusals 拒答数量。
 * @property {number} refusalRate 拒答率。
 * @property {number} feedbackSamples 有效反馈数量。
 * @property {number} acceptedAnswers 被接受的回答数量。
 * @property {number} acceptanceRate 接受率。
 * @property {number} answersWithCitations 带引用的回答数量。
 * @property {number} citationClicks 引用被点击的回答数量。
 * @property {number} citationClickRate 引用点击率。
 * @property {number} p95LatencyMs P95 回答时延。
 * @property {number} averageLatencyMs 平均回答时延。
 * @property {number} totalTokens 总 token 数。
 * @property {number} averageTokens 平均 token 数。
 * @property {number} averageEstimatedCostUsd 平均估算成本。
 * @property {Record<string, number>} models 模型使用次数。
 * @property {Record<string, number>} indexVersions 索引版本使用次数。
 */

/**
 * @typedef {object} RagExperimentReport
 * @description 管理端使用的 RAG 实验汇总报告。
 * @property {string} experimentId 实验 ID。
 * @property {boolean} enabled 是否启用实验。
 * @property {number} treatmentPercent treatment 流量百分比。
 * @property {RagExperimentState} state 实验状态。
 * @property {object} thresholds 自动回滚阈值。
 * @property {{control: RagVariantMetrics, treatment: RagVariantMetrics}} variants 两组聚合指标。
 * @property {object} comparison treatment 相对 control 的指标变化。
 */
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.mjs";
import { getDb } from "../db/database.mjs";

/**
 * @description 定义允许参与 RAG 实验统计的分组名称。
 * @type {ReadonlySet<"control"|"treatment">} 合法实验分组集合。
 */
const VARIANTS = new Set(["control", "treatment"]);

/**
 * @description
 * 读取并规范化当前实验策略。
 * @param {Partial<RagExperimentPolicy>} [override] 测试或运维显式传入的策略覆盖。
 * @returns {RagExperimentPolicy} 可直接用于分流和回滚判断的策略。
 * @example
 * const policy = getRagExperimentPolicy({ enabled: true, treatmentPercent: 20 });
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
 * @description
 * 为匿名会话返回稳定实验分组；实验关闭、缺少会话或已回滚时统一走 control。
 * @param {*} sessionId 游客会话 ID。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentAssignment} 稳定实验分组。
 * @throws {Error} 实验状态初始化或读取失败时透传 SQLite 异常。
 * @example
 * const assignment = resolveRagExperiment("session-1", { enabled: true });
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
 * @description
 * 保存一条匿名回答指标，并在达到最小样本后执行回滚检查。
 * @param {object} [input={}] 回答及实验归因信息。
 * @param {RagExperimentAssignment} [input.assignment] 当前会话的实验分组。
 * @param {object} [input.usage] 问答模型 token 用量。
 * @param {object} [input.embeddingUsage] 向量模型 token 用量。
 * @param {*} [input.messageId] 回答消息 ID。
 * @param {*} [input.scenario] 问答场景标识。
 * @param {boolean} [input.refused=false] 是否返回拒答结果。
 * @param {number} [input.citationCount=0] 回答引用数量。
 * @param {number} [input.latencyMs=0] 回答总时延，单位为毫秒。
 * @param {*} [input.provider] 模型供应商标识。
 * @param {*} [input.model] 模型名称。
 * @param {*} [input.indexVersion] 知识索引版本。
 * @param {boolean} [input.cached=false] 回答是否来自缓存。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentRecordResult} 指标记录和回滚判断结果。
 * @throws {Error} SQLite 事件写入、裁剪或回滚检查失败时透传数据库异常。
 * @example
 * const result = recordRagExperimentAnswer({ assignment, latencyMs: 320, refused: false });
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
 * @description
 * 将游客反馈关联到该会话最近一次回答，不保存反馈文本。
 * @param {object} [feedback={}] 已规范化反馈。
 * @param {*} [feedback.sessionId] 游客会话 ID。
 * @param {*} [feedback.messageId] 回答消息 ID。
 * @param {*} [feedback.rating] 数值评分。
 * @param {*} [feedback.vote] 点赞或点踩标识。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentRecordResult} 反馈记录和回滚判断结果。
 * @throws {Error} SQLite 事件查询、更新或回滚检查失败时透传数据库异常。
 * @example
 * const result = recordRagExperimentFeedback({ sessionId: "session-1", vote: "up" });
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
 * @description
 * 记录一次引用点击；同一回答多次点击只计为已点击一次。
 * @param {object} [input={}] 匿名会话和回答消息标识。
 * @param {*} [input.sessionId] 游客会话 ID。
 * @param {*} [input.messageId] 回答消息 ID。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {{recorded: boolean, eventId?: string}} 引用点击是否记录成功及关联事件 ID。
 * @throws {Error} SQLite 事件查询或更新失败时透传数据库异常。
 * @example
 * const result = recordRagCitationClick({ sessionId: "session-1", messageId: "message-1" });
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
 * @description
 * 返回实验状态、两组聚合指标与 treatment 相对 control 的差值。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentReport} 管理端可展示的匿名实验摘要。
 * @throws {Error} SQLite 状态或事件查询失败时透传数据库异常。
 * @example
 * const report = getRagExperimentReport();
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
 * @description
 * 重新激活当前实验并清空其历史事件，供管理员在修复 treatment 后重新灰度。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentReport} 重置后的实验报告。
 * @throws {Error} SQLite 事务或报告查询失败时透传数据库异常。
 * @example
 * const report = resetRagExperiment();
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
 * @description
 * 检查 treatment 是否超过回滚阈值；首次命中后原子写入 rolled_back。
 * @param {Partial<RagExperimentPolicy>} [policyOverride] 可选策略覆盖。
 * @returns {RagExperimentState|null} 本次回滚结果；样本不足或未退化时为 `null`。
 * @throws {Error} SQLite 状态读取或回滚更新失败时透传数据库异常。
 * @example
 * const rollback = evaluateRagExperimentRollback();
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

/**
 * @description 确保指定实验存在活动状态行，并返回数据库中的当前状态。
 * @private
 * @param {RagExperimentPolicy} policy 当前实验策略。
 * @returns {Record<string, *>} 实验状态数据库行。
 * @throws {Error} 实验状态写入或查询失败时透传 SQLite 异常。
 */
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

/**
 * @description 构建未参与 treatment 时统一使用的 control 分组结果。
 * @private
 * @param {RagExperimentPolicy} policy 当前实验策略。
 * @param {string} reason 未参与实验的原因。
 * @returns {RagExperimentAssignment} 关闭 treatment 的分组结果。
 */
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

/**
 * @description 使用实验盐值对会话 ID 生成不可逆 SHA-256 摘要。
 * @private
 * @param {string} sessionId 游客会话 ID。
 * @param {string} salt 实验哈希盐值。
 * @returns {string} 十六进制会话摘要。
 */
function hashSession(sessionId, salt) {
  return createHash("sha256").update(`${salt}:${sessionId}`).digest("hex");
}

/**
 * @description 将不同供应商的 token 用量字段归一化为统一结构。
 * @private
 * @param {object|null|undefined} usage 原始模型用量。
 * @returns {{inputTokens: number, outputTokens: number, totalTokens: number}} 非负 token 用量。
 */
function normalizeUsage(usage) {
  const inputTokens = Math.max(0, Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0);
  const outputTokens = Math.max(0, Number(usage?.completion_tokens ?? usage?.output_tokens) || 0);
  const totalTokens = Math.max(inputTokens + outputTokens, Number(usage?.total_tokens) || 0);
  return { inputTokens, outputTokens, totalTokens };
}

/**
 * @description 按实验策略中的单价估算单次回答成本。
 * @private
 * @param {{inputTokens: number, outputTokens: number}} usage 问答模型用量。
 * @param {{totalTokens: number}} embeddingUsage 向量模型用量。
 * @param {RagExperimentPolicy} policy 当前实验策略。
 * @returns {number|null} 美元估算成本；未配置单价时返回 `null`。
 */
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

/**
 * @description 汇总一个实验分组的质量、时延、引用和成本指标。
 * @private
 * @param {Array<Record<string, *>>} rows 实验事件数据库行。
 * @returns {RagVariantMetrics} 分组聚合指标。
 */
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

/**
 * @description 计算 treatment 相对 control 的关键指标差值和比例。
 * @private
 * @param {RagVariantMetrics} control control 分组指标。
 * @param {RagVariantMetrics} treatment treatment 分组指标。
 * @returns {object} 可供回滚判断和管理端展示的比较结果。
 */
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

/**
 * @description 将实验状态数据库行转换为公开状态对象。
 * @private
 * @param {Record<string, *>|null|undefined} row 实验状态数据库行。
 * @returns {RagExperimentState} 规范化实验状态。
 */
function toState(row) {
  return {
    status: row?.status || "active",
    rollbackReason: row?.rollback_reason || null,
    startedAt: row?.started_at || null,
    updatedAt: row?.updated_at || null,
    rolledBackAt: row?.rolled_back_at || null
  };
}

/**
 * @description 从升序数值样本中读取指定分位点。
 * @private
 * @param {number[]} values 升序数值样本。
 * @param {number} point 取值范围为 0 至 1 的分位点。
 * @returns {number} 三位小数的分位值；空样本返回 `0`。
 */
function percentile(values, point) {
  if (values.length === 0) return 0;
  return Number(values[Math.max(0, Math.ceil(values.length * point) - 1)].toFixed(3));
}

/**
 * @description 计算数值样本的算术平均值。
 * @private
 * @param {number[]} values 数值样本。
 * @param {number} [digits=3] 保留小数位数。
 * @returns {number} 指定精度的平均值；空样本返回 `0`。
 */
function average(values, digits = 3) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits));
}

/**
 * @description 计算分子相对分母的比例。
 * @private
 * @param {number} numerator 分子。
 * @param {number} denominator 分母。
 * @returns {number} 四位小数比例；分母为零时返回 `0`。
 */
function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

/**
 * @description 计算用于组间比较的比例。
 * @private
 * @param {number} numerator 分子。
 * @param {number} denominator 分母。
 * @returns {number|null} 四位小数比例；分母非正数时返回 `null`。
 */
function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

/**
 * @description 将数值四舍五入到四位小数。
 * @private
 * @param {number} value 原始数值。
 * @returns {number} 四位小数数值。
 */
function round(value) {
  return Number(value.toFixed(4));
}

/**
 * @description 统计字符串值出现次数并按键名排序。
 * @private
 * @param {string[]} values 待统计值。
 * @returns {Record<string, number>} 值到出现次数的映射。
 */
function countValues(values) {
  return Object.fromEntries([...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * @description 将数值限制在指定区间，无效值使用回退值。
 * @private
 * @param {*} value 原始数值。
 * @param {number} min 下限。
 * @param {number} max 上限。
 * @param {number} fallback 无效值回退值。
 * @returns {number} 区间内数值。
 */
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * @description 在事件超过五万条时删除最早记录，仅保留最近四万条。
 * @private
 * @param {string} experimentId 实验 ID。
 * @returns {void} 无返回值。
 * @throws {Error} 事件统计或裁剪失败时透传 SQLite 异常。
 */
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
