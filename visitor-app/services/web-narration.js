// Browser play() can reject after a valid, immediate pause/stop. DCloud's Web
// InnerAudioContext does not expose that promise. Native hosts keep their SDK player.
import { decodedLevels } from './decoded-levels.js'

export function createWebNarrationPlayer(onLevel = () => {}) {
  const audio = new Audio()
  let errorHandler = () => {}
  let disposed = false
  let controller, interval
  let levels = []
  let revision = 0
  async function measure(url) {
    const token = ++revision
    controller?.abort()
    levels = []
    try {
      controller = new AbortController()
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok || disposed || token !== revision) return
      const decoder = new OfflineAudioContext(1, 1, 16000)
      const buffer = await decoder.decodeAudioData(await response.arrayBuffer())
      if (!disposed && token === revision) levels = decodedLevels(buffer)
    } catch { /* Opaque media can still play through the original element. */ }
  }
  function stopMeter() { clearInterval(interval); interval = undefined }
  return {
    set src(url) { audio.src = url; measure(url) },
    play() {
      audio.play().catch(error => {
        if (!disposed && error.name !== 'AbortError') errorHandler()
      })
    },
    pause() { audio.pause() },
    stop() { stopMeter(); audio.pause(); audio.currentTime = 0 },
    destroy() {
      disposed = true
      stopMeter()
      controller?.abort()
      audio.onplaying = audio.onpause = audio.onended = audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    },
    onPlay(handler) { audio.onplaying = () => {
      handler()
      stopMeter()
      interval = setInterval(() => {
        const index = Math.floor(audio.currentTime / 0.08)
        if (!audio.paused && index < levels.length) onLevel(levels[index])
      }, 80)
    } },
    onPause(handler) { audio.onpause = () => { stopMeter(); handler() } },
    onEnded(handler) { audio.onended = () => { stopMeter(); handler() } },
    onError(handler) { errorHandler = handler; audio.onerror = () => { stopMeter(); handler() } }
  }
}
