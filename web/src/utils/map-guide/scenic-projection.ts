/**
 * @fileoverview 景区手绘图旋转投影工具。
 * @description 在 Web Mercator 空间中旋转景点坐标与边界，使网页端标记和手绘地图保持同一显示方向。
 */

import type { CoordinateBounds, GuideCoordinate } from '@/types/map-guide'
import { transformCoordinate } from './coordinate'

interface MercatorPoint {
  x: number
  y: number
}

const MAX_MERCATOR_LATITUDE = 85.0511287798

function project(coordinate: GuideCoordinate): MercatorPoint {
  const wgs84 = transformCoordinate(coordinate, 'WGS84')
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, wgs84.latitude))
  const latitudeRadians = (latitude * Math.PI) / 180
  return {
    x: (wgs84.longitude + 180) / 360,
    y: (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2
  }
}

function unproject(point: MercatorPoint): GuideCoordinate {
  const longitude = point.x * 360 - 180
  const latitudeRadians = Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y)))
  return {
    latitude: (latitudeRadians * 180) / Math.PI,
    longitude,
    coordinateSystem: 'WGS84'
  }
}

function boundsCenter(bounds: CoordinateBounds): MercatorPoint {
  const northwest = project({
    latitude: bounds.northeast.latitude,
    longitude: bounds.southwest.longitude,
    coordinateSystem: bounds.northeast.coordinateSystem
  })
  const southeast = project({
    latitude: bounds.southwest.latitude,
    longitude: bounds.northeast.longitude,
    coordinateSystem: bounds.southwest.coordinateSystem
  })
  return {
    x: (northwest.x + southeast.x) / 2,
    y: (northwest.y + southeast.y) / 2
  }
}

/**
 * @description 以手绘图边界中心为原点，在 Web Mercator 空间应用与微信地图一致的顺时针屏幕旋转。
 * @param {GuideCoordinate} coordinate 原始景点或路线坐标。
 * @param {CoordinateBounds} artworkBounds 未旋转手绘图的地理边界。
 * @param {number} rotationDegrees 顺时针旋转角度，单位为度。
 * @returns {GuideCoordinate} 旋转后的 WGS84 显示坐标。
 * @throws {Error} 当输入坐标或边界使用 `UNKNOWN` 坐标系时抛出。
 * @example
 * toScenicDisplayCoordinate(spot, artworkBounds, 12)
 */
export function toScenicDisplayCoordinate(
  coordinate: GuideCoordinate,
  artworkBounds: CoordinateBounds,
  rotationDegrees: number
): GuideCoordinate {
  const point = project(coordinate)
  if (!rotationDegrees) return unproject(point)
  const center = boundsCenter(artworkBounds)
  const radians = (rotationDegrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const deltaX = point.x - center.x
  const deltaY = point.y - center.y
  return unproject({
    x: center.x + deltaX * cosine - deltaY * sine,
    y: center.y + deltaX * sine + deltaY * cosine
  })
}

/**
 * @description 对显示坐标应用反向旋转，恢复为手绘图源坐标方向。
 * @param {GuideCoordinate} coordinate 已旋转的地图显示坐标。
 * @param {CoordinateBounds} artworkBounds 未旋转手绘图的地理边界。
 * @param {number} rotationDegrees 显示阶段采用的顺时针旋转角度。
 * @returns {GuideCoordinate} 反向旋转后的 WGS84 坐标。
 * @throws {Error} 当输入坐标或边界使用 `UNKNOWN` 坐标系时抛出。
 * @example
 * fromScenicDisplayCoordinate(displayPoint, artworkBounds, 12)
 */
export function fromScenicDisplayCoordinate(
  coordinate: GuideCoordinate,
  artworkBounds: CoordinateBounds,
  rotationDegrees: number
): GuideCoordinate {
  return toScenicDisplayCoordinate(coordinate, artworkBounds, -rotationDegrees)
}

/**
 * @description 旋转手绘图四个角点后，计算能够完整包围旋转结果的 WGS84 轴对齐边界。
 * @param {CoordinateBounds} artworkBounds 未旋转手绘图的地理边界。
 * @param {number} rotationDegrees 顺时针旋转角度，单位为度。
 * @returns {CoordinateBounds} 旋转后手绘图的西南角与东北角外接边界。
 * @throws {Error} 当边界使用 `UNKNOWN` 坐标系时抛出。
 * @example
 * scenicDisplayBounds(artworkBounds, 12)
 */
export function scenicDisplayBounds(
  artworkBounds: CoordinateBounds,
  rotationDegrees: number
): CoordinateBounds {
  const coordinateSystem = artworkBounds.southwest.coordinateSystem
  const corners: GuideCoordinate[] = [
    artworkBounds.southwest,
    artworkBounds.northeast,
    {
      latitude: artworkBounds.northeast.latitude,
      longitude: artworkBounds.southwest.longitude,
      coordinateSystem
    },
    {
      latitude: artworkBounds.southwest.latitude,
      longitude: artworkBounds.northeast.longitude,
      coordinateSystem
    }
  ].map((coordinate) => toScenicDisplayCoordinate(coordinate, artworkBounds, rotationDegrees))

  return {
    southwest: {
      latitude: Math.min(...corners.map((coordinate) => coordinate.latitude)),
      longitude: Math.min(...corners.map((coordinate) => coordinate.longitude)),
      coordinateSystem: 'WGS84'
    },
    northeast: {
      latitude: Math.max(...corners.map((coordinate) => coordinate.latitude)),
      longitude: Math.max(...corners.map((coordinate) => coordinate.longitude)),
      coordinateSystem: 'WGS84'
    }
  }
}
