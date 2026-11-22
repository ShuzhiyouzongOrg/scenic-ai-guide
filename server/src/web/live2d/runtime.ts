/**
 * @fileoverview 本地 Live2D 浏览器运行时入口，负责模型选择、渲染启动、音频队列和宿主状态通信。
 * @description 负责模型选择、渲染启动、音频队列控制以及与宿主页面之间的状态通信。
 *
 * 此文件是 `runtime.js` 浏览器构建产物的自有 TypeScript 源文件。
 */
import { Live2dManager } from '../../../../web/src/lib/live2d/live2dManager'
import { LAppDelegate } from '../../../../web/src/lib/live2d/src/lappdelegate'
import type { ResourceModel } from '../../../../web/src/lib/live2d/resource'

declare global {
  /**
   * @description 嵌入宿主可调用的 Live2D 运行时桥接方法。
   * @interface
   * @property {() => void} [scenicLive2dInterrupt] 中断当前语音并清空播放队列。
   * @property {() => void} [scenicLive2dPing] 向宿主报告当前模型和播放状态。
   * @property {(audioUrls: string[] | string) => Promise<boolean>} [scenicLive2dSpeak] 下载并播放一个或多个合成音频。
   */
  interface Window {
    scenicStage: {text: (key: string) => string, locale: string}
    /**
     * @description 中断当前 Live2D 语音并清空音频队列。
     */
    scenicLive2dInterrupt?: () => void
    /**
     * @description 向嵌入宿主报告模型、就绪和播放状态。
     */
    scenicLive2dPing?: () => void
    /**
     * @description 下载一个或多个后端合成音频并依次播放。
     */
    scenicLive2dSpeak?: (audioUrls: string[] | string, requestId?: number) => Promise<boolean>
  }
}

/**
 * @description 可从本地资源目录加载的模型 ID。
 * @type {readonly ["Haru", "Hiyori", "Kei", "Hibiki"]}
 */
const SUPPORTED_MODELS = ['Haru', 'Hiyori', 'Kei', 'Hibiki'] as const
/**
 * @description 支持的本地 Live2D 模型 ID。
 * @typedef {"Haru"|"Hiyori"|"Kei"|"Hibiki"} SupportedModel
 */
type SupportedModel = (typeof SUPPORTED_MODELS)[number]

/**
 * @description 各模型在固定画布中的缩放和偏移校准值。
 * @type {Record<SupportedModel, ResourceModel['viewTransform']>}
 */
const MODEL_PROFILES: Record<SupportedModel, ResourceModel['viewTransform']> = {
  Haru: { scale: 1.48, offsetX: 0, offsetY: -0.18 },
  Hiyori: { scale: 1.58, offsetX: 0, offsetY: -0.22 },
  Kei: { scale: 0.92, offsetX: 0, offsetY: 0 },
  Hibiki: { scale: 1.52, offsetX: 0, offsetY: -0.2 }
}

/**
 * @description 加载遮罩元素。
 * @type {HTMLDivElement}
 */
const loading = document.getElementById('loading') as HTMLDivElement
/**
 * @description 运行状态文本元素。
 * @type {HTMLSpanElement}
 */
const statusText = document.getElementById('status-text') as HTMLSpanElement
/**
 * @description 浏览器音频解锁按钮。
 * @type {HTMLButtonElement}
 */
const audioUnlock = document.getElementById('audio-unlock') as HTMLButtonElement
/**
 * @description Live2D WebGL 渲染画布。
 * @type {HTMLCanvasElement}
 */
const canvas = document.getElementById('live2dCanvas') as HTMLCanvasElement
/**
 * @description 当前页面查询参数。
 * @type {URLSearchParams}
 */
const params = new URLSearchParams(window.location.search)
/**
 * @description URL 请求的模型 ID，缺省为 Haru。
 * @type {string}
 */
const requestedModel = params.get('model') || 'Haru'
/**
 * @description 校验后的实际模型 ID。
 * @type {SupportedModel}
 */
const model = SUPPORTED_MODELS.includes(requestedModel as SupportedModel)
  ? (requestedModel as SupportedModel)
  : 'Haru'

/**
 * @description 每次播放或中断递增的世代号，用于取消过期异步任务。
 * @type {number}
 */
