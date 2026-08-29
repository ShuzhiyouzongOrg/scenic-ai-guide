/**
 * @fileoverview 地图讲解类型定义。
 * @description 声明讲解状态、来源、情绪、片段、内容和播放快照结构。
 */
/**
 * @description 定义讲解播放生命周期状态。
 * @typedef {'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error'} NarrationState
 */
export type NarrationState = 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error'

/**
 * @description 定义讲解内容来源。
 * @typedef {| 'official-audio' | 'official-script' | 'project-script' | 'ai-generated' | 'fallback-text'} NarrationSource
 */
export type NarrationSource =
  | 'official-audio'
  | 'official-script'
  | 'project-script'
  | 'ai-generated'
  | 'fallback-text'

/**
 * @description 定义讲解语气。
 * @typedef {'neutral' | 'friendly' | 'solemn' | 'enthusiastic' | 'storytelling'} NarrationEmotion
 */
export type NarrationEmotion = 'neutral' | 'friendly' | 'solemn' | 'enthusiastic' | 'storytelling'

/**
 * @description 描述讲解片段的文本、时间、情绪、动作和停顿。
 * @typedef {object} NarrationSegment
 * @property {string} id 唯一标识。
 * @property {string} text 当前片段需要播报并展示的讲解文本。
 * @property {number} [startTime] 开始时间。
 * @property {number} [endTime] 结束时间。
 * @property {NarrationEmotion} emotion 情绪标签。
 * @property {string} [gesture] 数字人动作。
 * @property {string[]} [emphasisWords] 需要强调的词语。
 * @property {number} [pauseAfterMs] 片段后停顿毫秒数。
 */
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

/**
 * @description 描述一份讲解脚本、音频来源和分段内容。
 * @typedef {object} NarrationContent
 * @property {string} id 唯一标识。
 * @property {string} title 标题。
 * @property {NarrationSource} source 数据来源。
 * @property {string} [script] 完整讲解脚本。
 * @property {string} [audioUrl] 音频地址。
 * @property {string} [sourceAssetUrl] 来源资源地址。
 * @property {boolean} [allowAvatarSynthesis] 是否允许数字人合成讲解。
 * @property {NarrationSegment[]} segments 语音或讲解片段列表。
 */
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

/**
 * @description 定义数字人在地图讲解中的显示状态。
 * @typedef {'idle' | 'speaking' | 'compact'} AvatarDisplayState
 */
export type AvatarDisplayState = 'idle' | 'speaking' | 'compact'

/**
 * @description 描述讲解播放进度、状态和错误信息。
 * @typedef {object} NarrationSnapshot
 * @property {string} [contentId] 讲解内容标识。
 * @property {NarrationState} state 实验运行与回滚状态。
 * @property {NarrationSource} [source] 数据来源。
 * @property {number} elapsedSeconds 已播放秒数。
 * @property {number} [durationSeconds] 总时长秒数。
 * @property {number} segmentIndex 当前片段下标。
 * @property {string} [errorMessage] 错误信息。
 */
export interface NarrationSnapshot {
  contentId?: string
  state: NarrationState
  source?: NarrationSource
  elapsedSeconds: number
  durationSeconds?: number
  segmentIndex: number
  errorMessage?: string
}
