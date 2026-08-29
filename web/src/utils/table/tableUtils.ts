/**
 * @fileoverview 表格响应适配、分页同步、防抖与错误转换工具。
 * @description 将多种接口响应统一为表格结构，并为请求调度和错误处理提供通用能力。
 *
 * 提供表格数据处理和请求管理的核心工具函数
 *
 * ## 主要功能
 *
 * - 多格式 API 响应自动适配和标准化
 * - 表格数据提取和转换
 * - 分页信息自动更新和校验
 * - 智能防抖函数（支持取消和立即执行）
 * - 统一的错误处理机制
 * - 嵌套数据结构解析
 *
 * ## 使用场景
 *
 * - useTable 组合式函数的底层工具
 * - 适配各种后端接口响应格式
 * - 表格数据的标准化处理
 * - 请求防抖和性能优化
 * - 错误统一处理和日志记录
 *
 * ## 支持的响应格式
 *
 * 1. 直接数组: [item1, item2, ...]
 * 2. 标准对象: { records: [], total: 100 }
 * 3. 嵌套data: { data: { list: [], total: 100 } }
 * 4. 多种字段名: list/data/records/items/result/rows
 *
 * ## 核心功能
 *
 * - defaultResponseAdapter: 智能识别和转换响应格式
 * - extractTableData: 提取表格数据数组
 * - updatePaginationFromResponse: 更新分页信息
 * - createSmartDebounce: 创建可控的防抖函数
 * - createErrorHandler: 生成错误处理器
 *
 * @module utils/table/tableUtils
 */

import type { ApiResponse } from './tableCache'
import { tableConfig } from './tableConfig'

/**
 * @typedef BaseRequestParams
 * @description 在通用分页参数基础上允许扩展任意业务查询字段。
 * @property {unknown} [key] 业务模块自定义的查询参数。
 */
export interface BaseRequestParams extends Api.Common.PaginationParams {
  [key: string]: unknown
}

/**
 * @typedef TableError
 * @description 表格工具对外返回的标准错误信息。
 * @property {string} code 错误名称或业务代码。
 * @property {string} message 可读错误消息。
 * @property {unknown} [details] 原始错误值。
 */
export interface TableError {
  code: string
  message: string
  details?: unknown
}

/**
 * @description 按候选字段顺序从对象中提取首个数组值。
 * @template T
 * @param {Record<string, unknown>} obj 待解析对象。
 * @param {string[]} fields 候选记录字段。
 * @returns {T[]} 匹配的记录数组；未找到时返回空数组。
 */
function extractRecords<T>(obj: Record<string, unknown>, fields: string[]): T[] {
  for (const field of fields) {
    if (field in obj && Array.isArray(obj[field])) {
      return obj[field] as T[]
    }
  }
  return []
}

/**
 * @description 按候选字段提取总记录数，缺失时回退为当前记录数量。
 * @param {Record<string, unknown>} obj 待解析对象。
 * @param {unknown[]} records 已提取的记录数组。
 * @param {string[]} fields 候选总数字段。
 * @returns {number} 总记录数。
 */
function extractTotal(obj: Record<string, unknown>, records: unknown[], fields: string[]): number {
  for (const field of fields) {
    if (field in obj && typeof obj[field] === 'number') {
      return obj[field] as number
    }
  }
  return records.length
}

/**
 * @description 从顶层响应及可选嵌套数据中提取当前页码和每页大小。
 * @param {Record<string, unknown>} obj 顶层响应对象。
 * @param {Record<string, unknown>} [data] 可选的嵌套数据对象。
 * @returns {Pick<ApiResponse<unknown>, 'current' | 'size'> | undefined} 分页参数；均缺失时返回 undefined。
 */
function extractPagination(
  obj: Record<string, unknown>,
  data?: Record<string, unknown>
): Pick<ApiResponse<unknown>, 'current' | 'size'> | undefined {
  const result: Partial<Pick<ApiResponse<unknown>, 'current' | 'size'>> = {}
  const sources = [obj, data ?? {}]

  const currentFields = tableConfig.currentFields
  for (const src of sources) {
    for (const field of currentFields) {
      if (field in src && typeof src[field] === 'number') {
        result.current = src[field] as number
        break
      }
    }
    if (result.current !== undefined) break
  }

  const sizeFields = tableConfig.sizeFields
  for (const src of sources) {
    for (const field of sizeFields) {
      if (field in src && typeof src[field] === 'number') {
        result.size = src[field] as number
        break
      }
    }
    if (result.size !== undefined) break
  }

  if (result.current === undefined && result.size === undefined) return undefined
  return result
}

/**
 * @description 将数组、标准对象或嵌套 data 响应转换为统一表格响应。
 * @template T
 * @param {unknown} response 原始接口响应。
 * @returns {ApiResponse<T>} 包含 records、total 和可选分页字段的标准响应。
 * @example
 * const result = defaultResponseAdapter<User>({ list: users, total: 10 })
 */
