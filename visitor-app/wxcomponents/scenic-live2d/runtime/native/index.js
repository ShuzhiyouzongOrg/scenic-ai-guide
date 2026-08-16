const { LAppDelegate } = require('./application/lappdelegate')
const { LAppLive2DManager } = require('./application/lapplive2dmanager')

const runtimes = new WeakMap()

class NativeLive2dRuntime {
  constructor(options) {
    this.owner = options.owner
    this.canvas = options.canvas
    this.width = options.width
    this.height = options.height
    this.onPacket = options.onPacket
    this.frameId = null
    this.readyTimer = null
    this.disposed = false
    this.speaking = false
    this.phase = 0
  }

  emit(packet) {
    if (!this.disposed && typeof this.onPacket === 'function') {
      this.onPacket({ source: 'scenic-live2d', ...packet })
    }
  }

  start() {
    this.emit({ type: 'page-loaded', model: 'Haru', realModel: true })
    const delegate = LAppDelegate.getInstance()
    if (!delegate.initialize(this.canvas, this.width, this.height)) {
      throw new Error('微信 WebGL Canvas 初始化失败')
    }
    this.loop()
    this.waitUntilReady(0)
  }

  loop() {
    if (this.disposed) return
    const manager = LAppLive2DManager.getInstance()
    const model = manager.getModel(0)
    if (model && typeof model.setExternalLipSyncValue === 'function') {
      this.phase += this.speaking ? 0.42 : 0.18
      const target = this.speaking ? 0.22 + Math.abs(Math.sin(this.phase)) * 0.72 : 0
      model.setExternalLipSyncValue(target)
    }
    LAppDelegate.getInstance().run()
    this.frameId = this.canvas.requestAnimationFrame(() => this.loop())
  }

  waitUntilReady(attempt) {
    if (this.disposed) return
    const model = LAppLive2DManager.getInstance().getModel(0)
    if (model && typeof model.isCompleteSetup === 'function' && model.isCompleteSetup()) {
      this.emit({ type: 'ready', model: 'Haru', realModel: true })
      return
    }
    if (attempt >= 300) {
      this.emit({ type: 'error', message: 'Live2D 模型加载超时，请检查网络和下载域名配置' })
      return
    }
    this.readyTimer = setTimeout(() => this.waitUntilReady(attempt + 1), 100)
  }

  setSpeaking(value) {
    const nextValue = Boolean(value)
    if (this.speaking === nextValue) return
    this.speaking = nextValue
    this.emit({ type: nextValue ? 'speaking' : 'idle', model: 'Haru' })
  }

  dispatchPointer(type, event) {
    const touch = event && event.changedTouches && event.changedTouches[0]
    if (!touch) return
    const view = LAppDelegate.getInstance().getView()
    const positionX = Number(touch.x != null ? touch.x : touch.pageX || 0)
    const positionY = Number(touch.y != null ? touch.y : touch.pageY || 0)
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
    if (this.readyTimer != null) clearTimeout(this.readyTimer)
    if (this.frameId != null && this.canvas && this.canvas.cancelAnimationFrame) {
      this.canvas.cancelAnimationFrame(this.frameId)
    }
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

function setSpeaking(owner, value) {
  const runtime = runtimes.get(owner)
  if (runtime) runtime.setSpeaking(value)
}

function dispatchPointer(owner, type, event) {
  const runtime = runtimes.get(owner)
  if (runtime) runtime.dispatchPointer(type, event)
}

module.exports = { mount, dispose, setSpeaking, dispatchPointer }
