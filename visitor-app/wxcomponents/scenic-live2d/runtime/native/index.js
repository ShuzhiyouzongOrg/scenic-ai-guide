const native = require('./application/lappdelegate')
const { LAppDelegate } = native
const { LAppLive2DManager } = require('./application/lapplive2dmanager')
const { CubismFramework } = require('./framework/live2dcubismframework')
const { Live2DCubismCore } = require('./framework/Core/live2dcubismcore')

const runtimes = new WeakMap()

class NativeLive2dRuntime {
  constructor(options) {
    this.owner = options.owner
    this.canvas = options.canvas
    this.width = options.width
    this.height = options.height
    this.onPacket = options.onPacket
    this.frameId = null
    this.frameChecks = 0
    this.lastFrameAt = null
    this.visibleMs = 0
    this.paused = false
    this.disposed = false
    this.ready = false
    this.speaking = Boolean(options.speaking)
    this.level = Number(options.level)
  }

  emit(packet) {
    if (!this.disposed && typeof this.onPacket === 'function') {
      this.onPacket({ source: 'scenic-live2d', ...packet })
    }
  }

  start() {
    if (this.disposed) return
    if (!(this.width >= 16 && this.height >= 16)) throw new Error('Invalid Live2D stage size')
    this.emit({ type: 'page-loaded', model: 'Haru', realModel: true })
    // Core 4.2.2 retains its only native log callback across framework cleanup.
    // On a full page remount, start the framework with that existing callback.
    if (Live2DCubismCore.Logging.csmGetLogFunction() && !CubismFramework.isStarted()) {
      CubismFramework.startUp()
    }
    const delegate = LAppDelegate.getInstance()
    if (!delegate.initialize(this.canvas, this.width, this.height)) {
      throw new Error('微信 WebGL Canvas 初始化失败')
    }
    this.loop()
  }

  loop() {
    this.frameId = null
    if (this.disposed || this.paused) return
    try { this.draw() }
    catch (error) {
      this.pause()
      this.emit({ type: 'error', message: error.message, viewport: this.viewport() })
      return
    }
    if (!this.paused) this.frameId = this.canvas.requestAnimationFrame(() => this.loop())
  }

  draw() {
    const manager = LAppLive2DManager.getInstance()
    const model = manager.getModel(0)
    if (model && typeof model.setExternalLipSyncValue === 'function') {
      const target = this.speaking && this.level >= 0 ? Math.min(1, this.level * 3) : 0
      model.setExternalLipSyncValue(target)
    }
    LAppDelegate.getInstance().run()
    if (this.ready) return
    const now = Date.now()
    if (this.lastFrameAt != null) this.visibleMs += now - this.lastFrameAt
    this.lastFrameAt = now
    if (model && model.isCompleteSetup()) {
      // CompleteSetup includes every model texture binding; run() above has
      // drawn it. The actual drawing buffer must also match the visible slot.
      const gl = native.gl
      if (gl.drawingBufferWidth === this.canvas.width && gl.drawingBufferHeight === this.canvas.height &&
          Math.abs((gl.drawingBufferWidth / gl.drawingBufferHeight) / (this.width / this.height) - 1) <= 0.03) {
        this.ready = true
        this.emit({ type: 'ready', model: 'Haru', realModel: true, viewport: this.viewport() })
      } else if (++this.frameChecks >= 4) {
        throw new Error('Haru model loaded, but its WebGL framebuffer does not match the stage')
      }
    } else if (this.visibleMs >= 30000) {
      throw new Error('Live2D model download timed out')
    }
  }

  viewport() {
    const gl = native.gl
    return { css: [this.width, this.height], buffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : [] }
  }

  pause() {
    this.paused = true
    this.lastFrameAt = null
    if (this.frameId != null && this.canvas) this.canvas.cancelAnimationFrame(this.frameId)
    this.frameId = null
  }

  resume(width, height) {
    if (this.disposed) return
    this.width = width
    this.height = height
    const ratio = Math.max(1, Number(wx.getWindowInfo().pixelRatio) || 1)
    const pixelWidth = Math.round(width * ratio)
    const pixelHeight = Math.round(height * ratio)
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight ||
        native.gl.drawingBufferWidth !== pixelWidth || native.gl.drawingBufferHeight !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
      LAppDelegate.getInstance().onResize()
      this.ready = false
      this.frameChecks = 0
    }
    if (this.paused) {
      this.paused = false
      this.loop()
    }
  }

  setSpeaking(value) {
    const nextValue = Boolean(value)
    if (this.speaking === nextValue) return
    this.speaking = nextValue
    this.emit({ type: nextValue ? 'speaking' : 'idle', model: 'Haru' })
  }

  dispatchPointer(type, event) {
    if (this.disposed || !this.ready) return
    const touch = event && event.changedTouches && event.changedTouches[0]
    if (!touch) return
    const view = LAppDelegate.getInstance().getView()
    const positionX = Number(touch.x || 0) * this.canvas.width / this.width
    const positionY = Number(touch.y || 0) * this.canvas.height / this.height
    if (type === 'pointerdown') {
      LAppDelegate.getInstance()._captured = true
      view.onTouchesBegan(positionX, positionY)
    } else if (type === 'pointermove' && LAppDelegate.getInstance()._captured) {
      view.onTouchesMoved(positionX, positionY)
    } else if (type === 'pointerup' || type === 'pointercancel') {
      LAppDelegate.getInstance()._captured = false
      view.onTouchesEnded(positionX, positionY)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.ready = false
    this.pause()
    LAppDelegate.releaseInstance()
    this.canvas = null
    this.owner = null
    this.onPacket = null
  }
}

function mount(options) {
  dispose(options.owner)
  const runtime = new NativeLive2dRuntime(options)
  runtimes.set(options.owner, runtime)
  return Promise.resolve().then(() => runtime.start())
}

function dispose(owner) {
  const runtime = runtimes.get(owner)
  if (!runtime) return
  runtime.dispose()
  runtimes.delete(owner)
}

function pause(owner) { const runtime = runtimes.get(owner); if (runtime) runtime.pause() }
function resume(owner, width, height) { const runtime = runtimes.get(owner); if (runtime) runtime.resume(width, height) }

function setSpeaking(owner, value) {
  const runtime = runtimes.get(owner)
  if (runtime) runtime.setSpeaking(value)
}

function setLevel(owner, value) {
  const runtime = runtimes.get(owner)
  if (runtime) runtime.level = Number(value)
}

function dispatchPointer(owner, type, event) {
  const runtime = runtimes.get(owner)
  if (runtime) runtime.dispatchPointer(type, event)
}

module.exports = { mount, dispose, pause, resume, setSpeaking, setLevel, dispatchPointer }
