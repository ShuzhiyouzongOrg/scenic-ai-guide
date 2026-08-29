/**
 * @fileoverview 表单响应式栅格计算工具。
 * @description 根据 Element Plus 的 xs、sm、md、lg、xl 断点为表单项计算可读的 24 栅格列宽。
 */

/**
 * @typedef ResponsiveBreakpoint
 * @description 表单布局支持的 Element Plus 响应式断点名称。
 */
export type ResponsiveBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * @typedef BreakpointConfig
 * @description 小屏断点触发列宽降级时使用的阈值与回退值。
 * @property {number} threshold 保留原列宽所需的最小 span。
 * @property {number} fallback 原列宽小于阈值时采用的 span。
 */
interface BreakpointConfig {
  /**
   * @description 保留原列宽所需的最小 span。
   * @type {number}
   */
  threshold: number
  /**
   * @description 原列宽低于阈值时采用的回退 span。
   * @type {number}
   */
  fallback: number
}

/**
 * @description 各断点的列宽降级规则；值为 `null` 表示直接使用原始 span。
 * @type {Record<ResponsiveBreakpoint, BreakpointConfig | null>}
 */
const BREAKPOINT_CONFIG: Record<ResponsiveBreakpoint, BreakpointConfig | null> = {
  xs: { threshold: 12, fallback: 24 }, // 手机：小于 12 时使用满宽
  sm: { threshold: 12, fallback: 12 }, // 平板：小于 12 时使用半宽
  md: { threshold: 8, fallback: 8 }, // 中等屏幕：小于 8 时使用三分之一宽
  lg: null, // 大屏幕：直接使用设置的 span
  xl: null // 超大屏幕：直接使用设置的 span
}

/**
 * @description 根据当前断点和最小宽度规则计算表单项 span，避免小屏幕上的字段被过度压缩。
 * @param {number | undefined} itemSpan 表单项单独配置的 span；省略时采用默认值。
 * @param {number} defaultSpan 表单容器提供的默认 span。
 * @param {ResponsiveBreakpoint} breakpoint 当前生效的响应式断点。
 * @returns {number} 断点降级后的 Element Plus 24 栅格列宽。
 * @example
 * calculateResponsiveSpan(6, 6, 'xs')
 */
export function calculateResponsiveSpan(
  itemSpan: number | undefined,
  defaultSpan: number,
  breakpoint: ResponsiveBreakpoint
): number {
  const finalSpan = itemSpan ?? defaultSpan
  const config = BREAKPOINT_CONFIG[breakpoint]

  // 如果没有配置（lg/xl），直接返回原始 span
  if (!config) {
    return finalSpan
  }

  // 如果 span 小于阈值，使用降级值
  return finalSpan >= config.threshold ? finalSpan : config.fallback
}

/**
 * @description 固定默认 span，创建供多个表单项重复使用的响应式列宽计算函数。
 * @param {number} defaultSpan 表单容器提供的默认 span。
 * @returns {(itemSpan: number | undefined, breakpoint: ResponsiveBreakpoint) => number} 接收字段 span 与断点并返回最终列宽的函数。
 * @example
 * const getColSpan = createResponsiveSpanCalculator(6)
 * getColSpan(undefined, 'xs')
 */
export function createResponsiveSpanCalculator(defaultSpan: number) {
  return (itemSpan: number | undefined, breakpoint: ResponsiveBreakpoint): number => {
    return calculateResponsiveSpan(itemSpan, defaultSpan, breakpoint)
  }
}
