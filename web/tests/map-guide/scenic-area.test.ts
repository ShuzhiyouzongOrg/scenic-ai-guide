import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import type { MapGuideBootstrap } from '../../src/types/map-guide'
import { facilityColor } from '../../src/utils/map-guide/facility-style'
import {
  clearedScenicAreaInteractionState,
  normalizeScenicAreaId,
  scenicAreaStateStorageKey
} from '../../src/utils/map-guide/scenic-area'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readBootstrap(path: string): MapGuideBootstrap {
  return JSON.parse(readFileSync(resolve(webRoot, path), 'utf8')) as MapGuideBootstrap
}

const lingshan = readBootstrap('public/map-guide/data/bootstrap.json')
const nianhuawan = readBootstrap('public/map-guide/data/nianhuawan/bootstrap.json')

test('scenic area IDs and persistence keys stay isolated', () => {
  assert.equal(normalizeScenicAreaId('nianhuawan'), 'nianhuawan')
  assert.equal(normalizeScenicAreaId('unknown'), 'lingshan')
  assert.notEqual(scenicAreaStateStorageKey('lingshan'), scenicAreaStateStorageKey('nianhuawan'))
})

test('switching scenic areas clears route, spot, panorama and narration state', () => {
  assert.deepEqual(clearedScenicAreaInteractionState(), {
    selectedSpotId: undefined,
    selectedRouteId: undefined,
    selectedCategoryIds: ['36'],
    query: '',
    routeDrawerOpen: false,
    routeDetailOpen: false,
    panoramaOpen: false,
    activePanoramaId: undefined,
    activeNarrationId: undefined,
    avatarDisplayState: 'idle',
    handDrawnVisible: true
  })
})

test('Nianhuawan bootstrap never mixes Lingshan source records', () => {
  assert.equal(nianhuawan.area.id, 'nianhuawan')
  assert.ok(nianhuawan.spots.length >= 274)
  assert.ok(
    nianhuawan.spots.every(
      (spot) =>
        spot.sourceProject === 'nianhuawan-miniapp-rebuild' && !spot.id.startsWith('lingshan-')
    )
  )
  assert.ok(lingshan.spots.every((spot) => spot.sourceProject !== 'nianhuawan-miniapp-rebuild'))
})

test('Nianhuawan official routes keep authored paths and canonical marker coordinates', () => {
  const spotById = new Map(nianhuawan.spots.map((spot) => [spot.id, spot]))
  assert.equal(nianhuawan.routes.length, 7)
  assert.equal(
    nianhuawan.routes.reduce((sum, route) => sum + route.polyline.length, 0),
    185
  )
  for (const route of nianhuawan.routes) {
    assert.equal(route.source, 'official')
    assert.equal(route.geometryKind, 'official-path')
    assert.ok(route.polyline.length > route.nodes.length)
    for (const node of route.nodes) {
      const spot = spotById.get(node.spotId)
      assert.ok(spot, `missing canonical spot for ${route.id}/${node.id}`)
      assert.equal(node.latitude, spot?.latitude)
      assert.equal(node.longitude, spot?.longitude)
      assert.ok(node.sourceRouteAnchor)
    }
  }
})

test('Nianhuawan tiles retain the source row-major 4x4 grid', () => {
  const tiles = nianhuawan.config.tileLayer.tiles
  assert.equal(tiles.length, 16)
  assert.deepEqual(
    tiles.map((tile) => [tile.id, tile.row, tile.column]),
    Array.from({ length: 16 }, (_, index) => [
      String(index + 1).padStart(2, '0'),
      Math.floor(index / 4),
      index % 4
    ])
  )
  assert.ok(tiles.every((tile) => tile.width === 1771 && tile.height === 2048))
  assert.equal(nianhuawan.config.rotationDegrees, 0)
  assert.equal(nianhuawan.config.highDpiMaxZoom, 18)
})

test('visible Nianhuawan facility categories use distinct marker colors', () => {
  const facilityCategoryIds = nianhuawan.categories
    .filter((category) => category.kind === 'facility')
    .map((category) => category.id)
  const colors = facilityCategoryIds.map(facilityColor)
  assert.equal(new Set(colors).size, colors.length)
})

test('Nianhuawan panorama inventory keeps scenes, hotspots and stable spot links', () => {
  assert.equal(nianhuawan.panoramas.length, 15)
  assert.equal(
    nianhuawan.panoramas.reduce((sum, panorama) => sum + panorama.hotspots.length, 0),
    54
  )
  assert.equal(nianhuawan.panoramas.filter((panorama) => panorama.spotId).length, 8)
  const tower = nianhuawan.spots.find((spot) => spot.sourcePointId === '169')
  assert.ok(tower?.panoramaIds.includes('49906875'))
  assert.match(
    nianhuawan.panoramas.find((panorama) => panorama.panoramaId === '49906875')?.url || '',
    /scene_id=49906875/
  )
})
