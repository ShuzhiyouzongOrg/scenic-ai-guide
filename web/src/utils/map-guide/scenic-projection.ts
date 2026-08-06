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
 * Applies the same clockwise screen-space rotation as the source WeChat map's
 * `rotate` property. The transform is performed once in Web Mercator space.
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

export function fromScenicDisplayCoordinate(
  coordinate: GuideCoordinate,
  artworkBounds: CoordinateBounds,
  rotationDegrees: number
): GuideCoordinate {
  return toScenicDisplayCoordinate(coordinate, artworkBounds, -rotationDegrees)
}

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
