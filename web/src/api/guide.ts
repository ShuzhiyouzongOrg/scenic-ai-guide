/**
 * @fileoverview 游客导览 API 客户端。
 * @description 封装智能问答、景点讲解、路线推荐、语音交互、反馈、引用追踪和会话历史请求。
 */
import request from '@/utils/http'

/**
 * @description 描述智能问答答案引用的文档、章节与景点来源。
 * @typedef {object} ChatSource
 * @property {string} [citationId] 引用标识。
 * @property {string} [documentName] 来源文档名称。
 * @property {string} [sectionTitle] 章节标题。
 * @property {string} [scenicSpotName] 景点名称。
 */
export interface ChatSource {
  citationId?: string
  documentName?: string
  sectionTitle?: string
  scenicSpotName?: string
}

/**
 * @description 描述答案驱动数字人的表情、动作、状态和语音情绪。
 * @typedef {object} DigitalHumanHint
 * @property {string} expression 表情标识。
 * @property {string} action 动作标识或内置操作。
 * @property {string} state 数字人当前表现状态。
 * @property {string} [ttsEmotion] 语音情绪。
 */
export interface DigitalHumanHint {
  expression: string
  action: string
  state: string
  ttsEmotion?: string
}

/**
 * @description 描述问答总耗时、检索耗时、大模型耗时及缓存命中状态。
 * @typedef {object} ChatLatency
 * @property {number} totalMs 总耗时，单位为毫秒。
 * @property {number} [retrievalMs] 检索耗时，单位为毫秒。
 * @property {number} [llmMs] 大模型耗时，单位为毫秒。
 * @property {boolean} [cached] 是否命中缓存。
 */
export interface ChatLatency {
  totalMs: number
  retrievalMs?: number
  llmMs?: number
  cached?: boolean
}

/**
 * @description 描述智能问答正文、场景、引用、数字人提示、耗时和实验分组。
 * @typedef {object} ChatAnswer
 * @property {string} answer 答案文本。
 * @property {string | null} [messageId] 消息标识。
 * @property {string} [mode] 本次回答采用的问答模式。
 * @property {string} [locale] 语言区域代码。
 * @property {string} [scenario] 问答场景。
 * @property {string | null} [publicNotice] 面向游客的提示。
 * @property {string} [label] 回答意图或场景的展示标签。
 * @property {string} [emotion] 情绪标签。
 * @property {ChatSource[]} [sources] 知识来源列表。
 * @property {DigitalHumanHint} [digitalHuman] 数字人表现提示。
 * @property {boolean} [cached] 是否命中缓存。
 * @property {ChatLatency} [latency] 分阶段耗时。
 * @property {{ id: string; enabled: boolean; variant: 'control' | 'treatment'; status: string }} [experiment] RAG 实验分组信息。
 * @property {string} experiment.id 唯一标识。
 * @property {boolean} experiment.enabled 是否启用。
 * @property {'control' | 'treatment'} experiment.variant 当前请求所属的实验分组。
 * @property {string} experiment.status 当前状态。
 */
export interface ChatAnswer {
  answer: string
  messageId?: string | null
  mode?: string
  locale?: string
  scenario?: string
  publicNotice?: string | null
  label?: string
  emotion?: string
  sources?: ChatSource[]
  digitalHuman?: DigitalHumanHint
  cached?: boolean
  latency?: ChatLatency
  experiment?: {
    id: string
    enabled: boolean
    variant: 'control' | 'treatment'
    status: string
  }
}

/**
 * @description 描述景点的身份、分类、坐标、媒体、讲解和数据来源。
 * @typedef {object} ScenicSpot
 * @property {string} id 唯一标识。
 * @property {string} scenicArea 所属景区。
 * @property {string} name 名称。
 * @property {string[]} aliases 别名列表。
 * @property {string} locationText 位置说明。
 * @property {string} parameters 景点规模、形制或设施参数说明。
 * @property {string} coreFunction 核心功能。
 * @property {string} culture 文化背景。
 * @property {string} detail 景点详细介绍。
 * @property {string} highlights 景点亮点。
 * @property {string} openInfo 开放信息。
 * @property {string} notes 游览提示。
 */
export interface ScenicSpot {
  id: string
  scenicArea: string
  name: string
  aliases: string[]
  locationText: string
  parameters: string
  coreFunction: string
  culture: string
  detail: string
  highlights: string
  openInfo: string
  notes: string
}

/**
 * @description 描述推荐路线中的景点节点、顺序、停留时长和标签。
 * @typedef {object} RouteNode
 * @property {string} id 唯一标识。
 * @property {string} name 名称。
 * @property {string | null} spotId 景点标识。
 * @property {number} order 排序序号。
 * @property {number} minutes 预计停留分钟数。
 * @property {string[]} tags 标签列表。
 * @property {number} [step] 路线步骤序号。
 */
