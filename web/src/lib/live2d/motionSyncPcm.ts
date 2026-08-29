/**
 * @fileoverview MotionSync PCM 时钟对齐工具。
 * @description 提供按 Web Audio 播放时钟读取 PCM、混合声道和拼接样本片段的能力。
 */

/**
 * @class
 * @description 维护 PCM 读取游标，只返回按播放时钟已经到达扬声器的样本。
 * @example
 * const cursor = new MotionSyncPcmCursor()
 * cursor.begin(pcm, 48000, audioContext.currentTime)
 */
export class MotionSyncPcmCursor {
  /**
   * @description 绑定一段新的 PCM 数据并重置读取游标。
   * @param {Float32Array} pcm 单声道 PCM 样本。
   * @param {number} sampleRate PCM 采样率，单位为赫兹。
   * @param {number} startedAt 音频在 Web Audio 时钟中的开始时间。
   * @returns {void} 无返回值。
   */
  public begin(pcm: Float32Array, sampleRate: number, startedAt: number): void {
    this._pcm = pcm
    this._sampleRate = sampleRate
    this._startedAt = startedAt
    this._cursor = 0
  }

  /**
   * @description 读取从当前游标到指定播放时刻之间尚未提交的 PCM 样本。
   * @param {number} currentTime 当前 Web Audio 时钟时间。
   * @returns {Float32Array} 已到播放时刻的增量 PCM；没有新增样本时返回空数组。
   */
  public readUntil(currentTime: number): Float32Array {
    if (!this._pcm.length || this._sampleRate <= 0) return EMPTY_PCM
    const elapsedSeconds = Math.max(0, currentTime - this._startedAt)
    const end = Math.min(this._pcm.length, Math.floor(elapsedSeconds * this._sampleRate))
    if (end <= this._cursor) return EMPTY_PCM
    const chunk = this._pcm.slice(this._cursor, end)
    this._cursor = end
    return chunk
  }

  /**
   * @description 读取并消费游标之后的全部剩余 PCM 样本。
   * @returns {Float32Array} 剩余 PCM；已读完时返回空数组。
   */
  public drain(): Float32Array {
    if (this._cursor >= this._pcm.length) return EMPTY_PCM
    const chunk = this._pcm.slice(this._cursor)
    this._cursor = this._pcm.length
    return chunk
  }

  /**
   * @description 清空 PCM、采样率、开始时间和读取游标。
   * @returns {void} 无返回值。
   */
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

/**
 * @description 将多个音频声道按平均权重混合为单声道 PCM。
 * @param {readonly Float32Array[]} channels 待混合的音频声道数组。
 * @returns {Float32Array} 以最短声道长度为准的单声道 PCM。
 * @example
 * const mono = mixAudioChannels([leftChannel, rightChannel])
 */
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

/**
 * @description 按输入顺序拼接所有非空 PCM 片段。
 * @param {readonly Float32Array[]} chunks 待拼接的 PCM 片段。
 * @returns {Float32Array} 连续 PCM 数据；全部为空时返回共享空数组。
 * @example
 * const pcm = concatPcmChunks([firstChunk, secondChunk])
 */
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
