/**
 * @fileoverview 数字人角色与音色目录。
 * @description 声明项目可选的讯飞、Live2D 角色以及讯飞发音人配置。
 */
import type { DigitalHumanEngine } from '@/api/digital-human'
import { BUNDLED_LIVE2D_MODELS } from '@/lib/live2d/resource'

/**
 * @description 描述可选数字人角色的引擎、云端形象、本地模型、文案键和预览图。
 * @typedef {object} AvatarOption
 * @property {string} id 唯一标识。
 * @property {DigitalHumanEngine} engine 数字人渲染引擎。
 * @property {string} avatarId 讯飞形象标识。
 * @property {string} modelId Live2D 模型标识。
 * @property {string} labelKey 名称国际化键。
 * @property {string} [preview] 预览图片地址。
 */
export interface AvatarOption {
  id: string
  engine: DigitalHumanEngine
  avatarId: string
  modelId: string
  labelKey: string
  preview?: string
}

/**
 * @description 描述讯飞发音人的参数标识、名称文案键和语言文案键。
 * @typedef {object} VoiceOption
 * @property {string} parameter 讯飞发音人参数。
 * @property {string} labelKey 名称国际化键。
 * @property {string} languageKey 语言国际化键。
 */
export interface VoiceOption {
  parameter: string
  labelKey: string
  languageKey: string
}

/**
 * @description 项目已配置并可选择的讯飞与 Live2D 角色列表。
 * @type {AvatarOption[]}
 * @example
 * const firstAvatar = avatarOptions[0]
 */
export const avatarOptions: AvatarOption[] = [
  {
    id: 'xf-reception-male',
    engine: 'xfyun',
    avatarId: 'cnr5dg8n2000000003',
    modelId: '',
    labelKey: 'app.dhAvatarReceptionMale'
  },
  {
    id: 'xf-reception-female',
    engine: 'xfyun',
    avatarId: 'cnrfb86h2000000004',
    modelId: '',
    labelKey: 'app.dhAvatarReceptionFemale'
  },
  {
    id: 'xf-scenic-a',
    engine: 'xfyun',
    avatarId: 'cnrmkf0e2000000006',
    modelId: '',
    labelKey: 'app.dhAvatarScenicA'
  },
  {
    id: 'xf-scenic-b',
    engine: 'xfyun',
    avatarId: 'cnrn9jgi2000000005',
    modelId: '',
    labelKey: 'app.dhAvatarScenicB'
  },
  ...BUNDLED_LIVE2D_MODELS.map((modelId) => ({
    id: `live2d-${modelId.toLowerCase()}`,
    engine: 'live2d' as const,
    avatarId: '',
    modelId,
    labelKey: `app.dhModel${modelId}`,
    preview: `/live2d/characters/${modelId}/${modelId}.png`
  }))
]

/**
 * @description 项目允许选择的讯飞发音人列表。
 * @type {VoiceOption[]}
 * @example
 * const firstVoice = voiceOptions[0]
 */
export const voiceOptions: VoiceOption[] = [
  {
    parameter: 'x5_EnUs_Grant_flow',
    labelKey: 'app.dhVoiceGrant',
    languageKey: 'app.dhLanguageAmericanEnglish'
  },
  {
    parameter: 'x6_taiqiangnuannan_pro',
    labelKey: 'app.dhVoiceTaiwanMale',
    languageKey: 'app.dhLanguageTaiwan'
  },
  {
    parameter: 'x5_EnUs_Lila_flow',
    labelKey: 'app.dhVoiceLila',
    languageKey: 'app.dhLanguageAmericanEnglish'
  },
  {
    parameter: 'x4_ziyang_oral',
    labelKey: 'app.dhVoiceZiyang',
    languageKey: 'app.dhLanguageNortheast'
  },
  {
    parameter: 'x5_lingxiaoyue_flow',
    labelKey: 'app.dhVoiceLingxiaoyue',
    languageKey: 'app.dhLanguageMandarin'
  },
  {
    parameter: 'x6_jingqudaolannvsheng_mini',
    labelKey: 'app.dhVoiceGuideFemale',
    languageKey: 'app.dhLanguageMandarin'
  },
  {
    parameter: 'x6_zhantingnanjiedai_pro',
    labelKey: 'app.dhVoiceGuideMale',
    languageKey: 'app.dhLanguageMandarin'
  }
]
