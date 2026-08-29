/**
 * @fileoverview 具备心跳、消息队列和自动重连能力的 WebSocket 客户端。
 * @description 以单例方式管理 WebSocket 生命周期，并为断线、超时和发送失败提供恢复机制。
 */

/**
 * @typedef WebSocketOptions
 * @description 创建或更新 WebSocketClient 实例时使用的连接参数。
 * @property {string} [url] WebSocket 服务地址；省略时读取登录 WebSocket 环境变量。
 * @property {(event: MessageEvent) => void} messageHandler 接收服务端消息的回调函数。
 * @property {number} [reconnectInterval] 基础重连间隔毫秒数。
 * @property {number} [heartbeatInterval] 心跳状态检查间隔毫秒数。
 * @property {number} [pingInterval] 主动发送 ping 的间隔毫秒数。
 * @property {number} [reconnectTimeout] 心跳失败后的重连超时毫秒数。
 * @property {number} [maxReconnectAttempts] 最大连续重连次数。
 * @property {number} [connectionTimeout] 单次连接建立的超时毫秒数。
 */
interface WebSocketOptions {
  url?: string
  messageHandler: (event: MessageEvent) => void
  reconnectInterval?: number // 重连间隔(ms)
  heartbeatInterval?: number // 心跳检测间隔(ms)
  pingInterval?: number // 发送ping间隔(ms)
  reconnectTimeout?: number // 重连超时时间(ms)
  maxReconnectAttempts?: number // 最大重连次数
  connectionTimeout?: number // 连接建立超时时间(ms)
}

/**
 * @class
 * @description 管理 WebSocket 连接、消息缓冲、心跳和指数退避重连的单例客户端。
 * @example
 * const client = WebSocketClient.getInstance({
 *   url: 'wss://example.com/socket',
 *   messageHandler: (event) => console.log(event.data)
 * })
 * client.init()
 */
export default class WebSocketClient {
  private static instance: WebSocketClient | null = null
  private ws: WebSocket | null = null
  private url: string
  private messageHandler: (event: MessageEvent) => void
  private reconnectInterval: number
  private heartbeatInterval: number
  private pingInterval: number
  private reconnectTimeout: number
  private maxReconnectAttempts: number
  private connectionTimeout: number
  private reconnectAttempts: number = 0 // 当前重连次数

  // 消息队列 - 缓存连接建立前的消息
  private messageQueue: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = []

  // 定时器
  private detectionTimer: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null // 连接超时定时器

  // 状态标识
  private isConnected: boolean = false
  private isConnecting: boolean = false // 是否正在连接中
  private stopReconnect: boolean = false
  private isReconnecting: boolean = false

  /**
   * @description 使用指定连接参数创建单例客户端；构造过程仅允许由 getInstance 调用。
   * @param {WebSocketOptions} options WebSocket 连接与重连配置。
   */
  private constructor(options: WebSocketOptions) {
    this.url = options.url || (process.env.VUE_APP_LOGIN_WEBSOCKET as string)
    this.messageHandler = options.messageHandler
    this.reconnectInterval = options.reconnectInterval ?? 20 * 1000 // 默认20秒
    this.heartbeatInterval = options.heartbeatInterval ?? 5 * 1000 // 默认5秒
    this.pingInterval = options.pingInterval ?? 10 * 1000 // 默认10秒
    this.reconnectTimeout = options.reconnectTimeout ?? 30 * 1000 // 默认30秒
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10 // 默认最多重连10次
    this.connectionTimeout = options.connectionTimeout ?? 10 * 1000 // 连接超时10秒
  }

