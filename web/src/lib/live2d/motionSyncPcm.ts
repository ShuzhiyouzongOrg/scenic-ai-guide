/**
 * Keeps MotionSync PCM delivery aligned with the Web Audio playback clock.
 * The cursor only returns samples that have actually reached the speakers.
 */
export class MotionSyncPcmCursor {
  public begin(pcm: Float32Array, sampleRate: number, startedAt: number): void {
    this._pcm = pcm
    this._sampleRate = sampleRate
    this._startedAt = startedAt
    this._cursor = 0
  }

  public readUntil(currentTime: number): Float32Array {
    if (!this._pcm.length || this._sampleRate <= 0) return EMPTY_PCM
    const elapsedSeconds = Math.max(0, currentTime - this._startedAt)
    const end = Math.min(this._pcm.length, Math.floor(elapsedSeconds * this._sampleRate))
    if (end <= this._cursor) return EMPTY_PCM
    const chunk = this._pcm.slice(this._cursor, end)
    this._cursor = end
    return chunk
  }

  public drain(): Float32Array {
    if (this._cursor >= this._pcm.length) return EMPTY_PCM
    const chunk = this._pcm.slice(this._cursor)
    this._cursor = this._pcm.length
    return chunk
  }

  public reset(): void {
    this._pcm = EMPTY_PCM
    this._sampleRate = 0
    this._startedAt = 0
    this._cursor = 0
  }

  private _pcm: Float32Array = EMPTY_PCM
  private _sampleRate = 0
  private _startedAt = 0
  private _cursor = 0
}

export function mixAudioChannels(channels: readonly Float32Array[]): Float32Array {
  if (!channels.length) return EMPTY_PCM
  if (channels.length === 1) return channels[0].slice()

  const length = Math.min(...channels.map((channel) => channel.length))
  const mono = new Float32Array(length)
  const scale = 1 / channels.length
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) mono[index] += channel[index] * scale
  }
  return mono
}

export function concatPcmChunks(chunks: readonly Float32Array[]): Float32Array {
  const nonEmpty = chunks.filter((chunk) => chunk.length > 0)
  if (!nonEmpty.length) return EMPTY_PCM
  if (nonEmpty.length === 1) return nonEmpty[0]

  const result = new Float32Array(nonEmpty.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of nonEmpty) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

const EMPTY_PCM = new Float32Array(0)
