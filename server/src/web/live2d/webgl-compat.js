// ArkWeb builds used by some HarmonyOS emulators expose WebGL1 but return
// null (or throw) when a page requests WebGL2. The bundled Cubism renderer
// only uses WebGL1-compatible shader APIs, so transparently retry the request
// with the older context before the renderer starts.
(function installWebglFallback() {
  if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype) return
  const prototype = HTMLCanvasElement.prototype
  const originalGetContext = prototype.getContext
  if (typeof originalGetContext !== 'function' || prototype.__scenicWebglFallback) return

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
