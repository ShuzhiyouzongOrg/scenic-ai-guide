/**
 * @fileoverview Vue、脚本、Promise 与静态资源的全局错误处理工具。
 * @description 安装浏览器级错误监听器，并过滤 ResizeObserver 等已知无害噪声。
 *
 * 提供统一的错误捕获和处理机制
 *
 * ## 主要功能
 *
 * - Vue 运行时错误捕获（组件错误、生命周期错误等）
 * - 全局脚本错误捕获（语法错误、运行时错误等）
 * - Promise 未捕获错误处理（unhandledrejection）
 * - 静态资源加载错误监控（图片、脚本、样式等）
 * - 错误日志记录和上报
 * - 统一的错误处理入口
 *
 * ## 使用场景
 * - 应用启动时安装全局错误处理器
 * - 捕获和记录所有类型的错误
 * - 错误上报到监控平台
 * - 提升应用稳定性和可维护性
 * - 问题排查和调试
 *
 * ## 错误类型
 *
 * - VueError: Vue 组件相关错误
 * - ScriptError: JavaScript 脚本错误
 * - PromiseError: Promise 未捕获的 rejection
 * - ResourceError: 静态资源加载失败
 *
 * @module utils/sys/error-handle
 */
import type { App } from 'vue'

/**
 * @description 可忽略的浏览器布局观察器错误文本列表。
 * @type {string[]}
 */
const IGNORABLE_SCRIPT_ERRORS = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
]

/**
 * @description 从字符串或错误事件中提取可比较的错误消息。
 * @param {Event | string} message 错误事件或消息文本。
 * @returns {string} 规范化后的消息；无法提取时返回空字符串。
 */
function normalizeErrorMessage(message: Event | string): string {
  if (typeof message === 'string') {
    return message
  }

  if ('message' in message && typeof message.message === 'string') {
    return message.message
  }

  return ''
}

/**
 * @description 判断脚本错误是否属于 ResizeObserver 或扩展注入产生的可忽略噪声。
 * @param {Event | string} message 错误事件或消息文本。
 * @param {string} [source] 错误脚本来源地址。
 * @returns {boolean} 错误可忽略时返回 true。
 */
function isIgnorableScriptError(message: Event | string, source?: string): boolean {
  const normalizedMessage = normalizeErrorMessage(message)

  if (!normalizedMessage) {
    return false
  }

  if (IGNORABLE_SCRIPT_ERRORS.some((item) => normalizedMessage.includes(item))) {
    // 浏览器/扩展在布局抖动时常见的 ResizeObserver 噪声，不作为真实异常处理
    return true
  }

  // 浏览器扩展注入脚本偶发的跨域 Script error 也没有排查价值
  if (normalizedMessage === 'Script error.' && source === '') {
    return true
  }

  return false
}

/**
 * @description 记录 Vue 组件运行时错误及其组件实例和上下文信息。
 * @param {unknown} err Vue 捕获的异常。
 * @param {any} instance 发生异常的组件实例。
 * @param {string} info Vue 提供的错误上下文说明。
 * @returns {void} 无返回值。
 * @example
 * app.config.errorHandler = vueErrorHandler
 */
export function vueErrorHandler(err: unknown, instance: any, info: string) {
  console.error('[VueError]', err, info, instance)
  // 这里可以上报到服务端，比如：
  // reportError({ type: 'vue', err, info })
}

/**
 * @description 过滤无害脚本噪声并记录浏览器全局脚本错误。
 * @param {Event | string} message 错误事件或消息文本。
 * @param {string} [source] 错误脚本来源地址。
 * @param {number} [lineno] 错误行号。
 * @param {number} [colno] 错误列号。
 * @param {Error} [error] 浏览器提供的 Error 实例。
 * @returns {boolean} 始终返回 true，以阻止浏览器默认错误处理。
 * @example
 * window.onerror = scriptErrorHandler
 */
export function scriptErrorHandler(
  message: Event | string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean {
  if (isIgnorableScriptError(message, source)) {
    return true
  }

  console.error('[ScriptError]', { message, source, lineno, colno, error })
  // reportError({ type: 'script', message, source, lineno, colno, error })
  return true // 阻止默认控制台报错，可根据需求改
}

/**
 * @description 注册 unhandledrejection 监听器并记录未捕获的 Promise 拒绝原因。
 * @returns {void} 无返回值。
 * @example
 * registerPromiseErrorHandler()
 */
export function registerPromiseErrorHandler() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[PromiseError]', event.reason)
    // reportError({ type: 'promise', reason: event.reason })
  })
}

/**
 * @description 在捕获阶段监听图片、脚本和样式链接的加载失败事件。
 * @returns {void} 无返回值。
 * @example
 * registerResourceErrorHandler()
 */
export function registerResourceErrorHandler() {
  window.addEventListener(
    'error',
    (event: Event) => {
      const target = event.target as HTMLElement
      if (
        target &&
        (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')
      ) {
        console.error('[ResourceError]', {
          tagName: target.tagName,
          src:
            (target as HTMLImageElement).src ||
            (target as HTMLScriptElement).src ||
            (target as HTMLLinkElement).href
        })
        // reportError({ type: 'resource', target })
      }
    },
    true // 捕获阶段才能监听到资源错误
  )
}

/**
 * @description 为 Vue 应用和浏览器环境安装全部统一错误处理器。
 * @param {App} app Vue 应用实例。
 * @returns {void} 无返回值。
 * @example
 * setupErrorHandle(app)
 */
export function setupErrorHandle(app: App) {
  app.config.errorHandler = vueErrorHandler
  window.onerror = scriptErrorHandler
  registerPromiseErrorHandler()
  registerResourceErrorHandler()
}
