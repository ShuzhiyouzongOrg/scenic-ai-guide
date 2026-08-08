import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson'
import type { ICubismModelSetting } from '@framework/icubismmodelsetting'
import type { CubismModel } from '@framework/model/cubismmodel'
import type { csmVector } from '@framework/type/csmvector'

interface MotionSyncModelSetting extends ICubismModelSetting {
  getMotionSyncFileName?: () => string
}

export interface MotionSyncInstance {
  setSoundBuffer(processIndex: number, buffer: csmVector<number>, startIndex: number): void
  updateParameters(model: CubismModel, deltaTimeSeconds: number): void
  getLastTotalProcessedCount(processIndex: number): number
  release(): void
}

type MotionSyncModule = typeof import('@motionsyncframework/live2dcubismmotionsync')
type MotionSyncSettingModule =
  typeof import('@motionsyncframework/cubismmodelmotionsyncsettingjson')
type MotionSyncControllerModule =
  typeof import('@motionsyncframework/cubismmotionsyncenginecontroller')

interface MotionSyncRuntime {
  motionSync: MotionSyncModule
  setting: MotionSyncSettingModule
  controller: MotionSyncControllerModule
}

let runtime: MotionSyncRuntime | null = null
let runtimePromise: Promise<boolean> | null = null

/**
 * Imports the official Framework only after its licensed Core global exists.
 * Several upstream modules bind Core namespaces during module evaluation, so
 * eager imports would make a missing Core crash the entire Vue application.
 */
export function prepareOfficialMotionSync(): Promise<boolean> {
  if (runtime) return Promise.resolve(true)
  if (!globalThis.Live2DCubismMotionSyncCore) return Promise.resolve(false)
  if (runtimePromise) return runtimePromise

  runtimePromise = Promise.all([
    import('@motionsyncframework/live2dcubismmotionsync'),
    import('@motionsyncframework/cubismmodelmotionsyncsettingjson'),
    import('@motionsyncframework/cubismmotionsyncenginecontroller')
  ])
    .then(([motionSync, setting, controller]) => {
      runtime = { motionSync, setting, controller }
      return true
    })
    .catch(() => {
      runtime = null
      runtimePromise = null
      return false
    })

  return runtimePromise
}

export function createMotionSyncModelSetting(
  buffer: ArrayBuffer,
  size: number
): MotionSyncModelSetting {
  return runtime
    ? new runtime.setting.CubismModelMotionSyncSettingJson(buffer, size)
    : new CubismModelSettingJson(buffer, size)
}

export function getMotionSyncFileName(setting: MotionSyncModelSetting): string {
  return setting.getMotionSyncFileName?.() || ''
}

export function startOfficialMotionSync(
  logFunction: (message: string) => void,
  loggingLevel: number
): boolean {
  if (!runtime) return false
  const option = new runtime.motionSync.MotionSyncOption()
  option.logFunction = logFunction
  option.loggingLevel = loggingLevel
  if (!runtime.motionSync.CubismMotionSync.startUp(option)) return false
  runtime.motionSync.CubismMotionSync.initialize()
  return runtime.motionSync.CubismMotionSync.isInitialized()
}

export function isOfficialMotionSyncInitialized(): boolean {
  return Boolean(runtime?.motionSync.CubismMotionSync.isInitialized())
}

export function createOfficialMotionSync(
  model: CubismModel,
  buffer: ArrayBuffer,
  size: number,
  sampleRate: number
): MotionSyncInstance | null {
  if (!runtime || !isOfficialMotionSyncInitialized()) return null
  return runtime.motionSync.CubismMotionSync.create(model, buffer, size, sampleRate)
}

export function disposeOfficialMotionSync(): void {
  if (!runtime) return
  try {
    runtime.controller.CubismMotionSyncEngineController.deleteAllEngine()
  } finally {
    runtime.motionSync.CubismMotionSync.dispose()
    runtime.motionSync.CubismMotionSync.cleanUp()
  }
}
