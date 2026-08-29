/**
 * @fileoverview RAG 检索追踪服务。
 * @description
 * 提供低开销的检索追踪持久化、轮转、筛选和回放能力。
 * 只记录脱敏问题预览和候选摘要，不落盘密钥或知识正文。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.mjs";

/**
 * @description 单个追踪文件触发轮转的最大字节数。
 * @type {number}
 */
const MAX_TRACE_BYTES = 5 * 1024 * 1024;

/**
 * @description 追踪文件允许保留的最大记录数，用于计算轮转保留窗口。
 * @type {number}
 */
const MAX_TRACE_ROWS = 5000;

/**
 * @description 使用时间戳和安全随机字节生成检索追踪 ID。
 * @returns {string} 以 `rt_` 开头的唯一追踪 ID。
 * @example
 * const traceId = createRetrievalTraceId();
 */
export function createRetrievalTraceId() {
  return `rt_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

/**
 * @description 持久化检索追踪；写入失败只返回 `false`，不影响主问答链路。
 * @param {object} trace 检索追踪数据。
 * @returns {boolean} 满足采样条件且写入成功时为 `true`。
 * @example
 * recordRetrievalTrace({ traceId, query: "灵山大佛多高", candidates: [] });
 */
export function recordRetrievalTrace(trace) {
  try {
    if (!shouldRecordTrace(trace)) return false;
    const tracePath = traceFilePath();
    mkdirSync(dirname(tracePath), { recursive: true });
    if (existsSync(tracePath) && statSync(tracePath).size >= MAX_TRACE_BYTES) {
      rotateTraceFile(tracePath);
    }
    appendFileSync(tracePath, `${JSON.stringify(sanitizeTrace(trace))}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * @description 从追踪文件尾部读取最近记录，并可按追踪 ID 精确筛选。
 * @param {{limit?: number, traceId?: string}} [options={}] 查询条件。
 * @returns {object[]} 按时间倒序排列的可回放追踪列表。
 * @throws {Error} 追踪文件存在但读取失败时透传文件系统异常。
 * @example
 * const traces = listRetrievalTraces({ limit: 20 });
 */
export function listRetrievalTraces({ limit = 50, traceId = "" } = {}) {
  const tracePath = traceFilePath();
  if (!existsSync(tracePath)) return [];
  const rows = readFileSync(tracePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(-Math.min(Math.max(Number(limit) || 50, 1), 200));
  const traces = rows.flatMap((row) => {
    try { return [JSON.parse(row)]; } catch { return []; }
  }).reverse();
  return traceId ? traces.filter((trace) => trace.traceId === traceId) : traces;
}

/**
 * @description 根据追踪 ID 获取最近一条匹配记录。
 * @param {string} traceId 检索追踪 ID。
 * @returns {object|null} 可回放追踪；不存在时返回 `null`。
 * @throws {Error} 追踪文件存在但读取失败时透传文件系统异常。
 * @example
 * const trace = getRetrievalTrace("rt_example");
 */
export function getRetrievalTrace(traceId) {
  return listRetrievalTraces({ traceId, limit: 200 })[0] || null;
}

/**
 * @description 计算检索追踪 NDJSON 文件的绝对路径。
 * @returns {string} 追踪文件路径。
 */
function traceFilePath() {
  return join(config.dataDir, "observability", "retrieval-traces.ndjson");
}

/**
 * @description 保留追踪文件后半部分记录并原地完成轻量轮转。
 * @param {string} tracePath 追踪文件路径。
 * @returns {void} 无返回值。
 * @throws {Error} 文件读取或写入失败时透传文件系统异常。
 */
function rotateTraceFile(tracePath) {
  const rows = readFileSync(tracePath, "utf8").split(/\r?\n/u).filter(Boolean).slice(-Math.floor(MAX_TRACE_ROWS / 2));
  writeFileSync(tracePath, `${rows.join("\n")}\n`, "utf8");
}

/**
 * @description 脱敏查询预览并限制候选、引用等追踪字段的保存规模。
 * @param {object} trace 原始检索追踪数据。
 * @returns {object} 可安全持久化的检索追踪摘要。
 */
function sanitizeTrace(trace) {
  const query = String(trace.query || "").trim();
  return {
    traceId: String(trace.traceId || createRetrievalTraceId()),
    createdAt: new Date().toISOString(),
    queryHash: createHash("sha256").update(query).digest("hex").slice(0, 16),
    queryPreview: query
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[email]")
      .replace(/\b1\d{10}\b/gu, "[phone]")
      .replace(/\b\d{17}[\dXx]\b/gu, "[id-card]")
      .replace(/\b(?:LTAI|AKID)[A-Za-z0-9_-]{8,}\b/gu, "[access-key]")
      .replace(/\b(?:sk|eyJ)[A-Za-z0-9._-]{16,}\b/gu, "[token]")
      .slice(0, 160),
    eventType: trace.eventType || "retrieval",
    mode: trace.mode || null,
    locale: trace.locale || null,
    indexVersion: trace.indexVersion || null,
    filters: trace.filters || {},
    channels: trace.channels || [],
    candidates: (trace.candidates || []).slice(0, 20).map((candidate) => ({
      id: candidate.id,
      rank: candidate.rank,
      score: candidate.score,
      channelRanks: candidate.channelRanks || []
    })),
    citations: (trace.citations || []).slice(0, 8).map((citation) => ({
      citationId: citation.citationId || null,
      documentId: citation.documentId || null,
      chunkId: citation.chunkId || null,
      page: citation.page || null,
      sheetName: citation.sheetName || null,
      range: citation.range || null,
      indexVersion: citation.indexVersion || trace.indexVersion || null
    })),
    decision: trace.decision || null,
    scenario: trace.scenario || null,
    provider: trace.provider || null,
    model: trace.model || null,
    conflicts: trace.conflicts || [],
    degradedReason: trace.degradedReason || null,
    latencyMs: Number.isFinite(Number(trace.latencyMs)) ? Number(trace.latencyMs) : null
  };
}

/**
 * @description 普通成功追踪按配置确定性采样；拒答、失败、冲突和降级链路始终保留。
 * @param {object} trace 检索追踪数据。
 * @returns {boolean} 是否记录。
 */
function shouldRecordTrace(trace) {
  const reason = trace?.decision?.reason || trace?.degradedReason || "";
  if (reason && reason !== "candidate_found") return true;
  if ((trace?.conflicts || []).length > 0 || trace?.degradedReason) return true;
  const rate = config.rag.traceSampleRate;
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  const seed = String(trace.traceId || trace.query || "trace");
  const bucket = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
  return bucket < rate;
}
