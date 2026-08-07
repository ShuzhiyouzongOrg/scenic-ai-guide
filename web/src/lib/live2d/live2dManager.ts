import { LAppDelegate } from '@/lib/live2d/src/lappdelegate'
import { Live2dLipSyncAnalyzer, type LipSyncFrame } from './lipSyncAnalyzer'
import type { ResourceModel } from './resource'

export class Live2dManager {
  public static getInstance(): Live2dManager {
    if (!this._instance) this._instance = new Live2dManager()
    return this._instance
  }

  public static releaseInstance(): void {
    const instance = this._instance
    this._instance = undefined
    instance?.release()
  }

  public beginModelLoad(owner: object): void {
    this._readyOwner = owner
    this._ready = false
    this._modelLoadError = null
  }

  public isModelLoadCurrent(owner: object): boolean {
    return this._readyOwner === owner
  }

  public setReady(ready: boolean, owner?: object): void {
    if (ready && owner !== this._readyOwner) return
    if (!ready && !owner) this._readyOwner = null
    if (ready) this._modelLoadError = null
    this._ready = ready
  }

  public setModelLoadError(message: string, owner: object): void {
    if (owner !== this._readyOwner) return
    this._ready = false
    this._modelLoadError = message
  }

  public getModelLoadError(): string | null {
    return this._modelLoadError
  }

  public isReady(): boolean {
    return this._ready
  }

  public changeCharacter(character: ResourceModel | null): void {
    this.setReady(false)
    LAppDelegate.getInstance().changeCharacter(character)
  }

  public setLipFactor(weight: number): void {
    this._lipFactor = Math.max(0, Math.min(1.5, weight))
  }

  public getLipFactor(): number {
    return this._lipFactor
  }

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

  public clearAudioQueue(): void {
    this._ttsQueue = []
  }

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
      source.disconnect()
      this._audioSource = null
      this._audioIsPlaying = false
      this.playAudio()
    }
    this._audioSource = source
    this._audioIsPlaying = true
    try {
      source.start()
    } catch {
      source.disconnect()
      this._audioSource = null
      this._audioIsPlaying = false
      this.playAudio()
    }
  }

  /** Returns audio-derived mouth parameters for the current render frame. */
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

  public stopAudio(): void {
    this._playbackToken += 1
    this.clearAudioQueue()
    const source = this._audioSource
    this._audioSource = null
    this._audioIsPlaying = false
    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // The source may already have ended.
      }
      source.disconnect()
    }
    this._lipSyncAnalyzer.reset()
  }

  public isAudioPlaying(): boolean {
    return this._audioIsPlaying
  }

  public hasQueuedAudio(): boolean {
    return this._ttsQueue.length > 0
  }

  public isAudioReady(): boolean {
    return this._audioContext.state === 'running'
  }

  public async resume(): Promise<void> {
    if (this._audioContext.state === 'suspended') await this._audioContext.resume()
    this.playAudio()
  }

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
  private _audioIsPlaying = false
  private _audioSource: AudioBufferSourceNode | null = null
  private _playbackToken = 0
  private _lipFactor = 1
  private _ready = false
  private _readyOwner: object | null = null
  private _modelLoadError: string | null = null
}
