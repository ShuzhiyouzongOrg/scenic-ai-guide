/**
 * @fileoverview 基于 Axios 的统一 HTTP 请求客户端。
 * @description 负责认证头注入、响应信封解析、错误展示、未授权登出和可配置重试。
 *
 * ## 主要功能
 *
 * - 请求/响应拦截器（自动添加 Token、统一错误处理）
 * - 401 未授权自动登出（带防抖机制）
 * - 请求失败自动重试（可配置）
 * - 统一的成功/错误消息提示
 * - 支持 GET/POST/PUT/DELETE 等常用方法
 *
 * @module utils/http
 */

import axios, { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useUserStore } from '@/store/modules/user'
import { ApiStatus } from './status'
import { HttpError, handleError, showError, showSuccess } from './error'
import { $t } from '@/locales'
import { BaseResponse } from '@/types'

/**
 * @description HTTP 客户端使用的超时、重试与未授权防抖常量。
 * @type {number}
 */
const REQUEST_TIMEOUT = 15000
const LOGOUT_DELAY = 500
const MAX_RETRIES = 0
const RETRY_DELAY = 1000
const UNAUTHORIZED_DEBOUNCE_TIME = 3000

/**
 * @description 标记当前是否已展示未授权提示，防止并发请求重复触发登出消息。
 * @type {boolean}
 */
let isUnauthorizedErrorShown = false
/**
 * @description 用于恢复未授权提示状态的定时器。
 * @type {NodeJS.Timeout | null}
 */
let unauthorizedTimer: NodeJS.Timeout | null = null

/**
 * @typedef ExtendedAxiosRequestConfig
 * @description 在 Axios 请求配置上增加界面提示和原始响应控制字段。
 * @property {boolean} [showErrorMessage] 请求失败时是否显示错误消息。
 * @property {boolean} [showSuccessMessage] 请求成功时是否显示响应元信息中的消息。
 * @property {boolean} [showUnauthorizedMessage] 未授权时是否显示提示。
 * @property {boolean} [rawResponse] 是否直接返回完整响应信封数据。
 */
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  showErrorMessage?: boolean
  showSuccessMessage?: boolean
  showUnauthorizedMessage?: boolean
  rawResponse?: boolean
}

const { VITE_API_URL, VITE_WITH_CREDENTIALS } = import.meta.env

/**
 * @description 使用项目 API 地址、凭证策略和 JSON 转换规则创建的 Axios 实例。
 * @type {import('axios').AxiosInstance}
 */
const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  baseURL: VITE_API_URL,
  withCredentials: VITE_WITH_CREDENTIALS === 'true',
  validateStatus: (status) => status >= 200 && status < 300,
  transformResponse: [
    (data, headers) => {
      const contentType = headers['content-type']
      if (contentType?.includes('application/json')) {
        try {
          return JSON.parse(data)
        } catch {
          return data
        }
      }
      return data
    }
  ]
})

/**
 * @description 请求拦截器负责注入访问令牌，并将普通请求体序列化为 JSON。
 */
