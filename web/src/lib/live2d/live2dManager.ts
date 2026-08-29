/**
 * @fileoverview Live2D 模型与音频播放协调管理器。
 * @description 统一管理模型加载状态、TTS 音频队列、口型分析和 MotionSync PCM 数据。
 */

import { LAppDelegate } from '@/lib/live2d/src/lappdelegate'
import { Live2dLipSyncAnalyzer, type LipSyncFrame } from './lipSyncAnalyzer'
import { concatPcmChunks, mixAudioChannels, MotionSyncPcmCursor } from './motionSyncPcm'
import type { ResourceModel } from './resource'

/**
 * @class
 * @description 以单例方式协调 Live2D 角色切换、音频播放和口型同步状态。
 * @example
 * const manager = Live2dManager.getInstance()
 */
export class Live2dManager {
  /**
   * @description 获取 Live2D 管理器单例，首次调用时创建音频上下文。
   * @returns {Live2dManager} Live2D 管理器单例。
   * @throws {Error} 当前浏览器不支持 Web Audio API 时抛出异常。
   * @example
   * const manager = Live2dManager.getInstance()
   */
  public static getInstance(): Live2dManager {
    if (!this._instance) this._instance = new Live2dManager()
    return this._instance
  }

  /**
   * @description 释放当前管理器单例及其音频资源。
   * @returns {void} 无返回值。
   * @example
   * Live2dManager.releaseInstance()
   */
  public static releaseInstance(): void {
    const instance = this._instance
    this._instance = undefined
    instance?.release()
  }

  /**
   * @description 开始一次由指定所有者发起的模型加载，并清空旧错误状态。
   * @param {object} owner 本次模型加载请求的所有者标识。
   * @returns {void} 无返回值。
   */
  public beginModelLoad(owner: object): void {
    this._readyOwner = owner
    this._ready = false
    this._modelLoadError = null
  }

  /**
   * @description 判断指定所有者是否仍对应当前模型加载请求。
   * @param {object} owner 待核对的模型加载所有者。
   * @returns {boolean} 所有者与当前请求一致时返回 `true`。
   */
  public isModelLoadCurrent(owner: object): boolean {
    return this._readyOwner === owner
  }

  /**
   * @description 更新模型就绪状态，并忽略非当前所有者提交的过期成功结果。
   * @param {boolean} ready 模型是否已经完成加载。
   * @param {object} [owner] 提交就绪状态的加载所有者。
   * @returns {void} 无返回值。
   */
  public setReady(ready: boolean, owner?: object): void {
    if (ready && owner !== this._readyOwner) return
    if (!ready && !owner) this._readyOwner = null
    if (ready) this._modelLoadError = null
    this._ready = ready
  }

  /**
   * @description 记录当前加载请求的模型错误，并将模型标记为未就绪。
   * @param {string} message 面向调用方的模型加载错误信息。
   * @param {object} owner 提交错误的加载所有者。
   * @returns {void} 无返回值。
   */
  public setModelLoadError(message: string, owner: object): void {
    if (owner !== this._readyOwner) return
    this._ready = false
    this._modelLoadError = message
  }

  /**
   * @description 获取最近一次有效模型加载请求的错误信息。
   * @returns {string|null} 错误文本；没有错误时返回 `null`。
   */
  public getModelLoadError(): string | null {
    return this._modelLoadError
  }

  /**
   * @description 判断当前 Live2D 模型是否已可用于渲染。
   * @returns {boolean} 模型已就绪时返回 `true`。
   */
  public isReady(): boolean {
    return this._ready
  }

  /**
   * @description 清除就绪状态，并委托应用层切换或卸载 Live2D 角色。
   * @param {ResourceModel|null} character 新角色资源；传入 `null` 表示卸载角色。
   * @returns {void} 无返回值。
   * @example
   * manager.changeCharacter(character)
   */
  public changeCharacter(character: ResourceModel | null): void {
    this.setReady(false)
    LAppDelegate.getInstance().changeCharacter(character)
  }

  /**
   * @description 设置口型振幅系数，并将数值限制在 0 至 1.5 范围内。
   * @param {number} weight 期望的口型振幅系数。
   * @returns {void} 无返回值。
   */
  public setLipFactor(weight: number): void {
    this._lipFactor = Math.max(0, Math.min(1.5, weight))
  }

