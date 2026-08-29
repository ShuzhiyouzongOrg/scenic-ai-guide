/**
 * @fileoverview 官方路线数据完整性测试。
 * @description 验证官方路线数据保留人工路径、道路锚点并能解析到完整景点清单。
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { MapGuideBootstrap } from '../../src/types/map-guide'
import { matchSpot } from '../../src/utils/map-guide/spot-mapping'

async function readBootstrap(): Promise<MapGuideBootstrap> {
  const contents = await readFile(
    new URL('../../public/map-guide/data/bootstrap.json', import.meta.url),
    'utf8'
  )
  return JSON.parse(contents) as MapGuideBootstrap
}

test('official routes retain authored paths and auditable road anchors', async () => {
  const bootstrap = await readBootstrap()
  const officialRoutes = bootstrap.routes.filter((route) => route.source === 'official')
  assert.equal(officialRoutes.length, 6)
  for (const route of officialRoutes) {
    assert.equal(route.geometryKind, 'official-path')
    assert.ok(
      route.polyline.length > route.nodes.length,
      `${route.name} should contain intermediate path vertices`
    )
    assert.ok(route.nodes.every((node) => node.coordinateSource === 'official-route-anchor'))
    assert.ok(
      route.polyline.every(
        (coordinate) =>
          Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude)
      )
    )
  }
})

test('every official route node resolves against the complete scenic spot inventory', async () => {
  const bootstrap = await readBootstrap()
  const officialNodes = bootstrap.routes
    .filter((route) => route.source === 'official')
    .flatMap((route) => route.nodes)
  const unmatched = officialNodes.filter(
    (node) =>
      !matchSpot({ id: node.sourcePointId || node.spotId, name: node.name }, bootstrap.spots).spot
  )

  assert.equal(officialNodes.length, 70)
  assert.deepEqual(
    unmatched.map((node) => ({ id: node.id, name: node.name })),
    []
  )
})
