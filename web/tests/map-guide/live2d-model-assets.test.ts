import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { BUNDLED_LIVE2D_MODELS, LIVE2D_PORTRAIT_PROFILES } from '../../src/lib/live2d/resource'

interface FileReference {
  File: string
}

interface ModelManifest {
  FileReferences: {
    Moc: string
    Textures: string[]
    Physics?: string
    Pose?: string
    UserData?: string
    DisplayInfo: string
    MotionSync: string
    Expressions?: FileReference[]
    Motions?: Record<string, FileReference[]>
  }
}

interface DisplayInfo {
  Parameters: Array<{ Id: string }>
}

interface MotionSyncSetting {
  AnalysisType: string
  UseCase: string
  CubismParameters: Array<{ Id: string }>
  AudioParameters: Array<{ Id: string; Enabled: boolean }>
  Mappings: Array<{
    Id: string
    Targets: Array<{ Id: string }>
  }>
}

interface MotionSyncManifest {
  Meta: { SettingCount: number }
  Settings: MotionSyncSetting[]
}

const charactersRoot = fileURLToPath(new URL('../../public/live2d/characters/', import.meta.url))
const requiredAudioParameters = ['Silence', 'A', 'I', 'U', 'E', 'O']

for (const modelId of BUNDLED_LIVE2D_MODELS) {
  test(`${modelId} has a complete loadable asset graph`, () => {
    const modelDirectory = resolve(charactersRoot, modelId)
    const manifestPath = resolve(modelDirectory, `${modelId}.model3.json`)
    const manifest = readJson<ModelManifest>(manifestPath)
    const references = manifest.FileReferences

    assertAsset(manifestPath)
    assertAsset(resolve(modelDirectory, `${modelId}.png`))
    assertAsset(resolve(modelDirectory, references.Moc))
    assertAsset(resolve(modelDirectory, references.DisplayInfo))
    assertAsset(resolve(modelDirectory, references.MotionSync))

    for (const texture of references.Textures) assertAsset(resolve(modelDirectory, texture))
    for (const optional of [references.Physics, references.Pose, references.UserData]) {
      if (optional) assertAsset(resolve(modelDirectory, optional))
    }
    for (const expression of references.Expressions || []) {
      assertAsset(resolve(modelDirectory, expression.File))
    }
    for (const motions of Object.values(references.Motions || {})) {
      for (const motion of motions) assertAsset(resolve(modelDirectory, motion.File))
    }
  })

  test(`${modelId} MotionSync mapping matches real model parameters`, () => {
    const modelDirectory = resolve(charactersRoot, modelId)
    const manifest = readJson<ModelManifest>(resolve(modelDirectory, `${modelId}.model3.json`))
    const displayInfo = readJson<DisplayInfo>(
      resolve(modelDirectory, manifest.FileReferences.DisplayInfo)
    )
    const motionSync = readJson<MotionSyncManifest>(
      resolve(modelDirectory, manifest.FileReferences.MotionSync)
    )
    const parameterIds = new Set(displayInfo.Parameters.map((parameter) => parameter.Id))

    assert.equal(motionSync.Meta.SettingCount, motionSync.Settings.length)
    assert.ok(motionSync.Settings.length > 0)
    for (const setting of motionSync.Settings) {
      assert.equal(setting.AnalysisType, 'CRI')
      assert.equal(setting.UseCase, 'Mouth')
      assert.deepEqual(
        setting.AudioParameters.filter((parameter) => parameter.Enabled).map(
          (parameter) => parameter.Id
        ),
        requiredAudioParameters
      )
      assert.deepEqual(
        setting.Mappings.map((mapping) => mapping.Id),
        requiredAudioParameters
      )
      for (const parameter of setting.CubismParameters) {
        assert.ok(parameterIds.has(parameter.Id), `${modelId} is missing ${parameter.Id}`)
      }
      for (const mapping of setting.Mappings) {
        for (const target of mapping.Targets) {
          assert.ok(parameterIds.has(target.Id), `${modelId} is missing ${target.Id}`)
        }
      }
    }
  })
}

test('every selectable Live2D model has a map portrait profile', () => {
  assert.deepEqual(Object.keys(LIVE2D_PORTRAIT_PROFILES).sort(), [...BUNDLED_LIVE2D_MODELS].sort())

  for (const profile of Object.values(LIVE2D_PORTRAIT_PROFILES)) {
    assert.ok(profile.scale > 0)
    assert.ok(Number.isFinite(profile.offsetX))
    assert.ok(Number.isFinite(profile.offsetY))
  }
})

function readJson<T>(path: string): T {
  assertAsset(path)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function assertAsset(path: string): void {
  assert.ok(existsSync(path), `missing Live2D asset: ${path}`)
  assert.ok(statSync(path).size > 0, `empty Live2D asset: ${path}`)
  assert.ok(dirname(path).startsWith(charactersRoot) || path.includes('motionsync'))
}
