const runtime = require('./runtime/native/index')

Component({
  options: {
    pureDataPattern: /^_/
  },

  properties: {
    model: {
      type: String,
      value: 'Haru'
    },
    speaking: {
      type: Boolean,
      value: false,
      observer(value) {
        runtime.setSpeaking(this, Boolean(value))
      }
    }
  },

  data: {
    loading: true,
    statusText: '正在加载 Live2D 模型',
    errorMessage: ''
  },

  lifetimes: {
    attached() {
      this._runtimeReady = false
    },

    ready() {
      this.initializeLive2d()
    },

    detached() {
      runtime.dispose(this)
    }
  },

  methods: {
    initializeLive2d() {
      this.createSelectorQuery()
        .select('#scenic-live2d-canvas')
        .fields({ node: true, size: true })
        .exec((result) => {
          const canvasInfo = result && result[0]
          if (!canvasInfo || !canvasInfo.node) {
            this.handleRuntimePacket({
              type: 'error',
              message: '微信 WebGL Canvas 初始化失败'
            })
            return
          }

          runtime
            .mount({
              owner: this,
              canvas: canvasInfo.node,
              width: canvasInfo.width,
              height: canvasInfo.height,
              model: this.properties.model,
              onPacket: (packet) => this.handleRuntimePacket(packet)
            })
            .catch((error) => {
              this.handleRuntimePacket({
                type: 'error',
                message: error && error.message ? error.message : 'Live2D 初始化失败'
              })
            })
        })
    },

    handleRuntimePacket(packet) {
      if (!packet || typeof packet.type !== 'string') return
      if (packet.type === 'ready') {
        this._runtimeReady = true
        this.setData({ loading: false, errorMessage: '' })
      } else if (packet.type === 'page-loaded') {
        this.setData({ loading: true, statusText: '正在启动 Live2D 模型', errorMessage: '' })
      } else if (packet.type === 'error') {
        this._runtimeReady = false
        this.setData({
          loading: false,
          errorMessage: packet.message || 'Live2D 模型暂不可用'
        })
      }
      this.triggerEvent('runtime', packet)
    },

    handleTouchStart(event) {
      runtime.dispatchPointer(this, 'pointerdown', event)
    },

    handleTouchMove(event) {
      runtime.dispatchPointer(this, 'pointermove', event)
    },

    handleTouchEnd(event) {
      runtime.dispatchPointer(this, 'pointerup', event)
    },

    handleTouchCancel(event) {
      runtime.dispatchPointer(this, 'pointercancel', event)
    }
  }
})
