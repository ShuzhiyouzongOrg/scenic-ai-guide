/**
 * @fileoverview HTTP 接口状态码定义。
 * @description 汇总请求层用于成功判断、错误展示和重试决策的标准状态码。
 */

/**
 * @description 请求层支持的 HTTP 状态码枚举。
 * @enum {number}
 * @example
 * if (status === ApiStatus.unauthorized) {
 *   // 处理未授权状态
 * }
 */
export enum ApiStatus {
  success = 200, // 成功
  error = 400, // 错误
  unauthorized = 401, // 未授权
  forbidden = 403, // 禁止访问
  notFound = 404, // 未找到
  methodNotAllowed = 405, // 方法不允许
  requestTimeout = 408, // 请求超时
  internalServerError = 500, // 服务器错误
  notImplemented = 501, // 未实现
  badGateway = 502, // 网关错误
  serviceUnavailable = 503, // 服务不可用
  gatewayTimeout = 504, // 网关超时
  httpVersionNotSupported = 505 // HTTP版本不支持
}
