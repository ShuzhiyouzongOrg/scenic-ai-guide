/**
 * @fileoverview 景点与分类类型定义。
 * @description 声明景点分类、媒体、点位和跨数据源映射结构。
 */
import type { CoordinateSystem } from './coordinate'
import type { NarrationContent } from './narration'

/**
 * @description 描述景点或设施分类。
 * @typedef {object} ScenicCategory
 * @property {string} id 唯一标识。
 * @property {string} name 名称。
 * @property {string} [iconUrl] 分类图标地址。
 * @property {string} [sourceIconUrl] 来源图标地址。
 * @property {'scenic' | 'facility'} kind 景点或设施类别。
 * @property {string} [sourceCategoryId] 来源分类标识。
 * @property {number} sortOrder 排序序号。
 */
export interface ScenicCategory {
  id: string
  name: string
  iconUrl?: string
  sourceIconUrl?: string
  kind: 'scenic' | 'facility'
  sourceCategoryId?: string
  sortOrder: number
}

/**
 * @description 描述景点封面、图片和视频资源。
 * @typedef {object} ScenicSpotMedia
 * @property {string} [coverUrl] 封面地址。
 * @property {string} [sourceCoverUrl] 来源封面地址。
 * @property {string[]} imageUrls 图片地址列表。
 * @property {string} [videoUrl] 视频地址。
 */
export interface ScenicSpotMedia {
  coverUrl?: string
  sourceCoverUrl?: string
  imageUrls: string[]
  videoUrl?: string
}

/**
 * @description 描述景点的身份、分类、坐标、媒体、讲解和数据来源。
 * @typedef {object} ScenicSpot
 * @property {string} id 唯一标识。
 * @property {string} [sourcePointId] 来源点位标识。
 * @property {string} [targetSpotId] 目标景点标识。
 * @property {string} name 名称。
 * @property {string[]} aliases 别名列表。
 * @property {string} categoryId 分类标识。
 * @property {string[]} [categoryIds] 关联分类标识列表。
 * @property {string} categoryName 分类名称。
 * @property {'scenic' | 'facility'} kind 景点或设施类别。
 * @property {number} latitude 纬度。
 * @property {number} longitude 经度。
 * @property {CoordinateSystem} coordinateSystem 坐标系。
 * @property {string} [description] 说明文本。
 * @property {string} [detail] 详细说明或更新条目。
 * @property {ScenicSpotMedia} media 景点封面、图片和视频等媒体资源。
 * @property {NarrationContent} [narration] 景点讲解内容。
 * @property {string[]} panoramaIds 关联全景标识列表。
 * @property {boolean} hasFootprint 是否支持足迹。
 * @property {boolean} checkInEnabled 是否允许打卡。
 * @property {number} [pointLevel] 点位级别。
 * @property {string} sourceProject 来源项目。
 * @property {boolean} manualReview 是否需要或已经人工复核。
 */
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

/**
 * @description 描述来源点位与目标景点的匹配方法和置信度。
 * @typedef {object} ScenicSpotMapping
 * @property {string} sourcePointId 来源点位标识。
 * @property {string} sourcePointName 来源点位名称。
 * @property {string} [targetSpotId] 目标景点标识。
 * @property {string} [targetSpotName] 目标景点名称。
 * @property {number} [coordinateDistance] 坐标距离。
 * @property {'stable-id' | 'exact-name' | 'alias' | 'name-and-distance' | 'unmatched'} matchMethod 匹配方法。
 * @property {number} confidence 匹配置信度。
 * @property {boolean} manualReview 是否需要或已经人工复核。
 */
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
