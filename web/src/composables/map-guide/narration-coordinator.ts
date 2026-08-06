import type { NarrationContent, NarrationSnapshot } from '@/types/map-guide'

export type NarrationMedia = 'text' | 'audio'
export type NarrationDriverId = 'avatar' | 'audio' | 'speech' | 'text'

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

export interface NarrationPlayOptions {
  preferOfficialAudio?: boolean
  allowSourceMedia?: boolean
}

type SnapshotListener = (snapshot: NarrationSnapshot) => void

function scriptAvailable(content: NarrationContent): boolean {
  return Boolean(content.script?.trim() || content.segments.some((segment) => segment.text.trim()))
}

function audioAvailable(content: NarrationContent, allowSourceMedia: boolean): boolean {
  return Boolean(content.audioUrl || (allowSourceMedia && content.sourceAssetUrl))
}

export class NarrationCoordinator {
  private readonly drivers: Map<NarrationDriverId, NarrationDriver>
  private activeDriver?: NarrationDriver
  private activeContent?: NarrationContent
  private pendingContentId?: string
  private runToken = 0
  private listeners = new Set<SnapshotListener>()
  private snapshot: NarrationSnapshot = { state: 'idle', elapsedSeconds: 0, segmentIndex: 0 }

  constructor(drivers: NarrationDriver[]) {
    this.drivers = new Map(drivers.map((driver) => [driver.id, driver]))
  }

  get state(): NarrationSnapshot {
    return { ...this.snapshot }
  }

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

  async pause(): Promise<void> {
    if (this.snapshot.state !== 'playing' || !this.activeDriver) return
    await this.activeDriver.pause()
    this.update({ state: 'paused' })
  }

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

  async stop(): Promise<void> {
    await this.halt(true)
  }

  async destroy(): Promise<void> {
    await this.stop()
    await Promise.allSettled(
      [...this.drivers.values()].map((driver) => Promise.resolve(driver.destroy?.()))
    )
    this.listeners.clear()
  }
}
