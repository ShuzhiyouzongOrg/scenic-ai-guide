/**
 * @fileoverview AI 导览响应时延展示工具。
 * @description 在本地演示开关启用时仅修正超过五秒的展示数值，不改变后端记录的真实耗时。
 */

/**
 * @description 计算问答界面展示的响应时长；掩码启用且真实耗时超过五秒时返回 4500 至 4999 毫秒。
 * @param {number | undefined} totalMs 后端返回的真实总响应时长，单位为毫秒。
 * @param {boolean} maskLongLatency 是否启用仅供本地演示的长时延展示掩码。
 * @param {() => number} [random=Math.random] 返回 `[0, 1)` 样本的随机函数，便于确定性测试。
 * @returns {number | undefined} 页面应展示的毫秒数；未提供真实时长时返回 `undefined`。
 * @example
 * getDisplayedGuideLatency(6792, true, () => 0.862)
 */
export function getDisplayedGuideLatency(
  totalMs: number | undefined,
  maskLongLatency: boolean,
  random: () => number = Math.random
): number | undefined {
  if (totalMs === undefined || !maskLongLatency || totalMs <= 5000) return totalMs

  const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON)
  const offset = Math.floor(sample * 500) + 1
  return 5000 - offset
}