export interface RouteNode {
  id: string
  name: string
  spotId: string | null
  order: number
  minutes: number
  tags: string[]
  step?: number
}

/**
 * @description 描述推荐路线的类型、时长、适用人群、节点与推荐理由。
 * @typedef {object} RouteRecommendation
 * @property {string} id 唯一标识。
 * @property {string} name 名称。
 * @property {string} routeType 路线类型。
 * @property {number} durationMinutes 预计总时长，单位为分钟。
 * @property {string[]} tags 标签列表。
 * @property {string[]} suitableFor 适用人群。
 * @property {RouteNode[]} nodes 路线节点列表。
 * @property {string} [reason] 推荐理由。
 * @property {string} explanation 推荐说明。
 */
export interface RouteRecommendation {
  id: string
  name: string
  routeType: string
  durationMinutes: number
  tags: string[]
  suitableFor: string[]
  nodes: RouteNode[]
  reason?: string
  explanation: string
}

/**
 * @description 描述路线偏好、首选路线、备选路线和提示信息。
 * @typedef {object} RouteRecommendResult
 * @property {Record<string, unknown>} preferences 归一化游客偏好。
 * @property {RouteRecommendation} recommendation 首选路线。
 * @property {RouteRecommendation[]} alternatives 备选路线。
 * @property {string} message 路线推荐结果的补充提示。
 */
export interface RouteRecommendResult {
  preferences: Record<string, unknown>
  recommendation: RouteRecommendation
  alternatives: RouteRecommendation[]
  message: string
}

/**
 * @description 描述游客会话中的用户或助手消息。
 * @typedef {object} ChatMessage
 * @property {string} id 唯一标识。
 * @property {string} sessionId 会话标识。
 * @property {'user' | 'assistant'} role 消息发送方角色。
 * @property {string} content 正文内容。
 * @property {string | null} [intentLabel] 意图标签。
 * @property {string | null} [emotionLabel] 情绪标签。
 * @property {string} createdAt 创建时间。
 */
export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  intentLabel?: string | null
  emotionLabel?: string | null
  createdAt: string
}

/**
 * @description 创建游客会话。
 * @returns {Promise<{ id: string; createdAt: string }>} 新建会话的标识和创建时间。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await createVisitorSession()
 */
export function createVisitorSession() {
  return request.post<{ id: string; createdAt: string }>({ url: '/api/visitor/session' })
}

/**
 * @description 向智能问答服务提交游客问题。
 * @param {{ question: string; sessionId?: string; mode?: string; locale?: string }} data 游客问题及会话、模式和语言信息。
 * @param {string} data.question 问题文本。
 * @param {string} [data.sessionId] 会话标识。
 * @param {string} [data.mode] 本次请求使用的问答模式。
 * @param {string} [data.locale] 语言区域代码。
 * @returns {Promise<ChatAnswer>} 智能问答正文、来源、数字人提示和耗时信息。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function askQuestion(data: {
  question: string
  sessionId?: string
  mode?: string
  locale?: string
}) {
  return request.post<ChatAnswer>({ url: '/api/chat/ask', data })
}

/**
 * @description 请求指定景点的讲解文本与引用。
 * @param {{ spotId?: string; spotName?: string }} data 景点标识或名称。
 * @param {string} [data.spotId] 景点标识。
 * @param {string} [data.spotName] 景点名称；缺少景点标识时用于匹配。
 * @returns {Promise<{ spotId: string; spotName: string; narration: string; citations?: ChatSource[] }>} 景点标识、名称、讲解正文和可选知识引用。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function narrateSpot(data: { spotId?: string; spotName?: string }) {
  return request.post<{
    spotId: string
    spotName: string
    narration: string
    citations?: ChatSource[]
  }>({
    url: '/api/chat/narrate',
    data
  })
}

/**
 * @description 获取问答与路线使用的景点列表。
 * @returns {Promise<ScenicSpot[]>} 可用于问答和路线推荐的景点列表。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await fetchScenicSpots()
 */
export function fetchScenicSpots() {
  return request.get<ScenicSpot[]>({ url: '/api/scenic-spots' })
}

