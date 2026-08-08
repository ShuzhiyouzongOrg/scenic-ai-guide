import assert from 'node:assert/strict'
import test from 'node:test'
import {
  concatPcmChunks,
  mixAudioChannels,
  MotionSyncPcmCursor
} from '../../src/lib/live2d/motionSyncPcm'

test('MotionSync PCM cursor follows elapsed audio time without replaying samples', () => {
  const cursor = new MotionSyncPcmCursor()
  cursor.begin(Float32Array.from([0, 1, 2, 3, 4, 5]), 2, 10)

  assert.deepEqual([...cursor.readUntil(10.9)], [0])
  assert.deepEqual([...cursor.readUntil(11.6)], [1, 2])
  assert.deepEqual([...cursor.readUntil(11.6)], [])
  assert.deepEqual([...cursor.drain()], [3, 4, 5])
  assert.deepEqual([...cursor.drain()], [])
})

test('MotionSync PCM downmix averages channels and joins queued tails', () => {
  const mono = mixAudioChannels([Float32Array.from([1, 0.5, -1]), Float32Array.from([-1, 0.5, 1])])
  assert.deepEqual([...mono], [0, 0.5, 0])
  assert.deepEqual(
    [...concatPcmChunks([Float32Array.from([1, 2]), new Float32Array(), Float32Array.from([3])])],
    [1, 2, 3]
  )
})
