const API_ROOT = 'https://api.shuzhiyouzong.cn/live2d/'
const SUPPORTED_MODELS = ['Haru', 'Hiyori', 'Kei', 'Hibiki']

let activeOwner = null
let activeCanvas = null
let onPacket = null
let syntheticSpeaking = false
let phase = 0
let runtimeStarted = false
let runtimeDisposed = false

const documentListeners = Object.create(null)
const windowListeners = Object.create(null)

function normalizeModel(model) {
  return SUPPORTED_MODELS.indexOf(model) >= 0 ? model : 'Haru'
}

function resolveUrl(input, base) {
  const value = String(input || '')
  if (/^https?:\/\//i.test(value)) return value
  const origin = /^https?:\/\/[^/]+/i.exec(base || API_ROOT)
  if (value.charAt(0) === '/') return (origin ? origin[0] : '') + value
  const cleanBase = String(base || API_ROOT).split('#')[0].split('?')[0]
  const directory = cleanBase.endsWith('/')
    ? cleanBase
    : cleanBase.slice(0, cleanBase.lastIndexOf('/') + 1)
  const segments = (directory + value).split('/')
  const resolved = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment === '..') resolved.pop()
    else if (segment !== '.') resolved.push(segment)
  }
  return resolved.join('/')
}

class MiniUrl {
  constructor(input, base) {
    this.href = resolveUrl(input, base)
  }
}

class MiniUrlSearchParams {
  constructor(search) {
    this.values = Object.create(null)
    const query = String(search || '').replace(/^\?/, '')
    if (!query) return
    query.split('&').forEach((entry) => {
      const separator = entry.indexOf('=')
      const key = separator >= 0 ? entry.slice(0, separator) : entry
      const value = separator >= 0 ? entry.slice(separator + 1) : ''
      this.values[decodeURIComponent(key)] = decodeURIComponent(value)
    })
  }

  get(key) {
    return Object.prototype.hasOwnProperty.call(this.values, key)
      ? this.values[key]
      : null
  }
}

function requestArrayBuffer(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: encodeURI(resolveUrl(url, API_ROOT)),
      method: 'GET',
      responseType: 'arraybuffer',
      success(response) {
        const status = Number(response.statusCode || 0)
        const data = response.data instanceof ArrayBuffer
          ? response.data
          : new ArrayBuffer(0)
        resolve({
          ok: status >= 200 && status < 300,
          status,
          arrayBuffer() {
            return Promise.resolve(data)
          }
        })
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : 'Live2D 资源请求失败'))
      }
    })
  })
}

function createEventTarget(seed) {
  const target = seed || {}
  const listeners = Object.create(null)
  target.addEventListener = function addEventListener(type, callback) {
    if (type === 'load') target.onload = callback
    else if (type === 'error') target.onerror = callback
    else listeners[type] = callback
  }
  target.removeEventListener = function removeEventListener(type) {
    if (type === 'load') target.onload = null
    else if (type === 'error') target.onerror = null
    else delete listeners[type]
  }
  return target
}

function createStatusElement() {
  return createEventTarget({
    hidden: false,
    textContent: '',
    style: { color: '' }
  })
}