axiosInstance.interceptors.request.use(
  (request: InternalAxiosRequestConfig) => {
    const { accessToken } = useUserStore()
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`)

    if (request.data && !(request.data instanceof FormData) && !request.headers['Content-Type']) {
      request.headers.set('Content-Type', 'application/json')
      request.data = JSON.stringify(request.data)
    }

    return request
  },
  (error) => {
    showError(createHttpError($t('httpMsg.requestConfigError'), ApiStatus.error))
    return Promise.reject(error)
  }
)

/**
 * @description 响应拦截器解析统一响应信封，并把非成功响应转换为标准错误。
 * 后端返回统一信封：成功 { success: true, data, meta }，失败 { success: false, error }
 * 并使用标准 HTTP 状态码，因此非 2xx 会进入错误分支。
 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse<BaseResponse>) => {
    if ((response.config as ExtendedAxiosRequestConfig).rawResponse) return response
    if (response.data && response.data.success) return response
    const message = response.data?.error?.message || $t('httpMsg.requestFailed')
    throw createHttpError(message, response.status || ApiStatus.error)
  },
  (error) => {
    const status = error.response?.status
    const backendMessage = error.response?.data?.error?.message
    const config = error.config as ExtendedAxiosRequestConfig | undefined
    if (status === ApiStatus.unauthorized) {
      handleUnauthorizedError(backendMessage, config?.showUnauthorizedMessage !== false)
    }
    return Promise.reject(handleError(error, backendMessage))
  }
)

/**
 * @description 使用消息和状态码创建标准 HttpError。
 * @param {string} message 错误消息。
 * @param {number} code HTTP 或业务状态码。
 * @returns {HttpError} 新建的标准错误实例。
 */
function createHttpError(message: string, code: number) {
  return new HttpError(message, code)
}

/**
 * @description 处理未授权响应，首次触发时执行登出并在防抖周期内抑制重复提示。
 * @param {string} [message] 后端返回的未授权消息。
 * @param {boolean} [showMessage=true] 是否显示未授权提示。
 * @returns {never} 此函数始终抛出未授权错误。
 * @throws {HttpError} 每次调用都会抛出状态码为 401 的错误。
 */
function handleUnauthorizedError(message?: string, showMessage = true): never {
  const error = createHttpError(message || $t('httpMsg.unauthorized'), ApiStatus.unauthorized)

  if (!isUnauthorizedErrorShown) {
    isUnauthorizedErrorShown = true
    logOut()

    unauthorizedTimer = setTimeout(resetUnauthorizedError, UNAUTHORIZED_DEBOUNCE_TIME)

    if (showMessage) showError(error, true)
    throw error
  }

  throw error
}

/**
 * @description 清除未授权防抖定时器并恢复提示状态。
 * @returns {void} 无返回值。
 */
function resetUnauthorizedError() {
  isUnauthorizedErrorShown = false
  if (unauthorizedTimer) clearTimeout(unauthorizedTimer)
  unauthorizedTimer = null
}

/**
 * @description 延迟调用用户状态仓库的退出登录操作。
 * @returns {void} 无返回值。
 */
function logOut() {
  setTimeout(() => {
    useUserStore().logOut()
  }, LOGOUT_DELAY)
}

/**
 * @description 判断指定 HTTP 状态码是否属于可重试的暂时性服务错误。
 * @param {number} statusCode HTTP 状态码。
 * @returns {boolean} 状态码可重试时返回 true。
 */
function shouldRetry(statusCode: number) {
  return [
    ApiStatus.requestTimeout,
    ApiStatus.internalServerError,
    ApiStatus.badGateway,
    ApiStatus.serviceUnavailable,
    ApiStatus.gatewayTimeout
  ].includes(statusCode)
}

/**
 * @description 执行请求，并在 HttpError 属于可重试状态时按固定间隔重试。
 * @template T
 * @param {ExtendedAxiosRequestConfig} config 请求配置。
 * @param {number} [retries=MAX_RETRIES] 剩余重试次数。
 * @returns {Promise<T>} 解析后的业务数据。
 * @throws {HttpError} 重试耗尽或错误不可重试时透传请求错误。
 */
async function retryRequest<T>(
  config: ExtendedAxiosRequestConfig,
  retries: number = MAX_RETRIES
): Promise<T> {
  try {
    return await request<T>(config)
  } catch (error) {
    if (retries > 0 && error instanceof HttpError && shouldRetry(error.code)) {
      await delay(RETRY_DELAY)
      return retryRequest<T>(config, retries - 1)
    }
    throw error
  }
}

/**
 * @description 创建在指定毫秒数后完成的 Promise。
 * @param {number} ms 延迟毫秒数。
 * @returns {Promise<void>} 延迟结束后完成的 Promise。
 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @description 执行 Axios 请求，将统一响应信封转换为业务数据，并按配置展示消息。
 * @template T
 * @param {ExtendedAxiosRequestConfig} config 请求配置。
 * @returns {Promise<T>} 原始响应信封或其中的业务数据。
 * @throws {HttpError} 请求失败时拒绝并返回标准 HTTP 错误。
 */
async function request<T = any>(config: ExtendedAxiosRequestConfig): Promise<T> {
  // POST | PUT 参数自动填充
  if (
    ['POST', 'PUT'].includes(config.method?.toUpperCase() || '') &&
    config.params &&
    !config.data
  ) {
    config.data = config.params
    config.params = undefined
  }

  try {
    const res = await axiosInstance.request<BaseResponse<T>>(config)

    // 显示成功消息
    if (config.showSuccessMessage && res.data.meta?.message) {
      showSuccess(res.data.meta.message)
    }

    return config.rawResponse ? (res.data as T) : (res.data.data as T)
  } catch (error) {
    if (error instanceof HttpError && error.code !== ApiStatus.unauthorized) {
      const showMsg = config.showErrorMessage !== false
      showError(error, showMsg)
    }
    return Promise.reject(error)
  }
}

/**
 * @description 对外提供 GET、POST、PUT、DELETE 和自定义方法请求入口的 API 客户端。
 * @type {{get: Function, post: Function, put: Function, del: Function, request: Function}}
 * @example
 * const list = await api.get<Api.Guide.Item[]>({ url: '/api/guide' })
 */
const api = {
  /**
   * @description 发起 GET 请求。
   * @template T
   * @param {ExtendedAxiosRequestConfig} config 请求配置。
   * @returns {Promise<T>} 解析后的业务数据。
   * @throws {HttpError} 请求失败且重试策略未恢复时抛出。
   */
  get<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'GET' })
  },
  /**
   * @description 发起 POST 请求。
   * @template T
   * @param {ExtendedAxiosRequestConfig} config 请求配置。
   * @returns {Promise<T>} 解析后的业务数据。
   * @throws {HttpError} 请求失败且重试策略未恢复时抛出。
   */
  post<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'POST' })
  },
  /**
   * @description 发起 PUT 请求。
   * @template T
   * @param {ExtendedAxiosRequestConfig} config 请求配置。
   * @returns {Promise<T>} 解析后的业务数据。
   * @throws {HttpError} 请求失败且重试策略未恢复时抛出。
   */
  put<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'PUT' })
  },
  /**
   * @description 发起 DELETE 请求。
   * @template T
   * @param {ExtendedAxiosRequestConfig} config 请求配置。
   * @returns {Promise<T>} 解析后的业务数据。
   * @throws {HttpError} 请求失败且重试策略未恢复时抛出。
   */
  del<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>({ ...config, method: 'DELETE' })
  },
  /**
   * @description 按传入配置发起自定义 HTTP 请求。
   * @template T
   * @param {ExtendedAxiosRequestConfig} config 包含 HTTP 方法的请求配置。
   * @returns {Promise<T>} 解析后的业务数据。
   * @throws {HttpError} 请求失败且重试策略未恢复时抛出。
   */
  request<T>(config: ExtendedAxiosRequestConfig) {
    return retryRequest<T>(config)
  }
}

/**
 * @description 导出供业务模块复用的 HTTP 请求方法集合。
 * @type {typeof api}
 */
export default api
