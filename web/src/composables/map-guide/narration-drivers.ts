import type { NarrationContent } from '@/types/map-guide'
import type { NarrationDriver, NarrationMedia } from './narration-coordinator'

function narrationText(content: NarrationContent): string {
  return content.script?.trim() || content.segments.map((segment) => segment.text).join('。')
}

export class HtmlAudioNarrationDriver implements NarrationDriver {
  readonly id = 'audio' as const
  private audio?: HTMLAudioElement
  private settle?: () => void

  isAvailable(): boolean {
    return typeof Audio !== 'undefined'
  }

  supports(media: NarrationMedia): boolean {
    return media === 'audio'
  }

  async play(content: NarrationContent): Promise<void> {
    await this.stop()
    const url = content.audioUrl || content.sourceAssetUrl
    if (!url) throw new Error('Narration audio URL is missing')
    const audio = new Audio(url)
    audio.preload = 'auto'
    this.audio = audio
    await new Promise<void>((resolve, reject) => {
      this.settle = resolve
      audio.addEventListener('ended', () => resolve(), { once: true })
      audio.addEventListener('error', () => reject(new Error('Narration audio failed to load')), {
        once: true
      })
      audio.play().catch(reject)
    })
    this.audio = undefined
    this.settle = undefined
  }

  pause(): void {
    this.audio?.pause()
  }

  async resume(): Promise<void> {
    await this.audio?.play()
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    }
    this.audio = undefined
    this.settle?.()
    this.settle = undefined
  }

  destroy(): void {
    this.stop()
  }
}

export class BrowserSpeechNarrationDriver implements NarrationDriver {
  readonly id = 'speech' as const
  private utterance?: SpeechSynthesisUtterance
  private settle?: () => void

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  supports(media: NarrationMedia): boolean {
    return media === 'text'
  }

  async play(content: NarrationContent): Promise<void> {
    await this.stop()
    const utterance = new SpeechSynthesisUtterance(narrationText(content))
    utterance.lang = 'zh-CN'
    utterance.rate = 0.94
    this.utterance = utterance
    await new Promise<void>((resolve, reject) => {
      this.settle = resolve
      utterance.onend = () => resolve()
      utterance.onerror = (event) => reject(new Error(event.error || 'Browser speech failed'))
      window.speechSynthesis.speak(utterance)
    })
    this.utterance = undefined
    this.settle = undefined
  }

  pause(): void {
    window.speechSynthesis.pause()
  }

  resume(): void {
    window.speechSynthesis.resume()
  }

  stop(): void {
    window.speechSynthesis.cancel()
    this.utterance = undefined
    this.settle?.()
    this.settle = undefined
  }
}

export class TextNarrationDriver implements NarrationDriver {
  readonly id = 'text' as const
  private timer?: number
  private settle?: () => void
  private remainingMs = 0
  private startedAt = 0

  isAvailable(): boolean {
    return true
  }

  supports(): boolean {
    return true
  }

  play(content: NarrationContent): Promise<void> {
    this.stop()
    const text = narrationText(content)
    this.remainingMs = Math.min(60000, Math.max(1800, text.length * 180))
    return new Promise((resolve) => {
      this.settle = resolve
      this.startTimer()
    })
  }

  private startTimer() {
    this.startedAt = Date.now()
    this.timer = window.setTimeout(() => {
      this.timer = undefined
      this.settle?.()
      this.settle = undefined
    }, this.remainingMs)
  }

  pause(): void {
    if (this.timer === undefined) return
    window.clearTimeout(this.timer)
    this.timer = undefined
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt))
  }

  resume(): void {
    if (this.timer === undefined && this.settle) this.startTimer()
  }

  stop(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer)
    this.timer = undefined
    this.settle?.()
    this.settle = undefined
  }
}
