/**
 * @fileoverview 全景目标解析优先级测试。
 * @description 验证全景目标按显式场景、景点映射和景区总览的优先级进行解析。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { PanoramaRecord } from '../../src/types/map-guide'
import { resolvePanoramaForTarget } from '../../src/utils/map-guide/panorama'

const panoramas: PanoramaRecord[] = [
  {
    panoramaId: '29958273',
    title: '景区全貌',
    url: 'https://example.com/panorama?scene_id=29958273',
    platform: '720yun',
    hotspots: [],
    supportsGyroscope: 'unknown',
    manualReview: true
  },
  {
    panoramaId: '34731374',
    spotId: 'LS-011',
    title: '灵山大佛',
    url: 'https://example.com/panorama?scene_id=34731374',
    platform: '720yun',
    hotspots: [],
    supportsGyroscope: 'unknown',
    manualReview: true
  }
]

test('panorama target opens the scene mapped to a scenic spot', () => {
  assert.equal(resolvePanoramaForTarget(panoramas, { spotId: 'LS-011' })?.panoramaId, '34731374')
})

test('explicit scene URL takes priority over spot fallback', () => {
  assert.equal(
    resolvePanoramaForTarget(panoramas, {
      spotId: 'missing',
      vrUrl: 'https://example.com/panorama?scene_id=34731374'
    })?.panoramaId,
    '34731374'
  )
})

test('unmapped scenic spots fall back to the park overview', () => {
  assert.equal(resolvePanoramaForTarget(panoramas, { spotId: 'LS-999' })?.panoramaId, '29958273')
})
