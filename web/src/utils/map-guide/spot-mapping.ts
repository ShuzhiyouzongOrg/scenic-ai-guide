import type { ScenicSpot } from '@/types/map-guide'

export interface SpotMatchResult {
  spot?: ScenicSpot
  method: 'stable-id' | 'exact-name' | 'alias' | 'unmatched'
  confidence: number
  manualReview: boolean
}

export function normalizeSpotName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s·•—－_()（）[\]【】、，。,:：;；'“”"!?！？]/g, '')
}

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