export const defaultResponseAdapter = <T>(response: unknown): ApiResponse<T> => {
  // 定义支持的字段
  const recordFields = tableConfig.recordFields

  if (!response) {
    return { records: [], total: 0 }
  }

  if (Array.isArray(response)) {
    return { records: response, total: response.length }
  }

  if (typeof response !== 'object') {
    console.warn(
      '[tableUtils] 无法识别的响应格式，支持的格式包括: 数组、包含' +
        recordFields.join('/') +
        '字段的对象、嵌套data对象。当前格式:',
      response
    )
    return { records: [], total: 0 }
  }

  const res = response as Record<string, unknown>
  let records: T[] = []
  let total = 0
  let pagination: Pick<ApiResponse<unknown>, 'current' | 'size'> | undefined

  // 处理标准格式或直接列表
  records = extractRecords(res, recordFields)
  total = extractTotal(res, records, tableConfig.totalFields)
  pagination = extractPagination(res)

  // 如果没有找到，检查嵌套data
  if (records.length === 0 && 'data' in res && typeof res.data === 'object') {
    const data = res.data as Record<string, unknown>
    records = extractRecords(data, ['list', 'records', 'items'])
    total = extractTotal(data, records, tableConfig.totalFields)
    pagination = extractPagination(res, data)

    if (Array.isArray(res.data)) {
      records = res.data as T[]
      total = records.length
    }
  }

  if (!recordFields.some((field) => field in res) && records.length === 0) {
    console.warn('[tableUtils] 无法识别的响应格式')
    console.warn('支持的字段包括: ' + recordFields.join('、'), response)
    console.warn('扩展字段请到 utils/table/tableConfig 文件配置')
  }

  const result: ApiResponse<T> = { records, total }
  if (pagination) {
    Object.assign(result, pagination)
  }
  return result
}

/**
 * @description 从标准化响应的 records 或 data 字段提取记录数组。
 * @template T
 * @param {ApiResponse<T>} response 标准化表格响应。
 * @returns {T[]} 表格记录数组；字段无效时返回空数组。
 */
export const extractTableData = <T>(response: ApiResponse<T>): T[] => {
  const data = response.records || response.data || []
  return Array.isArray(data) ? data : []
}

/**
 * @description 使用响应中的总数和页码更新分页状态，并将越界页码回退到最后一页。
 * @template T
 * @param {Api.Common.PaginationParams} pagination 可变的分页状态对象。
 * @param {ApiResponse<T>} response 标准化表格响应。
 * @returns {void} 无返回值。
 */
export const updatePaginationFromResponse = <T>(
  pagination: Api.Common.PaginationParams,
  response: ApiResponse<T>
): void => {
  pagination.total = response.total ?? pagination.total ?? 0

  if (response.current !== undefined) {
    pagination.current = response.current
  }

  const maxPage = Math.max(1, Math.ceil(pagination.total / (pagination.size || 1)))
  if (pagination.current > maxPage) {
    pagination.current = maxPage
  }
}

/**
 * @description 创建可取消、可立即执行的异步防抖函数；后续调用会覆盖待执行参数。
 * @template T
 * @param {T} fn 需要防抖的异步函数。
 * @param {number} delay 防抖等待毫秒数。
 * @returns {T & {cancel: () => void, flush: () => Promise<any>}} 带取消和立即执行方法的包装函数。
 * @throws {unknown} flush 执行底层函数失败时透传原始异常。
 * @example
 * const load = createSmartDebounce(fetchTable, 300)
 * await load({ current: 1 })
 */
export const createSmartDebounce = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => Promise<any> } => {
  let timeoutId: NodeJS.Timeout | null = null
  let lastArgs: Parameters<T> | null = null
  let lastResolve: ((value: any) => void) | null = null
  let lastReject: ((reason: any) => void) | null = null

  const debouncedFn = (...args: Parameters<T>): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) clearTimeout(timeoutId)
      lastArgs = args
      lastResolve = resolve
      lastReject = reject
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args)
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          timeoutId = null
          lastArgs = null
          lastResolve = null
          lastReject = null
        }
      }, delay)
    })
  }

  debouncedFn.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = null
    lastArgs = null
    lastResolve = null
    lastReject = null
  }

  debouncedFn.flush = async () => {
    if (timeoutId && lastArgs && lastResolve && lastReject) {
      clearTimeout(timeoutId)
      timeoutId = null
      const args = lastArgs
      const resolve = lastResolve
      const reject = lastReject
      lastArgs = null
      lastResolve = null
      lastReject = null
      try {
        const result = await fn(...args)
        resolve(result)
        return result
      } catch (error) {
        reject(error)
        throw error
      }
    }
    return Promise.resolve()
  }

  return debouncedFn as any
}

/**
 * @description 创建将未知异常转换为 TableError 的处理函数，并按配置记录日志和回调。
 * @param {(error: TableError) => void} [onError] 标准错误生成后的回调。
 * @param {boolean} [enableLog=false] 是否输出控制台错误日志。
 * @returns {(err: unknown, context: string) => TableError} 标准表格错误处理函数。
 * @example
 * const handleError = createErrorHandler(console.error, true)
 * const tableError = handleError(error, '加载列表')
 */
export const createErrorHandler = (
  onError?: (error: TableError) => void,
  enableLog: boolean = false
) => {
  const logger = {
    error: (message: string, ...args: any[]) => {
      if (enableLog) console.error(`[useTable] ${message}`, ...args)
    }
  }

  return (err: unknown, context: string): TableError => {
    const tableError: TableError = {
      code: 'UNKNOWN_ERROR',
      message: '未知错误',
      details: err
    }

    if (err instanceof Error) {
      tableError.message = err.message
      tableError.code = err.name
    } else if (typeof err === 'string') {
      tableError.message = err
    }

    logger.error(`${context}:`, err)
    onError?.(tableError)
    return tableError
  }
}
