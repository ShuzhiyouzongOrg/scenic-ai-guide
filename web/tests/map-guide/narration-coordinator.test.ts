import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NarrationCoordinator,
  type NarrationDriver
} from '../../src/composables/map-guide/narration-coordinator'
import type { NarrationContent } from '../../src/types/map-guide'

const content: NarrationContent = {
  id: 'narration-1',
  title: 'Test',
  source: 'official-script',
  script: 'Official text',
  segments: [{ id: '1', text: 'Official text', emotion: 'neutral' }]
}

function driver(
  id: NarrationDriver['id'],
  play: () => Promise<void>,
  supports = true
): NarrationDriver {
  return {
    id,
    isAvailable: () => true,
    supports: () => supports,
    play,
    pause: () => undefined,
    resume: () => undefined,
    stop: () => undefined
  }
}

test('coordinator blocks duplicate concurrent playback', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const coordinator = new NarrationCoordinator([driver('avatar', () => pending)])
  const first = coordinator.play(content)
  assert.equal(await coordinator.play(content), false)
  finish()
  assert.equal(await first, true)
  assert.equal(coordinator.state.state, 'completed')
})

test('avatar failure degrades to browser speech without failing the page', async () => {
  const calls: string[] = []
  const coordinator = new NarrationCoordinator([
    driver('avatar', async () => {
      calls.push('avatar')
      throw new Error('WebRTC unavailable')
    }),
    driver('speech', async () => {
      calls.push('speech')
    })
  ])
  assert.equal(await coordinator.play(content), true)
  assert.deepEqual(calls, ['avatar', 'speech'])
  assert.equal(coordinator.state.state, 'completed')
})

test('stop releases the active driver and returns to idle', async () => {
  let stopped = false
  let finish!: () => void
  const coordinator = new NarrationCoordinator([
    {
      ...driver(
        'avatar',
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          })
      ),
      stop: () => {
        stopped = true
        finish?.()
      }
    }
  ])
  const running = coordinator.play(content)
  await Promise.resolve()
  await coordinator.stop()
  await running
  assert.equal(stopped, true)
  assert.equal(coordinator.state.state, 'idle')
})
