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
