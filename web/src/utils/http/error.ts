/**
 * @fileoverview HTTP 请求错误的标准化、日志转换与消息展示工具。
 * @description 将 Axios 错误转换为统一的 HttpError，并提供类型判断、日志记录和界面提示能力。
 *
 * 提供统一的 HTTP 请求错误处理机制
 *
 * ## 主要功能
 *
 * - 自定义 HttpError 错误类，封装错误信息、状态码、时间戳等
 * - 错误拦截和转换，将 Axios 错误转换为标准的 HttpError
 * - 错误消息国际化处理，根据状态码返回对应的多语言错误提示
 * - 错误日志记录，便于问题追踪和调试
 * - 错误和成功消息的统一展示
 * - 类型守卫函数，用于判断错误类型
 *
 * ## 使用场景
 *
 * - HTTP 请求拦截器中统一处理错误
 * - 业务代码中捕获和处理特定错误
 * - 错误日志收集和上报
 *
 * @module utils/http/error
 */
import { AxiosError } from 'axios'
import { ApiStatus } from './status'
import { $t } from '@/locales'

/**
 * @typedef ErrorResponse
 * @description 后端错误响应中可被 HTTP 层识别的业务字段。
 * @property {number} code 业务错误状态码。
 * @property {string} msg 面向调用方的错误消息。
 * @property {unknown} [data] 与错误相关的可选附加数据。
 */
export interface ErrorResponse {
  code: number
  msg: string
  data?: unknown
}

/**
 * @typedef ErrorLogData
 * @description HttpError 序列化后用于控制台或日志系统记录的数据结构。
 * @property {number} code HTTP 或业务错误状态码。
 * @property {string} message 错误消息。
 * @property {unknown} [data] 错误附加数据。
 * @property {string} timestamp 错误创建时的 ISO 时间戳。
 * @property {string} [url] 发生错误的请求地址。
 * @property {string} [method] 发生错误的 HTTP 方法。
 * @property {string} [stack] JavaScript 错误堆栈。
 */
export interface ErrorLogData {
  code: number
  message: string
  data?: unknown
  timestamp: string
  url?: string
  method?: string
  stack?: string
}

/**
 * @class
 * @description 封装状态码、请求上下文和时间戳的标准 HTTP 错误。
 * @example
 * const error = new HttpError('请求失败', 500, { url: '/api/guide', method: 'GET' })
 * console.error(error.toLogData())
 */
export class HttpError extends Error {
  /**
   * @description HTTP 或业务错误状态码。
   * @type {number}
   */
  public readonly code: number
  /**
   * @description 错误附加数据。
   * @type {unknown | undefined}
   */
  public readonly data?: unknown
  /**
   * @description 错误创建时的 ISO 时间戳。
   * @type {string}
   */
  public readonly timestamp: string
  /**
   * @description 发生错误的可选请求地址。
   * @type {string | undefined}
   */
  public readonly url?: string
  /**
   * @description 发生错误的可选 HTTP 方法。
   * @type {string | undefined}
   */
  public readonly method?: string

  /**
   * @description 创建包含请求上下文的 HTTP 错误实例。
   * @param {string} message 错误消息。
   * @param {number} code HTTP 或业务错误状态码。
   * @param {{data?: unknown, url?: string, method?: string}} [options] 可选的附加数据与请求信息。
   */
  constructor(
    message: string,
    code: number,
    options?: {
      data?: unknown
      url?: string
      method?: string
    }
  ) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.data = options?.data
    this.timestamp = new Date().toISOString()
    this.url = options?.url
    this.method = options?.method
  }

  /**
   * @description 将当前错误转换为适合日志记录的普通对象。
   * @returns {ErrorLogData} 包含错误上下文和堆栈的日志数据。
   * @example
   * const data = error.toLogData()
   */
  public toLogData(): ErrorLogData {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
      timestamp: this.timestamp,
      url: this.url,
      method: this.method,
      stack: this.stack
    }
  }
}

/**
 * @description 根据 HTTP 状态码获取对应的国际化错误消息。
 * @param {number} status HTTP 状态码。
 * @returns {string} 已完成本地化的错误消息。
 */
