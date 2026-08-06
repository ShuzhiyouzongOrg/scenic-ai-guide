import type { GuideCoordinate } from './coordinate'

export type GuideRouteSource = 'official' | 'curated' | 'ai' | 'hybrid' | 'user'
export type GuideRouteGeometryKind = 'official-path' | 'walking-navigation' | 'schematic'
export type GuideRouteNodeCoordinateSource = 'official-route-anchor' | 'spot' | 'generated'

export interface GuideRouteNode {
  id: string
  order: number
  spotId: string
  sourcePointId?: string
  name: string
  latitude?: number
  longitude?: number
  coordinateSystem: GuideCoordinate['coordinateSystem']
  coordinateSource?: GuideRouteNodeCoordinateSource
  sourceRouteAnchor?: GuideCoordinate
  stayMinutes?: number
  narrationText?: string
  audioUrl?: string
  sourceAudioUrl?: string
  imageUrl?: string
  sourceImageUrl?: string
  vrUrl?: string
  categoryId?: string
  manualReview?: boolean
}

export interface GuideRoute {
  id: string
  name: string
  source: GuideRouteSource
  baseRouteId?: string
  sourceProject?: string
  description?: string
  recommendationReason?: string
  durationMinutes?: number
  distanceMeters?: number
  tags: string[]
  coverUrl?: string
  sourceCoverUrl?: string
  polyline: GuideCoordinate[]
  nodes: GuideRouteNode[]
  isEditable: boolean
  isOfficial: boolean
  isPreciseNavigation: boolean
  geometryKind?: GuideRouteGeometryKind
  version?: string
}

export interface RoutePlaybackSnapshot {
  routeId?: string
  nodeIndex: number
  playing: boolean
  autoPlay: boolean
}
