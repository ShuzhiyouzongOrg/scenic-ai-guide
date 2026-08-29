/**
 * @fileoverview 地图坐标系转换与距离计算工具。
 * @description 在 WGS84、GCJ02、BD09 之间转换景区坐标，并使用球面公式计算两点距离。
 */

import type { CoordinateSystem, GuideCoordinate } from '@/types/map-guide'

const PI = Math.PI
const AXIS = 6378245
const ECCENTRICITY = 0.006693421622965943

function isOutsideChina(latitude: number, longitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function latitudeDelta(latitude: number, longitude: number): number {
  let result = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
  result += 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude))
  result += ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2) / 3
  result += ((20 * Math.sin(latitude * PI) + 40 * Math.sin((latitude / 3) * PI)) * 2) / 3
  result += ((160 * Math.sin((latitude / 12) * PI) + 320 * Math.sin((latitude * PI) / 30)) * 2) / 3
  return result
}

function longitudeDelta(latitude: number, longitude: number): number {
  let result = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
  result += 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude))
  result += ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2) / 3
  result += ((20 * Math.sin(longitude * PI) + 40 * Math.sin((longitude / 3) * PI)) * 2) / 3
  result +=
    ((150 * Math.sin((longitude / 12) * PI) + 300 * Math.sin((longitude / 30) * PI)) * 2) / 3
  return result
}

/**
 * @description 将 WGS84 坐标转换为腾讯地图使用的 GCJ02 坐标；中国境外仅更新坐标系标识。
 * @param {GuideCoordinate} coordinate WGS84 地理坐标。
 * @returns {GuideCoordinate} 对应的 GCJ02 坐标。
 * @example
 * wgs84ToGcj02({ latitude: 31.35, longitude: 120.45, coordinateSystem: 'WGS84' })
 */
export function wgs84ToGcj02(coordinate: GuideCoordinate): GuideCoordinate {
  if (isOutsideChina(coordinate.latitude, coordinate.longitude)) {
    return { ...coordinate, coordinateSystem: 'GCJ02' }
  }
  const deltaLatitude = latitudeDelta(coordinate.latitude - 35, coordinate.longitude - 105)
  const deltaLongitude = longitudeDelta(coordinate.latitude - 35, coordinate.longitude - 105)
  const radians = (coordinate.latitude / 180) * PI
  const magic = 1 - ECCENTRICITY * Math.sin(radians) ** 2
  const latitudeOffset =
    (deltaLatitude * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * Math.sqrt(magic))) * PI)
  const longitudeOffset =
    (deltaLongitude * 180) / ((AXIS / Math.sqrt(magic)) * Math.cos(radians) * PI)
  return {
    latitude: coordinate.latitude + latitudeOffset,
    longitude: coordinate.longitude + longitudeOffset,
    coordinateSystem: 'GCJ02'
  }
}

/**
 * @description 通过迭代误差修正将 GCJ02 坐标近似还原为 WGS84 坐标。
 * @param {GuideCoordinate} coordinate GCJ02 地理坐标。
 * @returns {GuideCoordinate} 迭代八次后的 WGS84 坐标。
 * @example
 * gcj02ToWgs84({ latitude: 31.35, longitude: 120.45, coordinateSystem: 'GCJ02' })
 */
export function gcj02ToWgs84(coordinate: GuideCoordinate): GuideCoordinate {
  if (isOutsideChina(coordinate.latitude, coordinate.longitude)) {
    return { ...coordinate, coordinateSystem: 'WGS84' }
  }
  let candidate: GuideCoordinate = { ...coordinate, coordinateSystem: 'WGS84' }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const projected = wgs84ToGcj02(candidate)
    candidate = {
      latitude: candidate.latitude - (projected.latitude - coordinate.latitude),
      longitude: candidate.longitude - (projected.longitude - coordinate.longitude),
      coordinateSystem: 'WGS84'
    }
  }
  return candidate
}

/**
 * @description 将 GCJ02 坐标转换为百度地图使用的 BD09 坐标。
 * @param {GuideCoordinate} coordinate GCJ02 地理坐标。
 * @returns {GuideCoordinate} 对应的 BD09 坐标。
 * @example
 * gcj02ToBd09({ latitude: 31.35, longitude: 120.45, coordinateSystem: 'GCJ02' })
 */