let playbackGeneration = 0
/**
 * @description 页面是否已进入销毁阶段。
 * @type {boolean}
 */
let destroyed = false
let modelManager: Live2dManager | null = null
let modelError: string | null = null

type StageBridge = { postMessage: (message: { data: Record<string, unknown> }) => void }
const bridgeWindow = window as Window & { uni?: Partial<StageBridge> & { webView?: StageBridge } }

/**
 * @description 通过 uni-app 桥和同源父窗口报告 Live2D 状态事件。
 * @param {string} type 事件类型。
 * @param {Record<string, unknown>} [detail={}] 附加状态字段。
 * @returns {void} 无返回值。
 */
function post(type: string, detail: Record<string, unknown> = {}): void {
  const packet = { source: 'scenic-live2d', speechProtocol: 2, type, ...detail }
  try {
    if (window.parent !== window) {
      window.parent.postMessage(packet, window.location.origin)
    } else {
      const bridge = bridgeWindow.uni?.webView ?? bridgeWindow.uni
      bridge?.postMessage?.({ data: packet })
    }
  } catch {
    // The native host may have already released this document.
  }
}

function reportModelState(): void {
  if (destroyed) return
  if (modelError !== null) {
    post('error', { model, message: modelError })
    return
  }
  post('runtime-state', {
    model, realModel: true, ready: modelManager?.isReady() ?? false,
    speaking: modelManager?.isAudioPlaying() ?? false
  })
}

function connectAppBridge(): void {
  if (window.parent !== window || params.get('embed') !== '1') return
  document.addEventListener('UniAppJSBridgeReady', reportModelState)
  if (bridgeWindow.uni?.webView?.postMessage) return
  const script = document.createElement('script')
  script.src = './vendor/dcloud/uni.webview.1.5.8.js'
  // A dynamically loaded SDK can arrive after DOMContentLoaded.
  script.addEventListener('load', reportModelState)
  document.head.appendChild(script)
}

function reportModelError(status: string, message: string): void {
  modelError = message
  setStatus(status, true)
  reportModelState()
}

/**
 * @description 更新运行状态文本，并确保加载遮罩可见。
 * @param {string} message 用户可读状态。
 * @param {boolean} [isError=false] 是否使用错误颜色。
 * @returns {void} 无返回值。
 */
function setStatus(message: string, isError = false): void {
  statusText.textContent = window.scenicStage.text(message)
  statusText.classList.toggle('error', isError)
  loading.hidden = false
}

/**
 * @description 生成本地模型 JSON URL 和对应视图变换。
 * @param {SupportedModel} modelName 受支持模型 ID。
 * @returns {ResourceModel} Live2D 管理器可加载的资源描述。
 */
function modelResource(modelName: SupportedModel): ResourceModel {
  const modelUrl = new URL(
    `./characters/${encodeURIComponent(modelName)}/${encodeURIComponent(modelName)}.model3.json`,
    window.location.href
  ).href
  return {
    resource_id: `visitor-live2d-${modelName.toLowerCase()}`,
    name: modelName,
    link: modelUrl,
    viewTransform: MODEL_PROFILES[modelName]
  }
}

/**
 * @description 轮询模型加载状态，成功、失败或 20 秒超时后通知宿主。
 * @param {Live2dManager} manager Live2D 管理器。
 * @param {number} [attempts=0] 已轮询次数。
 * @returns {void} 无返回值。
 */
function waitForModel(manager: Live2dManager, attempts = 0): void {
  if (destroyed) return
  const error = manager.getModelLoadError()
  if (error) {
    reportModelError('Live2D 模型加载失败', error)
    return
  }
  if (manager.isReady()) {
    loading.hidden = true
    post('ready', { model, realModel: true })
    return
  }
  if (attempts >= 200) {
    reportModelError('Live2D 模型加载超时', 'Live2D model loading timed out.')
    return
  }
  window.setTimeout(() => waitForModel(manager, attempts + 1), 100)
}

/**
 * @description 以无凭据、禁用缓存方式下载音频。
 * @param {string} url 后端音频 URL。
 * @returns {Promise<ArrayBuffer>} 音频二进制。
 * @throws {Error} HTTP 状态非成功时抛出。
 */
async function fetchAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error(`Audio request failed (${response.status}).`)
  return response.arrayBuffer()
}

