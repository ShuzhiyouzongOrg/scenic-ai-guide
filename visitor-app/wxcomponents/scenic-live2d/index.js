/**
 * @fileoverview 游客端小程序 Live2D 自定义组件适配层。
 * @description 负责挂载原生运行时、同步模型状态，并将触摸事件转发给 Live2D 画布。
 */

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
      /**
       * @description 将组件的播报状态同步给 Live2D 原生运行时。
       * @param {boolean} value 最新播报状态。
       * @returns {void} 无返回值。
       */
      observer(value) {
        runtime.setSpeaking(this, Boolean(value))
      }
    },
    visible: {
      type: Boolean,
      value: true
    }
  },

  data: {
    loading: true,
    statusText: '正在加载 Live2D 模型',
    errorMessage: ''
  },

  lifetimes: {
    /**
     * @description 初始化组件内部的运行时就绪标记。
     * @returns {void} 无返回值。
     */
    attached() {
      this._runtimeReady = false
    },

    /**
     * @description 组件布局就绪后开始初始化 Live2D 画布。
     * @returns {void} 无返回值。
     */
    ready() {
      this.initializeLive2d()
    },

    /**
     * @description 组件移除时释放原生运行时资源。
     * @returns {void} 无返回值。
     */
    detached() {
      runtime.dispose(this)
    }
  },

  methods: {
    /**
     * @description 查询 WebGL Canvas 节点并挂载 Live2D 原生运行时。
     * @returns {void} 无返回值。
     * @example
     * this.initializeLive2d()
     */
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

    /**
     * @description 处理运行时状态包，更新加载状态并向父组件转发事件。
     * @param {{type: string, message?: string}|null|undefined} packet 运行时状态包。
     * @returns {void} 无返回值。
     * @example
     * this.handleRuntimePacket({ type: 'ready' })
     */
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

    /**
     * @description 将触摸开始事件转换为运行时指针按下事件。
     * @param {WechatMiniprogram.TouchEvent} event 小程序触摸事件。
     * @returns {void} 无返回值。
     */
    handleTouchStart(event) {
      runtime.dispatchPointer(this, 'pointerdown', event)
    },

    /**
     * @description 将触摸结束事件转换为运行时指针抬起事件。
     * @param {WechatMiniprogram.TouchEvent} event 小程序触摸事件。
     * @returns {void} 无返回值。
     */
    handleTouchEnd(event) {
      runtime.dispatchPointer(this, 'pointerup', event)
    },

    /**
     * @description 将触摸取消事件转换为运行时指针取消事件。
     * @param {WechatMiniprogram.TouchEvent} event 小程序触摸事件。
     * @returns {void} 无返回值。
     */
    handleTouchCancel(event) {
      runtime.dispatchPointer(this, 'pointercancel', event)
    }
  }
})
