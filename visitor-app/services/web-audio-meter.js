// Read a parallel copy of a media stream. Never redirect or duplicate audible
// playback. A missing source, blocked context or muted track has no measurement.
export function startStreamMeter(stream, onLevel) {
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context || !stream?.getAudioTracks().length) return () => {}
  let context, source, interval
  let disposed = false
  const close = () => {
    if (disposed) return
    disposed = true
    clearInterval(interval)
    source?.disconnect()
    if (context && context.state !== 'closed') context.close().catch(() => {})
  }
  try {
    context = new Context()
    source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    const samples = new Float32Array(analyser.fftSize)
    source.connect(analyser)
    if (context.state === 'suspended') context.resume().catch(close)
    interval = setInterval(() => {
      if (context.state !== 'running' || !stream.getAudioTracks().some(track => track.readyState === 'live' && !track.muted)) {
        onLevel(-1)
        return
      }
      analyser.getFloatTimeDomainData(samples)
      let energy = 0
      for (const sample of samples) energy += sample * sample
      onLevel(Math.sqrt(energy / samples.length))
    }, 80)
  } catch { close() }
  return close
}
