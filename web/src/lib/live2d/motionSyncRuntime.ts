/**
 * @fileoverview 官方 Cubism MotionSync 运行时延迟加载适配器。
 * @description 在授权 Core 全局对象可用后加载 Framework，并封装模型设置、实例创建与释放流程。
 */

import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson'
import type { ICubismModelSetting } from '@framework/icubismmodelsetting'
import type { CubismModel } from '@framework/model/cubismmodel'
import type { csmVector } from '@framework/type/csmvector'

interface MotionSyncModelSetting extends ICubismModelSetting {
  getMotionSyncFileName?: () => string
}

/**
 * @typedef {object} MotionSyncInstance
 * @description 描述官方 MotionSync 实例在应用适配层使用的最小接口。
 * @property {(processIndex: number, buffer: csmVector<number>, startIndex: number) => void} setSoundBuffer 写入待分析的音频样本。
 * @property {(model: CubismModel, deltaTimeSeconds: number) => void} updateParameters 将分析结果更新到模型参数。
 * @property {(processIndex: number) => number} getLastTotalProcessedCount 获取指定处理器累计完成的样本数。
 * @property {() => void} release 释放实例持有的 MotionSync 资源。
 */
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
 * @description 仅在授权 MotionSync Core 全局对象存在时延迟加载官方 Framework，避免缺少 Core 导致应用启动失败。
 * @returns {Promise<boolean>} Framework 可用且加载成功时返回 `true`，否则返回 `false`。
 * @example
 * const available = await prepareOfficialMotionSync()
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

/**
 * @description 根据官方运行时可用性创建 MotionSync 专用或普通 Cubism 模型设置。
 * @param {ArrayBuffer} buffer 模型设置 JSON 的二进制数据。
 * @param {number} size 有效二进制长度。
 * @returns {MotionSyncModelSetting} 可供模型加载流程读取的设置对象。
 * @throws {Error} 设置数据无效或底层解析器初始化失败时抛出异常。
 */
export function createMotionSyncModelSetting(
  buffer: ArrayBuffer,
  size: number
): MotionSyncModelSetting {
  return runtime
    ? new runtime.setting.CubismModelMotionSyncSettingJson(buffer, size)
    : new CubismModelSettingJson(buffer, size)
}

/**
 * @description 从模型设置中读取可选的 MotionSync 配置文件名。
 * @param {MotionSyncModelSetting} setting 模型设置对象。
 * @returns {string} MotionSync 文件名；未声明时返回空字符串。
 */
export function getMotionSyncFileName(setting: MotionSyncModelSetting): string {
  return setting.getMotionSyncFileName?.() || ''
}

/**
 * @description 配置日志选项并启动、初始化官方 MotionSync Framework。
 * @param {(message: string) => void} logFunction Framework 日志输出函数。
 * @param {number} loggingLevel Framework 日志级别。
 * @returns {boolean} Framework 完成初始化时返回 `true`。
 * @throws {Error} 官方 Framework 启动或初始化过程异常时抛出。
 * @example
 * const started = startOfficialMotionSync(console.log, loggingLevel)
 */
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

/**
 * @description 判断官方 MotionSync Framework 是否已经完成初始化。
 * @returns {boolean} 运行时存在且 Framework 已初始化时返回 `true`。
 */
export function isOfficialMotionSyncInitialized(): boolean {
  return Boolean(runtime?.motionSync.CubismMotionSync.isInitialized())
}

/**
 * @description 为指定 Cubism 模型创建官方 MotionSync 分析实例。
 * @param {CubismModel} model 接收口型参数的 Cubism 模型。
 * @param {ArrayBuffer} buffer MotionSync 配置文件的二进制数据。
 * @param {number} size 配置数据的有效长度。
 * @param {number} sampleRate 输入 PCM 的采样率。
 * @returns {MotionSyncInstance|null} 创建成功的实例；运行时未就绪时返回 `null`。
 * @throws {Error} 官方 Core 拒绝创建实例时抛出异常。
 */
export function createOfficialMotionSync(
  model: CubismModel,
  buffer: ArrayBuffer,
  size: number,
  sampleRate: number
): MotionSyncInstance | null {
  if (!runtime || !isOfficialMotionSyncInitialized()) return null
  return runtime.motionSync.CubismMotionSync.create(model, buffer, size, sampleRate)
}

/**
 * @description 删除全部分析引擎，并释放和清理官方 MotionSync Framework。
 * @returns {void} 无返回值。
 * @throws {Error} 底层引擎或 Framework 释放失败时抛出异常。
 * @example
 * disposeOfficialMotionSync()
 */
export function disposeOfficialMotionSync(): void {
  if (!runtime) return
  try {
    runtime.controller.CubismMotionSyncEngineController.deleteAllEngine()
  } finally {
    runtime.motionSync.CubismMotionSync.dispose()
    runtime.motionSync.CubismMotionSync.cleanUp()
  }
}
