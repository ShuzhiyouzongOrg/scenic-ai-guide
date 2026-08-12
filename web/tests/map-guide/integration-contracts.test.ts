import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('map digital human follows the active backend engine', () => {
  const source = readFileSync(
    new URL('../../src/components/map-guide/MapDigitalHuman.vue', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /engine-override=["']xfyun["']/)
})

test('map guide opens with compact search and keeps the spot card centered', () => {
  const page = readFileSync(new URL('../../src/views/guide/map/index.vue', import.meta.url), 'utf8')
  const spotCard = readFileSync(
    new URL('../../src/components/map-guide/ScenicSpotCard.vue', import.meta.url),
    'utf8'
  )

  assert.match(page, /const panelCollapsed = ref\(true\)/)
  assert.match(page, /:search-panel-open="!panelCollapsed"/)
  assert.match(spotCard, /\.scenic-spot-card\.search-panel-open/)
  assert.match(spotCard, /\.scenic-spot-card \{[\s\S]*?bottom: 18px;[\s\S]*?left: 50%;/)
  assert.match(spotCard, /transform: translateX\(-50%\)/)
  assert.match(spotCard, /width: min\(560px, max\(340px, calc\(100% - 656px\)\)\);/)
  assert.doesNotMatch(spotCard, /left: calc/)
  assert.match(spotCard, /@media \(width <= 600px\)[\s\S]*?transform: none;/)
  assert.match(page, /@close="selectedSpotId = undefined"/)
})

test('expanded map avatar keeps its white stage and readable dark narration panel', () => {
  const source = readFileSync(
    new URL('../../src/components/map-guide/MapDigitalHuman.vue', import.meta.url),
    'utf8'
  )
  const dock = readFileSync(
    new URL('../../src/components/map-guide/DigitalHumanNarrationDock.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /\.state-speaking .*:deep\(\.dh-stage\)/s)
  assert.match(source, /\.state-speaking .*:deep\(\.l2d-stage\)/s)
  assert.match(source, /:deep\(\.dh-badge\),\s*.*:deep\(\.l2d-badge\) \{\s*display: none;/s)
  assert.match(source, /:deep\(\.dh-fallback-tip\),\s*.*:deep\(\.l2d-fallback-tip\)/s)
  assert.match(
    dock,
    /\.digital-human-dock \{[\s\S]*?color: #304a43;[\s\S]*?background: #fff;/
  )
  assert.match(
    dock,
    /:deep\(\.narration-subtitle\) \{[\s\S]*?color: #f5f8f7;[\s\S]*?background: #1c342e;/
  )
  assert.match(
    dock,
    /footer button \{[\s\S]*?color: #f4f7f5;[\s\S]*?background: #3e5952;/
  )
})

test('live2d runtime invalidates stale rendering and model loads', () => {
  const delegate = readFileSync(
    new URL('../../src/lib/live2d/src/lappdelegate.ts', import.meta.url),
    'utf8'
  )
  const model = readFileSync(
    new URL('../../src/lib/live2d/src/lappmodel.ts', import.meta.url),
    'utf8'
  )
  const composable = readFileSync(
    new URL('../../src/composables/useLive2dAvatar.ts', import.meta.url),
    'utf8'
  )
  const manager = readFileSync(
    new URL('../../src/lib/live2d/live2dManager.ts', import.meta.url),
    'utf8'
  )
  const textureManager = readFileSync(
    new URL('../../src/lib/live2d/src/lapptexturemanager.ts', import.meta.url),
    'utf8'
  )

  assert.match(delegate, /s_instance\s*!==\s*this/)
  assert.match(delegate, /cancelAnimationFrame\(this\._animationFrameId\)/)
  assert.match(model, /isModelLoadCurrent\(this\)/)
  assert.match(model, /setModelLoadError/)
  assert.match(composable, /runtimeGeneration/)
  assert.match(composable, /cancelReadyWait/)
  assert.match(composable, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/)
  assert.match(composable, /getModelLoadError\(\)/)
  assert.match(manager, /releaseInstance\(\)/)
  assert.match(manager, /_audioContext\.close\(\)/)
  assert.match(textureManager, /addEventListener\(\s*['"]error['"]/)
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
  playback.start()
  playback.clear()
  assert.equal(playback.route.value, undefined)
  assert.equal(playback.playing.value, false)
  assert.equal(playback.autoPlay.value, false)
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
