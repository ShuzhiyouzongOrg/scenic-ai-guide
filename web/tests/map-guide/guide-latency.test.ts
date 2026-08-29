/**
 * @fileoverview 智能问答展示时延规则测试。
 * @description 验证智能问答真实时延与本地展示时延之间的边界和掩码计算规则。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { getDisplayedGuideLatency } from '../../src/utils/guide-latency'

test('keeps real latency at or below five seconds', () => {
  assert.equal(
    getDisplayedGuideLatency(4999, true, () => 0.5),
    4999
  )
  assert.equal(
    getDisplayedGuideLatency(5000, true, () => 0.5),
    5000
  )
})

test('keeps real latency when local masking is disabled', () => {
  assert.equal(
    getDisplayedGuideLatency(6792, false, () => 0.862),
    6792
  )
})

test('masks long local latency within the requested range', () => {
  assert.equal(
    getDisplayedGuideLatency(6792, true, () => 0.862),
    4568
  )
  assert.equal(
    getDisplayedGuideLatency(7000, true, () => 0),
    4999
  )
  assert.equal(
    getDisplayedGuideLatency(7000, true, () => 0.999999),
    4500
  )
})

test('preserves a missing latency value', () => {
  assert.equal(
    getDisplayedGuideLatency(undefined, true, () => 0.5),
    undefined
  )
})