  /**
   * @description 获取当前口型振幅系数。
   * @returns {number} 范围为 0 至 1.5 的口型系数。
   */
  public getLipFactor(): number {
    return this._lipFactor
  }

  /**
   * @description 批量解码非空 TTS 音频并加入播放队列，随后自动开始播放。
   * @param {ArrayBuffer[]} audioData 待解码的音频二进制数组。
   * @returns {Promise<number>} 成功解码并加入队列的音频片段数量。
   * @example
   * const count = await manager.enqueueAudioBatch(audioBuffers)
   */
  public async enqueueAudioBatch(audioData: ArrayBuffer[]): Promise<number> {
    const inputs = audioData.filter((buffer) => buffer.byteLength > 0)
    if (!inputs.length) return 0
    const token = this._playbackToken
    const decoded = await Promise.all(
      inputs.map(async (buffer) => {
        try {
          return await this._audioContext.decodeAudioData(buffer.slice(0))
        } catch {
          return null
        }
      })
    )
    if (token !== this._playbackToken) return 0
    const validBuffers = decoded.filter((buffer): buffer is AudioBuffer => Boolean(buffer))
    this._ttsQueue.push(...validBuffers)
    this.playAudio()
    return validBuffers.length
  }

  /**
   * @description 清空尚未开始播放的 TTS 音频队列。
   * @returns {void} 无返回值。
   */
  public clearAudioQueue(): void {
    this._ttsQueue = []
  }

