/**
 * @fileoverview 景区全景资源匹配工具。
 * @description 按全景编号、场景链接、景点编号或规范化名称为当前景点选择最合适的全景记录。
 */

import type { PanoramaRecord } from '@/types/map-guide'
import { normalizeSpotName } from './spot-mapping'

/**
 * @typedef PanoramaTarget
 * @description 用于检索全景资源的景点目标信息。
 * @property {string} [spotId] 景点稳定编号。
 * @property {string} [name] 景点展示名称。
 * @property {string[]} [panoramaIds] 显式关联的全景场景编号列表。
 * @property {string} [vrUrl] 显式关联的全景访问地址。
 */
export interface PanoramaTarget {
  spotId?: string
  name?: string
  panoramaIds?: string[]
  vrUrl?: string
}

function sceneIdFromUrl(url?: string): string | undefined {
  if (!url) return
  try {
    return new URL(url).searchParams.get('scene_id') || undefined
  } catch {
    return
  }
}

/**
 * @description 按显式全景关联、景点编号和规范化名称的优先级选择目标全景。
 * @param {PanoramaRecord[]} panoramas 当前景区可用的全景记录列表。
 * @param {PanoramaTarget} [target] 可选的景点匹配条件；省略时选择第一条全景。
 * @returns {PanoramaRecord | undefined} 匹配到的全景记录；列表为空时返回 `undefined`。
 * @example
 * resolvePanoramaForTarget(panoramas, { spotId: 'spot-001' })
 */
export function resolvePanoramaForTarget(
  panoramas: PanoramaRecord[],
  target?: PanoramaTarget
): PanoramaRecord | undefined {
  if (!panoramas.length) return
  if (!target) return panoramas[0]

  const explicitIds = new Set(target.panoramaIds || [])
  const explicitSceneId = sceneIdFromUrl(target.vrUrl)
  const explicit = panoramas.find(
    (panorama) =>
      explicitIds.has(panorama.panoramaId) ||
      (explicitSceneId && panorama.panoramaId === explicitSceneId) ||
      (target.vrUrl && panorama.url === target.vrUrl)
  )
  if (explicit) return explicit

  if (target.spotId) {
    const bySpot = panoramas.find((panorama) => panorama.spotId === target.spotId)
    if (bySpot) return bySpot
  }

  if (target.name) {
    const normalizedName = normalizeSpotName(target.name)
    const byName = panoramas.find(
      (panorama) => normalizeSpotName(panorama.title) === normalizedName
    )
    if (byName) return byName
  }

  return panoramas[0]
}
