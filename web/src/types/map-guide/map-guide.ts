import type { CoordinateBounds, GuideCoordinate } from './coordinate'
import type { GuideRoute } from './guide-route'
import type { ScenicCategory, ScenicSpot } from './scenic-spot'

export interface HandDrawnTile {
  id: string
  index: number
  row: number
  column: number
  url: string
  width: number
  height: number
  sizeBytes: number
  bounds: CoordinateBounds
}

export interface HandDrawnLayerConfig {
  enabled: boolean
  rows: number
  columns: number
  concurrency: number
  retries: number
  bounds: CoordinateBounds
  tiles: HandDrawnTile[]
}

export interface MapSafeArea {
  top: number
  right: number
  bottom: number
  left: number
}

export type PanoramaPlatform = '720yun' | 'iframe' | 'h5' | 'self-hosted' | 'unknown'

export interface PanoramaHotspot {
  id: string
  title: string
  yaw: number
  pitch: number
  targetPanoramaId?: string
  narrationText?: string
}

export interface PanoramaRecord {
  panoramaId: string
  spotId?: string
  title: string
  description?: string
  coverUrl?: string
  url: string
  platform: PanoramaPlatform
  hotspots: PanoramaHotspot[]
  initialView?: { yaw: number; pitch: number; fieldOfView?: number }
  supportsGyroscope: boolean | 'unknown'
  manualReview: boolean
}

export interface MapGuideConfig {
  center: GuideCoordinate
  visitorCenter: GuideCoordinate
  /** Matches the source mini-program map bearing so artwork and points stay registered. */
  rotationDegrees: number
  minZoom: number
  maxZoom: number
  initialZoom: number
  tileLayer: HandDrawnLayerConfig
}

export interface MapGuideBootstrap {
  version: string
  generatedAt: string
  config: MapGuideConfig
  categories: ScenicCategory[]
  spots: ScenicSpot[]
  routes: GuideRoute[]
  panoramas: PanoramaRecord[]
}

export interface PersistedMapGuideState {
  version: 1
  center?: GuideCoordinate
  zoom?: number
  selectedSpotId?: string
  selectedRouteId?: string
  currentRouteNodeIndex?: number
  favoriteRouteIds: string[]
  layerMode: 'hand-drawn' | 'base'
}
