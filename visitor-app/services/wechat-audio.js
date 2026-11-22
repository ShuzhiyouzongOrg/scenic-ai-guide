import { decodedLevels } from './decoded-levels.js'

let nativeRecorder
let capture

// The requested 2 KiB mono PCM frames at 16 kHz span 64 ms. Allow eight
// frame periods for batched delivery before marking the last reading stale.
const microphoneGapMs = 512

function clearFrameCheck(session) {
  if (session?.frameTimer != null) clearTimeout(session.frameTimer)
  if (session) session.frameTimer = null
}

function noteValidFrame(session) {
  session.lastFrameAt = Date.now()
  if (session.frameTimer != null) return
  function check() {
    session.frameTimer = null
    if (capture !== session || session.stopping) return
    const remaining = microphoneGapMs - (Date.now() - session.lastFrameAt)
    if (remaining > 0) session.frameTimer = setTimeout(check, remaining)
    else session.handlers.frame?.(-1)
  }
  session.frameTimer = setTimeout(check, microphoneGapMs)
}

// RecorderManager is a WeChat singleton. Several base libraries expose on*
// without off*. Install native listeners once and route to the active page.
export function createWechatRecorder() {
  const handlers = {}
  if (!nativeRecorder) {
    nativeRecorder = wx.getRecorderManager()
    nativeRecorder.onStart(() => {
      if (!capture) return
      capture.started = true
      if (capture.diagnostic) console.info('[guide-recorder] started', capture.format, 'frame listener', typeof nativeRecorder.onFrameRecorded)
      if (capture.stopping) { nativeRecorder.stop(); return }
      capture.handlers.start?.()
    })
    nativeRecorder.onFrameRecorded?.(event => {
      if (!capture?.started || capture.stopping || capture.format !== 'PCM') return
      capture.callbacks++
      const level = microphoneLevel(event)
      if (level < 0) {
        if (capture.diagnostic && capture.callbacks === 1) console.warn('[guide-recorder] empty PCM callback', event?.frameBuffer?.byteLength ?? 0)
        return
      }
      capture.frames++
      capture.peak = Math.max(capture.peak, level)
      if (capture.frames === 1 && capture.diagnostic) console.info('[guide-recorder] first PCM frame', event.frameBuffer.byteLength, 'bytes, RMS', level)
      noteValidFrame(capture)
      capture.handlers.frame?.(level)
    })
    nativeRecorder.onStop(event => {
      const finished = capture
      clearFrameCheck(finished)
      capture = null
      if (finished?.diagnostic) console.info('[guide-recorder] stopped', finished.format, 'callbacks', finished.callbacks, 'PCM frames', finished.frames, 'peak RMS', finished.frames ? finished.peak : 'unavailable')
      finished?.handlers.stop?.(event)
    })
    nativeRecorder.onError(error => {
      const failed = capture
      clearFrameCheck(failed)
      capture = null
      if (failed?.diagnostic) console.warn('[guide-recorder]', failed.format, error.errMsg)
      failed?.handlers.error?.(error)
    })
    nativeRecorder.onInterruptionBegin?.(() => {
      if (!capture) return
      clearFrameCheck(capture)
      capture.handlers.interrupt?.()
    })
  }
  return {
    onStart(fn) { handlers.start = fn }, offStart() { delete handlers.start },
    onStop(fn) { handlers.stop = fn }, offStop() { delete handlers.stop },
    onError(fn) { handlers.error = fn }, offError() { delete handlers.error },
    onFrameRecorded(fn) { handlers.frame = fn }, offFrameRecorded() { delete handlers.frame },
    onInterruptionBegin(fn) { handlers.interrupt = fn }, offInterruptionBegin() { delete handlers.interrupt },
    start(options) {
      if (capture) { handlers.error?.({ errMsg: 'recorder is busy' }); return }
      let diagnostic = false
      try { diagnostic = ['develop', 'trial'].includes(wx.getAccountInfoSync().miniProgram.envVersion) || wx.getDeviceInfo?.().platform === 'devtools' } catch {}
      capture = { handlers, started: false, stopping: false, format: options.format, diagnostic, callbacks: 0, frames: 0, peak: 0 }
      const args = { duration: options.duration, format: options.format, sampleRate: options.sampleRate, numberOfChannels: options.numberOfChannels }
      if (options.frameSize != null) args.frameSize = options.frameSize
      if (options.encodeBitRate != null) args.encodeBitRate = options.encodeBitRate
      try { nativeRecorder.start(args) }
      catch (error) { capture = null; handlers.error?.({ errMsg: String(error?.message || error) }) }
    },
    stop() {
      if (capture?.handlers !== handlers || capture.stopping) return
      capture.stopping = true
      clearFrameCheck(capture)
      if (capture.started) nativeRecorder.stop()
    }
  }
}

export function microphoneLevel(event) {
  const bytes = event?.frameBuffer
  if (!bytes || !(bytes.byteLength >= 2)) return -1
  const view = ArrayBuffer.isView(bytes) ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes)
  const count = Math.floor(view.byteLength / 2)
  let energy = 0
  for (let i = 0; i < count; i++) energy += (view.getInt16(i * 2, true) / 32768) ** 2
  return Math.sqrt(energy / count)
}

// InnerAudioContext owns playback. Decode a copy only if the service supplied
// no PCM envelope. No buffer source or second audio output is created here.
export function measureWechatSegment(url, accept) {
  let decoder, task, cancelled = false
  function close() {
    try { decoder?.close() } catch { /* Older hosts may already have freed it. */ }
    decoder = null
  }
  if (typeof wx.createWebAudioContext === 'function') {
    task = wx.request({ url, responseType: 'arraybuffer', timeout: 8000,
      success(result) {
        if (cancelled || result.statusCode !== 200 || !result.data?.byteLength) return
        try {
          decoder = wx.createWebAudioContext()
          decoder.decodeAudioData(result.data, buffer => {
            try { if (!cancelled) accept(decodedLevels(buffer)) } finally { close() }
          }, close)
        } catch { close() }
      }
    })
  }
  return () => { cancelled = true; task?.abort(); close() }
}
