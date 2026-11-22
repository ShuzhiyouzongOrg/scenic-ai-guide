// WEB only. ask-upload accepts mono 16-bit PCM WAV; browsers select their own capture codec.
import { startStreamMeter } from './web-audio-meter.js'

async function toWave(blob) {
  const sampleRate = 16000
  const decoder = new OfflineAudioContext(1, 1, sampleRate)
  const audio = await decoder.decodeAudioData(await blob.arrayBuffer())
  if (audio.length === 0) throw new Error('没有收到录音')
  const data = new DataView(new ArrayBuffer(44 + audio.length * 2))
  function writeTag(offset, tag) {
    for (let i = 0; i < tag.length; i++) data.setUint8(offset + i, tag.charCodeAt(i))
  }
  writeTag(0, 'RIFF')
  data.setUint32(4, 36 + audio.length * 2, true)
  writeTag(8, 'WAVE')
  writeTag(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, 1, true)
  data.setUint32(24, sampleRate, true)
  data.setUint32(28, sampleRate * 2, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  writeTag(36, 'data')
  data.setUint32(40, audio.length * 2, true)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  for (let i = 0; i < audio.length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]
    const sample = Math.max(-1, Math.min(1, sum / channels.length))
    data.setInt16(44 + 2 * i, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  }
  return new Blob([data.buffer], { type: 'audio/wav' })
}

export function createWebRecording(onStart, onProcessing, onFile, onError, onLevel = () => {}) {
  let recorder = null
  let capture = null
  let cancelled = false
  let timer = null
  let stopMeter = () => {}
  const release = () => {
    stopMeter()
    clearTimeout(timer)
    capture?.getTracks().forEach(track => track.stop())
    capture = null
  }
  const stop = (discard = false) => {
    if (discard) cancelled = true
    if (recorder?.state === 'recording') recorder.stop()
    release()
  }
  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.OfflineAudioContext) {
        onError('当前浏览器无法录音，请使用文字提问', true)
        return
      }
      capture = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      if (cancelled) { release(); return }
      recorder = new MediaRecorder(capture)
      const chunks = []
      recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data) }
      recorder.onerror = () => {
        if (!cancelled) onError('录音中断，请重新录制', false)
        stop(true)
      }
      recorder.onstart = () => {
        if (cancelled) return
        onStart()
        stopMeter = startStreamMeter(capture, onLevel)
      }
      recorder.onstop = async () => {
        release()
        if (cancelled) return
        onProcessing()
        try {
          const wav = await toWave(new Blob(chunks, { type: recorder.mimeType }))
          if (cancelled) return
          const url = URL.createObjectURL(wav)
          try { await onFile(url) } finally { URL.revokeObjectURL(url) }
        } catch (error) {
          if (!cancelled) onError('录音读取失败，请重试或使用文字', false)
        }
      }
      recorder.start()
      timer = setTimeout(() => stop(), 60000)
    } catch (error) {
      release()
      if (!cancelled) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') onError('麦克风未获授权，可在浏览器设置中允许录音', true)
        else if (error.name === 'NotSupportedError') onError('当前浏览器无法录音，请使用文字提问', true)
        else onError('无法使用麦克风，请检查设备或使用文字', error.name === 'NotFoundError')
      }
    }
  }
  return { start, stop }
}
