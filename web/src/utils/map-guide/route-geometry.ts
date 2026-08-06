import type { GuideCoordinate, GuideRouteNode, ScenicSpot } from '@/types/map-guide'
import { matchSpot } from '@/utils/map-guide/spot-mapping'

function isUsableCoordinate(
  coordinate: Pick<GuideCoordinate, 'latitude' | 'longitude' | 'coordinateSystem'>
): boolean {
  return (
    coordinate.coordinateSystem !== 'UNKNOWN' &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude)
  )
}

export function resolveRouteNodeCoordinate(
  node: GuideRouteNode,
  spots: ScenicSpot[]
): GuideCoordinate | undefined {
  const spot = matchSpot({ id: node.sourcePointId || node.spotId, name: node.name }, spots).spot
  if (spot && isUsableCoordinate(spot)) {
    return {
      latitude: spot.latitude,
      longitude: spot.longitude,
      coordinateSystem: spot.coordinateSystem
    }
  }
  // Official route anchors describe the authored road path. Numbered stop markers,
  // however, represent the scenic POI and therefore prefer its canonical coordinate.
  // Keep the anchor as an explicit fallback for unmatched legacy route nodes.
  if (
    node.latitude === undefined ||
    node.longitude === undefined ||
    !isUsableCoordinate({
      latitude: node.latitude,
      longitude: node.longitude,
      coordinateSystem: node.coordinateSystem
    })
  ) {
    return
  }
  return {
    latitude: node.latitude,
    longitude: node.longitude,
    coordinateSystem: node.coordinateSystem
  }
}

export function resolveRoutePathCoordinates(
  route: { polyline: GuideCoordinate[]; nodes: GuideRouteNode[] },
  spots: ScenicSpot[]
): GuideCoordinate[] {
  const path = route.polyline.filter(isUsableCoordinate)
  if (path.length > 1) return path
  return route.nodes
    .map((node) => resolveRouteNodeCoordinate(node, spots))
    .filter((coordinate): coordinate is GuideCoordinate => Boolean(coordinate))
}
