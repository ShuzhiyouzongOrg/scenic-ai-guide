// RMS windows on the actual decoded signal, indexed by the existing player's
// currentTime. The analyser has no audio output and cannot silence the player.
export function decodedLevels(buffer) {
  const stride = Math.max(1, Math.round(buffer.sampleRate * 0.08))
  const streams = []
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) streams.push(buffer.getChannelData(channel))
  const levels = []
  for (let start = 0; start < buffer.length; start += stride) {
    const end = Math.min(start + stride, buffer.length)
    let energy = 0
    for (const samples of streams) for (let i = start; i < end; i++) energy += samples[i] * samples[i]
    levels.push(Math.sqrt(energy / ((end - start) * streams.length)))
  }
  return levels
}
