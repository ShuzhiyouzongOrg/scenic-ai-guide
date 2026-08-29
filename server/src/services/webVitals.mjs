/**
 * @fileoverview 匿名 Web Vitals 写入与 P75 汇总。
 *
 * @description 仅持久化指标名、数值、评级、应用版本和粗粒度设备类别，不接收 URL、账号、
 * 查询参数、User-Agent、Referer 或稳定设备标识。
 */
import { getDb } from "../db/database.mjs";

/**
 * @description 定义允许匿名上报的 Web Vitals 指标名。
 * @type {ReadonlySet<"CLS"|"FCP"|"INP"|"LCP"|"TTFB">} 合法指标名集合。
 */
const METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);
/**
 * @description 定义 Web Vitals 标准质量评级。
 * @type {ReadonlySet<"good"|"needs-improvement"|"poor">} 合法评级集合。
 */
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
/**
 * @description 定义允许汇总的粗粒度设备类别。
 * @type {ReadonlySet<"mobile"|"desktop">} 合法设备类别集合。
 */
const DEVICE_CLASSES = new Set(["mobile", "desktop"]);
/**
 * @description 限制性能上报载荷可包含的字段，避免接收身份或页面信息。
 * @type {ReadonlySet<string>} 合法上报字段集合。
 */
const ALLOWED_FIELDS = new Set(["metric", "value", "rating", "version", "deviceClass"]);

/**
 * @description 写入一条匿名性能指标。
 * @param {Record<string, unknown>} input 上报载荷。
 * @returns {{accepted: true}} 接收结果。
 * @throws {Error & {statusCode: number, code: string}} 字段越界或数值无效时抛出。
 * @throws {Error} 数据库写入失败时透传异常。
 * @example
 * recordWebVital({ metric: "LCP", value: 1800, rating: "good", version: "3.0.0", deviceClass: "desktop" });
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
 * @description 按版本、设备和指标汇总最近样本的 P75。
 * @param {{limit?: number}} [options] 最大读取样本数。
 * @returns {{sampleCount: number, groups: Array<Record<string, unknown>>}} 汇总结果。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const report = getWebVitalReport({ limit: 5000 });
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

/**
 * @description 计算数值样本的指定分位值，计算前复制并排序输入数组。
 * @private
 * @param {number[]} values 数值样本。
 * @param {number} quantile 取值范围为 0 至 1 的分位点。
 * @returns {number|null} 分位值；空样本返回 `null`。
 */
function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

/**
 * @description 创建携带 HTTP 400 状态码和稳定业务码的性能上报异常。
 * @private
 * @param {string} code 业务错误码。
 * @param {string} message 错误说明。
 * @returns {Error & {statusCode: 400, code: string}} 可由 HTTP 层识别的参数异常。
 */
function invalid(code, message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}
