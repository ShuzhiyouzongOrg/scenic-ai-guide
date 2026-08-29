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
    scenicLive2dSpeak?: (audioUrls: string[] | string) => Promise<boolean>
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

/**
 * @description 通过 uni-app 桥和同源父窗口报告 Live2D 状态事件。
 * @param {string} type 事件类型。
 * @param {Record<string, unknown>} [detail={}] 附加状态字段。
 * @returns {void} 无返回值。
 */
function post(type: string, detail: Record<string, unknown> = {}): void {
  const packet = { source: 'scenic-live2d', type, ...detail }
  try {
    const uniBridge = (window as unknown as {
      uni?: { postMessage?: (value: { data: typeof packet }) => void }
    }).uni
    uniBridge?.postMessage?.({ data: packet })
  } catch {
    // The uni bridge is not present in an ordinary browser preview.
  }
  try {
    window.parent?.postMessage(packet, window.location.origin)
  } catch {
    // Cross-frame messaging is optional for the standalone preview.
  }
}

/**
 * @description 更新运行状态文本，并确保加载遮罩可见。
 * @param {string} message 用户可读状态。
 * @param {boolean} [isError=false] 是否使用错误颜色。
 * @returns {void} 无返回值。
 */
function setStatus(message: string, isError = false): void {
  statusText.textContent = message
  statusText.style.color = isError ? '#b84545' : '#667b92'
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
    setStatus('Live2D 模型加载失败', true)
    post('error', { message: error, model })
    return
  }
  if (manager.isReady()) {
    loading.hidden = true
    post('ready', { model, realModel: true })
    return
  }
  if (attempts >= 200) {
    setStatus('Live2D 模型加载超时', true)
    post('error', { message: 'Live2D model loading timed out.', model })
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
async function speak(audioUrls: string[] | string): Promise<boolean> {
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
    if (!queued) throw new Error('The supplied audio could not be decoded.')
    audioUnlock.hidden = true
    post('speaking', { model, segments: queued })
    monitorPlayback(manager, generation)
    return true
  } catch (error) {
    if (generation !== playbackGeneration || destroyed) return false
    const message = error instanceof Error ? error.message : 'Live2D audio playback failed.'
    audioUnlock.hidden = false
    post('audio-blocked', { message, model })
    return false
  }
}

/**
 * @description 轮询当前播放世代，在音频播放及队列均结束时报告空闲。
 * @param {Live2dManager} manager Live2D 管理器。
 * @param {number} generation 播放任务世代号。
 * @returns {void} 无返回值。
 */
function monitorPlayback(manager: Live2dManager, generation: number): void {
  if (destroyed || generation !== playbackGeneration) return
  if (!manager.isAudioPlaying() && !manager.hasQueuedAudio()) {
    post('idle', { model })
    return
  }
  window.setTimeout(() => monitorPlayback(manager, generation), 120)
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
    setStatus('当前 WebView 不支持 Live2D Cubism Core', true)
    post('error', { message: 'Live2D Cubism Core is unavailable.', model })
    return
  }
  try {
    const delegate = LAppDelegate.getInstance()
    if (!delegate.initialize(canvas)) throw new Error('Live2D renderer initialization failed.')
    delegate.run()
    const manager = Live2dManager.getInstance()
    manager.changeCharacter(modelResource(model))
    waitForModel(manager)
    post('page-loaded', { model, realModel: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live2D initialization failed.'
    setStatus('Live2D 初始化失败', true)
    post('error', { message, model })
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
window.scenicLive2dPing = () => post('runtime-state', {
  model,
  ready: Live2dManager.getInstance().isReady(),
  speaking: Live2dManager.getInstance().isAudioPlaying(),
  realModel: true
})

window.addEventListener('beforeunload', () => {
  destroyed = true
  interrupt()
  LAppDelegate.releaseInstance()
  Live2dManager.releaseInstance()
})

start()
