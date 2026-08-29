/**
 * @fileoverview 实现地图讲解所需的音频、浏览器语音和文本计时驱动。
 * @description 为讲解协调器提供统一的播放、暂停、恢复、停止与销毁行为。
 */

import type { NarrationContent } from '@/types/map-guide'
import type { NarrationDriver, NarrationMedia } from './narration-coordinator'

function narrationText(content: NarrationContent): string {
  return content.script?.trim() || content.segments.map((segment) => segment.text).join('。')
}

/**
 * @class
 * @description 使用浏览器音频元素播放官方录音或来源音频。
 * @implements {NarrationDriver}
 * @example
 * const driver = new HtmlAudioNarrationDriver()
 * await driver.play(content, 'audio')
 */
export class HtmlAudioNarrationDriver implements NarrationDriver {
  /**
   * @description HTML 音频讲解驱动的固定编号。
   * @type {'audio'}
   */
  readonly id = 'audio' as const
  private audio?: HTMLAudioElement
  private settle?: () => void

  /**
   * @description 判断当前运行环境是否提供浏览器音频构造器。
   * @returns {boolean} 可创建 `Audio` 元素时返回 `true`。
   */
  isAvailable(): boolean {
    return typeof Audio !== 'undefined'
  }

  /**
   * @description 判断当前驱动是否支持指定讲解媒介。
   * @param {NarrationMedia} media 待播放的讲解媒介。
   * @returns {boolean} 仅音频媒介返回 `true`。
   */
  supports(media: NarrationMedia): boolean {
    return media === 'audio'
  }

  /**
   * @description 创建音频元素播放讲解，并等待自然结束。
   * @param {NarrationContent} content 包含官方或来源音频地址的讲解内容。
   * @returns {Promise<void>} 音频播放结束后兑现。
   * @throws {Error} 缺少音频地址、音频加载失败或浏览器拒绝播放时抛出。
   */
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

  /**
   * @description 暂停当前音频元素。
   * @returns {void} 无返回值。
   */
  pause(): void {
    this.audio?.pause()
  }

  /**
   * @description 从当前时间点恢复音频播放。
   * @returns {Promise<void>} 浏览器接受恢复播放后兑现。
   * @throws {Error} 浏览器拒绝恢复播放时抛出。
   */
  async resume(): Promise<void> {
    await this.audio?.play()
  }

  /**
   * @description 停止并卸载当前音频，同时结束等待中的播放任务。
   * @returns {void} 无返回值。
   */
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

  /**
   * @description 通过停止当前音频释放驱动资源。
   * @returns {void} 无返回值。
   */
  destroy(): void {
    this.stop()
  }
}

/**
 * @class
 * @description 使用浏览器 SpeechSynthesis 将讲解文本转换为语音。
 * @implements {NarrationDriver}
 * @example
 * const driver = new BrowserSpeechNarrationDriver()
 * await driver.play(content, 'text')
 */
export class BrowserSpeechNarrationDriver implements NarrationDriver {
  /**
   * @description 浏览器语音讲解驱动的固定编号。
   * @type {'speech'}
   */
  readonly id = 'speech' as const
  private utterance?: SpeechSynthesisUtterance
  private settle?: () => void

  /**
   * @description 判断当前窗口是否支持浏览器语音合成接口。
   * @returns {boolean} 存在 `speechSynthesis` 时返回 `true`。
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  /**
   * @description 判断当前驱动是否支持指定讲解媒介。
   * @param {NarrationMedia} media 待播放的讲解媒介。
   * @returns {boolean} 仅文本媒介返回 `true`。
   */
  supports(media: NarrationMedia): boolean {
    return media === 'text'
  }

  /**
   * @description 按页面语言创建语音实例并等待浏览器完成朗读。
   * @param {NarrationContent} content 包含脚本或讲解片段的内容。
   * @returns {Promise<void>} 浏览器语音朗读结束后兑现。
   * @throws {Error} 浏览器语音合成报告错误时抛出。
   */
  async play(content: NarrationContent): Promise<void> {
    await this.stop()
    const utterance = new SpeechSynthesisUtterance(narrationText(content))
    utterance.lang =
      {
        zh: 'zh-CN',
        en: 'en-US',
        ko: 'ko-KR',
        'zh-TW': 'zh-TW',
        ja: 'ja-JP',
        th: 'th-TH'
      }[document.documentElement.lang] || 'zh-CN'
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

  /**
   * @description 暂停浏览器全局语音合成队列。
   * @returns {void} 无返回值。
   */
  pause(): void {
    window.speechSynthesis.pause()
  }

  /**
   * @description 恢复浏览器全局语音合成队列。
   * @returns {void} 无返回值。
   */
  resume(): void {
    window.speechSynthesis.resume()
  }

  /**
   * @description 取消浏览器语音并结束当前驱动等待任务。
   * @returns {void} 无返回值。
   */
  stop(): void {
    window.speechSynthesis.cancel()
    this.utterance = undefined
    this.settle?.()
    this.settle = undefined
  }
}

/**
 * @class
 * @description 在没有音频能力时按文本长度模拟讲解时长。
 * @implements {NarrationDriver}
 * @example
 * const driver = new TextNarrationDriver()
 * await driver.play(content, 'text')
 */
export class TextNarrationDriver implements NarrationDriver {
  /**
   * @description 纯文本讲解驱动的固定编号。
   * @type {'text'}
   */
  readonly id = 'text' as const
  private timer?: number
  private settle?: () => void
  private remainingMs = 0
  private startedAt = 0

  /**
   * @description 表示纯文本计时驱动始终可作为最终回退项。
   * @returns {boolean} 始终返回 `true`。
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * @description 表示纯文本计时驱动接受任意讲解媒介作为回退。
   * @returns {boolean} 始终返回 `true`。
   */
  supports(): boolean {
    return true
  }

  /**
   * @description 根据讲解文本长度启动有上下限的模拟播放计时器。
   * @param {NarrationContent} content 用于计算模拟讲解时长的内容。
   * @returns {Promise<void>} 模拟讲解计时结束后兑现。
   */
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

  /**
   * @description 暂停模拟计时并记录剩余时长。
   * @returns {void} 无返回值。
   */
  pause(): void {
    if (this.timer === undefined) return
    window.clearTimeout(this.timer)
    this.timer = undefined
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt))
  }

  /**
   * @description 使用剩余时长恢复模拟讲解计时。
   * @returns {void} 无返回值。
   */
  resume(): void {
    if (this.timer === undefined && this.settle) this.startTimer()
  }

  /**
   * @description 清除模拟计时器并结束当前等待任务。
   * @returns {void} 无返回值。
   */
  stop(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer)
    this.timer = undefined
    this.settle?.()
    this.settle = undefined
  }
}
