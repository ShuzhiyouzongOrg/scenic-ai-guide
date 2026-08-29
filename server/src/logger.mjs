/**
 * @fileoverview 输出适合终端和日志采集器消费的单行 JSON 日志。
 * @description 将信息和错误事件整理为适合终端及日志采集器消费的单行 JSON。
 *
 * @example
 * logInfo("server started", { port: 5178 });
 */

/**
 * @description 写入一条信息级日志。
 *
 * @param {string} message 简短、稳定的事件名称。
 * @param {Record<string, unknown>} [meta={}] 与事件关联的结构化字段。
 * @returns {void}
 * @throws {TypeError} 元数据包含循环引用等无法 JSON 序列化的值时抛出。
 * @example
 * logInfo("request completed", { method: "GET", statusCode: 200 });
 */
export function logInfo(message, meta = {}) {
  writeLog("info", message, meta);
}

/**
 * @description 写入一条错误级日志。
 *
 * @param {string} message 简短、稳定的错误事件名称。
 * @param {Record<string, unknown>} [meta={}] 错误码、请求路径等结构化上下文。
 * @returns {void}
 * @throws {TypeError} 元数据包含循环引用等无法 JSON 序列化的值时抛出。
 * @example
 * logError("request failed", { code: "INVALID_JSON" });
 */
export function logError(message, meta = {}) {
  writeLog("error", message, meta);
}

/**
 * @description 组装公共日志字段并选择标准输出或标准错误输出。
 *
 * @param {"info"|"error"} level 日志级别。
 * @param {string} message 事件名称。
 * @param {Record<string, unknown>} meta 附加元数据。
 * @returns {void}
 * @private
 */
function writeLog(level, message, meta) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}