export function gcj02ToBd09(coordinate: GuideCoordinate): GuideCoordinate {
  const x = coordinate.longitude
  const y = coordinate.latitude
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin((y * PI * 3000) / 180)
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos((x * PI * 3000) / 180)
  return {
    latitude: z * Math.sin(theta) + 0.006,
    longitude: z * Math.cos(theta) + 0.0065,
    coordinateSystem: 'BD09'
  }
}

/**
 * @description 将 BD09 坐标转换为 GCJ02 坐标。
 * @param {GuideCoordinate} coordinate BD09 地理坐标。
 * @returns {GuideCoordinate} 对应的 GCJ02 坐标。
 * @example
 * bd09ToGcj02({ latitude: 31.35, longitude: 120.45, coordinateSystem: 'BD09' })
 */
export function bd09ToGcj02(coordinate: GuideCoordinate): GuideCoordinate {
  const x = coordinate.longitude - 0.0065
  const y = coordinate.latitude - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin((y * PI * 3000) / 180)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos((x * PI * 3000) / 180)
  return {
    latitude: z * Math.sin(theta),
    longitude: z * Math.cos(theta),
    coordinateSystem: 'GCJ02'
  }
}

/**
 * @description 将已标注坐标系的景区坐标转换为目标坐标系，并自动串联必要的中间转换。
 * @param {GuideCoordinate} coordinate 待转换坐标及其来源坐标系。
 * @param {CoordinateSystem} targetSystem 目标坐标系。
 * @returns {GuideCoordinate} 目标坐标系下的新坐标对象。
 * @throws {Error} 当来源坐标系或目标坐标系为 `UNKNOWN` 时抛出。
 * @example
 * transformCoordinate(point, 'GCJ02')
 */
export function transformCoordinate(
  coordinate: GuideCoordinate,
  targetSystem: CoordinateSystem
): GuideCoordinate {
  if (coordinate.coordinateSystem === targetSystem) return { ...coordinate }
  if (coordinate.coordinateSystem === 'UNKNOWN' || targetSystem === 'UNKNOWN') {
    throw new Error('Cannot transform a coordinate with an unknown coordinate system')
  }
  if (coordinate.coordinateSystem === 'GCJ02' && targetSystem === 'WGS84') {
    return gcj02ToWgs84(coordinate)
  }
  if (coordinate.coordinateSystem === 'WGS84' && targetSystem === 'GCJ02') {
    return wgs84ToGcj02(coordinate)
  }
  if (coordinate.coordinateSystem === 'GCJ02' && targetSystem === 'BD09') {
    return gcj02ToBd09(coordinate)
  }
  if (coordinate.coordinateSystem === 'BD09' && targetSystem === 'GCJ02') {
    return bd09ToGcj02(coordinate)
  }
  if (coordinate.coordinateSystem === 'WGS84' && targetSystem === 'BD09') {
    return gcj02ToBd09(wgs84ToGcj02(coordinate))
  }
  return gcj02ToWgs84(bd09ToGcj02(coordinate))
}

/**
 * @description 将第二个坐标转换到第一个坐标的坐标系后，按 Haversine 公式计算球面距离。
 * @param {GuideCoordinate} first 起点坐标及其坐标系。
 * @param {GuideCoordinate} second 终点坐标及其坐标系。
 * @returns {number} 两点之间的近似球面距离，单位为米。
 * @throws {Error} 当任一坐标使用 `UNKNOWN` 坐标系且需要转换时抛出。
 * @example
 * distanceMeters(startCoordinate, endCoordinate)
 */
export function distanceMeters(first: GuideCoordinate, second: GuideCoordinate): number {
  const comparableSecond = transformCoordinate(second, first.coordinateSystem)
  const earthRadius = 6371008.8
  const latitude1 = (first.latitude * PI) / 180
  const latitude2 = (comparableSecond.latitude * PI) / 180
  const deltaLatitude = latitude2 - latitude1
  const deltaLongitude = ((comparableSecond.longitude - first.longitude) * PI) / 180
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
