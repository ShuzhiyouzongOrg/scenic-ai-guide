/**
 * @fileoverview 地图导览聚合类型定义。
 * @description 声明景区、手绘图层、全景、地图配置、初始化载荷和持久化状态。
 */
import type { CoordinateBounds, GuideCoordinate } from './coordinate'
import type { GuideRoute } from './guide-route'
import type { ScenicCategory, ScenicSpot } from './scenic-spot'

/**
 * @description 定义地图导览支持的景区标识。
 * @typedef {'lingshan' | 'nianhuawan'} ScenicAreaId
 */
export type ScenicAreaId = 'lingshan' | 'nianhuawan'

/**
 * @description 描述景区名称、简称和数据来源。
 * @typedef {object} ScenicAreaSummary
 * @property {ScenicAreaId} id 唯一标识。
 * @property {string} name 名称。
 * @property {string} shortName 景区简称。
 * @property {string} sourceProject 来源项目。
 */
export interface ScenicAreaSummary {
  id: ScenicAreaId
  name: string
  shortName: string
  sourceProject: string
}

/**
 * @description 描述一张手绘地图瓦片的位置、尺寸、体积和边界。
 * @typedef {object} HandDrawnTile
 * @property {string} id 唯一标识。
 * @property {number} index 顺序下标。
 * @property {number} row 网格行号。
 * @property {number} column 网格列号。
 * @property {string} url 资源地址。
 * @property {number} width 宽度。
 * @property {number} height 高度。
 * @property {number} sizeBytes 文件字节数。
 * @property {CoordinateBounds} bounds 坐标边界。
 */
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

/**
 * @description 描述手绘地图图层的网格、并发、重试和瓦片。
 * @typedef {object} HandDrawnLayerConfig
 * @property {boolean} enabled 是否启用。
 * @property {number} rows 网格行数。
 * @property {number} columns 网格列数。
 * @property {number} concurrency 加载并发数。
 * @property {number} retries 失败重试次数。
 * @property {CoordinateBounds} bounds 坐标边界。
 * @property {HandDrawnTile[]} tiles 手绘瓦片列表。
 */
export interface HandDrawnLayerConfig {
  enabled: boolean
  rows: number
  columns: number
  concurrency: number
  retries: number
  bounds: CoordinateBounds
  tiles: HandDrawnTile[]
}

/**
 * @description 描述地图视口四边的安全间距。
 * @typedef {object} MapSafeArea
 * @property {number} top 顶部安全间距。
 * @property {number} right 右侧安全间距。
 * @property {number} bottom 底部安全间距。
 * @property {number} left 左侧安全间距。
 */
export interface MapSafeArea {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * @description 定义全景内容的承载平台。
 * @typedef {'720yun' | 'iframe' | 'h5' | 'self-hosted' | 'unknown'} PanoramaPlatform
 */
export type PanoramaPlatform = '720yun' | 'iframe' | 'h5' | 'self-hosted' | 'unknown'

/**
 * @description 描述全景内可交互热点的位置、目标和讲解。
 * @typedef {object} PanoramaHotspot
 * @property {string} id 唯一标识。
 * @property {string} title 标题。
 * @property {number} yaw 水平视角。
 * @property {number} pitch 垂直视角。
 * @property {string} [targetPanoramaId] 跳转目标全景标识。
 * @property {string} [narrationText] 讲解文本。
 */
export interface PanoramaHotspot {
  id: string
  title: string
  yaw: number
  pitch: number
  targetPanoramaId?: string
  narrationText?: string
}

/**
 * @description 描述全景资源、平台、初始视角、热点和审核状态。
 * @typedef {object} PanoramaRecord
 * @property {string} panoramaId 全景标识。
 * @property {string} [sourcePanoId] 来源全景标识。
 * @property {string} [spotId] 景点标识。
 * @property {string} title 标题。
 * @property {string} [description] 说明文本。
 * @property {string} [coverUrl] 封面地址。
 * @property {string} url 资源地址。
 * @property {PanoramaPlatform} platform 全景承载平台。
 * @property {PanoramaHotspot[]} hotspots 全景热点列表。
 * @property {{ yaw: number; pitch: number; fieldOfView?: number }} [initialView] 初始全景视角。
 * @property {number} initialView.yaw 水平视角。
 * @property {number} initialView.pitch 垂直视角。
 * @property {number} [initialView.fieldOfView] 初始全景镜头的视场角。
 * @property {boolean | 'unknown'} supportsGyroscope 是否支持陀螺仪。
 * @property {boolean} manualReview 是否需要或已经人工复核。
 */
export interface PanoramaRecord {
  panoramaId: string
  sourcePanoId?: string
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

/**
 * @description 描述地图中心、游客中心、旋转、缩放和手绘图层。
 * @typedef {object} MapGuideConfig
 * @property {GuideCoordinate} center 地图中心坐标。
 * @property {GuideCoordinate} visitorCenter 游客中心坐标。
 * @property {string} [artworkBackgroundColor] 手绘图透明区域使用的背景色。
 * @property {number} rotationDegrees 手绘图相对正北方向的旋转角度。
 * @property {number} minZoom 最小缩放级别。
 * @property {number} maxZoom 最大缩放级别。
 * @property {number} [highDpiMaxZoom] 高像素密度设备最大缩放级别。
 * @property {number} initialZoom 初始缩放级别。
 * @property {HandDrawnLayerConfig} tileLayer 手绘图层配置。
 */
export interface MapGuideConfig {
  center: GuideCoordinate
  visitorCenter: GuideCoordinate
  /**
   * @description 手绘图透明像素下方及拼图边界外使用的不透明背景色。
   */
  artworkBackgroundColor?: string
  /**
   * @description 与来源小程序地图方位保持一致，使手绘图与点位持续对齐。
   */
  rotationDegrees: number
  minZoom: number
  maxZoom: number
  highDpiMaxZoom?: number
  initialZoom: number
  tileLayer: HandDrawnLayerConfig
}

/**
 * @description 描述地图导览页面初始化所需的完整数据。
 * @typedef {object} MapGuideBootstrap
 * @property {string} version 版本号或数据版本。
 * @property {string} generatedAt 生成时间。
 * @property {ScenicAreaSummary} area 景区摘要。
 * @property {MapGuideConfig} config 地图配置。
 * @property {ScenicCategory[]} categories 景点分类列表。
 * @property {ScenicSpot[]} spots 景点数量。
 * @property {GuideRoute[]} routes 路线列表。
 * @property {PanoramaRecord[]} panoramas 全景列表。
 */
export interface MapGuideBootstrap {
  version: string
  generatedAt: string
  area: ScenicAreaSummary
  config: MapGuideConfig
  categories: ScenicCategory[]
  spots: ScenicSpot[]
  routes: GuideRoute[]
  panoramas: PanoramaRecord[]
}

/**
 * @description 描述地图导览持久化的视口、选择项、收藏和图层模式。
 * @typedef {object} PersistedMapGuideState
 * @property {1} version 版本号或数据版本。
 * @property {GuideCoordinate} [center] 地图中心坐标。
 * @property {number} [zoom] 恢复地图视口时使用的缩放级别。
 * @property {string} [selectedSpotId] 已选择景点标识。
 * @property {string} [selectedRouteId] 已选择路线标识。
 * @property {number} [currentRouteNodeIndex] 当前路线节点下标。
 * @property {string[]} favoriteRouteIds 收藏路线标识列表。
 * @property {'hand-drawn' | 'base'} layerMode 当前图层模式。
 */
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