const getErrorMessage = (status: number): string => {
  const errorMap: Record<number, string> = {
    [ApiStatus.unauthorized]: 'httpMsg.unauthorized',
    [ApiStatus.forbidden]: 'httpMsg.forbidden',
    [ApiStatus.notFound]: 'httpMsg.notFound',
    [ApiStatus.methodNotAllowed]: 'httpMsg.methodNotAllowed',
    [ApiStatus.requestTimeout]: 'httpMsg.requestTimeout',
    [ApiStatus.internalServerError]: 'httpMsg.internalServerError',
    [ApiStatus.badGateway]: 'httpMsg.badGateway',
    [ApiStatus.serviceUnavailable]: 'httpMsg.serviceUnavailable',
    [ApiStatus.gatewayTimeout]: 'httpMsg.gatewayTimeout'
  }

  return $t(errorMap[status] || 'httpMsg.internalServerError')
}

/**
 * @description 将 Axios 错误转换为 HttpError 并抛出，保留请求地址、方法和响应数据。
 * @param {AxiosError<ErrorResponse>} error Axios 请求错误。
 * @param {string} [overrideMessage] 优先于响应内容使用的错误消息。
 * @returns {never} 此函数始终通过异常终止。
 * @throws {HttpError} 请求取消、网络异常或 HTTP 状态异常时抛出。
 * @example
 * try {
 *   await axios.get('/api/guide')
 * } catch (error) {
 *   handleError(error as AxiosError<ErrorResponse>)
 * }
 */
export function handleError(error: AxiosError<ErrorResponse>, overrideMessage?: string): never {
  // 处理取消的请求
  if (error.code === 'ERR_CANCELED') {
    console.warn('Request cancelled:', error.message)
    throw new HttpError($t('httpMsg.requestCancelled'), ApiStatus.error)
  }

  const statusCode = error.response?.status
  const errorMessage = overrideMessage || error.response?.data?.msg || error.message
  const requestConfig = error.config

  // 处理网络错误
  if (!error.response) {
    throw new HttpError($t('httpMsg.networkError'), ApiStatus.error, {
      url: requestConfig?.url,
      method: requestConfig?.method?.toUpperCase()
    })
  }

  // 处理 HTTP 状态码错误：优先使用后端返回的业务错误信息
  const message = overrideMessage
    ? overrideMessage
    : statusCode
      ? getErrorMessage(statusCode)
      : errorMessage || $t('httpMsg.requestFailed')
  throw new HttpError(message, statusCode || ApiStatus.error, {
    data: error.response.data,
    url: requestConfig?.url,
    method: requestConfig?.method?.toUpperCase()
  })
}

/**
 * @description 按需显示错误提示，并将结构化错误信息写入控制台。
 * @param {HttpError} error 待展示和记录的标准 HTTP 错误。
 * @param {boolean} [showMessage=true] 是否显示 Element Plus 错误消息。
 * @returns {void} 无返回值。
 * @example
 * showError(new HttpError('请求失败', 500))
 */
export function showError(error: HttpError, showMessage: boolean = true): void {
  if (showMessage) {
    ElMessage.error(error.message)
  }
  // 记录错误日志
  console.error('[HTTP Error]', error.toLogData())
}

/**
 * @description 按需显示操作成功消息。
 * @param {string} message 成功消息文本。
 * @param {boolean} [showMessage=true] 是否显示 Element Plus 成功消息。
 * @returns {void} 无返回值。
 * @example
 * showSuccess('保存成功')
 */
export function showSuccess(message: string, showMessage: boolean = true): void {
  if (showMessage) {
    ElMessage.success(message)
  }
}

/**
 * @description 判断未知值是否为 HttpError 实例。
 * @param {unknown} error 待判断的值。
 * @returns {boolean} 是 HttpError 实例时返回 true。
 * @example
 * if (isHttpError(error)) console.error(error.code)
 */
export const isHttpError = (error: unknown): error is HttpError => {
  return error instanceof HttpError
}
