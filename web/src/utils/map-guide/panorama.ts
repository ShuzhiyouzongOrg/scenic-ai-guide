import type { PanoramaRecord } from '@/types/map-guide'
import { normalizeSpotName } from './spot-mapping'

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
