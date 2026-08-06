export type NarrationState = 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error'

export type NarrationSource =
  | 'official-audio'
  | 'official-script'
  | 'project-script'
  | 'ai-generated'
  | 'fallback-text'

export type NarrationEmotion = 'neutral' | 'friendly' | 'solemn' | 'enthusiastic' | 'storytelling'

export interface NarrationSegment {
  id: string
  text: string
  startTime?: number
  endTime?: number
  emotion: NarrationEmotion
  gesture?: string
  emphasisWords?: string[]
  pauseAfterMs?: number
}

export interface NarrationContent {
  id: string
  title: string
  source: NarrationSource
  script?: string
  audioUrl?: string
  sourceAssetUrl?: string
  allowAvatarSynthesis?: boolean
  segments: NarrationSegment[]
}

export type AvatarDisplayState = 'idle' | 'speaking' | 'compact'

export interface NarrationSnapshot {
  contentId?: string
  state: NarrationState
  source?: NarrationSource
  elapsedSeconds: number
  durationSeconds?: number
  segmentIndex: number
  errorMessage?: string
}
