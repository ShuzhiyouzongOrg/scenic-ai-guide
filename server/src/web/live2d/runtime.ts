import { Live2dManager } from '../../../../web/src/lib/live2d/live2dManager'
import { LAppDelegate } from '../../../../web/src/lib/live2d/src/lappdelegate'
import type { ResourceModel } from '../../../../web/src/lib/live2d/resource'

declare global {
  interface Window {
    scenicLive2dInterrupt?: () => void
    scenicLive2dPing?: () => void
    scenicLive2dSpeak?: (audioUrls: string[] | string) => Promise<boolean>
  }
}

const SUPPORTED_MODELS = ['Haru', 'Hiyori', 'Kei', 'Hibiki'] as const
type SupportedModel = (typeof SUPPORTED_MODELS)[number]

const MODEL_PROFILES: Record<SupportedModel, ResourceModel['viewTransform']> = {
  Haru: { scale: 1.48, offsetX: 0, offsetY: -0.18 },
  Hiyori: { scale: 1.58, offsetX: 0, offsetY: -0.22 },
  Kei: { scale: 0.92, offsetX: 0, offsetY: 0 },
  Hibiki: { scale: 1.52, offsetX: 0, offsetY: -0.2 }
}

const loading = document.getElementById('loading') as HTMLDivElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const audioUnlock = document.getElementById('audio-unlock') as HTMLButtonElement
const canvas = document.getElementById('live2dCanvas') as HTMLCanvasElement
const params = new URLSearchParams(window.location.search)
const requestedModel = params.get('model') || 'Haru'
const model = SUPPORTED_MODELS.includes(requestedModel as SupportedModel)
  ? (requestedModel as SupportedModel)
  : 'Haru'

let playbackGeneration = 0
let destroyed = false

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

function setStatus(message: string, isError = false): void {
  statusText.textContent = message
  statusText.style.color = isError ? '#b84545' : '#667b92'
  loading.hidden = false
}

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

async function fetchAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error(`Audio request failed (${response.status}).`)
  return response.arrayBuffer()
}

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

function monitorPlayback(manager: Live2dManager, generation: number): void {
  if (destroyed || generation !== playbackGeneration) return
  if (!manager.isAudioPlaying() && !manager.hasQueuedAudio()) {
    post('idle', { model })
    return
  }
  window.setTimeout(() => monitorPlayback(manager, generation), 120)
}

function interrupt(): void {
  playbackGeneration += 1
  Live2dManager.getInstance().stopAudio()
  post('idle', { model, interrupted: true })
}

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
