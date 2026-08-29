/**
 * @fileoverview 地图路线映射规则测试。
 * @description 验证路线节点、景点映射、设施样式和官方折线路径的解析优先级。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { useGuideRoutes } from '../../src/composables/map-guide/useGuideRoutes'
import { matchSpot } from '../../src/utils/map-guide/spot-mapping'
import { facilityColor } from '../../src/utils/map-guide/facility-style'
import {
  resolveRouteNodeCoordinate,
  resolveRoutePathCoordinates
} from '../../src/utils/map-guide/route-geometry'
import type { GuideRoute, GuideRouteNode, ScenicSpot } from '../../src/types/map-guide'

const spot: ScenicSpot = {
  id: 'LS-006',
  sourcePointId: '627',
  targetSpotId: 'LS-006',
  name: '九龙灌浴',
  aliases: ['九龙灌浴广场'],
  categoryId: '36',
  categoryName: '景点',
  kind: 'scenic',
  latitude: 31.424869,
  longitude: 120.100114,
  coordinateSystem: 'GCJ02',
  media: { imageUrls: [] },
  panoramaIds: [],
  hasFootprint: false,
  checkInEnabled: true,
  sourceProject: 'lingshan-miniapp-rebuild',
  manualReview: false
}

test('spot mapping follows stable ID, exact name, alias, then review', () => {
  assert.equal(matchSpot({ id: 'LS-006', name: 'wrong' }, [spot]).method, 'stable-id')
  assert.equal(matchSpot({ name: '九龙灌浴' }, [spot]).method, 'exact-name')
  assert.equal(matchSpot({ name: '九龙灌浴广场' }, [spot]).method, 'alias')
  assert.equal(matchSpot({ name: '未知景点' }, [spot]).manualReview, true)
})

test('map route state exposes official routes only', () => {
  const baseRoute: Omit<GuideRoute, 'id' | 'name' | 'source' | 'isOfficial'> = {
    tags: [],
    polyline: [],
    nodes: [],
    isEditable: false,
    isPreciseNavigation: false
  }
  const official: GuideRoute = {
    ...baseRoute,
    id: 'official-1',
    name: '官方路线',
    source: 'official',
    isOfficial: true
  }
  const ai: GuideRoute = {
    ...baseRoute,
    id: 'ai-1',
    name: 'AI 路线',
    source: 'ai',
    isOfficial: false
  }
  const state = useGuideRoutes(() => [ai, official])
  assert.deepEqual(
    state.routes.value.map((route) => route.id),
    ['official-1']
  )
})

test('facility categories use distinct stable marker colours', () => {
  const categoryIds = ['41', '38', '76', '53', '73', '47', '65', '66', '55', '46']
  const colors = categoryIds.map(facilityColor)
  assert.equal(new Set(colors).size, colors.length)
  assert.equal(facilityColor('41'), facilityColor('41'))
})

test('route geometry prefers the canonical spot coordinate over a stale route snapshot', () => {
  const staleNode: GuideRouteNode = {
    id: 'route-node-1',
    order: 1,
    spotId: spot.id,
    name: spot.name,
    latitude: 30,
    longitude: 119,
    coordinateSystem: 'WGS84'
  }
  assert.deepEqual(resolveRouteNodeCoordinate(staleNode, [spot]), {
    latitude: spot.latitude,
    longitude: spot.longitude,
    coordinateSystem: spot.coordinateSystem
  })
})

test('official route markers use the canonical scenic spot while preserving the road anchor', () => {
  const officialNode: GuideRouteNode = {
    id: 'official-123-01',
    order: 1,
    spotId: spot.id,
    sourcePointId: spot.sourcePointId,
    name: spot.name,
    latitude: 31.4242626,
    longitude: 120.1005596,
    coordinateSystem: 'GCJ02',
    coordinateSource: 'official-route-anchor'
  }
  assert.deepEqual(resolveRouteNodeCoordinate(officialNode, [spot]), {
    latitude: spot.latitude,
    longitude: spot.longitude,
    coordinateSystem: spot.coordinateSystem
  })
})

test('official route markers can safely fall back to an exact spot name', () => {
  const legacyNode: GuideRouteNode = {
    id: 'official-128-01',
    order: 1,
    spotId: 'legacy-751',
    sourcePointId: '751',
    name: spot.name,
    latitude: 31.42,
    longitude: 120.09,
    coordinateSystem: 'GCJ02',
    coordinateSource: 'official-route-anchor'
  }
  assert.deepEqual(resolveRouteNodeCoordinate(legacyNode, [spot]), {
    latitude: spot.latitude,
    longitude: spot.longitude,
    coordinateSystem: spot.coordinateSystem
  })
})

test('official authored polyline takes precedence over the node-to-node fallback', () => {
  const route: GuideRoute = {
    id: 'official-123',
    name: '祈福禅悟线',
    source: 'official',
    tags: [],
    polyline: [
      { latitude: 31.4242, longitude: 120.1005, coordinateSystem: 'GCJ02' },
      { latitude: 31.4245, longitude: 120.1008, coordinateSystem: 'GCJ02' },
      { latitude: 31.4248, longitude: 120.1001, coordinateSystem: 'GCJ02' }
    ],
    nodes: [],
    isEditable: false,
    isOfficial: true,
    isPreciseNavigation: false,
    geometryKind: 'official-path'
  }
  assert.equal(resolveRoutePathCoordinates(route, [spot]).length, 3)
})

test('route geometry keeps a valid embedded coordinate when no spot is matched', () => {
  const standaloneNode: GuideRouteNode = {
    id: 'route-node-2',
    order: 2,
    spotId: 'missing-spot',
    name: '临时节点',
    latitude: 31.42,
    longitude: 120.1,
    coordinateSystem: 'GCJ02'
  }
  assert.deepEqual(resolveRouteNodeCoordinate(standaloneNode, []), {
    latitude: 31.42,
    longitude: 120.1,
    coordinateSystem: 'GCJ02'
  })
})
