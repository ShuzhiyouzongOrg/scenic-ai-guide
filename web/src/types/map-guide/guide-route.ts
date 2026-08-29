/**
 * @fileoverview 地图导览路线类型定义。
 * @description 声明路线来源、几何类型、节点、路线和播放快照结构。
 */
import type { GuideCoordinate } from './coordinate'

/**
 * @description 定义导览路线的数据来源。
 * @typedef {'official' | 'curated' | 'ai' | 'hybrid' | 'user'} GuideRouteSource
 */
export type GuideRouteSource = 'official' | 'curated' | 'ai' | 'hybrid' | 'user'
/**
 * @description 定义导览路线几何用途。
 * @typedef {'official-path' | 'walking-navigation' | 'schematic'} GuideRouteGeometryKind
 */
export type GuideRouteGeometryKind = 'official-path' | 'walking-navigation' | 'schematic'
/**
 * @description 定义路线节点坐标的来源。
 * @typedef {'official-route-anchor' | 'spot' | 'generated'} GuideRouteNodeCoordinateSource
 */
export type GuideRouteNodeCoordinateSource = 'official-route-anchor' | 'spot' | 'generated'

/**
 * @description 描述导览路线节点的坐标、讲解、媒体和核验信息。
 * @typedef {object} GuideRouteNode
 * @property {string} id 唯一标识。
 * @property {number} order 排序序号。
 * @property {string} spotId 景点标识。
 * @property {string} [sourcePointId] 来源点位标识。
 * @property {string} name 名称。
 * @property {number} [latitude] 纬度。
 * @property {number} [longitude] 经度。
 * @property {GuideCoordinate['coordinateSystem']} coordinateSystem 坐标系。
 * @property {GuideRouteNodeCoordinateSource} [coordinateSource] 节点坐标来源。
 * @property {GuideCoordinate} [sourceRouteAnchor] 来源路线锚点坐标。
 * @property {number} [stayMinutes] 建议停留分钟数。
 * @property {string} [narrationText] 讲解文本。
 * @property {string} [audioUrl] 音频地址。
 * @property {string} [sourceAudioUrl] 来源音频地址。
 * @property {string} [imageUrl] 图片地址。
 * @property {string} [sourceImageUrl] 来源图片地址。
 * @property {string} [vrUrl] 全景地址。
 * @property {string} [categoryId] 分类标识。
 * @property {boolean} [manualReview] 是否需要或已经人工复核。
 */
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

/**
 * @description 描述导览路线的来源、几何、节点、时长和可编辑状态。
 * @typedef {object} GuideRoute
 * @property {string} id 唯一标识。
 * @property {string} name 名称。
 * @property {GuideRouteSource} source 数据来源。
 * @property {string} [baseRouteId] 基础路线标识。
 * @property {string} [sourceProject] 来源项目。
 * @property {string} [description] 说明文本。
 * @property {string} [recommendationReason] 推荐理由。
 * @property {number} [durationMinutes] 预计总时长，单位为分钟。
 * @property {number} [distanceMeters] 路线距离，单位为米。
 * @property {string[]} tags 标签列表。
 * @property {string} [coverUrl] 封面地址。
 * @property {string} [sourceCoverUrl] 来源封面地址。
 * @property {GuideCoordinate[]} polyline 路线折线坐标。
 * @property {GuideRouteNode[]} nodes 路线节点列表。
 * @property {boolean} isEditable 路线是否可编辑。
 * @property {boolean} isOfficial 是否为官方路线。
 * @property {boolean} isPreciseNavigation 是否适用于精确导航。
 * @property {GuideRouteGeometryKind} [geometryKind] 路线几何用途。
 * @property {string} [version] 版本号或数据版本。
 */
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

/**
 * @description 描述路线播放时的节点位置和自动播放状态。
 * @typedef {object} RoutePlaybackSnapshot
 * @property {string} [routeId] 路线标识。
 * @property {number} nodeIndex 当前节点下标。
 * @property {boolean} playing 是否正在播放。
 * @property {boolean} autoPlay 是否自动连续播放。
 */
export interface RoutePlaybackSnapshot {
  routeId?: string
  nodeIndex: number
  playing: boolean
  autoPlay: boolean
}
