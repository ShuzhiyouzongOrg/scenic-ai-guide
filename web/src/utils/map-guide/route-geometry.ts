/**
 * @fileoverview 景区推荐路线坐标解析工具。
 * @description 将路线节点映射到规范景点坐标，并在缺少有效折线时生成可绘制的节点路径。
 */

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

/**
 * @description 优先使用节点匹配到的规范景点坐标，匹配失败时回退到节点自身的有效锚点坐标。
 * @param {GuideRouteNode} node 待解析的推荐路线节点。
 * @param {ScenicSpot[]} spots 当前景区的规范景点列表。
 * @returns {GuideCoordinate | undefined} 可绘制坐标；节点与景点均无有效坐标时返回 `undefined`。
 * @example
 * resolveRouteNodeCoordinate(route.nodes[0], scenicSpots)
 */
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

/**
 * @description 优先返回至少包含两个有效点的官方折线，否则按路线节点顺序生成回退路径。
 * @param {{ polyline: GuideCoordinate[]; nodes: GuideRouteNode[] }} route 推荐路线折线与节点集合。
 * @param {ScenicSpot[]} spots 当前景区的规范景点列表。
 * @returns {GuideCoordinate[]} 过滤无效坐标后的可绘制路线点序列。
 * @example
 * resolveRoutePathCoordinates(selectedRoute, scenicSpots)
 */
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