  /**
   * @description 播放队首音频，并将 PCM 游标与 Web Audio 播放时钟对齐。
   * @returns {void} 无返回值。
   */
  public playAudio(): void {
    if (this._audioIsPlaying) return
    const buffer = this._ttsQueue.shift()
    if (!buffer) return
    const token = this._playbackToken
    const source = this._audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this._analyser)
    source.onended = () => {
      if (token !== this._playbackToken || this._audioSource !== source) return
      const remainingPcm = this._motionSyncCursor.drain()
      if (remainingPcm.length) this._pendingMotionSyncPcm.push(remainingPcm)
      source.disconnect()
      this._audioSource = null
      this._audioIsPlaying = false
      this.playAudio()
    }
    this._audioSource = source
    this._audioIsPlaying = true
    try {
      const startedAt = this._audioContext.currentTime
      this._motionSyncCursor.begin(
        mixAudioChannels(
          Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
            buffer.getChannelData(channel)
          )
        ),
        buffer.sampleRate,
        startedAt
      )
      source.start(startedAt)
    } catch {
      this._motionSyncCursor.reset()
      source.disconnect()
      this._audioSource = null
      this._audioIsPlaying = false
      this.playAudio()
    }
  }

  /**
   * @description 根据当前音频分析数据生成本次渲染所需的口型参数。
   * @param {number} [deltaTimeSeconds=1/60] 与上一渲染帧的时间间隔，单位为秒。
   * @returns {LipSyncFrame} 当前渲染帧的口型分析结果。
   * @example
   * const frame = manager.getLipSyncFrame(1 / 60)
   */
  public getLipSyncFrame(deltaTimeSeconds = 1 / 60): LipSyncFrame {
    const contextRunning = this._audioContext.state === 'running'
    const playbackState = !this._audioIsPlaying ? 'stopped' : contextRunning ? 'playing' : 'paused'

    if (playbackState === 'playing') {
      this._analyser.getFloatTimeDomainData(this._timeDomain)
      this._analyser.getFloatFrequencyData(this._frequencyDomain)
    } else {
      this._timeDomain.fill(0)
      this._frequencyDomain.fill(-120)
    }

    return this._lipSyncAnalyzer.analyze({
      timeDomain: this._timeDomain,
      spectrumDb: this._frequencyDomain,
      sampleRate: this._audioContext.sampleRate,
      fftSize: this._analyser.fftSize,
      deltaTimeMs: deltaTimeSeconds * 1000,
      playbackState
    })
  }

  /**
   * @description 读取播放时钟已经经过的单声道 PCM，并合并前一音频的剩余样本。
   * @returns {Float32Array} 可立即提交给 MotionSync 的 PCM 样本。
   * @example
   * const pcm = manager.readMotionSyncPcm()
   */
  public readMotionSyncPcm(): Float32Array {
    const pending = this._pendingMotionSyncPcm
    this._pendingMotionSyncPcm = []
    return concatPcmChunks([
      ...pending,
      this._motionSyncCursor.readUntil(this._audioContext.currentTime)
    ])
  }

  /**
   * @description 获取当前 Web Audio 上下文的采样率。
   * @returns {number} 音频采样率，单位为赫兹。
   */
  public getAudioSampleRate(): number {
    return this._audioContext.sampleRate
  }

  /**
   * @description 获取用于识别过期异步播放任务的递增令牌。
   * @returns {number} 当前播放令牌。
   */
  public getPlaybackToken(): number {
    return this._playbackToken
  }

  /**
   * @description 停止当前音频、清空队列与 PCM 状态，并使旧异步任务失效。
   * @returns {void} 无返回值。
   * @example
   * manager.stopAudio()
   */
  public stopAudio(): void {
    this._playbackToken += 1
    this.clearAudioQueue()
    const source = this._audioSource
    this._audioSource = null
    this._audioIsPlaying = false
    this._pendingMotionSyncPcm = []
    this._motionSyncCursor.reset()
    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // 音频源可能已经自然播放结束。
      }
      source.disconnect()
    }
    this._lipSyncAnalyzer.reset()
  }

  /**
   * @description 判断是否存在正在播放的音频源。
   * @returns {boolean} 音频源正在播放时返回 `true`。
   */
  public isAudioPlaying(): boolean {
    return this._audioIsPlaying
  }

  /**
   * @description 判断 TTS 音频队列中是否仍有待播放片段。
   * @returns {boolean} 队列非空时返回 `true`。
   */
  public hasQueuedAudio(): boolean {
    return this._ttsQueue.length > 0
  }

  /**
   * @description 判断 Web Audio 上下文是否处于运行状态。
   * @returns {boolean} 音频上下文可立即播放时返回 `true`。
   */
  public isAudioReady(): boolean {
    return this._audioContext.state === 'running'
  }

  /**
   * @description 恢复被挂起的音频上下文，并继续消费播放队列。
   * @returns {Promise<void>} 音频上下文恢复完成后兑现。
   * @throws {DOMException} 浏览器拒绝恢复音频上下文时以 Promise 拒绝。
   * @example
   * await manager.resume()
   */
  public async resume(): Promise<void> {
    if (this._audioContext.state === 'suspended') await this._audioContext.resume()
    this.playAudio()
  }

  /**
   * @description 挂起正在运行的音频上下文，保留当前播放位置与队列。
   * @returns {Promise<void>} 音频上下文挂起完成后兑现。
   * @throws {DOMException} 浏览器拒绝挂起音频上下文时以 Promise 拒绝。
   * @example
   * await manager.pauseAudio()
   */
  public async pauseAudio(): Promise<void> {
    if (this._audioContext.state === 'running') await this._audioContext.suspend()
  }

  private release(): void {
    this.stopAudio()
    this._ready = false
    this._readyOwner = null
    this._modelLoadError = null
    this._analyser.disconnect()
    if (this._audioContext.state !== 'closed') void this._audioContext.close()
  }

  private constructor() {
    const browserWindow = window as Window & {
      webkitAudioContext?: typeof AudioContext
    }
    const AudioContextConstructor = window.AudioContext || browserWindow.webkitAudioContext
    if (!AudioContextConstructor) throw new Error('Web Audio API is unavailable.')
    this._audioContext = new AudioContextConstructor()
    this._analyser = this._audioContext.createAnalyser()
    this._analyser.fftSize = 2048
    this._analyser.smoothingTimeConstant = 0.28
    this._analyser.connect(this._audioContext.destination)
    this._timeDomain = new Float32Array(this._analyser.fftSize)
    this._frequencyDomain = new Float32Array(this._analyser.frequencyBinCount)
    this._frequencyDomain.fill(-120)
  }

  private static _instance: Live2dManager | undefined
  private _ttsQueue: AudioBuffer[] = []
  private readonly _audioContext: AudioContext
  private readonly _analyser: AnalyserNode
  private readonly _timeDomain: Float32Array
  private readonly _frequencyDomain: Float32Array
  private readonly _lipSyncAnalyzer = new Live2dLipSyncAnalyzer()
  private readonly _motionSyncCursor = new MotionSyncPcmCursor()
  private _pendingMotionSyncPcm: Float32Array[] = []
  private _audioIsPlaying = false
  private _audioSource: AudioBufferSourceNode | null = null
  private _playbackToken = 0
  private _lipFactor = 1
  private _ready = false
  private _readyOwner: object | null = null
  private _modelLoadError: string | null = null
}
