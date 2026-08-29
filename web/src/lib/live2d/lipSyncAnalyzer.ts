/**
 * @fileoverview Live2D 音频特征口型分析器。
 * @description 在官方 MotionSync Core 不可用时，根据时域与频域数据生成启发式口型参数。
 */

/**
 * @typedef {'playing'|'paused'|'stopped'} LipSyncPlaybackState
 * @description 表示当前音频播放状态，用于控制口型推进、衰减或复位。
 * @example
 * const state: LipSyncPlaybackState = 'playing'
 */
export type LipSyncPlaybackState = 'playing' | 'paused' | 'stopped'

/**
 * @typedef {object} VowelWeights
 * @description 表示五个元音口型的归一化权重。
 * @property {number} a 元音 A 的权重。
 * @property {number} i 元音 I 的权重。
 * @property {number} u 元音 U 的权重。
 * @property {number} e 元音 E 的权重。
 * @property {number} o 元音 O 的权重。
 */
export interface VowelWeights {
  a: number
  i: number
  u: number
  e: number
  o: number
}

/**
 * @typedef {object} LipSyncFrame
 * @description 表示单个渲染帧的 Live2D 口型分析结果。
 * @property {number} mouthOpen 嘴部张开程度，范围为 0 至 1。
 * @property {number} mouthForm 嘴型横向形态，范围为 -1 至 1。
 * @property {VowelWeights} vowels 五元音的当前权重。
 * @property {number} rms 当前音频帧的均方根能量。
 * @property {boolean} voiced 当前音频帧是否通过有声门限。
 */
export interface LipSyncFrame {
  mouthOpen: number
  mouthForm: number
  vowels: VowelWeights
  rms: number
  voiced: boolean
}

/**
 * @typedef {object} LipSyncAnalysisInput
 * @description 表示执行一次口型分析所需的音频与播放状态数据。
 * @property {Float32Array} timeDomain 时域采样数据。
 * @property {Float32Array} spectrumDb 以分贝表示的频谱数据。
 * @property {number} sampleRate 音频采样率，单位为赫兹。
 * @property {number} fftSize 频谱分析使用的 FFT 窗口大小。
 * @property {number} deltaTimeMs 与上一渲染帧的时间间隔，单位为毫秒。
 * @property {LipSyncPlaybackState} playbackState 当前音频播放状态。
 */
export interface LipSyncAnalysisInput {
  timeDomain: Float32Array
  spectrumDb: Float32Array
  sampleRate: number
  fftSize: number
  deltaTimeMs: number
  playbackState: LipSyncPlaybackState
}

interface FrequencyBands {
  low: number
  open: number
  mid: number
  bright: number
  sibilant: number
}

const ZERO_VOWELS: VowelWeights = Object.freeze({ a: 0, i: 0, u: 0, e: 0, o: 0 })

/**
 * @class
 * @description 基于音频特征生成 Live2D 口型帧，不执行音素识别，也不替代官方 Cubism MotionSync。
 * @example
 * const analyzer = new Live2dLipSyncAnalyzer()
 * const frame = analyzer.analyze(input)
 */
export class Live2dLipSyncAnalyzer {
  private envelope = 0
  private mouthForm = 0
  private noiseFloor = 0.004
  private peakRms = 0.08
  private gateOpen = false
  private gateHoldMs = 0
  private previousBands: FrequencyBands = { low: 0, open: 0, mid: 0, bright: 0, sibilant: 0 }
  private vowelState: VowelWeights = { ...ZERO_VOWELS }

