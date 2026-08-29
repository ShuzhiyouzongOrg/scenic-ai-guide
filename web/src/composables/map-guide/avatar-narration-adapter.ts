/**
 * @fileoverview 将数字人播放接口适配为地图讲解驱动。
 * @description 负责数字人就绪等待、文本或音频下发、暂停恢复及播放完成检测。
 */

import type { NarrationContent } from '@/types/map-guide'
import type { NarrationDriver, NarrationMedia } from './narration-coordinator'

/**
 * @typedef {object} AvatarNarrationHandle
 * @description 地图讲解适配器调用数字人组件时所需的最小控制接口。
 * @property {() => void | Promise<void>} enableAudio 在用户手势中解锁数字人音频。
 * @property {(text: string, emotion?: string) => Promise<boolean>} speak 下发文本和可选情绪进行播报。
 * @property {(url: string) => Promise<boolean>} speakAudio 下发可公开访问的音频地址进行播报。
 * @property {() => void | Promise<void>} pause 暂停当前数字人播报。
 * @property {() => void | Promise<void>} resume 恢复当前数字人播报。
 * @property {() => void | Promise<void>} interrupt 打断当前数字人播报。
 * @property {() => 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'} getStatus 获取数字人运行状态。
 * @property {() => string} getSubtitle 获取当前数字人字幕。
 */
export interface AvatarNarrationHandle {
  enableAudio(): void | Promise<void>
  speak(text: string, emotion?: string): Promise<boolean>
  speakAudio(url: string): Promise<boolean>
  pause(): void | Promise<void>
  resume(): void | Promise<void>
  interrupt(): void | Promise<void>
  getStatus(): 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'
  getSubtitle(): string
}

function narrationText(content: NarrationContent): string {
  return content.script?.trim() || content.segments.map((segment) => segment.text).join('。')
}

/**
 * @class
 * @description 将数字人控制句柄转换为统一的地图讲解驱动。
 * @implements {NarrationDriver}
 * @example
 * const driver = new AvatarNarrationAdapter(() => avatarHandle.value)
 */
export class AvatarNarrationAdapter implements NarrationDriver {
  /**
   * @description 讲解协调器识别数字人驱动时使用的固定编号。
   * @type {'avatar'}
   */
  readonly id = 'avatar' as const
  private playToken = 0
  private lastContent?: NarrationContent
  private lastMedia?: NarrationMedia

  /**
   * @description 创建按需读取数字人句柄的讲解适配器。
   * @param {() => AvatarNarrationHandle | undefined} getHandle 返回当前数字人句柄的函数。
   */
  constructor(private readonly getHandle: () => AvatarNarrationHandle | undefined) {}

  /**
   * @description 判断数字人组件当前是否已提供控制句柄。
   * @returns {boolean} 存在可调用句柄时返回 `true`。
   */
  isAvailable(): boolean {
    return Boolean(this.getHandle())
  }

  /**
   * @description 判断数字人是否支持指定讲解媒介。
   * @param {NarrationMedia} media 待播放的文本或音频媒介。
   * @returns {boolean} 文本始终受支持；音频需句柄实现 `speakAudio`。
   */
  supports(media: NarrationMedia): boolean {
    const handle = this.getHandle()
    return Boolean(handle && (media === 'text' || typeof handle.speakAudio === 'function'))
  }

  private async waitUntilReady(handle: AvatarNarrationHandle, timeoutMs = 20000): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const status = handle.getStatus()
      if (status === 'ready' || status === 'speaking') return
      if (status === 'error') throw new Error('Digital-human service is unavailable')
      await new Promise((resolve) => window.setTimeout(resolve, 120))
    }
    throw new Error('Digital-human service did not become ready in time')
  }

  private async waitUntilFinished(handle: AvatarNarrationHandle, token: number): Promise<void> {
    const started = Date.now()
    let startedSpeaking = false
    while (token === this.playToken && Date.now() - started < 20 * 60 * 1000) {
      const status = handle.getStatus()
      if (status === 'speaking') startedSpeaking = true
      if (status === 'error') throw new Error('Digital-human narration failed')
      if (startedSpeaking && status === 'ready') return
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    }
    if (token === this.playToken) throw new Error('Digital-human narration timed out')
  }

  /**
   * @description 等待数字人就绪后播放讲解，并持续等待本轮播报完成。
   * @param {NarrationContent} content 包含脚本、片段和音频地址的讲解内容。
   * @param {NarrationMedia} media 本轮采用的文本或音频媒介。
   * @returns {Promise<void>} 数字人完成播报后兑现。
   * @throws {Error} 数字人未挂载、未及时就绪、拒绝请求或播报失败时抛出。
   */
  async play(content: NarrationContent, media: NarrationMedia): Promise<void> {
    const handle = this.getHandle()
    if (!handle) throw new Error('Digital-human component is not mounted')
    const token = ++this.playToken
    this.lastContent = content
    this.lastMedia = media
    await this.waitUntilReady(handle)
    const started =
      media === 'audio'
        ? await handle.speakAudio(content.audioUrl || content.sourceAssetUrl || '')
        : await handle.speak(narrationText(content), content.segments[0]?.emotion || 'neutral')
    if (!started) throw new Error('Digital-human narration request was rejected')
    await this.waitUntilFinished(handle, token)
  }

  /**
   * @description 暂停当前数字人播报。
   * @returns {Promise<void>} 数字人暂停操作完成后兑现。
   * @throws {Error} 数字人暂停接口拒绝时向上抛出。
   */
  async pause(): Promise<void> {
    await this.getHandle()?.pause()
  }

  /**
   * @description 恢复数字人播报；数字人已回到就绪态时重新下发最近内容。
   * @returns {Promise<void>} 恢复或重新下发操作完成后兑现。
   * @throws {Error} 数字人恢复接口拒绝时向上抛出。
   */
  async resume(): Promise<void> {
    const handle = this.getHandle()
    if (!handle) return
    await handle.resume()
    if (handle.getStatus() === 'ready' && this.lastContent && this.lastMedia) {
      void this.play(this.lastContent, this.lastMedia)
    }
  }

  /**
   * @description 使当前播放令牌失效并打断数字人播报。
   * @returns {Promise<void>} 数字人打断操作完成后兑现。
   * @throws {Error} 数字人打断接口拒绝时向上抛出。
   */
  async stop(): Promise<void> {
    this.playToken += 1
    await this.getHandle()?.interrupt()
  }
}
