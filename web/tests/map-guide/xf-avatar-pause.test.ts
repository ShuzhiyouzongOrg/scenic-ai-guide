/**
 * @fileoverview 讯飞数字人暂停恢复测试。
 * @description 验证讯飞数字人根据字幕推进暂停位置，并从剩余文本继续播报。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceSpeechOffset,
  getRemainingSpeech
} from '../../src/utils/digital-human/speech-resume'

test('讯飞字幕按片段推进并从暂停位置继续', () => {
  const text = '灵山大佛通高88米，其中佛体高79米，莲花瓣高9米。'
  const firstOffset = advanceSpeechOffset(text, '灵山大佛通高88米', 0)
  const secondOffset = advanceSpeechOffset(text, '其中佛体高79米', firstOffset)

  assert.equal(getRemainingSpeech(text, secondOffset), '莲花瓣高9米。')
})

test('讯飞字幕标点变化时仍能定位暂停位置', () => {
  const text = '您好，欢迎来到灵山胜境！接下来为您介绍大佛。'
  const offset = advanceSpeechOffset(text, '您好欢迎来到灵山胜境', 0)

  assert.equal(getRemainingSpeech(text, offset), '接下来为您介绍大佛。')
})

test('未收到有效字幕时从完整回答恢复', () => {
  const text = '这是一段完整的数字人讲解。'

  assert.equal(advanceSpeechOffset(text, '', 0), 0)
  assert.equal(getRemainingSpeech(text, 0), text)
})

test('重复字幕片段继续匹配尚未播报的下一处文本', () => {
  const text = '欢迎欢迎来到灵山。'
  const firstOffset = advanceSpeechOffset(text, '欢迎', 0)
  const secondOffset = advanceSpeechOffset(text, '欢迎', firstOffset)

  assert.equal(getRemainingSpeech(text, secondOffset), '来到灵山。')
})
