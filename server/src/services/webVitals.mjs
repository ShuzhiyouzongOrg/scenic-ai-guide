/**
 * @fileoverview 匿名 Web Vitals 写入与 P75 汇总。
 *
 * 仅持久化指标名、数值、评级、应用版本和粗粒度设备类别，不接收 URL、账号、
 * 查询参数、User-Agent、Referer 或稳定设备标识。
 */
import { getDb } from "../db/database.mjs";

const METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const DEVICE_CLASSES = new Set(["mobile", "desktop"]);
const ALLOWED_FIELDS = new Set(["metric", "value", "rating", "version", "deviceClass"]);

/**
 * 写入一条匿名性能指标。
 * @param {Record<string, unknown>} input 上报载荷。
 * @returns {{accepted: true}} 接收结果。
 * @throws {Error & {statusCode: number, code: string}} 字段越界或数值无效时抛出。
 */
export function recordWebVital(input = {}) {
  const unexpected = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unexpected.length > 0) {
    throw invalid("WEB_VITAL_FIELDS_INVALID", "Web Vital payload contains unsupported fields.");
  }

  const metric = String(input.metric || "").toUpperCase();
  const value = Number(input.value);
  const rating = String(input.rating || "");
  const version = String(input.version || "unknown").trim().slice(0, 64) || "unknown";
  const deviceClass = String(input.deviceClass || "");

  if (!METRICS.has(metric)) throw invalid("WEB_VITAL_METRIC_INVALID", "Web Vital metric is invalid.");
  if (!Number.isFinite(value) || value < 0 || value > 3_600_000) {
    throw invalid("WEB_VITAL_VALUE_INVALID", "Web Vital value is invalid.");
  }
  if (!RATINGS.has(rating)) throw invalid("WEB_VITAL_RATING_INVALID", "Web Vital rating is invalid.");
  if (!DEVICE_CLASSES.has(deviceClass)) {
    throw invalid("WEB_VITAL_DEVICE_INVALID", "Web Vital device class is invalid.");
  }

  getDb().prepare(
    `INSERT INTO web_vital_events
      (metric, value, rating, app_version, device_class, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(metric, value, rating, version, deviceClass, new Date().toISOString());

  return { accepted: true };
}

/**
 * 按版本、设备和指标汇总最近样本的 P75。
 * @param {{limit?: number}} [options] 最大读取样本数。
 * @returns {{sampleCount: number, groups: Array<Record<string, unknown>>}} 汇总结果。
 */
export function getWebVitalReport({ limit = 10_000 } = {}) {
  const safeLimit = Math.max(1, Math.min(50_000, Number(limit) || 10_000));
  const rows = getDb().prepare(
    `SELECT metric, value, rating, app_version, device_class, created_at
     FROM web_vital_events ORDER BY created_at DESC LIMIT ?`
  ).all(safeLimit);
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.app_version}\0${row.device_class}\0${row.metric}`;
    const group = groups.get(key) || {
      version: row.app_version,
      deviceClass: row.device_class,
      metric: row.metric,
      values: [],
      ratings: { good: 0, "needs-improvement": 0, poor: 0 }
    };
    group.values.push(Number(row.value));
    group.ratings[row.rating] += 1;
    groups.set(key, group);
  }

  return {
    sampleCount: rows.length,
    groups: [...groups.values()].map((group) => ({
      version: group.version,
      deviceClass: group.deviceClass,
      metric: group.metric,
      samples: group.values.length,
      p75: percentile(group.values, 0.75),
      ratings: group.ratings
    }))
  };
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function invalid(code, message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}
