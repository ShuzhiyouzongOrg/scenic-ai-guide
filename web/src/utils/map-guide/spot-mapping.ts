/**
 * @fileoverview 景区景点稳定匹配工具。
 * @description 规范化景点名称，并按稳定编号、精确名称和别名顺序匹配路线或全景目标。
 */

import type { ScenicSpot } from '@/types/map-guide'

/**
 * @typedef SpotMatchResult
 * @description 候选景点与规范景点列表的匹配结果及可信度。
 * @property {ScenicSpot} [spot] 成功匹配的规范景点。
 * @property {'stable-id' | 'exact-name' | 'alias' | 'unmatched'} method 实际采用的匹配方式。
 * @property {number} confidence 匹配可信度，范围为 0 至 1。
 * @property {boolean} manualReview 是否需要人工复核未匹配记录。
 */
export interface SpotMatchResult {
  spot?: ScenicSpot
  method: 'stable-id' | 'exact-name' | 'alias' | 'unmatched'
  confidence: number
  manualReview: boolean
}

/**
 * @description 使用 NFKC、统一小写和标点清理生成可比较的景点名称。
 * @param {string} value 原始景点名称或别名。
 * @returns {string} 去除空白、常用标点及大小写差异后的名称。
 * @example
 * normalizeSpotName('灵山·大佛（东门）')
 */
export function normalizeSpotName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s·•—－_()（）[\]【】、，。,:：;；'“”"!?！？]/g, '')
}

/**
 * @description 按稳定编号、规范名称和别名的优先级匹配景点，并返回固定的可信度与复核标记。
 * @param {{ id?: string | null; name: string }} candidate 待匹配的路线节点或外部景点标识。
 * @param {ScenicSpot[]} spots 当前景区的规范景点列表。
 * @returns {SpotMatchResult} 命中的景点与匹配方式；未命中时要求人工复核。
 * @example
 * matchSpot({ id: 'spot-001', name: '灵山大佛' }, scenicSpots)
 */
export function matchSpot(
  candidate: { id?: string | null; name: string },
  spots: ScenicSpot[]
): SpotMatchResult {
  if (candidate.id) {
    const stable = spots.find(
      (spot) =>
        spot.id === candidate.id ||
        spot.targetSpotId === candidate.id ||
        spot.sourcePointId === candidate.id
    )
    if (stable) return { spot: stable, method: 'stable-id', confidence: 1, manualReview: false }
  }
  const normalized = normalizeSpotName(candidate.name)
  const exact = spots.find((spot) => normalizeSpotName(spot.name) === normalized)
  if (exact) return { spot: exact, method: 'exact-name', confidence: 0.99, manualReview: false }
  const alias = spots.find((spot) =>
    spot.aliases.some((name) => normalizeSpotName(name) === normalized)
  )
  if (alias) return { spot: alias, method: 'alias', confidence: 0.96, manualReview: false }
  return { method: 'unmatched', confidence: 0, manualReview: true }
}
