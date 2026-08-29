/**
 * @fileoverview 手绘瓦片网格完整性测试。
 * @description 验证手绘瓦片边界、行列顺序和相邻瓦片衔接不存在缝隙或重叠。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTileGrid,
  calculateTileBounds,
  sortTilesRowMajor
} from '../../src/utils/map-guide/tile-grid'

const bounds = {
  southwest: { latitude: 31.418236, longitude: 120.089882, coordinateSystem: 'GCJ02' as const },
  northeast: { latitude: 31.433837, longitude: 120.109759, coordinateSystem: 'GCJ02' as const }
}

test('4x4 tile bounds use north-to-south rows and west-to-east columns', () => {
  const northwest = calculateTileBounds(bounds, 4, 4, 0, 0)
  const southeast = calculateTileBounds(bounds, 4, 4, 3, 3)
  assert.equal(northwest.northeast.latitude, bounds.northeast.latitude)
  assert.equal(northwest.southwest.longitude, bounds.southwest.longitude)
  assert.ok(Math.abs(southeast.southwest.latitude - bounds.southwest.latitude) < 1e-10)
  assert.ok(Math.abs(southeast.northeast.longitude - bounds.northeast.longitude) < 1e-10)
})

test('adjacent tile boundaries have no geographic gaps or overlaps', () => {
  const tiles = buildTileGrid(
    Array.from({ length: 16 }, (_, index) => ({ url: `${index + 1}.webp` })),
    bounds,
    4,
    4
  )
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const left = tiles[row * 4 + column]
      const right = tiles[row * 4 + column + 1]
      assert.ok(
        Math.abs(left.bounds.northeast.longitude - right.bounds.southwest.longitude) < 1e-12
      )
    }
  }
})

test('tile sorting restores row-major source order', () => {
  const tiles = buildTileGrid(
    Array.from({ length: 16 }, (_, index) => ({ url: `${index + 1}.webp` })),
    bounds,
    4,
    4
  )
  const sorted = sortTilesRowMajor([...tiles].reverse())
  assert.deepEqual(
    sorted.map((tile) => tile.id),
    Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, '0'))
  )
})
