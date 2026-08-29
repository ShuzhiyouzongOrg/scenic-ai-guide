/**
 * @fileoverview 统一 API 响应类型。
 * @description 声明后端响应信封的数据、元信息和错误结构。
 */

/**
 * @description 描述后端统一响应信封的数据、元信息和错误。
 * @typedef {object} BaseResponse
 * @property {boolean} success 请求是否成功完成。
 * @property {T} data 数据内容。
 * @property {Record<string, unknown> & { message?: string }} [meta] 分页、耗时或提示语等响应元信息。
 * @property {{ code: string message: string details?: unknown }} [error] 请求失败时的结构化错误信息。
 * @property {string} error.code 错误码。
 * @property {string} error.message 提示或错误消息。
 * @property {unknown} [error.details] 错误详情。
 */
export interface BaseResponse<T = unknown> {
  /**
   * @description 是否成功
   */
  success: boolean
  /**
   * @description 数据
   */
  data: T
  /**
   * @description 附加元信息（分页、耗时、提示语等）
   */
  meta?: Record<string, unknown> & { message?: string }
  /**
   * @description 失败时的错误信息
   */
  error?: {
    code: string
    message: string
    details?: unknown
  }
}
