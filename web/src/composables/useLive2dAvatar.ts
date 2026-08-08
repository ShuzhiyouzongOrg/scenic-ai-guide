/**
 * Live2D 数字人封装（讯飞云端数字人的本地兜底方案）。
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

export type AvatarStatus = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'

export interface Live2dStartOptions {
  /** Live2D 模型（角色目录名，如 Haru），来自后台数字人配置 */
  modelId?: string
  /** 口型驱动用的 TTS 音色（vcn），来自后台数字人配置 */
  vcn?: string
  /** TTS 语速 */
  speechRate?: number
  /** 当前组件的真实渲染画布，避免全局 id 在切换时取错实例 */
  canvas: HTMLCanvasElement
  /** 舞台全身或地图头像取景。 */
  presentation?: Live2dPresentation
}

const BASE = (import.meta.env.VITE_BASE_URL as string) || '/'
const CORE_SCRIPT = `${BASE}live2d/core/live2dcubismcore.min.js`.replace(/\/{2,}/g, '/')
const MOTION_SYNC_CORE_SCRIPT =
  `${BASE}live2d/motionsync/core/live2dcubismmotionsynccore.min.js`.replace(/\/{2,}/g, '/')

/** 只加载一次 Cubism 核心运行时（挂到 window.Live2DCubismCore 全局） */
let corePromise: Promise<void> | null = null
let motionSyncCorePromise: Promise<void> | null = null
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

/** Loads the licensed CRI phoneme runtime once; model playback can fall back if it fails. */
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

  /** Live2D 属于本地资源，无需云端凭证 */
  const hasCredentials = true

  async function start(options: Live2dStartOptions): Promise<boolean> {
    const generation = ++runtimeGeneration
    cancelReadyWait?.()
    if (initialized) {
      releaseRuntime()
      Live2dManager.releaseInstance()
    }
    try {
      status.value = 'connecting'
      errorMessage.value = ''
      currentVcn = options.vcn || ''
      currentSpeechRate = Number.isFinite(options.speechRate) ? Number(options.speechRate) : 1

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
      if (generation !== runtimeGeneration) return false

      if (!options.canvas.isConnected) throw new Error('Live2D 画布未就绪')
      const delegate = LAppDelegate.getInstance()
      initialized = true
      if (delegate.initialize(options.canvas) === false) {
        throw new Error('Live2D 初始化失败（WebGL 不可用？）')
      }
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
        if (generation !== runtimeGeneration) return false
        if (ready) break
        loadError = manager.getModelLoadError() || ''
        if (attempt === 0) await waitForRetry(generation, 180)
      }
      if (!ready) throw new Error(loadError || `Live2D 模型 ${model} 加载超时`)

      status.value = 'ready'
      audioReady.value = Live2dManager.getInstance().isAudioReady()
      return true
    } catch (err) {
      if (generation !== runtimeGeneration) return false
      releaseRuntime()
      Live2dManager.releaseInstance()
      status.value = 'error'
      errorMessage.value = normalizeError(err)
      return false
    }
  }

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

  async function waitForRetry(generation: number, delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
    if (generation !== runtimeGeneration) throw new Error('Live2D 模型加载已取消')
  }

  /** 驱动数字人说话：后端 TTS 取音频 -> 入队 -> AnalyserNode 驱动口型 */
  async function speak(text: string, opts: { emotion?: string } = {}): Promise<boolean> {
    void opts
    const content = String(text || '').trim()
    if (!content || ['error', 'idle', 'connecting'].includes(status.value)) return false
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

  async function speakAudio(url: string): Promise<boolean> {
    if (!url || ['error', 'idle', 'connecting'].includes(status.value)) return false
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

  async function fetchAudio(url: string): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.arrayBuffer()
    } catch {
      return null
    }
  }

  // 队列播完且没有正在播放的音频时，回到 ready 状态
  function watchSpeakingEnd() {
    if (doneTimer) window.clearInterval(doneTimer)
    doneTimer = window.setInterval(() => {
      const mgr = Live2dManager.getInstance()
      if (!mgr.isAudioPlaying() && !mgr.hasQueuedAudio()) {
        if (status.value === 'speaking') status.value = 'ready'
        if (doneTimer) window.clearInterval(doneTimer)
        doneTimer = null
      }
    }, 250)
  }

  /** 用户手势中恢复音频上下文 */
  async function enableAudio(): Promise<void> {
    await resumeAudioContext()
  }

  async function pause(): Promise<void> {
    await Live2dManager.getInstance().pauseAudio()
  }

  async function resume(): Promise<void> {
    await resumeAudioContext()
  }

  /** 打断当前播报 */
  async function interrupt(): Promise<void> {
    speechGeneration += 1
    stopPlayback()
    if (status.value === 'speaking') status.value = 'ready'
  }

  function stopPlayback(): void {
    Live2dManager.getInstance().stopAudio()
    if (doneTimer) {
      window.clearInterval(doneTimer)
      doneTimer = null
    }
    if (status.value === 'speaking') status.value = 'ready'
  }

  async function resumeAudioContext(): Promise<void> {
    try {
      const manager = Live2dManager.getInstance()
      await manager.resume()
      audioReady.value = manager.isAudioReady()
    } catch {
      audioReady.value = false
    }
  }

  function destroy(): void {
    runtimeGeneration += 1
    speechGeneration += 1
    cancelReadyWait?.()
    if (doneTimer) {
      window.clearInterval(doneTimer)
      doneTimer = null
    }
    releaseRuntime()
    Live2dManager.releaseInstance()
    status.value = 'idle'
    audioReady.value = false
  }

  function releaseRuntime(): void {
    if (!initialized) return
    try {
      LAppDelegate.releaseInstance()
    } catch {
      /* ignore */
    }
    initialized = false
  }

  // 供组件在 window resize 时调用（画布自适应）
  function onResize(): void {
    if (initialized && LAppDefine.CanvasSize === 'auto') {
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

export function resolveViewTransform(
  modelId: string,
  presentation: Live2dPresentation
): Live2dViewTransform | undefined {
  if (presentation === 'stage') return undefined

  return isBundledLive2dModel(modelId)
    ? LIVE2D_PORTRAIT_PROFILES[modelId]
    : { scale: 2.2, offsetX: 0, offsetY: -0.32 }
}

function normalizeError(err: unknown): string {
  if (!err) return 'Live2D 数字人异常'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string }
  return anyErr.message || 'Live2D 数字人异常'
}
