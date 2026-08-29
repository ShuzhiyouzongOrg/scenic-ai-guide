/**
 * @fileoverview 日期时间格式化工具。
 * @description 将字符串、时间戳或 Date 实例转换为本地化日期时间文本，并为无效输入提供稳定回退。
 */

/**
 * @typedef DateTimeValue
 * @description `formatDateTime` 可接受的日期时间输入；空值表示没有可展示的日期。
 */
export type DateTimeValue = string | number | Date | null | undefined

const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}

/**
 * @description 按指定区域与格式选项输出日期时间；空值返回短横线，无效日期返回原始文本。
 * @param {DateTimeValue} value 待格式化的日期字符串、时间戳、Date 实例或空值。
 * @param {string} [locale] 可选的 BCP 47 区域标识；省略时使用运行环境默认区域。
 * @param {Intl.DateTimeFormatOptions} [options=DEFAULT_DATE_TIME_OPTIONS] 日期时间字段与显示规则。
 * @returns {string} 本地化日期时间文本、短横线或无法解析时的原始值文本。
 * @throws {RangeError} 当传入的格式选项在默认区域下仍不受 `Intl.DateTimeFormat` 支持时抛出。
 * @example
 * formatDateTime('2026-08-29T08:30:00Z', 'zh-CN')
 */
export function formatDateTime(
  value: DateTimeValue,
  locale?: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME_OPTIONS
): string {
  if (value === null || value === undefined || value === '') return '-'

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
}