  /**
   * @description 分析当前音频帧，并根据播放状态计算平滑后的嘴部与元音参数。
   * @param {LipSyncAnalysisInput} input 时域、频域、采样率和播放状态等输入数据。
   * @returns {LipSyncFrame} 可直接应用于 Live2D 模型的口型帧。
   * @example
   * const frame = analyzer.analyze(input)
   */
  analyze(input: LipSyncAnalysisInput): LipSyncFrame {
    if (input.playbackState === 'stopped') {
      this.resetArticulation()
      return this.silentFrame()
    }

    const deltaTimeMs = clamp(finiteOr(input.deltaTimeMs, 16.67), 1, 100)
    if (input.playbackState === 'paused') {
      this.gateOpen = false
      this.gateHoldMs = 0
      this.envelope = smooth(this.envelope, 0, deltaTimeMs, 18)
      this.mouthForm = smooth(this.mouthForm, 0, deltaTimeMs, 28)
      this.vowelState = smoothVowels(this.vowelState, ZERO_VOWELS, deltaTimeMs, 28)
      return this.frame(0, false)
    }

    const { rms, zeroCrossingRate } = measureWaveform(input.timeDomain)
    this.updateNoiseFloor(rms, deltaTimeMs)
    this.updateGate(rms, deltaTimeMs)

    const bands = measureFrequencyBands(
      input.spectrumDb,
      finiteOr(input.sampleRate, 48000),
      Math.max(32, finiteOr(input.fftSize, input.spectrumDb.length * 2))
    )
    const bandRatios = normalizeBands(bands)
    const spectralFlux = positiveBandFlux(bandRatios, this.previousBands)
    this.previousBands = bandRatios

    this.peakRms = Math.max(rms, this.peakRms * Math.exp(-deltaTimeMs / 1400), 0.035)
    const gateThreshold = Math.max(0.006, this.noiseFloor * 2.2)
    const normalizedEnergy = this.gateOpen
      ? clamp((rms - gateThreshold) / Math.max(0.018, this.peakRms - gateThreshold), 0, 1)
      : 0
    const compressedEnergy = Math.pow(normalizedEnergy, 0.68)
    const unvoicedAmount = clamp(
      Math.max(0, zeroCrossingRate - 0.1) * 1.8 + bandRatios.sibilant * 0.55,
      0,
      0.42
    )
    const baseOpen = clamp(
      compressedEnergy * (1 - unvoicedAmount) + spectralFlux * compressedEnergy * 0.1,
      0,
      1
    )
    const vowelTarget = estimateVowels(bandRatios)
    const tonalConfidence = clamp(1 - unvoicedAmount * 1.8, 0, 1)
    const confidentVowels = scaleVowels(vowelTarget, tonalConfidence)
    this.vowelState = smoothVowels(this.vowelState, confidentVowels, deltaTimeMs, 52)
    const vowelOpenness =
      this.vowelState.a +
      this.vowelState.i * 0.45 +
      this.vowelState.u * 0.45 +
      this.vowelState.e * 0.72 +
      this.vowelState.o * 0.95
    const targetOpen = baseOpen * (0.72 + vowelOpenness * 0.38)
    const envelopeTime = targetOpen > this.envelope ? 28 : 82
    this.envelope = smooth(this.envelope, targetOpen, deltaTimeMs, envelopeTime)

    const targetForm = this.gateOpen
      ? clamp(
          (this.vowelState.a * 0.35 +
            this.vowelState.i +
            this.vowelState.e * 0.75 -
            this.vowelState.u * 0.75 -
            this.vowelState.o * 0.45) *
            0.9,
          -0.75,
          0.75
        )
      : 0
    this.mouthForm = smooth(this.mouthForm, targetForm, deltaTimeMs, 65)

    return this.frame(rms, this.gateOpen)
  }

  /**
   * @description 清空能量包络、噪声门限和元音平滑状态。
   * @returns {void} 无返回值。
   * @example
   * analyzer.reset()
   */
  reset(): void {
    this.envelope = 0
    this.mouthForm = 0
    this.noiseFloor = 0.004
    this.peakRms = 0.08
    this.previousBands = { low: 0, open: 0, mid: 0, bright: 0, sibilant: 0 }
    this.resetArticulation()
  }

  private updateNoiseFloor(rms: number, deltaTimeMs: number): void {
    if (!this.gateOpen && rms < Math.max(0.025, this.noiseFloor * 2.5)) {
      this.noiseFloor = smooth(this.noiseFloor, clamp(rms, 0.0015, 0.02), deltaTimeMs, 1600)
    }
  }

  private updateGate(rms: number, deltaTimeMs: number): void {
    const openThreshold = Math.max(0.008, this.noiseFloor * 2.7)
    const closeThreshold = Math.max(0.005, this.noiseFloor * 1.8)
    if (rms >= openThreshold) {
      this.gateOpen = true
      this.gateHoldMs = 58
      return
    }
    if (this.gateOpen && rms >= closeThreshold) {
      this.gateHoldMs = Math.max(this.gateHoldMs, 34)
      return
    }
    this.gateHoldMs = Math.max(0, this.gateHoldMs - deltaTimeMs)
    if (this.gateHoldMs === 0) this.gateOpen = false
  }

  private resetArticulation(): void {
    this.envelope = 0
    this.mouthForm = 0
    this.gateOpen = false
    this.gateHoldMs = 0
    this.vowelState = { ...ZERO_VOWELS }
  }

  private frame(rms: number, voiced: boolean): LipSyncFrame {
    const vowelScale = this.envelope
    return {
      mouthOpen: clamp(this.envelope, 0, 1),
      mouthForm: clamp(this.mouthForm, -1, 1),
      vowels: {
        a: this.vowelState.a * vowelScale,
        i: this.vowelState.i * vowelScale,
        u: this.vowelState.u * vowelScale,
        e: this.vowelState.e * vowelScale,
        o: this.vowelState.o * vowelScale
      },
      rms,
      voiced
    }
  }

  private silentFrame(): LipSyncFrame {
    return { mouthOpen: 0, mouthForm: 0, vowels: { ...ZERO_VOWELS }, rms: 0, voiced: false }
  }
}

function measureWaveform(samples: Float32Array): { rms: number; zeroCrossingRate: number } {
  if (!samples.length) return { rms: 0, zeroCrossingRate: 0 }
  let mean = 0
  for (const value of samples) mean += finiteOr(value, 0)
  mean /= samples.length

  let sumSquares = 0
  let crossings = 0
  let previous = finiteOr(samples[0], 0) - mean
  for (let index = 0; index < samples.length; index += 1) {
    const centered = finiteOr(samples[index], 0) - mean
    sumSquares += centered * centered
    if (index > 0 && centered >= 0 !== previous >= 0) crossings += 1
    previous = centered
  }
  return {
    rms: Math.sqrt(sumSquares / samples.length),
    zeroCrossingRate: crossings / Math.max(1, samples.length - 1)
  }
}

