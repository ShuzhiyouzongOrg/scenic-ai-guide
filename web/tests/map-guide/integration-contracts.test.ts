import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope } from 'vue'
import { guideRoutes } from '../../src/router/modules/guide'
import { useRoutePlayback } from '../../src/composables/map-guide/useRoutePlayback'
import type { GuideRoute } from '../../src/types/map-guide'
import { ResourceDisposer } from '../../src/utils/map-guide/resource-disposer'

test('guide route registers the map page without replacing digital-human experience', () => {
  const children = guideRoutes.children || []
  assert.ok(
    children.some((route) => route.name === 'GuideExperience' && route.path === 'experience')
  )
  assert.ok(children.some((route) => route.name === 'GuideMap' && route.path === 'map'))
})

test('page resource cleanup is idempotent and runs every registered disposer', async () => {
  const calls: number[] = []
  const disposer = new ResourceDisposer()
  disposer.add(() => {
    calls.push(1)
  })
  disposer.add(async () => {
    calls.push(2)
  })
  await disposer.dispose()
  await disposer.dispose()
  assert.deepEqual(calls, [2, 1])
})

test('clearing route playback removes route and transient playback state', async () => {
  const route: GuideRoute = {
    id: 'official-test',
    name: '测试路线',
    source: 'official',
    tags: [],
    polyline: [],
    nodes: [
      {
        id: 'node-1',
        order: 1,
        spotId: 'spot-1',
        name: '测试景点',
        latitude: 31.42,
        longitude: 120.1,
        coordinateSystem: 'GCJ02'
      }
    ],
    isEditable: false,
    isOfficial: true,
    isPreciseNavigation: false
  }
  const scope = effectScope()
  const playback = scope.run(() => useRoutePlayback())
  assert.ok(playback)
  await playback.selectRoute(route)
  playback.autoPlay.value = true
  playback.followNarration.value = true
  playback.start()
  playback.clear()
  assert.equal(playback.route.value, undefined)
  assert.equal(playback.playing.value, false)
  assert.equal(playback.autoPlay.value, false)
  assert.equal(playback.followNarration.value, false)
  assert.equal(playback.nodeIndex.value, 0)
  scope.stop()
})

test('selecting a route previews it without starting narration', async () => {
  let narrationStarts = 0
  const route: GuideRoute = {
    id: 'official-preview',
    name: '路线预览',
    source: 'official',
    tags: [],
    polyline: [],
    nodes: [
      {
        id: 'preview-node-1',
        order: 1,
        spotId: 'spot-1',
        name: '第一站',
        latitude: 31.42,
        longitude: 120.1,
        coordinateSystem: 'GCJ02'
      }
    ],
    isEditable: false,
    isOfficial: true,
    isPreciseNavigation: false
  }
  const scope = effectScope()
  const playback = scope.run(() =>
    useRoutePlayback({
      onNodeChange: () => {
        narrationStarts += 1
      }
    })
  )
  assert.ok(playback)

  await playback.selectRoute(route)
  assert.equal(narrationStarts, 0)
  await playback.goTo(0)
  assert.equal(narrationStarts, 1)
  scope.stop()
})