/**
 * @description 根据游客偏好请求路线推荐。
 * @param {Record<string, unknown>} data 游客路线偏好。
 * @returns {Promise<RouteRecommendResult>} 归一化偏好、首选路线、备选路线和提示信息。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function recommendRoute(data: Record<string, unknown>) {
  return request.post<RouteRecommendResult>({ url: '/api/routes/recommend', data })
}

/**
 * @description 保存游客选定或自定义的路线。
 * @param {{ sessionId?: string; routeId?: string; route?: unknown; preferences?: unknown }} data 会话、路线与偏好数据。
 * @param {string} [data.sessionId] 会话标识。
 * @param {string} [data.routeId] 路线标识。
 * @param {unknown} [data.route] 待保存的路线快照或自定义路线数据。
 * @param {unknown} [data.preferences] 归一化游客偏好。
 * @returns {Promise<unknown>} 后端返回的路线保存结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function saveRoute(data: {
  sessionId?: string
  routeId?: string
  route?: unknown
  preferences?: unknown
}) {
  return request.post({ url: '/api/routes/save', data })
}

/**
 * @description 请求路线节点讲解。
 * @param {{ nodeId?: string; spotId?: string; spotName?: string }} data 路线节点或景点定位信息。
 * @param {string} [data.nodeId] 当前路线节点标识。
 * @param {string} [data.spotId] 景点标识。
 * @param {string} [data.spotName] 路线节点关联的景点名称。
 * @returns {Promise<{ spotName: string; narration: string }>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function narrateRouteNode(data: { nodeId?: string; spotId?: string; spotName?: string }) {
  return request.post<{ spotName: string; narration: string }>({
    url: '/api/routes/node/narrate',
    data
  })
}

/**
 * @description 提交游客对回答的评分、情绪或意见。
 * @param {{ sessionId?: string; messageId?: string; rating?: number; vote?: 'up' | 'down'; emotion?: string; comment?: string }} data 评分、投票、情绪和意见。
 * @param {string} [data.sessionId] 会话标识。
 * @param {string} [data.messageId] 消息标识。
 * @param {number} [data.rating] 游客给出的数值评分。
 * @param {'up' | 'down'} [data.vote] 游客给出的赞同或反对投票。
 * @param {string} [data.emotion] 情绪标签。
 * @param {string} [data.comment] 游客补充的文字意见。
 * @returns {Promise<unknown>} 后端返回的反馈保存结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function submitFeedback(data: {
  sessionId?: string
  messageId?: string
  rating?: number
  vote?: 'up' | 'down'
  emotion?: string
  comment?: string
}) {
  return request.post({ url: '/api/feedback', data })
}

/**
 * @description 记录游客对答案知识来源的点击。
 * @param {{ sessionId: string; messageId?: string | null }} data 会话及可选回答消息标识。
 * @param {string} data.sessionId 会话标识。
 * @param {string | null} [data.messageId] 消息标识。
 * @returns {Promise<{ recorded: boolean }>} 引用点击是否已成功记录。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function trackCitationClick(data: { sessionId: string; messageId?: string | null }) {
  return request.post<{ recorded: boolean }>({ url: '/api/rag/citation-click', data })
}

/**
 * @description 获取指定游客会话的历史消息。
 * @param {string} sessionId 会话标识。
 * @returns {Promise<ChatMessage[]>} 按会话归档的用户与助手历史消息。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchHistory(sessionId: string) {
  return request.get<ChatMessage[]>({ url: '/api/chat/history', params: { sessionId } })
}

/**
 * @description 清空指定游客会话的历史消息。
 * @param {string} sessionId 会话标识。
 * @returns {Promise<{ sessionId: string; deleted: number }>} 被清理的会话标识和删除消息数量。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function clearChatHistory(sessionId: string) {
  return request.del<{ sessionId: string; deleted: number }>({
    url: '/api/chat/history',
    params: { sessionId }
  })
}

/**
 * @description 描述语音问答的识别文本、答案、合成语音和分阶段耗时。
 * @typedef {object} VoiceAskResult
 * @property {string} transcript 语音识别文本。
 * @property {unknown} [asr] 语音识别结果。
 * @property {ChatAnswer} answer 答案文本。
 * @property {{ segments?: { audioUrl: string }[] }} [tts] 语音合成结果。
 * @property {{ audioUrl: string }[]} [tts.segments] 语音或讲解片段列表。
 * @property {ChatLatency} [latency] 分阶段耗时。
 */
export interface VoiceAskResult {
  transcript: string
  asr?: unknown
  answer: ChatAnswer
  tts?: { segments?: { audioUrl: string }[] }
  latency?: ChatLatency
}

/**
 * @description 上传语音或转写文本并完成语音问答。
 * @param {{ transcript?: string; audioBase64?: string; mimeType?: string; sessionId?: string; locale?: string }} data 语音文件、转写文本和会话信息。
 * @param {string} [data.transcript] 语音识别文本。
 * @param {string} [data.audioBase64] 待识别音频的 Base64 编码。
 * @param {string} [data.mimeType] 媒体类型。
 * @param {string} [data.sessionId] 会话标识。
 * @param {string} [data.locale] 语言区域代码。
 * @returns {Promise<VoiceAskResult>} 识别文本、问答结果、合成语音和分阶段耗时。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function voiceAsk(data: {
  transcript?: string
  audioBase64?: string
  mimeType?: string
  sessionId?: string
  locale?: string
}) {
  return request.post<VoiceAskResult>({ url: '/api/voice/ask', data })
}
