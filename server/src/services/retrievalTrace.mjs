/**
 * @fileoverview RAG 检索 trace 的低开销持久化与回放服务。
 * 只记录脱敏问题预览和候选摘要，不落盘密钥或知识正文。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.mjs";

const MAX_TRACE_BYTES = 5 * 1024 * 1024;
const MAX_TRACE_ROWS = 5000;

/** @returns {string} trace ID。 */
export function createRetrievalTraceId() {
  return `rt_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

/**
 * 持久化检索 trace；写入失败只返回 false，不影响问答。
 * @param {object} trace trace 数据。
 * @returns {boolean} 写入成功时为 true。
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

/** @param {{limit?: number, traceId?: string}} [options={}] 查询条件。 @returns {object[]} trace 列表。 */
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

/** @param {string} traceId trace ID。 @returns {object|null} 可回放 trace。 */
export function getRetrievalTrace(traceId) {
  return listRetrievalTraces({ traceId, limit: 200 })[0] || null;
}

function traceFilePath() {
  return join(config.dataDir, "observability", "retrieval-traces.ndjson");
}

function rotateTraceFile(tracePath) {
  const rows = readFileSync(tracePath, "utf8").split(/\r?\n/u).filter(Boolean).slice(-Math.floor(MAX_TRACE_ROWS / 2));
  writeFileSync(tracePath, `${rows.join("\n")}\n`, "utf8");
}

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
 * 普通成功 trace 按配置确定性采样；拒答、失败、冲突和降级链路始终保留。
 * @param {object} trace trace 数据。
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
