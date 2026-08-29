/**
 * @fileoverview 封装本地 Live2D 数字人的加载、渲染与语音播放流程。
 * @description 管理共享 Cubism 运行时、模型切换、TTS 音频队列、口型驱动和生命周期清理。
 */

/**
 * @description Live2D 数字人封装（讯飞云端数字人的本地兜底方案）。
 *
 * 与 useXfAvatar 暴露一致的接口（start/speak/enableAudio/interrupt/destroy +
 * 响应式状态），因此 DigitalHumanAvatar 可以按后台配置的 engine 无缝切换两种引擎。
 *
 * 与讯飞不同：讯飞是云端出声 + 云端口型；Live2D 在本地画布渲染，声音来自项目
 * 已有的后端 TTS 接口，取到音频后喂给 Live2dManager。优先使用官方 Cubism
 * MotionSync CRI 音素识别驱动口型；Core、配置或处理异常时回退到 AnalyserNode
 * 音频特征驱动。渲染基础移植自 awesome-digital-human-live2d。
 */
import { ref } from 'vue'
import { LAppDelegate } from '@/lib/live2d/src/lappdelegate'
import * as LAppDefine from '@/lib/live2d/src/lappdefine'
import { Live2dManager } from '@/lib/live2d/live2dManager'
import type { Live2dPresentation, Live2dViewTransform } from '@/lib/live2d/resource'
import { isBundledLive2dModel, LIVE2D_PORTRAIT_PROFILES } from '@/lib/live2d/resource'
import { prepareOfficialMotionSync } from '@/lib/live2d/motionSyncRuntime'
import { synthesizeSpeech } from '@/api/digital-human'

/**
 * @description 表示 Live2D 数字人的连接与播报状态。
 * @typedef {'idle' | 'connecting' | 'ready' | 'speaking' | 'error'} AvatarStatus
 */
export type AvatarStatus = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'

/**
 * @description 定义启动本地 Live2D 数字人所需的模型、音色和渲染参数。
 * @interface Live2dStartOptions
 * @property {string} [modelId] Live2D 角色目录名；未提供时使用 Haru。
 * @property {string} [vcn] 后端 TTS 使用的讯飞音色标识。
 * @property {number} [speechRate] 后端 TTS 使用的语速倍率。
 * @property {HTMLCanvasElement} canvas 当前组件持有的真实渲染画布。
 * @property {Live2dPresentation} [presentation] 舞台全身或地图头像取景模式。
 */
export interface Live2dStartOptions {
  /**
   * @description Live2D 模型（角色目录名，如 Haru），来自后台数字人配置
   */
  modelId?: string
  /**
   * @description 口型驱动用的 TTS 音色（vcn），来自后台数字人配置
   */
  vcn?: string
  /**
   * @description TTS 语速
   */
  speechRate?: number
  /**
   * @description 当前组件的真实渲染画布，避免全局 id 在切换时取错实例
   */
  canvas: HTMLCanvasElement
  /**
   * @description 舞台全身或地图头像取景。
   */
  presentation?: Live2dPresentation
}

const BASE = (import.meta.env.VITE_BASE_URL as string) || '/'
const CORE_SCRIPT = `${BASE}live2d/core/live2dcubismcore.min.js`.replace(/\/{2,}/g, '/')
const MOTION_SYNC_CORE_SCRIPT =
  `${BASE}live2d/motionsync/core/live2dcubismmotionsynccore.min.js`.replace(/\/{2,}/g, '/')

/**
 * @description 只加载一次 Cubism 核心运行时（挂到 window.Live2DCubismCore 全局）
 */
let corePromise: Promise<void> | null = null
let motionSyncCorePromise: Promise<void> | null = null
let runtimeOperationQueue: Promise<void> = Promise.resolve()
let activeRuntimeOwner: object | null = null

/**
 * @description 将共享 Live2D 运行时操作串行加入队列，避免模型切换时初始化与释放交叉执行。
 * @template T
 * @param {() => Promise<T>} operation 待串行执行的异步运行时操作。
 * @returns {Promise<T>} 当前操作完成后的结果 Promise。
 * @throws {unknown} 当前运行时操作拒绝时透传原始异常。
 */
function enqueueRuntimeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = runtimeOperationQueue.then(operation, operation)
  runtimeOperationQueue = queued.then(
    () => undefined,
    () => undefined
  )
  return queued
}

/**
 * @description 释放 Cubism 委托与 Live2D 音频管理器持有的共享运行时资源。
 * @returns {void} 无返回值。
 */
function releaseSharedRuntime(): void {
  try {
    LAppDelegate.releaseInstance()
  } catch {
    /* A partially initialized delegate still needs the audio manager released. */
  }
  Live2dManager.releaseInstance()
}

/**
 * @description 复用既有加载任务或向页面注入 Cubism 核心脚本，确保运行时仅加载一次。
 * @returns {Promise<void>} Cubism 核心脚本可用后的 Promise。
 * @throws {Error} 核心脚本资源加载失败时拒绝 Promise。
 */
function loadCubismCore(): Promise<void> {
  if ((window as Window & { Live2DCubismCore?: unknown }).Live2DCubismCore) return Promise.resolve()
  if (corePromise) return corePromise
  corePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CORE_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      corePromise = null
      reject(new Error('Live2D 核心运行时加载失败'))
    }
    document.head.appendChild(script)
  })
  return corePromise
}

/**
 * @description 单次加载已授权的 CRI 音素运行时；加载失败时允许模型回退至音频特征驱动。
 * @returns {Promise<void>} 核心脚本可用后完成的 Promise。
 * @throws {Error} 核心脚本资源加载失败时抛出异常。
 */
function loadMotionSyncCore(): Promise<void> {
  if ((window as Window & { Live2DCubismMotionSyncCore?: unknown }).Live2DCubismMotionSyncCore) {
    return Promise.resolve()
  }
  if (motionSyncCorePromise) return motionSyncCorePromise
  motionSyncCorePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = MOTION_SYNC_CORE_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      motionSyncCorePromise = null
      reject(new Error('Live2D MotionSync 核心运行时加载失败'))
    }
    document.head.appendChild(script)
  })
  return motionSyncCorePromise
}

/**
 * @description 创建本地 Live2D 数字人的响应式状态及完整生命周期控制接口。
 * @returns {ReturnType<typeof useLive2dAvatar>} 包含状态、错误信息、音频就绪状态，以及启动、播报、暂停、恢复、打断、销毁和缩放处理方法的对象。
 * @example
 * const avatar = useLive2dAvatar()
 * await avatar.start({ canvas, modelId: 'Haru', presentation: 'stage' })
 * await avatar.speak('欢迎来到灵山胜境')
 */
