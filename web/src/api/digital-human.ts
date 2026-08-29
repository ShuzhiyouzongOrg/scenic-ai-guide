/**
 * @fileoverview 数字人配置与语音 API 客户端。
 * @description 声明讯飞与 Live2D 数字人配置，并封装配置管理、资源预热和语音合成请求。
 */
import request from '@/utils/http'

/**
 * @description 定义数字人使用的讯飞云端或本地 Live2D 引擎。
 * @typedef {'xfyun' | 'live2d'} DigitalHumanEngine
 */
export type DigitalHumanEngine = 'xfyun' | 'live2d'

/**
 * @description 描述数字人形象、引擎、音色、欢迎语、服务状态和降级配置。
 * @typedef {object} DigitalHumanConfig
 * @property {string} id 唯一标识。
 * @property {string} name 数字人显示名称。
 * @property {DigitalHumanEngine} engine 数字人渲染引擎。
 * @property {string} avatarId 讯飞形象标识。
 * @property {string} vcn 讯飞发音人参数。
 * @property {string} modelId Live2D 模型标识。
 * @property {string} welcomeText 欢迎语。
 * @property {number} speechRate 语速。
 * @property {string} emotionStyle 情绪风格。
 * @property {'online' | 'maintenance' | 'text_only'} serviceStatus 服务状态。
 * @property {boolean} enabled 是否启用。
 * @property {boolean} assetAvailable 数字人资源是否可用。
 * @property {{ type: string; reason: string }} [fallback] 降级策略与原因。
 * @property {string} fallback.type 类型。
 * @property {string} fallback.reason 推荐理由。
 * @property {string} [updatedAt] 更新时间。
 */
export interface DigitalHumanConfig {
  id: string
  name: string
  /**
   * @description 渲染引擎：xfyun=讯飞云端流，live2d=本地 Live2D 画布（互为兜底）
   */
  engine: DigitalHumanEngine
  avatarId: string
  vcn: string
  /**
   * @description Live2D 模型（角色目录名），仅 engine=live2d 时使用
   */
  modelId: string
  welcomeText: string
  speechRate: number
  emotionStyle: string
  serviceStatus: 'online' | 'maintenance' | 'text_only'
  enabled: boolean
  assetAvailable: boolean
  fallback?: { type: string; reason: string }
  updatedAt?: string
}

/**
 * @description 获取游客端当前启用的数字人配置。
 * @returns {Promise<DigitalHumanConfig>} 游客端当前启用的数字人配置。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await fetchActiveDigitalHuman()
 */
export function fetchActiveDigitalHuman() {
  return request.get<DigitalHumanConfig>({ url: '/api/digital-human/config' })
}

/**
 * @description 获取管理端全部数字人配置。
 * @returns {Promise<DigitalHumanConfig[]>} 管理端可维护的全部数字人配置。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await fetchDigitalHumanConfigs()
 */
export function fetchDigitalHumanConfigs() {
  return request.get<DigitalHumanConfig[]>({ url: '/api/digital-human/configs' })
}

/**
 * @description 新增或更新数字人配置。
 * @param {Partial<DigitalHumanConfig>} data 待新增或更新的数字人配置。
 * @returns {Promise<DigitalHumanConfig>} 后端保存并规范化后的数字人配置。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function saveDigitalHumanConfig(data: Partial<DigitalHumanConfig>) {
  return request.post<DigitalHumanConfig>({ url: '/api/digital-human/config', data })
}

/**
 * @description 删除未启用的数字人配置。
 * @param {string} id 唯一标识。
 * @returns {Promise<{ id: string; name: string }>} 已删除配置的标识和名称。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function deleteDigitalHumanConfig(id: string) {
  return request.del<{ id: string; name: string }>({
    url: `/api/digital-human/configs/${encodeURIComponent(id)}`,
    showErrorMessage: false
  })
}

/**
 * @description 预热当前数字人引擎与资源。
 * @returns {Promise<{ ok: boolean; engine: DigitalHumanEngine; avatarId: string; modelId: string; vcn: string }>} 预热状态和实际使用的引擎、形象、模型及音色标识。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await preloadDigitalHuman()
 */
export function preloadDigitalHuman() {
  return request.post<{
    ok: boolean
    engine: DigitalHumanEngine
    avatarId: string
    modelId: string
    vcn: string
  }>({
    url: '/api/digital-human/preload'
  })
}

/**
 * @description 描述语音合成供应商、音色、降级状态与可播放音频片段。
 * @typedef {object} TtsResult
 * @property {string} [provider] 服务供应商。
 * @property {string} [voice] 实际使用的音色。
 * @property {string} [requestedVoice] 请求的音色。
 * @property {boolean} [fallbackUsed] 是否使用降级音色。
 * @property {{ audioUrl: string; mimeType?: string; text?: string }[]} segments 语音或讲解片段列表。
 * @property {string | null} audioUrl 音频地址。
 */
export interface TtsResult {
  provider?: string
  voice?: string
  requestedVoice?: string
  fallbackUsed?: boolean
  segments: { audioUrl: string; mimeType?: string; text?: string }[]
  audioUrl: string | null
}

/**
 * @description 将文本提交后端合成为语音，供 Live2D 口型同步。
 * @param {{ text: string; voice?: string; speed?: number }} data 待合成文本、音色和语速。
 * @param {string} data.text 待合成的讲解文本。
 * @param {string} [data.voice] 请求使用的音色标识。
 * @param {number} [data.speed] 语音合成速度。
 * @returns {Promise<TtsResult>} 语音供应商、实际音色、降级状态和音频片段。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function synthesizeSpeech(data: { text: string; voice?: string; speed?: number }) {
  return request.post<TtsResult>({ url: '/api/voice/tts', data })
}