function measureFrequencyBands(
  spectrumDb: Float32Array,
  sampleRate: number,
  fftSize: number
): FrequencyBands {
  return {
    low: meanBandPower(spectrumDb, sampleRate, fftSize, 160, 500),
    open: meanBandPower(spectrumDb, sampleRate, fftSize, 500, 900),
    mid: meanBandPower(spectrumDb, sampleRate, fftSize, 900, 1600),
    bright: meanBandPower(spectrumDb, sampleRate, fftSize, 1600, 2800),
    sibilant: meanBandPower(spectrumDb, sampleRate, fftSize, 2800, 6000)
  }
}

function meanBandPower(
  spectrumDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number
): number {
  if (!spectrumDb.length || sampleRate <= 0 || fftSize <= 0) return 0
  const binHz = sampleRate / fftSize
  const start = clamp(Math.ceil(minHz / binHz), 0, spectrumDb.length - 1)
  const end = clamp(Math.floor(maxHz / binHz), start, spectrumDb.length - 1)
  let sum = 0
  let count = 0
  for (let index = start; index <= end; index += 1) {
    const db = finiteOr(spectrumDb[index], -120)
    sum += Math.pow(10, clamp(db, -120, 0) / 10)
    count += 1
  }
  return count ? sum / count : 0
}

function normalizeBands(bands: FrequencyBands): FrequencyBands {
  const total = bands.low + bands.open + bands.mid + bands.bright + bands.sibilant
  if (total <= Number.EPSILON) return { low: 0, open: 0, mid: 0, bright: 0, sibilant: 0 }
  return {
    low: bands.low / total,
    open: bands.open / total,
    mid: bands.mid / total,
    bright: bands.bright / total,
    sibilant: bands.sibilant / total
  }
}

function estimateVowels(bands: FrequencyBands): VowelWeights {
  const scores = {
    a: bands.open * 1.35 + bands.mid * 0.8 + bands.low * 0.15,
    i: bands.low * 0.35 + bands.bright * 1.45 + bands.mid * 0.15,
    u: bands.low * 1.25 + bands.open * 0.35 - bands.bright * 0.35,
    e: bands.open * 0.45 + bands.mid * 0.65 + bands.bright * 0.85,
    o: bands.low * 0.55 + bands.open * 1.05 + bands.mid * 0.4 - bands.bright * 0.25
  }
  return softmaxVowels(scores, 5.5)
}

function softmaxVowels(scores: VowelWeights, sharpness: number): VowelWeights {
  const maximum = Math.max(scores.a, scores.i, scores.u, scores.e, scores.o)
  const exponentials = {
    a: Math.exp((scores.a - maximum) * sharpness),
    i: Math.exp((scores.i - maximum) * sharpness),
    u: Math.exp((scores.u - maximum) * sharpness),
    e: Math.exp((scores.e - maximum) * sharpness),
    o: Math.exp((scores.o - maximum) * sharpness)
  }
  const total = exponentials.a + exponentials.i + exponentials.u + exponentials.e + exponentials.o
  return {
    a: exponentials.a / total,
    i: exponentials.i / total,
    u: exponentials.u / total,
    e: exponentials.e / total,
    o: exponentials.o / total
  }
}

function positiveBandFlux(current: FrequencyBands, previous: FrequencyBands): number {
  return clamp(
    Math.max(0, current.low - previous.low) +
      Math.max(0, current.open - previous.open) +
      Math.max(0, current.mid - previous.mid) +
      Math.max(0, current.bright - previous.bright) +
      Math.max(0, current.sibilant - previous.sibilant),
    0,
    1
  )
}

function smooth(
  current: number,
  target: number,
  deltaTimeMs: number,
  timeConstantMs: number
): number {
  const alpha = 1 - Math.exp(-deltaTimeMs / Math.max(1, timeConstantMs))
  return current + (target - current) * alpha
}

function smoothVowels(
  current: VowelWeights,
  target: VowelWeights,
  deltaTimeMs: number,
  timeConstantMs: number
): VowelWeights {
  return {
    a: smooth(current.a, target.a, deltaTimeMs, timeConstantMs),
    i: smooth(current.i, target.i, deltaTimeMs, timeConstantMs),
    u: smooth(current.u, target.u, deltaTimeMs, timeConstantMs),
    e: smooth(current.e, target.e, deltaTimeMs, timeConstantMs),
    o: smooth(current.o, target.o, deltaTimeMs, timeConstantMs)
  }
}

function scaleVowels(vowels: VowelWeights, scale: number): VowelWeights {
  return {
    a: vowels.a * scale,
    i: vowels.i * scale,
    u: vowels.u * scale,
    e: vowels.e * scale,
    o: vowels.o * scale
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