export function useLive2dAvatar() {
  const status = ref<AvatarStatus>('idle')
  const errorMessage = ref('')
  // 与讯飞对齐：浏览器自动播放策略会挂起 AudioContext，需用户手势恢复
  const audioReady = ref(false)

  let currentVcn = ''
  let currentSpeechRate = 1
  let doneTimer: number | null = null
  let initialized = false
  let speechGeneration = 0
  let runtimeGeneration = 0
  let cancelReadyWait: (() => void) | null = null
  const runtimeOwner = Object.freeze({})

  /**
   * @description Live2D 属于本地资源，无需云端凭证
   */
  const hasCredentials = true

  /**
   * @description 串行释放旧运行时、加载核心脚本与指定模型，并绑定当前画布。
   * @param {Live2dStartOptions} options Live2D 启动参数。
   * @returns {Promise<boolean>} 初始化完成且模型就绪时返回 true；被取消或初始化失败时返回 false。
   */
  async function start(options: Live2dStartOptions): Promise<boolean> {
    const generation = ++runtimeGeneration
    cancelReadyWait?.()
    status.value = 'connecting'
    errorMessage.value = ''
    currentVcn = options.vcn || ''
    currentSpeechRate = Number.isFinite(options.speechRate) ? Number(options.speechRate) : 1

    return enqueueRuntimeOperation(async () => {
      if (generation !== runtimeGeneration) return false

      // Live2D's Cubism framework is process-global. Always complete the previous
      // teardown before claiming it for a new component/canvas.
      releaseSharedRuntime()
      activeRuntimeOwner = runtimeOwner
      initialized = false

      try {
        await loadCubismCore()
        try {
          await loadMotionSyncCore()
          if (!(await prepareOfficialMotionSync())) {
            throw new Error('Live2D MotionSync Framework 初始化失败')
          }
        } catch (motionSyncError) {
          console.warn(
            '[Live2D] Official MotionSync is unavailable; using audio analysis fallback.',
            motionSyncError
          )
        }
        if (generation !== runtimeGeneration) {
          releaseOwnedRuntime()
          return false
        }

        if (!options.canvas.isConnected) throw new Error('Live2D 画布未就绪')
        const delegate = LAppDelegate.getInstance()
        if (delegate.initialize(options.canvas) === false) {
          throw new Error('Live2D 初始化失败（WebGL 不可用？）')
        }
        initialized = true
        delegate.run()

        // 加载模型
        const model = options.modelId || 'Haru'
        const link = `${BASE}live2d/characters/${model}/${model}.model3.json`.replace(
          /([^:])\/{2,}/g,
          '$1/'
        )
        const resource = {
          resource_id: model,
          name: model,
          link,
          viewTransform: resolveViewTransform(model, options.presentation || 'stage')
        }
        const manager = Live2dManager.getInstance()
        let ready = false
        let loadError = ''
        for (let attempt = 0; attempt < 2; attempt += 1) {
          manager.changeCharacter(resource)
          ready = await waitReady(generation, 10000)
          if (generation !== runtimeGeneration) {
            releaseOwnedRuntime()
            return false
          }
          if (ready) break
          loadError = manager.getModelLoadError() || ''
          if (attempt === 0) await waitForRetry(generation, 180)
        }
        if (!ready) throw new Error(loadError || `Live2D 模型 ${model} 加载超时`)

        status.value = 'ready'
        audioReady.value = manager.isAudioReady()
        return true
      } catch (err) {
        releaseOwnedRuntime()
        if (generation !== runtimeGeneration) return false
        status.value = 'error'
        errorMessage.value = normalizeError(err)
        return false
      }
    })
  }

  /**
   * @description 轮询当前运行时的模型就绪或失败状态，并在批次失效或超时后停止等待。
   * @param {number} generation 当前模型加载批次编号。
   * @param {number} [timeoutMs=15000] 最长等待毫秒数。
   * @returns {Promise<boolean>} 模型就绪时返回 true；取消、失败或超时时返回 false。
   */
  function waitReady(generation: number, timeoutMs = 15000): Promise<boolean> {
    cancelReadyWait?.()
    return new Promise((resolve) => {
      const started = Date.now()
      let timer: number | null = null
      let settled = false
      const finish = (result: boolean) => {
        if (settled) return
        settled = true
        if (timer != null) window.clearTimeout(timer)
        if (cancelReadyWait === cancel) cancelReadyWait = null
        resolve(result)
      }
      const cancel = () => finish(false)
      cancelReadyWait = cancel
      const check = () => {
        if (generation !== runtimeGeneration) return finish(false)
        const manager = Live2dManager.getInstance()
        if (manager.isReady()) return finish(true)
        if (manager.getModelLoadError()) return finish(false)
        if (Date.now() - started > timeoutMs) return finish(false)
        timer = window.setTimeout(check, 200)
      }
      check()
    })
  }

  /**
   * @description 在模型加载重试前等待指定时长，并验证当前加载批次仍然有效。
   * @param {number} generation 当前模型加载批次编号。
   * @param {number} delayMs 重试前等待的毫秒数。
   * @returns {Promise<void>} 等待结束且批次仍有效时完成的 Promise。
   * @throws {Error} 等待期间模型加载批次被取消时抛出异常。
   */
  async function waitForRetry(generation: number, delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
    if (generation !== runtimeGeneration) throw new Error('Live2D 模型加载已取消')
  }

  /**
   * @description 调用后端 TTS 获取文本音频，将有效音频批量入队并驱动 Live2D 口型。
   * @param {string} text 待播报文本；空白文本不会下发。
   * @param {{ emotion?: string }} [opts={}] 播报扩展参数；当前仅为与云端数字人保持调用接口一致。
   * @returns {Promise<boolean>} 音频成功入队时返回 true；状态不可用、请求失败或无有效音频时返回 false。
   */
  async function speak(text: string, opts: { emotion?: string } = {}): Promise<boolean> {
    void opts
    const content = String(text || '').trim()
    if (
      !content ||
      !hasRuntimeOwnership() ||
      ['error', 'idle', 'connecting'].includes(status.value)
    )
      return false
    const generation = ++speechGeneration
    stopPlayback()
    try {
      await resumeAudioContext()
      if (generation !== speechGeneration) return false
      const result = await synthesizeSpeech({
        text: content,
        voice: currentVcn,
        speed: currentSpeechRate
      })
      if (generation !== speechGeneration) return false
      const urls = (result.segments || []).map((s) => s.audioUrl).filter(Boolean)
      if (!urls.length && result.audioUrl) urls.push(result.audioUrl)
      if (!urls.length) return false

      const buffers = (await Promise.all(urls.map(fetchAudio))).filter(
        (buffer): buffer is ArrayBuffer => Boolean(buffer)
      )
      if (generation !== speechGeneration || !buffers.length) return false
      const queued = await Live2dManager.getInstance().enqueueAudioBatch(buffers)
      if (generation !== speechGeneration || queued === 0) return false
      status.value = 'speaking'
      watchSpeakingEnd()
      return true
    } catch (err) {
      errorMessage.value = normalizeError(err)
      return false
    }
  }

  /**
   * @description 获取指定音频资源并直接加入本地播放队列，用于驱动 Live2D 口型。
   * @param {string} url 可访问的音频资源地址。
   * @returns {Promise<boolean>} 音频成功入队时返回 true；地址无效、状态不可用或下载失败时返回 false。
   * @throws {Error} 音频管理器入队失败时透传异常。
   */
  async function speakAudio(url: string): Promise<boolean> {
    if (!url || !hasRuntimeOwnership() || ['error', 'idle', 'connecting'].includes(status.value))
      return false
    const generation = ++speechGeneration
    stopPlayback()
    await resumeAudioContext()
    if (generation !== speechGeneration) return false
    const buffer = await fetchAudio(url)
    if (!buffer || generation !== speechGeneration) return false
    const queued = await Live2dManager.getInstance().enqueueAudioBatch([buffer])
    if (generation !== speechGeneration || queued === 0) return false
    status.value = 'speaking'
    watchSpeakingEnd()
    return true
  }

  /**
   * @description 下载音频资源并读取为可加入 Live2D 播放队列的二进制缓冲区。
   * @param {string} url 待下载的音频资源地址。
   * @returns {Promise<ArrayBuffer | null>} 下载成功时返回音频缓冲区；请求失败时返回 null。
   */
  async function fetchAudio(url: string): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.arrayBuffer()
    } catch {
      return null
    }
  }

  /**
   * @description 轮询音频播放队列，并在全部音频结束后恢复数字人就绪状态。
   * @returns {void} 无返回值。
   */
  function watchSpeakingEnd() {
    if (doneTimer) window.clearInterval(doneTimer)
    doneTimer = window.setInterval(() => {
      if (!hasRuntimeOwnership()) {
        if (doneTimer) window.clearInterval(doneTimer)
        doneTimer = null
        return
      }
      const mgr = Live2dManager.getInstance()
      if (!mgr.isAudioPlaying() && !mgr.hasQueuedAudio()) {
        if (status.value === 'speaking') status.value = 'ready'
        if (doneTimer) window.clearInterval(doneTimer)
        doneTimer = null
      }
    }, 250)
  }

  /**
   * @description 在用户手势回调中恢复当前 Live2D 音频上下文。
   * @returns {Promise<void>} 音频恢复流程完成后的 Promise。
   */
  async function enableAudio(): Promise<void> {
    if (!hasRuntimeOwnership()) return
    await resumeAudioContext()
  }

  /**
   * @description 暂停当前 Live2D 音频，并保留播放位置与队列状态。
   * @returns {Promise<void>} 暂停操作完成后的 Promise；当前实例不持有运行时时直接完成。
   * @throws {Error} 音频管理器暂停失败时透传异常。
   */
  async function pause(): Promise<void> {
    if (!hasRuntimeOwnership()) return
    await Live2dManager.getInstance().pauseAudio()
  }

  /**
   * @description 恢复已暂停的 Live2D 音频上下文并继续播放。
   * @returns {Promise<void>} 恢复尝试完成后的 Promise。
   */
  async function resume(): Promise<void> {
    if (!hasRuntimeOwnership()) return
    await resumeAudioContext()
  }

  /**
   * @description 清空当前 Live2D 音频及待播放队列，并将播报状态恢复为就绪。
   * @returns {Promise<void>} 打断操作完成后的 Promise。
   */
  async function interrupt(): Promise<void> {
    speechGeneration += 1
    stopPlayback()
    if (status.value === 'speaking') status.value = 'ready'
  }

  /**
   * @description 停止当前 Live2D 音频和待播放队列，并清理播报完成轮询器。
   * @returns {void} 无返回值。
   */
  function stopPlayback(): void {
    if (hasRuntimeOwnership()) Live2dManager.getInstance().stopAudio()
    if (doneTimer) {
      window.clearInterval(doneTimer)
      doneTimer = null
    }
    if (status.value === 'speaking') status.value = 'ready'
  }

  /**
   * @description 尝试恢复当前运行时的音频上下文，并同步更新音频可用状态。
   * @returns {Promise<void>} 音频上下文恢复尝试结束后的 Promise。
   */
  async function resumeAudioContext(): Promise<void> {
    if (!hasRuntimeOwnership()) return
    try {
      const manager = Live2dManager.getInstance()
      await manager.resume()
      audioReady.value = manager.isAudioReady()
    } catch {
      audioReady.value = false
    }
  }

  /**
   * @description 取消模型加载与播报任务，异步释放当前实例持有的共享运行时。
   * @returns {void} 无返回值。
   */
  function destroy(): void {
    runtimeGeneration += 1
    speechGeneration += 1
    cancelReadyWait?.()
    if (doneTimer) {
      window.clearInterval(doneTimer)
      doneTimer = null
    }
    initialized = false
    void enqueueRuntimeOperation(async () => {
      releaseOwnedRuntime()
    })
    status.value = 'idle'
    audioReady.value = false
  }

  /**
   * @description 判断当前组合式函数实例是否持有全局 Live2D 运行时。
   * @returns {boolean} 当前实例拥有运行时所有权时返回 true。
   */
  function hasRuntimeOwnership(): boolean {
    return activeRuntimeOwner === runtimeOwner
  }

  /**
   * @description 仅在当前实例持有运行时时释放共享资源并清除所有权。
   * @returns {void} 无返回值。
   */
  function releaseOwnedRuntime(): void {
    if (!hasRuntimeOwnership()) {
      initialized = false
      return
    }
    releaseSharedRuntime()
    activeRuntimeOwner = null
    initialized = false
  }

  /**
   * @description 在窗口尺寸变化时通知自动画布模式重新计算渲染尺寸。
   * @returns {void} 无返回值。
   */
  function onResize(): void {
    if (initialized && hasRuntimeOwnership() && LAppDefine.CanvasSize === 'auto') {
      LAppDelegate.getInstance().onResize()
    }
  }

  return {
    status,
    errorMessage,
    audioReady,
    hasCredentials,
    start,
    speak,
    speakAudio,
    enableAudio,
    pause,
    resume,
    interrupt,
    destroy,
    onResize
  }
}

/**
 * @description 根据模型和展示场景解析地图头像所需的取景变换。
 * @param {string} modelId Live2D 模型目录名。
 * @param {Live2dPresentation} presentation 展示场景；舞台模式不应用额外变换。
 * @returns {Live2dViewTransform | undefined} 内置或默认头像变换；舞台模式返回 undefined。
 * @example
 * const transform = resolveViewTransform('Haru', 'portrait')
 */
export function resolveViewTransform(
  modelId: string,
  presentation: Live2dPresentation
): Live2dViewTransform | undefined {
  if (presentation === 'stage') return undefined

  return isBundledLive2dModel(modelId)
    ? LIVE2D_PORTRAIT_PROFILES[modelId]
    : { scale: 2.2, offsetX: 0, offsetY: -0.32 }
}

/**
 * @description 将未知 Live2D 异常规范化为可直接展示的中文错误文本。
 * @param {unknown} err 原始异常值。
 * @returns {string} 解析后的异常消息或默认提示。
 */
function normalizeError(err: unknown): string {
  if (!err) return 'Live2D 数字人异常'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string }
  return anyErr.message || 'Live2D 数字人异常'
}
