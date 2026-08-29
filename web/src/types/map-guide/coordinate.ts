/**
 * @fileoverview 地图坐标类型定义。
 * @description 声明坐标系、导览坐标、坐标核验记录和坐标边界结构。
 */
/**
 * @description 定义地图数据支持的坐标系。
 * @typedef {'WGS84' | 'GCJ02' | 'BD09' | 'UNKNOWN'} CoordinateSystem
 */
export type CoordinateSystem = 'WGS84' | 'GCJ02' | 'BD09' | 'UNKNOWN'

/**
 * @description 描述带坐标系标识的经纬度坐标。
 * @typedef {object} GuideCoordinate
 * @property {number} latitude 纬度。
 * @property {number} longitude 经度。
 * @property {CoordinateSystem} coordinateSystem 坐标系。
 */
export interface GuideCoordinate {
  latitude: number
  longitude: number
  coordinateSystem: CoordinateSystem
}

/**
 * @description 描述一个点位的来源坐标、转换结果、参考坐标和核验状态。
 * @typedef {object} CoordinateAuditEntry
 * @property {string} id 唯一标识。
 * @property {string} name 名称。
 * @property {GuideCoordinate} source 数据来源。
 * @property {GuideCoordinate} [converted] 转换后的坐标。
 * @property {GuideCoordinate} [reference] 核验参考坐标。
 * @property {number} [errorMeters] 与参考点的误差米数。
 * @property {'verified' | 'manual-review' | 'invalid'} status 当前状态。
 * @property {string} [note] 补充说明。
 */
export interface CoordinateAuditEntry {
  id: string
  name: string
  source: GuideCoordinate
  converted?: GuideCoordinate
  reference?: GuideCoordinate
  errorMeters?: number
  status: 'verified' | 'manual-review' | 'invalid'
  note?: string
}

/**
 * @description 描述西南与东北角构成的地图边界。
 * @typedef {object} CoordinateBounds
 * @property {GuideCoordinate} southwest 西南角坐标。
 * @property {GuideCoordinate} northeast 东北角坐标。
 */
export interface CoordinateBounds {
  southwest: GuideCoordinate
  northeast: GuideCoordinate
}