/**
 * @description 下载并解码一个或多个音频片段，清空旧播放后按顺序加入 Live2D 音频队列。
 * 错误会转换为宿主 `audio-blocked` 事件，不向调用方抛出。
 * @param {string[]|string} audioUrls 音频 URL 或 URL 数组。
 * @returns {Promise<boolean>} 成功加入至少一个音频片段时为 `true`。
 * @example
 * await window.scenicLive2dSpeak?.(['/api/voice/tts/audio/segment-1'])
 */
async function speak(audioUrls: string[] | string, requestId = 0): Promise<boolean> {
  const urls = (Array.isArray(audioUrls) ? audioUrls : [audioUrls]).filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  )
  if (!urls.length) return false

  const generation = ++playbackGeneration
  const manager = Live2dManager.getInstance()
  manager.stopAudio()
  try {
    await manager.resume()
    const audioBuffers = await Promise.all(urls.map(fetchAudio))
    if (generation !== playbackGeneration || destroyed) return false
    const queued = await manager.enqueueAudioBatch(audioBuffers)
    if (!queued || !manager.isAudioPlaying()) throw new Error('The supplied audio did not start playing.')
    audioUnlock.hidden = true
    if (generation !== playbackGeneration || destroyed) return false
    post('speaking', { model, segments: queued, requestId })
    monitorPlayback(manager, generation, requestId)
    return true
  } catch (error) {
    if (generation !== playbackGeneration || destroyed) return false
    const message = error instanceof Error ? error.message : 'Live2D audio playback failed.'
    audioUnlock.hidden = false
    post('audio-blocked', { message, model, requestId })
    return false
  }
}

/**
 * @description 轮询当前播放世代，在音频播放及队列均结束时报告空闲。
 * @param {Live2dManager} manager Live2D 管理器。
 * @param {number} generation 播放任务世代号。
 * @returns {void} 无返回值。
 */
function monitorPlayback(manager: Live2dManager, generation: number, requestId: number): void {
  if (destroyed || generation !== playbackGeneration) return
  if (!manager.isAudioPlaying() && !manager.hasQueuedAudio()) {
    post('idle', { model, requestId })
    return
  }
  const meter = manager.getPlaybackMeter()
  if (meter.level >= 0) post('level', { ...meter, requestId })
  window.setTimeout(() => monitorPlayback(manager, generation, requestId), 120)
}

/**
 * @description 使当前异步播放任务失效、停止音频并通知宿主。
 * @returns {void} 无返回值。
 * @example
 * window.scenicLive2dInterrupt?.()
 */
function interrupt(): void {
  playbackGeneration += 1
  Live2dManager.getInstance().stopAudio()
  post('idle', { model, interrupted: true })
}

/**
 * @description 校验 Cubism Core 和画布，初始化渲染器并加载请求模型。
 * 初始化错误会显示并发送给宿主，不向外抛出。
 * @returns {void} 无返回值。
 */
function start(): void {
  if (!canvas || !window.Live2DCubismCore) {
    reportModelError('当前 WebView 不支持 Live2D Cubism Core', 'Live2D Cubism Core is unavailable.')
    return
  }
  try {
    const delegate = LAppDelegate.getInstance()
    if (!delegate.initialize(canvas)) throw new Error('Live2D renderer initialization failed.')
    delegate.run()
    const manager = Live2dManager.getInstance()
    modelManager = manager
    manager.changeCharacter(modelResource(model))
    waitForModel(manager)
    post('page-loaded', { model, realModel: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live2D initialization failed.'
    reportModelError('Live2D 初始化失败', message)
  }
}

audioUnlock.addEventListener('click', async () => {
  try {
    await Live2dManager.getInstance().resume()
    audioUnlock.hidden = true
    post('audio-ready', { model })
  } catch {
    audioUnlock.hidden = false
  }
})

window.scenicLive2dSpeak = speak
window.scenicLive2dInterrupt = interrupt
window.scenicLive2dPing = reportModelState

window.addEventListener('beforeunload', () => {
  destroyed = true
  document.removeEventListener('UniAppJSBridgeReady', reportModelState)
  ++playbackGeneration
  modelManager?.stopAudio()
  LAppDelegate.releaseInstance()
  Live2dManager.releaseInstance()
})

connectAppBridge()
start()
