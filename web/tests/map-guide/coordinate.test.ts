import assert from 'node:assert/strict'
import test from 'node:test'
import {
  distanceMeters,
  gcj02ToWgs84,
  transformCoordinate,
  wgs84ToGcj02
} from '../../src/utils/map-guide/coordinate'

test('GCJ-02 anchor converts to verified WGS84 position', () => {
  const converted = gcj02ToWgs84({
    latitude: 31.42486928773325,
    longitude: 120.10011434555054,
    coordinateSystem: 'GCJ02'
  })
  assert.ok(Math.abs(converted.latitude - 31.4266538605) < 0.000001)
  assert.ok(Math.abs(converted.longitude - 120.0952005331) < 0.000001)
})

test('coordinate round trip avoids a second offset', () => {
  const source = { latitude: 31.43205, longitude: 120.09151, coordinateSystem: 'WGS84' as const }
  const roundTrip = transformCoordinate(wgs84ToGcj02(source), 'WGS84')
  assert.ok(distanceMeters(source, roundTrip) < 0.2)
})

test('unknown coordinates are rejected instead of silently converted', () => {
  assert.throws(
    () =>
      transformCoordinate({ latitude: 31, longitude: 120, coordinateSystem: 'UNKNOWN' }, 'WGS84'),
    /unknown coordinate system/i
  )
})
