import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoordinateBounds, GuideCoordinate } from '../../src/types/map-guide'
import {
  fromScenicDisplayCoordinate,
  scenicDisplayBounds,
  toScenicDisplayCoordinate
} from '../../src/utils/map-guide/scenic-projection'
import { distanceMeters } from '../../src/utils/map-guide/coordinate'

const artworkBounds: CoordinateBounds = {
  southwest: { latitude: 31.418236, longitude: 120.089882, coordinateSystem: 'GCJ02' },
  northeast: { latitude: 31.433837, longitude: 120.109759, coordinateSystem: 'GCJ02' }
}

const anchor: GuideCoordinate = {
  latitude: 31.432331,
  longitude: 120.096386,
  coordinateSystem: 'GCJ02'
}

test('source map bearing round-trips a scenic point without cumulative offset', () => {
  const displayed = toScenicDisplayCoordinate(anchor, artworkBounds, 30)
  const restored = fromScenicDisplayCoordinate(displayed, artworkBounds, 30)
  assert.ok(distanceMeters(anchor, restored) < 0.02)
})

test('thirty-degree scenic display bounds contain every rotated artwork corner', () => {
  const displayedBounds = scenicDisplayBounds(artworkBounds, 30)
  const corners: GuideCoordinate[] = [
    artworkBounds.southwest,
    artworkBounds.northeast,
    {
      latitude: artworkBounds.northeast.latitude,
      longitude: artworkBounds.southwest.longitude,
      coordinateSystem: 'GCJ02'
    },
    {
      latitude: artworkBounds.southwest.latitude,
      longitude: artworkBounds.northeast.longitude,
      coordinateSystem: 'GCJ02'
    }
  ]
  for (const corner of corners) {
    const displayed = toScenicDisplayCoordinate(corner, artworkBounds, 30)
    assert.ok(displayed.latitude >= displayedBounds.southwest.latitude - 1e-12)
    assert.ok(displayed.latitude <= displayedBounds.northeast.latitude + 1e-12)
    assert.ok(displayed.longitude >= displayedBounds.southwest.longitude - 1e-12)
    assert.ok(displayed.longitude <= displayedBounds.northeast.longitude + 1e-12)
  }
})
