/**
 * @fileoverview 编排地图导览中的多种讲解驱动。
 * @description 按内容可用性选择数字人、音频、浏览器语音或文本驱动，并维护统一播放状态。
 */

import type { NarrationContent, NarrationSnapshot } from '@/types/map-guide'

/**
 * @typedef {'text' | 'audio'} NarrationMedia
 * @description 讲解驱动可以接收的内容媒介。
 * @example
 * const media: NarrationMedia = 'audio'
 */
export type NarrationMedia = 'text' | 'audio'

/**
 * @typedef {'avatar' | 'audio' | 'speech' | 'text'} NarrationDriverId
 * @description 讲解协调器内置驱动的唯一编号。
 * @example
 * const driverId: NarrationDriverId = 'avatar'
 */
export type NarrationDriverId = 'avatar' | 'audio' | 'speech' | 'text'

/**
 * @typedef {object} NarrationDriver
 * @description 供讲解协调器选择和控制的统一播放驱动契约。
 * @property {NarrationDriverId} id 驱动唯一编号。
 * @property {() => boolean} isAvailable 判断运行环境是否可使用当前驱动。
 * @property {(media: NarrationMedia) => boolean} supports 判断驱动是否支持指定媒介。
 * @property {(content: NarrationContent, media: NarrationMedia) => Promise<void>} play 播放讲解并等待完成。
 * @property {() => Promise<void> | void} pause 暂停当前播放。
 * @property {() => Promise<void> | void} resume 恢复当前播放。
 * @property {() => Promise<void> | void} stop 停止当前播放。
 * @property {() => Promise<void> | void} [destroy] 释放驱动持有的可选资源。
 */
export interface NarrationDriver {
  id: NarrationDriverId
  isAvailable(): boolean
  supports(media: NarrationMedia): boolean
  play(content: NarrationContent, media: NarrationMedia): Promise<void>
  pause(): Promise<void> | void
  resume(): Promise<void> | void
  stop(): Promise<void> | void
  destroy?(): Promise<void> | void
}

/**
 * @typedef {object} NarrationPlayOptions
 * @description 单次讲解请求的驱动候选排序选项。
 * @property {boolean} [preferOfficialAudio] 官方录音可用时是否优先播放音频。
 * @property {boolean} [allowSourceMedia] 是否允许使用来源素材地址作为音频。
 */
export interface NarrationPlayOptions {
  preferOfficialAudio?: boolean
  allowSourceMedia?: boolean
}

/**
 * @typedef {(snapshot: NarrationSnapshot) => void} SnapshotListener
 * @description 接收不可变讲解状态快照的订阅回调。
 */
type SnapshotListener = (snapshot: NarrationSnapshot) => void

function scriptAvailable(content: NarrationContent): boolean {
  return Boolean(content.script?.trim() || content.segments.some((segment) => segment.text.trim()))
}

function audioAvailable(content: NarrationContent, allowSourceMedia: boolean): boolean {
  return Boolean(content.audioUrl || (allowSourceMedia && content.sourceAssetUrl))
}

/**
 * @class
 * @description 按内容与环境能力选择讲解驱动，并维护统一播放状态快照。
 * @example
 * const coordinator = new NarrationCoordinator([audioDriver, textDriver])
 * await coordinator.play(content)
 */
export class NarrationCoordinator {
  private readonly drivers: Map<NarrationDriverId, NarrationDriver>
  private activeDriver?: NarrationDriver
  private activeContent?: NarrationContent
  private pendingContentId?: string
  private runToken = 0
  private listeners = new Set<SnapshotListener>()
  private snapshot: NarrationSnapshot = { state: 'idle', elapsedSeconds: 0, segmentIndex: 0 }

  /**
   * @description 使用候选驱动集合创建讲解协调器。
   * @param {NarrationDriver[]} drivers 按驱动编号注册的讲解实现集合。
   */
  constructor(drivers: NarrationDriver[]) {
    this.drivers = new Map(drivers.map((driver) => [driver.id, driver]))
  }

  /**
   * @description 获取当前讲解状态的浅拷贝，防止调用方直接修改内部快照。
   * @returns {NarrationSnapshot} 当前讲解状态快照。
   */
  get state(): NarrationSnapshot {
    return { ...this.snapshot }
  }

  /**
   * @description 订阅讲解状态变化，并立即发送一次当前快照。
   * @param {SnapshotListener} listener 接收状态快照的监听函数。
   * @returns {() => void} 用于取消本次订阅的函数。
   */
  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private update(next: Partial<NarrationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener(this.state)
  }

