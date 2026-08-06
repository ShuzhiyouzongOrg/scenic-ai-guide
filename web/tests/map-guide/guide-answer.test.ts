import assert from 'node:assert/strict'
import test from 'node:test'
import { formatGuideAnswer } from '../../src/utils/guide-answer'

test('guide answers remove Markdown syntax without rendering HTML', () => {
  const answer = [
    '### 推荐路线',
    '1. **南门入园**：从正门进入。',
    '- 参观 [灵山大佛](https://example.com)',
    '`请按现场指引游览`'
  ].join('\n')

  assert.equal(
    formatGuideAnswer(answer),
    ['推荐路线', '1. 南门入园：从正门进入。', '• 参观 灵山大佛', '请按现场指引游览'].join('\n')
  )
})

test('guide answer formatter preserves complete numbered route text', () => {
  const answer = '1. **九龙灌浴**：观看演出。\n2. **灵山大佛**：参观地标。'
  assert.equal(formatGuideAnswer(answer), '1. 九龙灌浴：观看演出。\n2. 灵山大佛：参观地标。')
})
