import type { CoordinateSystem } from './coordinate'
import type { NarrationContent } from './narration'

export interface ScenicCategory {
  id: string
  name: string
  iconUrl?: string
  sourceIconUrl?: string
  kind: 'scenic' | 'facility'
  sourceCategoryId?: string
  sortOrder: number
}

export interface ScenicSpotMedia {
  coverUrl?: string
  sourceCoverUrl?: string
  imageUrls: string[]
  videoUrl?: string
}

export interface ScenicSpot {
  id: string
  sourcePointId?: string
  targetSpotId?: string
  name: string
  aliases: string[]
  categoryId: string
  categoryIds?: string[]
  categoryName: string
  kind: 'scenic' | 'facility'
  latitude: number
  longitude: number
  coordinateSystem: CoordinateSystem
  description?: string
  detail?: string
  media: ScenicSpotMedia
  narration?: NarrationContent
  panoramaIds: string[]
  hasFootprint: boolean
  checkInEnabled: boolean
  pointLevel?: number
  sourceProject: string
  manualReview: boolean
}

export interface ScenicSpotMapping {
  sourcePointId: string
  sourcePointName: string
  targetSpotId?: string
  targetSpotName?: string
  coordinateDistance?: number
  matchMethod: 'stable-id' | 'exact-name' | 'alias' | 'name-and-distance' | 'unmatched'
  confidence: number
  manualReview: boolean
}
