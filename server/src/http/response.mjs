/**
 * @fileoverview API JSON 响应封装，统一成功与失败信封格式。
 */

/**
 * 序列化 JSON 并结束 HTTP 响应。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应对象。
 * @param {number} statusCode HTTP 状态码。
 * @param {unknown} body 可 JSON 序列化的响应主体。
 * @returns {void}
 * @throws {TypeError} `body` 包含循环引用等不可序列化值时抛出。
 * @example
 * sendJson(res, 200, { success: true });
 */
export function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

/**
 * 返回 HTTP 200 成功信封。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应对象。
 * @param {unknown} [data=null] 业务数据。
 * @param {Record<string, unknown>} [meta={}] 分页、耗时等元信息。
 * @returns {void}
 * @example
 * ok(res, { id: "spot-1" }, { cached: false });
 */
export function ok(res, data = null, meta = {}) {
  sendJson(res, 200, {
    success: true,
    data,
    meta
  });
}

/**
 * 返回 HTTP 201 创建成功信封。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应对象。
 * @param {unknown} [data=null] 新建资源。
 * @param {Record<string, unknown>} [meta={}] 附加元信息。
 * @returns {void}
 * @example
 * created(res, { id: "new-id" });
 */
export function created(res, data = null, meta = {}) {
  sendJson(res, 201, {
    success: true,
    data,
    meta
  });
}

/**
 * 返回标准错误信封。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应对象。
 * @param {number} statusCode HTTP 错误状态码。
 * @param {string} code 稳定的机器可读错误码。
 * @param {string} message 面向调用方的错误说明。
 * @param {unknown} [details=null] 可选的字段级详情。
 * @returns {void}
 * @example
 * fail(res, 404, "NOT_FOUND", "Resource not found.");
 */
export function fail(res, statusCode, code, message, details = null) {
  sendJson(res, statusCode, {
    success: false,
    error: {
      code,
      message,
      details
    }
  });
}
