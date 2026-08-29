/**
 * @fileoverview 数字人凭证解析与降级规则测试。
 * @description 验证数字人凭证在 Web 构建配置与桌面桥接通道之间的解析和降级规则。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasAvatarCredentials,
  resolveAvatarCredentials
} from '../../src/utils/digital-human/avatar-credentials'

const bundled = { appId: 'app-id', apiKey: 'api-key', apiSecret: 'api-secret' }

test('keeps complete credentials compiled into the web bundle', async () => {
  let desktopCalls = 0
  const resolved = await resolveAvatarCredentials(bundled, async () => {
    desktopCalls += 1
    return null
  })

  assert.deepEqual(resolved, bundled)
  assert.equal(desktopCalls, 0)
})

test('loads credentials from the Electron bridge when the web bundle is empty', async () => {
  const resolved = await resolveAvatarCredentials({}, async () => bundled)
  assert.deepEqual(resolved, bundled)
})

test('rejects partial or unavailable desktop credentials', async () => {
  assert.equal(hasAvatarCredentials({ appId: 'app-id', apiKey: '', apiSecret: 'secret' }), false)
  assert.equal(
    await resolveAvatarCredentials({}, async () => ({ appId: 'app-id', apiKey: 'api-key' })),
    null
  )
  assert.equal(
    await resolveAvatarCredentials({}, async () => {
      throw new Error('bridge unavailable')
    }),
    null
  )
})
