import type { NarrationContent } from '@/types/map-guide'
import type { NarrationDriver, NarrationMedia } from './narration-coordinator'

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

export class AvatarNarrationAdapter implements NarrationDriver {
  readonly id = 'avatar' as const
  private playToken = 0
  private lastContent?: NarrationContent
  private lastMedia?: NarrationMedia

  constructor(private readonly getHandle: () => AvatarNarrationHandle | undefined) {}

  isAvailable(): boolean {
    return Boolean(this.getHandle())
  }

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

  async pause(): Promise<void> {
    await this.getHandle()?.pause()
  }

  async resume(): Promise<void> {
    const handle = this.getHandle()
    if (!handle) return
    await handle.resume()
    if (handle.getStatus() === 'ready' && this.lastContent && this.lastMedia) {
      void this.play(this.lastContent, this.lastMedia)
    }
  }

  async stop(): Promise<void> {
    this.playToken += 1
    await this.getHandle()?.interrupt()
  }
}
