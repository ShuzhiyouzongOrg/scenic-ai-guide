/**
 * @fileoverview HarmonyOS ArkWeb 的 WebGL2 到 WebGL1 兼容补丁。
 * @description 在 WebGL2 不可用时将上下文请求安全降级到 WebGL1，以支持 Cubism 渲染。
 *
 * 部分模拟器仅提供 WebGL1，却会在请求 WebGL2 时返回 null 或抛错。Cubism 渲染器使用的着色器
 * API 与 WebGL1 兼容，因此在渲染启动前安全地为 `getContext('webgl2')` 增加降级重试。
 */

/**
 * @description 安装一次性的 Canvas `getContext` 包装器。
 * @returns {void}
 */
(function installWebglFallback() {
  if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype) return
  const prototype = HTMLCanvasElement.prototype
  const originalGetContext = prototype.getContext
  if (typeof originalGetContext !== 'function' || prototype.__scenicWebglFallback) return

  /**
   * @description 获取请求的画布上下文；WebGL2 不可用时依次尝试 WebGL1 和实验名称。
   * @this {HTMLCanvasElement}
   * @param {string} type 上下文类型。
   * @param {object} [attributes] 上下文属性。
   * @returns {RenderingContext|null} 浏览器上下文或 `null`。
   */
  prototype.getContext = function scenicGetContext(type, attributes) {
    if (type !== 'webgl2') return originalGetContext.call(this, type, attributes)
    let context = null
    try {
      context = originalGetContext.call(this, 'webgl2', attributes)
    } catch (error) {
      context = null
    }
    if (context) return context
    try {
      return originalGetContext.call(this, 'webgl', attributes)
        || originalGetContext.call(this, 'experimental-webgl', attributes)
    } catch (error) {
      return null
    }
  }
  prototype.__scenicWebglFallback = true
})()