  private resolveCandidates(
    content: NarrationContent,
    options: NarrationPlayOptions
  ): Array<{ id: NarrationDriverId; media: NarrationMedia }> {
    const hasScript = scriptAvailable(content)
    const hasAudio = audioAvailable(content, options.allowSourceMedia === true)
    const explicitAudio = options.preferOfficialAudio && content.source === 'official-audio'
    if (hasAudio && explicitAudio) {
      return [
        { id: 'avatar', media: 'audio' },
        { id: 'audio', media: 'audio' },
        ...(hasScript ? [{ id: 'speech' as const, media: 'text' as const }] : []),
        { id: 'text', media: 'text' }
      ]
    }
    if (hasScript) {
      return [
        { id: 'avatar', media: 'text' },
        { id: 'speech', media: 'text' },
        ...(hasAudio ? [{ id: 'audio' as const, media: 'audio' as const }] : []),
        { id: 'text', media: 'text' }
      ]
    }
    if (hasAudio) {
      return [
        { id: 'avatar', media: 'audio' },
        { id: 'audio', media: 'audio' },
        { id: 'text', media: 'text' }
      ]
    }
    return [{ id: 'text', media: 'text' }]
  }

  /**
   * @description 根据内容可用性依次尝试候选驱动，并记录完成或错误状态。
   * @param {NarrationContent} content 待播放的景点讲解内容。
   * @param {NarrationPlayOptions} [options={}] 官方音频和来源素材的使用策略。
   * @returns {Promise<boolean>} 成功完成播放时为 `true`，重复请求或全部驱动失败时为 `false`。
   */
  async play(content: NarrationContent, options: NarrationPlayOptions = {}): Promise<boolean> {
    if (
      (this.activeContent?.id === content.id || this.pendingContentId === content.id) &&
      (this.snapshot.state === 'loading' || this.snapshot.state === 'playing')
    ) {
      return false
    }
    this.pendingContentId = content.id
    this.update({ state: 'loading' })
    await this.halt(false)
    if (this.pendingContentId !== content.id) return false
    this.pendingContentId = undefined
    const token = ++this.runToken
    this.activeContent = content
    this.update({
      contentId: content.id,
      source: content.source,
      state: 'loading',
      elapsedSeconds: 0,
      segmentIndex: 0,
      errorMessage: undefined
    })
    const candidates = this.resolveCandidates(content, options)
    let lastError: unknown
    for (const candidate of candidates) {
      const driver = this.drivers.get(candidate.id)
      if (!driver?.isAvailable() || !driver.supports(candidate.media)) continue
      try {
        this.activeDriver = driver
        this.update({ state: 'playing' })
        await driver.play(content, candidate.media)
        if (token !== this.runToken) return false
        this.update({ state: 'completed' })
        this.activeDriver = undefined
        return true
      } catch (error) {
        lastError = error
        await Promise.resolve(driver.stop()).catch(() => undefined)
        if (token !== this.runToken) return false
      }
    }
    this.activeDriver = undefined
    this.update({
      state: 'error',
      errorMessage:
        lastError instanceof Error ? lastError.message : 'No narration driver is available'
    })
    return false
  }

  /**
   * @description 在当前驱动处于播放态时暂停讲解。
   * @returns {Promise<void>} 驱动暂停并更新状态后兑现。
   * @throws {Error} 当前驱动暂停失败时向上抛出。
   */
  async pause(): Promise<void> {
    if (this.snapshot.state !== 'playing' || !this.activeDriver) return
    await this.activeDriver.pause()
    this.update({ state: 'paused' })
  }

  /**
   * @description 在当前驱动处于暂停态时恢复讲解。
   * @returns {Promise<void>} 驱动恢复并更新状态后兑现。
   * @throws {Error} 当前驱动恢复失败时向上抛出。
   */
  async resume(): Promise<void> {
    if (this.snapshot.state !== 'paused' || !this.activeDriver) return
    await this.activeDriver.resume()
    this.update({ state: 'playing' })
  }

  private async halt(clearPending: boolean): Promise<void> {
    this.runToken += 1
    if (this.activeDriver) await Promise.resolve(this.activeDriver.stop()).catch(() => undefined)
    this.activeDriver = undefined
    this.activeContent = undefined
    if (clearPending) this.pendingContentId = undefined
    this.update({ state: 'idle', contentId: undefined, elapsedSeconds: 0, segmentIndex: 0 })
  }

  /**
   * @description 停止当前驱动、清除待播内容并恢复空闲状态。
   * @returns {Promise<void>} 停止与状态清理完成后兑现。
   */
  async stop(): Promise<void> {
    await this.halt(true)
  }

  /**
   * @description 停止讲解、释放全部驱动并清空状态订阅者。
   * @returns {Promise<void>} 所有驱动释放尝试结束后兑现。
   */
  async destroy(): Promise<void> {
    await this.stop()
    await Promise.allSettled(
      [...this.drivers.values()].map((driver) => Promise.resolve(driver.destroy?.()))
    )
    this.listeners.clear()
  }
}
