/**
 * @fileoverview 泰语国际化完整性测试。
 * @description 验证泰语业务文案和框架文案对英文基准键及插值占位符的完整覆盖。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { LanguageEnum } from '../../src/enums/appEnum'
import { appMessages } from '../../src/locales/app-messages'
import englishFramework from '../../src/locales/langs/en.json'
import thaiFramework from '../../src/locales/langs/th.json'

test('Thai business messages cover every existing application key and placeholder', () => {
  const englishKeys = Object.keys(appMessages[LanguageEnum.EN]).sort()
  const thaiKeys = Object.keys(appMessages[LanguageEnum.TH]).sort()
  assert.equal(LanguageEnum.TH, 'th')
  assert.deepEqual(thaiKeys, englishKeys)

  for (const key of englishKeys) {
    const english = appMessages[LanguageEnum.EN][key as keyof (typeof appMessages)[LanguageEnum.EN]]
    const thai = appMessages[LanguageEnum.TH][key as keyof (typeof appMessages)[LanguageEnum.TH]]
    assert.ok(thai.trim(), `Thai business message is empty: ${key}`)
    assert.deepEqual(placeholders(thai), placeholders(english), `placeholder mismatch: ${key}`)
  }

  const thaiCoverage = Object.values(appMessages[LanguageEnum.TH]).filter((value) =>
    /[\u0e00-\u0e7f]/u.test(value)
  ).length
  assert.ok(thaiCoverage / thaiKeys.length > 0.85, 'Thai business translation coverage is too low')
})

test('Thai framework messages preserve the complete nested English structure', () => {
  const english = flattenStrings(englishFramework)
  const thai = flattenStrings(thaiFramework)
  assert.deepEqual(Object.keys(thai).sort(), Object.keys(english).sort())

  for (const [key, value] of Object.entries(english)) {
    assert.ok(thai[key]?.trim(), `Thai framework message is empty: ${key}`)
    assert.deepEqual(placeholders(thai[key]), placeholders(value), `placeholder mismatch: ${key}`)
  }
})

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^}]+\}/gu)].map((match) => match[0]).sort()
}

function flattenStrings(
  value: unknown,
  path = '',
  result: Record<string, string> = {}
): Record<string, string> {
  if (typeof value === 'string') result[path] = value
  else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, `${path}[${index}]`, result))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flattenStrings(child, path ? `${path}.${key}` : key, result)
    }
  }
  return result
}