class MiniResizeObserver {
  constructor(callback) {
    this.callback = callback
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

class MiniAnalyser {
  constructor() {
    this._fftSize = 2048
    this.frequencyBinCount = 1024
    this.smoothingTimeConstant = 0.28
  }

  set fftSize(value) {
    this._fftSize = value
    this.frequencyBinCount = Math.max(1, Math.floor(value / 2))
  }

  get fftSize() {
    return this._fftSize
  }

  connect() {}
  disconnect() {}

  getFloatTimeDomainData(target) {
    if (!syntheticSpeaking) {
      target.fill(0)
      return
    }
    phase += 0.34
    const envelope = 0.12 + Math.abs(Math.sin(phase * 0.71)) * 0.24
    for (let index = 0; index < target.length; index += 1) {
      target[index] = Math.sin(phase + index * 0.18) * envelope
    }
  }

  getFloatFrequencyData(target) {
    target.fill(syntheticSpeaking ? -26 : -120)
  }
}

class MiniAudioContext {
  constructor() {
    this.state = 'running'
    this.sampleRate = 48000
    this.destination = {}
  }

  get currentTime() {
    return Date.now() / 1000
  }

  createAnalyser() {
    return new MiniAnalyser()
  }

  createBufferSource() {
    return {
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {}
    }
  }

  decodeAudioData() {
    return Promise.reject(new Error('微信端音频由页面播放器负责'))
  }

  resume() {
    this.state = 'running'
    return Promise.resolve()
  }

  suspend() {
    this.state = 'suspended'
    return Promise.resolve()
  }

  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

function emitPacket(packet) {
  if (typeof onPacket === 'function') onPacket(packet)
}

function installEnvironment(options) {
  const canvasNode = options.canvas
  const system = wx.getWindowInfo
    ? wx.getWindowInfo()
    : wx.getSystemInfoSync()
  const pixelRatio = Number(system.pixelRatio || 1)
  const cssWidth = Math.max(1, Number(options.width || 1))
  const cssHeight = Math.max(1, Number(options.height || 1))
  const model = normalizeModel(options.model)

  canvasNode.width = Math.max(1, Math.round(cssWidth * pixelRatio))
  canvasNode.height = Math.max(1, Math.round(cssHeight * pixelRatio))

  const canvas = {
    width: canvasNode.width,
    height: canvasNode.height,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    offsetLeft: 0,
    offsetTop: 0,
    getContext(type, attributes) {
      // WeChat exposes the WebGL context as `webgl`; the shared Cubism
      // renderer asks for `webgl2` on browser/H5. Keep that request portable.
      return canvasNode.getContext(type === 'webgl2' ? 'webgl' : type, attributes)
    }
  }
  const loading = createStatusElement()
  const statusText = createStatusElement()
  const audioUnlock = createStatusElement()
  const elements = {
    loading,
    'status-text': statusText,
    'audio-unlock': audioUnlock,
    live2dCanvas: canvas
  }

  const miniDocument = {
    getElementById(id) {
      return elements[id] || null
    },
    addEventListener(type, callback) {
      documentListeners[type] = callback
    },
    removeEventListener(type, callback) {
      if (!callback || documentListeners[type] === callback) delete documentListeners[type]
    }
  }

  globalThis.window = globalThis
  globalThis.document = miniDocument
  globalThis.devicePixelRatio = pixelRatio
  globalThis.location = {
    href: API_ROOT + '?model=' + encodeURIComponent(model),
    search: '?model=' + encodeURIComponent(model),
    origin: 'https://api.shuzhiyouzong.cn'
  }
  globalThis.parent = {
    postMessage(packet) {
      emitPacket(packet)
    }
  }
  globalThis.uni = {
    postMessage(payload) {
      if (payload && payload.data) emitPacket(payload.data)
    }
  }
  globalThis.URL = MiniUrl
  globalThis.URLSearchParams = MiniUrlSearchParams
  globalThis.ResizeObserver = MiniResizeObserver
  globalThis.AudioContext = MiniAudioContext
  globalThis.webkitAudioContext = MiniAudioContext
  globalThis.alert = function miniProgramAlert(message) {
    console.warn('[Live2D]', message)
  }
  globalThis.fetch = requestArrayBuffer
  globalThis.Image = function MiniImage() {
    return createEventTarget(canvasNode.createImage())
  }
  globalThis.requestAnimationFrame = function requestAnimationFrame(callback) {
    if (typeof canvasNode.requestAnimationFrame === 'function') {
      return canvasNode.requestAnimationFrame(callback)
    }
    return setTimeout(() => callback(Date.now()), 16)
  }
  globalThis.cancelAnimationFrame = function cancelAnimationFrame(id) {
    if (typeof canvasNode.cancelAnimationFrame === 'function') {
      return canvasNode.cancelAnimationFrame(id)
    }
    clearTimeout(id)
  }
  globalThis.addEventListener = function addEventListener(type, callback) {
    windowListeners[type] = callback
  }
  globalThis.removeEventListener = function removeEventListener(type, callback) {
    if (!callback || windowListeners[type] === callback) delete windowListeners[type]
  }
}

function mount(options) {
  if (!options || !options.owner || !options.canvas) {
    return Promise.reject(new Error('微信 Live2D Canvas 参数不完整'))
  }
  if (runtimeDisposed) {
    return Promise.reject(new Error('Live2D 运行时已释放，请重新进入小程序'))
  }

  activeOwner = options.owner
  activeCanvas = options.canvas
  onPacket = options.onPacket
  syntheticSpeaking = Boolean(options.owner.properties.speaking)

  if (runtimeStarted) {
    emitPacket({
      source: 'scenic-live2d',
      type: 'ready',
      model: normalizeModel(options.model),
      realModel: true,
      reused: true
    })
    return Promise.resolve()
  }

  installEnvironment(options)
  try {
    const core = require('./live2dcubismcore.min')
    globalThis.Live2DCubismCore = core
    const startRuntime = () => {
      require('./cubism-runtime')
      runtimeStarted = true
    }
    // Cubism Core initializes its asm module on a microtask. Waiting here is
    // important in a mini-program because the runtime is required from a
    // custom component callback rather than a browser script tag.
    if (core && core.ready && typeof core.ready.then === 'function') {
      return core.ready.then(startRuntime)
    }
    startRuntime()
    return Promise.resolve()
  } catch (error) {
    runtimeStarted = false
    return Promise.reject(error)
  }
}

function setSpeaking(owner, speaking) {
  if (owner !== activeOwner) return
  syntheticSpeaking = Boolean(speaking)
}

function pointerFromEvent(event) {
  const touches = (event && event.touches && event.touches.length)
    ? event.touches
    : (event && event.changedTouches ? event.changedTouches : [])
  const touch = touches && touches[0]
  if (!touch) return null
  return {
    pageX: Number(touch.x != null ? touch.x : touch.pageX || 0),
    pageY: Number(touch.y != null ? touch.y : touch.pageY || 0)
  }
}

function dispatchPointer(owner, type, event) {
  if (owner !== activeOwner || !activeCanvas) return
  const pointer = pointerFromEvent(event)
  const listener = documentListeners[type]
  if (pointer && typeof listener === 'function') listener(pointer)
}

function dispose(owner) {
  if (owner !== activeOwner) return
  syntheticSpeaking = false
  const handler = windowListeners.beforeunload
  if (typeof handler === 'function') {
    try {
      handler()
      runtimeDisposed = true
    } catch (error) {
      console.warn('release mini program Live2D runtime failed', error)
    }
  }
  activeOwner = null
  activeCanvas = null
  onPacket = null
}

module.exports = {
  dispatchPointer,
  dispose,
  mount,
  setSpeaking
}