  /**
   * @description 获取全局客户端单例；已有实例会更新消息处理器，并在 URL 改变时重新连接。
   * @param {WebSocketOptions} options WebSocket 连接与回调配置。
   * @returns {WebSocketClient} 全局共享的客户端实例。
   * @example
   * const client = WebSocketClient.getInstance({ messageHandler })
   */
  static getInstance(options: WebSocketOptions): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient(options)
    } else {
      // 更新消息处理器
      WebSocketClient.instance.messageHandler = options.messageHandler
      // 如果提供了新的URL，则更新并重新连接
      if (options.url && WebSocketClient.instance.url !== options.url) {
        WebSocketClient.instance.url = options.url
        WebSocketClient.instance.reconnectAttempts = 0
        WebSocketClient.instance.init()
      }
    }
    return WebSocketClient.instance
  }

  /**
   * @description 初始化 WebSocket 连接，并重置历史重连计数。
   * @returns {void} 无返回值。
   * @example
   * client.init()
   */
  init(): void {
    this.connect(true)
  }

  private connect(resetReconnectAttempts: boolean = false): void {
    // 如果正在连接中，不重复连接
    if (this.isConnecting) {
      console.log('正在建立WebSocket连接中...')
      return
    }

    // 如果已连接，不重复连接
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket连接已存在')
      this.flushMessageQueue() // 确保队列中的消息被发送
      return
    }

    try {
      this.isConnecting = true
      this.stopReconnect = false
      if (resetReconnectAttempts) {
        this.reconnectAttempts = 0
        this.isReconnecting = false
        this.clearTimer('reconnectTimer')
      }
      this.ws = new WebSocket(this.url)

      // 设置连接超时检测
      this.clearTimer('connectionTimer')
      this.connectionTimer = setTimeout(() => {
        console.error(`WebSocket连接超时 (${this.connectionTimeout}ms)：${this.url}`)
        this.handleConnectionTimeout()
      }, this.connectionTimeout)

      this.ws.onopen = (event) => this.handleOpen(event)
      this.ws.onmessage = (event) => this.handleMessage(event)
      this.ws.onclose = (event) => this.handleClose(event)
      this.ws.onerror = (event) => this.handleError(event)
    } catch (error) {
      console.error('WebSocket初始化失败:', error)
      this.isConnecting = false
      this.reconnect()
    }
  }

  // 处理连接超时
  private handleConnectionTimeout(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('WebSocket连接超时，强制关闭连接')
      this.ws?.close(1000, 'Connection timeout')
      this.isConnecting = false
      this.reconnect()
    }
  }

  /**
   * @description 清除定时器并主动关闭当前连接，同时停止后续自动重连。
   * @param {boolean} [force] 是否使用强制关闭状态码和原因。
   * @returns {void} 无返回值。
   * @example
   * client.close(true)
   */
  close(force?: boolean): void {
    this.clearAllTimers()
    this.stopReconnect = true
    this.isReconnecting = false
    this.isConnecting = false

    if (this.ws) {
      // 1000 表示正常关闭
      this.ws.close(force ? 1001 : 1000, force ? 'Force closed' : 'Normal close')
      this.ws = null
    }

    this.isConnected = false
  }

  /**
   * @description 发送 WebSocket 消息；未连接时可将消息加入队列，待连接恢复后发送。
   * @param {string | ArrayBufferLike | Blob | ArrayBufferView} data 待发送的数据。
   * @param {boolean} [immediate=false] 是否要求立即发送并在未连接时放弃该消息。
   * @returns {void} 无返回值。
   * @example
   * client.send(JSON.stringify({ type: 'ping' }))
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView, immediate: boolean = false): void {
    // 如果要求立即发送且未连接，则直接报错
    if (immediate && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
      console.error('WebSocket未连接，无法立即发送消息')
      return
    }

    // 如果未连接且不要求立即发送，则加入消息队列
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket未连接，消息已加入队列等待发送')
      this.messageQueue.push(data)
      // 如果未在重连中，则尝试重连
      if (!this.isConnecting && !this.stopReconnect) {
        this.init()
      }
      return
    }

    try {
      this.ws.send(data)
    } catch (error) {
      console.error('WebSocket发送消息失败:', error)
      // 发送失败时将消息加入队列，等待重连后重试
      this.messageQueue.push(data)
      this.reconnect()
    }
  }

  // 发送队列中的消息
  private flushMessageQueue(): void {
    if (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      console.log(`发送队列中的${this.messageQueue.length}条消息`)
      while (this.messageQueue.length > 0) {
        const data = this.messageQueue.shift()
        if (data) {
          try {
            this.ws?.send(data)
          } catch (error) {
            console.error('发送队列消息失败:', error)
            // 如果发送失败，将消息放回队列头部
            if (data) this.messageQueue.unshift(data)
            break
          }
        }
      }
    }
  }

  // 处理连接打开
  private handleOpen(event: Event): void {
    console.log('WebSocket连接成功', event)
    this.clearTimer('connectionTimer') // 清除连接超时定时器
    this.isConnected = true
    this.isConnecting = false
    this.isReconnecting = false
    this.stopReconnect = false
    this.reconnectAttempts = 0 // 重置重连次数
    this.startHeartbeat()
    this.startPing()
    this.flushMessageQueue() // 发送队列中的消息
  }

  // 处理收到的消息
  private handleMessage(event: MessageEvent): void {
    console.log('收到WebSocket消息:', event)
    this.resetHeartbeat()
    this.messageHandler(event)
  }

  // 处理连接关闭
  private handleClose(event: CloseEvent): void {
    console.log(
      `WebSocket断开: 代码=${event.code}, 原因=${event.reason}, 干净关闭=${event.wasClean}`
    )

    // 1000 是正常关闭代码
    const isNormalClose = event.code === 1000

    this.isConnected = false
    this.isConnecting = false
    this.clearConnectionTimers()
    this.ws = null

    if (!this.stopReconnect && !isNormalClose) {
      this.reconnect()
    }
  }

  // 处理错误 - 增加详细错误信息
  private handleError(event: Event): void {
    console.error('WebSocket连接错误:')
    console.error('错误事件:', event)
    console.error(
      '当前连接状态:',
      this.ws?.readyState ? this.getReadyStateText(this.ws.readyState) : '未初始化'
    )

    this.isConnected = false
    this.isConnecting = false

    // 只有在未停止重连的情况下才尝试重连
    if (!this.stopReconnect) {
      this.reconnect()
    }
  }

  private closeCurrentSocketForReconnect(): void {
    this.clearConnectionTimers()
    this.isConnected = false
    this.isConnecting = false

    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1001, 'Reconnect')
      }

      this.ws = null
    }
  }

  // 转换连接状态为文本描述
  private getReadyStateText(state: number): string {
    switch (state) {
      case WebSocket.CONNECTING:
        return 'CONNECTING (0) - 正在连接'
      case WebSocket.OPEN:
        return 'OPEN (1) - 已连接'
      case WebSocket.CLOSING:
        return 'CLOSING (2) - 正在关闭'
      case WebSocket.CLOSED:
        return 'CLOSED (3) - 已关闭'
      default:
        return `未知状态 (${state})`
    }
  }

  // 开始心跳检测
  private startHeartbeat(): void {
    this.clearTimer('detectionTimer')
    this.clearTimer('timeoutTimer')

    this.detectionTimer = setTimeout(() => {
      this.isConnected = this.ws?.readyState === WebSocket.OPEN

      if (!this.isConnected) {
        console.warn('WebSocket心跳检测失败，尝试重连')
        this.reconnect()

        this.timeoutTimer = setTimeout(() => {
          console.warn('WebSocket重连超时')
          this.close()
        }, this.reconnectTimeout)
      }
    }, this.heartbeatInterval)
  }

  // 重置心跳检测
  private resetHeartbeat(): void {
    this.clearTimer('detectionTimer')
    this.clearTimer('timeoutTimer')
    this.startHeartbeat()
  }

  // 开始发送ping消息
  private startPing(): void {
    this.clearTimer('pingTimer')

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket未连接，停止发送ping')
        this.clearTimer('pingTimer')
        this.reconnect()
        return
      }

      try {
        this.ws.send('ping')
        console.log('发送ping消息')
      } catch (error) {
        console.error('发送ping消息失败:', error)
        this.clearTimer('pingTimer')
        this.reconnect()
      }
    }, this.pingInterval)
  }

  // 重连 - 增加重连次数限制
  private reconnect(): void {
    if (this.stopReconnect || this.isConnecting || this.reconnectInterval <= 0) {
      return
    }

    // 检查是否超过最大重连次数
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`已达到最大重连次数(${this.maxReconnectAttempts})，停止重连`)
      this.close(true)
      return
    }

    this.reconnectAttempts++
    this.isReconnecting = true
    this.closeCurrentSocketForReconnect()

    const delay = this.calculateReconnectDelay()
    console.log(
      `将在${delay / 1000}秒后尝试重新连接（第${this.reconnectAttempts}/${this.maxReconnectAttempts}次）`
    )

    this.clearTimer('reconnectTimer')
    this.reconnectTimer = setTimeout(() => {
      console.log(`尝试重新连接WebSocket（第${this.reconnectAttempts}次）`)
      this.connect(false)
    }, delay)
  }

  // 计算重连延迟 - 指数退避策略
  private calculateReconnectDelay(): number {
    // 基础延迟 + 随机值，避免多个客户端同时重连
    const jitter = Math.random() * 1000 // 0-1秒的随机延迟
    const baseDelay = Math.min(
      this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      this.reconnectInterval * 5
    )
    return baseDelay + jitter
  }

  // 清除指定定时器
  private clearTimer(
    timerName:
      | 'detectionTimer'
      | 'timeoutTimer'
      | 'reconnectTimer'
      | 'pingTimer'
      | 'connectionTimer'
  ): void {
    if (this[timerName]) {
      clearTimeout(this[timerName] as NodeJS.Timeout)
      this[timerName] = null
    }
  }

  // 清除所有定时器
  private clearAllTimers(): void {
    this.clearConnectionTimers()
    this.clearTimer('reconnectTimer')
  }

  private clearConnectionTimers(): void {
    this.clearTimer('detectionTimer')
    this.clearTimer('timeoutTimer')
    this.clearTimer('pingTimer')
    this.clearTimer('connectionTimer')
  }

  /**
   * @description 获取客户端当前是否已建立可用连接。
   * @returns {boolean} WebSocket 已连接时返回 true。
   */
  get isWebSocketConnected(): boolean {
    return this.isConnected
  }

  /**
   * @description 获取包含连接或重连进度的中文状态文本。
   * @returns {string} 当前连接状态文本。
   */
  get connectionStatusText(): string {
    if (this.isConnecting) return '正在连接'
    if (this.isConnected) return '已连接'
    if (this.isReconnecting && this.reconnectAttempts > 0)
      return `重连中（${this.reconnectAttempts}/${this.maxReconnectAttempts}）`
    return '已断开'
  }

  /**
   * @description 关闭并清除全局客户端单例，使后续调用可创建新实例。
   * @returns {void} 无返回值。
   * @example
   * WebSocketClient.destroyInstance()
   */
  static destroyInstance(): void {
    if (WebSocketClient.instance) {
      WebSocketClient.instance.close()
      WebSocketClient.instance = null
    }
  }
}
