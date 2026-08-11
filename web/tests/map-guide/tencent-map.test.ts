import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoordinateBounds, GuideCoordinate } from '../../src/types/map-guide'
import { distanceMeters, transformCoordinate } from '../../src/utils/map-guide/coordinate'
import { toScenicDisplayCoordinate } from '../../src/utils/map-guide/scenic-projection'
import {
  scenicDisplayToTencentMapCoordinate,
  toTencentMapCoordinate
} from '../../src/utils/map-guide/tencent-map'

const artworkBounds: CoordinateBounds = {
  southwest: { latitude: 31.418236, longitude: 120.089882, coordinateSystem: 'GCJ02' },
  northeast: { latitude: 31.433837, longitude: 120.109759, coordinateSystem: 'GCJ02' }
}

const scenicPoint: GuideCoordinate = {
  latitude: 31.432331,
  longitude: 120.096386,
  coordinateSystem: 'GCJ02'
}

test('Tencent map receives GCJ-02 coordinates without a second offset', () => {
  const converted = toTencentMapCoordinate(scenicPoint)
  assert.equal(converted.coordinateSystem, 'GCJ02')
  assert.ok(distanceMeters(converted, scenicPoint) < 0.01)
})

test('rotated scenic display center is reversed before Tencent GCJ-02 conversion', () => {
  const displayed = toScenicDisplayCoordinate(scenicPoint, artworkBounds, 30)
  const tencentCoordinate = scenicDisplayToTencentMapCoordinate(displayed, artworkBounds, 30)
  const restoredWgs84 = transformCoordinate(tencentCoordinate, 'WGS84')
  assert.ok(distanceMeters(restoredWgs84, transformCoordinate(scenicPoint, 'WGS84')) < 0.2)
})
