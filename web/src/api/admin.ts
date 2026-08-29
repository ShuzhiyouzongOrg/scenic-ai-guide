/**
 * @fileoverview 管理后台 API 客户端。
 * @description 封装知识库、景点、FAQ、运营分析、会话反馈、服务质量、用户及角色管理请求和响应结构。
 */
import request from '@/utils/http'
import type { AxiosProgressEvent } from 'axios'
import type { ScenicSpot } from '@/api/guide'

/**
 * @description 管理后台 API（知识库 / 景点 / FAQ / 分析 / 会话 / 反馈 / 服务质量）
 */

// ---- 知识库 ----
/**
 * @description 描述知识库索引状态、范围、生成时间及内容统计。
 * @typedef {object} KnowledgeSummary
 * @property {string} status 当前状态。
 * @property {string} scope 知识范围。
 * @property {string} generatedAt 生成时间。
 * @property {string | null} [indexVersion] 知识索引版本。
 * @property {number} documents 文档数量。
 * @property {number} spots 景点数量。
 * @property {number} guideSections 导览章节数量。
 * @property {number} chunks 知识分块数量。
 */
export interface KnowledgeSummary {
  status: string
  scope: string
  generatedAt: string
  indexVersion?: string | null
  documents: number
  spots: number
  guideSections: number
  chunks: number
}

/**
 * @description 描述上传文档的文件信息、处理状态、知识范围、索引版本与去重结果。
 * @typedef {object} UploadRecord
 * @property {string} id 唯一标识。
 * @property {string} fileName 文件名。
 * @property {string} mimeType 媒体类型。
 * @property {number} size 上传文件字节数。
 * @property {string} fileType 文件类型。
 * @property {string} status 当前状态。
 * @property {string} [processingStage] 处理阶段。
 * @property {string | null} [errorCode] 错误码。
 * @property {string | null} [errorMessage] 错误信息。
 * @property {number} [attemptCount] 处理尝试次数。
 * @property {string | null} [startedAt] 处理开始时间。
 * @property {string | null} [finishedAt] 处理完成时间。
 * @property {'visitor_qa' | 'operations_analytics' | 'internal_reference'} [knowledgeScope] 知识用途范围。
 * @property {string} [scenicArea] 所属景区。
 * @property {string} [language] 内容语言。
 * @property {string} [documentType] 文档类型。
 * @property {string | null} [validFrom] 知识生效时间。
 * @property {string | null} [validTo] 知识失效时间。
 * @property {boolean} [enabled] 是否启用。
 * @property {string | null} [indexVersion] 知识索引版本。
 * @property {number} chunkCount 知识分块数量。
 * @property {string} [updatedAt] 更新时间。
 * @property {string} createdAt 创建时间。
 * @property {boolean} [duplicate] 是否为重复上传。
 * @property {string} [duplicateOf] 重复来源文档标识。
 * @property {string} [taskId] 异步处理任务标识。
 */
export interface UploadRecord {
  id: string
  fileName: string
  mimeType: string
  size: number
  fileType: string
  status: string
  processingStage?: string
  errorCode?: string | null
  errorMessage?: string | null
  attemptCount?: number
  startedAt?: string | null
  finishedAt?: string | null
  knowledgeScope?: 'visitor_qa' | 'operations_analytics' | 'internal_reference'
  scenicArea?: string
  language?: string
  documentType?: string
  validFrom?: string | null
  validTo?: string | null
  enabled?: boolean
  indexVersion?: string | null
  chunkCount: number
  updatedAt?: string
  createdAt: string
  duplicate?: boolean
  duplicateOf?: string
  taskId?: string
}

/**
 * @description 描述上传文档的可预览文本与截断状态。
 * @typedef {object} UploadPreview
 * @property {string} id 唯一标识。
 * @property {string} fileName 文件名。
 * @property {string} mimeType 媒体类型。
 * @property {number} size 上传文件字节数。
 * @property {string} fileType 文件类型。
 * @property {boolean} previewable 是否支持预览。
 * @property {boolean} truncated 预览内容是否已截断。
 * @property {string} content 正文内容。
 */
export interface UploadPreview {
  id: string
  fileName: string
  mimeType: string
  size: number
  fileType: string
  previewable: boolean
  truncated: boolean
  content: string
}

/**
 * @description 获取当前知识库摘要。
 * @returns {Promise<KnowledgeSummary>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getKnowledgeSummary()
 */
export function getKnowledgeSummary() {
  return request.get<KnowledgeSummary>({ url: '/api/knowledge/summary' })
}

/**
 * @description 触发知识库全量重建。
 * @returns {Promise<unknown>} 后端返回的知识库重建任务结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await rebuildKnowledge()
 */
export function rebuildKnowledge() {
  return request.post({ url: '/api/knowledge/rebuild' })
}

/**
 * @description 描述一个可切换知识索引版本的分块器、生成时间、统计和激活状态。
 * @typedef {object} KnowledgeIndexVersion
 * @property {string} indexVersion 知识索引版本。
 * @property {string} chunkerVersion 分块器版本。
 * @property {string} generatedAt 生成时间。
 * @property {number} documentCount 文档数量。
 * @property {number} chunkCount 知识分块数量。
 * @property {boolean} active 是否为当前活动版本。
 */
export interface KnowledgeIndexVersion {
  indexVersion: string
  chunkerVersion: string
  generatedAt: string
  documentCount: number
  chunkCount: number
  active: boolean
}

/**
 * @description 获取可用知识索引版本。
 * @returns {Promise<KnowledgeIndexVersion[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getKnowledgeIndexVersions()
 */
export function getKnowledgeIndexVersions() {
  return request.get<KnowledgeIndexVersion[]>({ url: '/api/admin/knowledge/index-versions' })
}

/**
 * @description 激活指定知识索引版本。
 * @param {string} indexVersion 知识索引版本。
 * @returns {Promise<{ activeVersion: string previousVersion: string versions: KnowledgeIndexVersion[] }>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function activateKnowledgeIndexVersion(indexVersion: string) {
  return request.post<{
    activeVersion: string
    previousVersion: string
    versions: KnowledgeIndexVersion[]
  }>({
    url: `/api/admin/knowledge/index-versions/${encodeURIComponent(indexVersion)}/activate`
  })
}

/**
 * @description 获取上传文档列表。
 * @returns {Promise<UploadRecord[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getUploads()
 */
export function getUploads() {
  return request.get<UploadRecord[]>({ url: '/api/uploads' })
}

/**
 * @description 获取指定上传文档的文本预览。
 * @param {string} id 唯一标识。
 * @returns {Promise<UploadPreview>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getUploadPreview(id: string) {
  return request.get<UploadPreview>({ url: `/api/uploads/${encodeURIComponent(id)}/preview` })
}

/**
 * @description 下载指定上传文档的原始内容。
 * @param {string} id 唯一标识。
 * @returns {Promise<ArrayBuffer>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getUploadContent(id: string) {
  return request.get<ArrayBuffer>({
    url: `/api/uploads/${encodeURIComponent(id)}/content`,
    responseType: 'arraybuffer',
    rawResponse: true,
    showErrorMessage: false
  })
}

/**
 * @description 上传 Base64 文档并提交知识处理元数据。
 * @param {{ fileName: string mimeType: string contentBase64: string knowledgeScope: 'visitor_qa' | 'operations_analytics' | 'internal_reference' scenicArea?: string language?: string }} data 文档内容与知识元数据。
 * @param {string} data.fileName 文件名。
 * @param {string} data.mimeType 媒体类型。
 * @param {string} data.contentBase64 文档二进制内容的 Base64 编码。
 * @param {'visitor_qa' | 'operations_analytics' | 'internal_reference'} data.knowledgeScope 知识用途范围。
 * @param {string} [data.scenicArea] 所属景区。
 * @param {string} [data.language] 内容语言。
 * @param {{ onUploadProgress?: (event: AxiosProgressEvent) => void }} [options] 上传进度回调选项。
 * @param {(event: AxiosProgressEvent) => void} [options.onUploadProgress] 上传进度变化时调用的回调函数。
 * @returns {Promise<UploadRecord>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function uploadDocument(
  data: {
    fileName: string
    mimeType: string
    contentBase64: string
    knowledgeScope: 'visitor_qa' | 'operations_analytics' | 'internal_reference'
    scenicArea?: string
    language?: string
  },
  options: { onUploadProgress?: (event: AxiosProgressEvent) => void } = {}
) {
  return request.post<UploadRecord>({
    url: '/api/uploads',
    data,
    onUploadProgress: options.onUploadProgress
  })
}

/**
 * @description 重新处理指定上传文档。
 * @param {string} id 唯一标识。
 * @returns {Promise<UploadRecord>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function reprocessUpload(id: string) {
  return request.post<UploadRecord>({
    url: `/api/uploads/${encodeURIComponent(id)}/reprocess`
  })
}

/**
 * @description 描述上传文档生成的可追溯引用及页码、工作表或行范围。
 * @typedef {object} UploadCitation
 * @property {string} citationId 引用标识。
 * @property {string} chunkId 知识分块标识。
 * @property {string} documentId 文档标识。
 * @property {string} sectionTitle 章节标题。
 * @property {string} quote 引用摘录。
 * @property {number | null} [page] PDF 页码。
 * @property {string | null} [sheetName] 工作表名称。
 * @property {string | null} [range] 单元格范围。
 * @property {number | null} [rowStart] 起始行号。
 * @property {number | null} [rowEnd] 结束行号。
 * @property {string} [knowledgeScope] 知识用途范围。
 * @property {string} [scenicArea] 所属景区。
 * @property {string} [language] 内容语言。
 * @property {string | null} [documentType] 文档类型。
 * @property {string | null} [indexVersion] 知识索引版本。
 */
export interface UploadCitation {
  citationId: string
  chunkId: string
  documentId: string
  sectionTitle: string
  quote: string
  page?: number | null
  sheetName?: string | null
  range?: string | null
  rowStart?: number | null
  rowEnd?: number | null
  knowledgeScope?: string
  scenicArea?: string
  language?: string
  documentType?: string | null
  indexVersion?: string | null
}

/**
 * @description 切换上传文档是否参与知识检索。
 * @param {string} id 唯一标识。
 * @param {boolean} enabled 是否启用。
 * @returns {Promise<UploadRecord>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function setUploadEnabled(id: string, enabled: boolean) {
  return request.put<UploadRecord>({
    url: `/api/uploads/${encodeURIComponent(id)}`,
    data: { enabled }
  })
}

/**
 * @description 获取上传文档及其生成的引用列表。
 * @param {string} id 唯一标识。
 * @returns {Promise<{ document: UploadRecord indexVersion: string | null citations: UploadCitation[] }>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getUploadCitations(id: string) {
  return request.get<{
    document: UploadRecord
    indexVersion: string | null
    citations: UploadCitation[]
  }>({ url: `/api/uploads/${encodeURIComponent(id)}/citations` })
}

/**
 * @description 描述管理端知识检索命中的正文、分数和来源。
 * @typedef {object} KnowledgeHit
 * @property {string} [id] 唯一标识。
 * @property {string} [title] 标题。
 * @property {string} content 正文内容。
 * @property {number} [score] 相关性分数。
 * @property {string} [scenicSpotName] 景点名称。
 * @property {string} [documentName] 来源文档名称。
 */
export interface KnowledgeHit {
  id?: string
  title?: string
  content: string
  score?: number
  scenicSpotName?: string
  documentName?: string
}

/**
 * @description 按关键词或混合模式测试知识检索。
 * @param {{ query: string; mode?: 'hybrid' | 'keyword' }} data 知识检索查询与模式。
 * @param {string} data.query 路由查询参数或检索问题。
 * @param {'hybrid' | 'keyword'} [data.mode] 回答或运行模式。
 * @returns {Promise<{ results: KnowledgeHit[] }>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function searchKnowledge(data: { query: string; mode?: 'hybrid' | 'keyword' }) {
  return request.post<{ results: KnowledgeHit[] }>({ url: '/api/knowledge/search', data })
}

/**
 * @description 描述 RAG 实验单个分组的回答质量、延迟、成本、模型与索引指标。
 * @typedef {object} RagExperimentVariantMetrics
 * @property {number} answers 回答数量。
 * @property {number} refusalRate 拒答率。
 * @property {number} feedbackSamples 反馈样本数。
 * @property {number} acceptanceRate 回答接受率。
 * @property {number} citationClickRate 引用点击率。
 * @property {number} p95LatencyMs P95 响应耗时。
 * @property {number} averageTokens 平均令牌数。
 * @property {number} averageEstimatedCostUsd 平均预估美元成本。
 * @property {Record<string, number>} models 模型使用次数映射。
 * @property {Record<string, number>} indexVersions 索引版本使用次数映射。
 */
export interface RagExperimentVariantMetrics {
  answers: number
  refusalRate: number
  feedbackSamples: number
  acceptanceRate: number
  citationClickRate: number
  p95LatencyMs: number
  averageTokens: number
  averageEstimatedCostUsd: number
  models: Record<string, number>
  indexVersions: Record<string, number>
}

/**
 * @description 描述 RAG 对照实验配置、运行状态、两组指标和差异结果。
 * @typedef {object} RagExperimentReport
 * @property {string} experimentId 实验标识。
 * @property {boolean} enabled 是否启用。
 * @property {number} treatmentPercent 实验组流量比例。
 * @property {{ status: string; rollbackReason?: string | null; rolledBackAt?: string | null }} state 实验运行与回滚状态。
 * @property {string} state.status 当前状态。
 * @property {string | null} [state.rollbackReason] 自动回滚的原因。
 * @property {string | null} [state.rolledBackAt] 自动回滚时间。
 * @property {{ control: RagExperimentVariantMetrics treatment: RagExperimentVariantMetrics }} variants 对照组和实验组指标。
 * @property {RagExperimentVariantMetrics} variants.control 对照组聚合指标。
 * @property {RagExperimentVariantMetrics} variants.treatment 实验组聚合指标。
 * @property {Record<string, number | null>} comparison 两组指标差异。
 */
export interface RagExperimentReport {
  experimentId: string
  enabled: boolean
  treatmentPercent: number
  state: { status: string; rollbackReason?: string | null; rolledBackAt?: string | null }
  variants: {
    control: RagExperimentVariantMetrics
    treatment: RagExperimentVariantMetrics
  }
  comparison: Record<string, number | null>
}

/**
 * @description 获取 RAG 对照实验报告。
 * @returns {Promise<RagExperimentReport>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getRagExperimentReport()
 */
export function getRagExperimentReport() {
  return request.get<RagExperimentReport>({ url: '/api/admin/rag-experiment' })
}

/**
 * @description 重置 RAG 对照实验统计。
 * @returns {Promise<RagExperimentReport>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await resetRagExperiment()
 */
export function resetRagExperiment() {
  return request.post<RagExperimentReport>({ url: '/api/admin/rag-experiment/reset' })
}

// ---- 景点管理 ----
/**
 * @description 获取管理端景点列表。
 * @returns {Promise<ScenicSpot[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getAdminSpots()
 */
export function getAdminSpots() {
  return request.get<ScenicSpot[]>({ url: '/api/admin/scenic-spots' })
}
/**
 * @description 创建景点记录。
 * @param {Partial<ScenicSpot>} data 待创建的景点字段。
 * @returns {Promise<ScenicSpot>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function createAdminSpot(data: Partial<ScenicSpot>) {
  return request.post<ScenicSpot>({ url: '/api/admin/scenic-spots', data })
}
/**
 * @description 更新指定景点记录。
 * @param {string} id 唯一标识。
 * @param {Partial<ScenicSpot>} data 待更新的景点字段。
 * @returns {Promise<ScenicSpot>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateAdminSpot(id: string, data: Partial<ScenicSpot>) {
  return request.put<ScenicSpot>({ url: `/api/admin/scenic-spots/${id}`, data })
}
/**
 * @description 删除指定景点记录。
 * @param {string} id 唯一标识。
 * @returns {Promise<unknown>} 后端返回的景点删除结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function deleteAdminSpot(id: string) {
  return request.del({ url: `/api/admin/scenic-spots/${id}` })
}

// ---- FAQ 管理 ----
/**
 * @description 描述管理端 FAQ 的问题、答案、关键词、优先级与启用状态。
 * @typedef {object} AdminFaq
 * @property {string} id 唯一标识。
 * @property {string} question 问题文本。
 * @property {string} answer 答案文本。
 * @property {string[]} keywords 检索关键词。
 * @property {number} priority 排序优先级。
 * @property {boolean} enabled 是否启用。
 * @property {string} [createdAt] 创建时间。
 * @property {string} [updatedAt] 更新时间。
 */
export interface AdminFaq {
  id: string
  question: string
  answer: string
  keywords: string[]
  priority: number
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}
/**
 * @description 获取管理端 FAQ 列表。
 * @returns {Promise<AdminFaq[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getAdminFaqs()
 */
export function getAdminFaqs() {
  return request.get<AdminFaq[]>({ url: '/api/admin/faqs' })
}
/**
 * @description 创建 FAQ 记录。
 * @param {Partial<AdminFaq>} data 待创建的 FAQ 字段。
 * @returns {Promise<AdminFaq>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function createAdminFaq(data: Partial<AdminFaq>) {
  return request.post<AdminFaq>({ url: '/api/admin/faqs', data })
}
/**
 * @description 更新指定 FAQ 记录。
 * @param {string} id 唯一标识。
 * @param {Partial<AdminFaq>} data 待更新的 FAQ 字段。
 * @returns {Promise<AdminFaq>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateAdminFaq(id: string, data: Partial<AdminFaq>) {
  return request.put<AdminFaq>({ url: `/api/admin/faqs/${id}`, data })
}

// ---- 运营分析 ----
/**
 * @description 描述运营分析看板的数据来源、指标、画像、热点与建议。
 * @typedef {object} DashboardData
 * @property {string} source 数据来源。
 * @property {string} generatedAt 生成时间。
 * @property {Record<string, unknown>} filters 当前筛选条件。
 * @property {{ todayServiceCount: number weekServiceCount: number totalQuestions: number averageSatisfaction: number averageLatencyMs: number behaviorRows: number }} metrics 核心业务指标。
 * @property {number} metrics.todayServiceCount 今日累计服务次数。
 * @property {number} metrics.weekServiceCount 本周累计服务次数。
 * @property {number} metrics.totalQuestions 累计游客提问数。
 * @property {number} metrics.averageSatisfaction 平均满意度。
 * @property {number} metrics.averageLatencyMs 平均问答响应时延，单位为毫秒。
 * @property {number} metrics.behaviorRows 纳入统计的游客行为记录数。
 * @property {{ label: string; value: number }[]} hotQuestions 热门问题统计。
 * @property {{ label: string; value: number }[]} spotFocus 景点关注度统计。
 * @property {{ label: string; value: number }[]} emotionTrend 情绪趋势统计。
 * @property {{ label: string; value: number }[]} routePreference 路线偏好统计。
 * @property {Record<string, number>} consumption 消费指标。
 * @property {{ ageBands: { label: string; value: number }[] genders: { label: string; value: number }[] groupSizes: { label: string; value: number }[] }} persona 游客画像统计。
 * @property {{ label: string; value: number }[]} persona.ageBands 年龄段分布。
 * @property {{ label: string; value: number }[]} persona.genders 性别分布。
 * @property {{ label: string; value: number }[]} persona.groupSizes 同行人数分布。
 * @property {unknown} stayRelation 停留关系数据。
 * @property {string[]} suggestions 优化建议。
 */
export interface DashboardData {
  source: string
  generatedAt: string
  filters: Record<string, unknown>
  metrics: {
    todayServiceCount: number
    weekServiceCount: number
    totalQuestions: number
    averageSatisfaction: number
    averageLatencyMs: number
    behaviorRows: number
  }
  hotQuestions: { label: string; value: number }[]
  spotFocus: { label: string; value: number }[]
  emotionTrend: { label: string; value: number }[]
  routePreference: { label: string; value: number }[]
  consumption: Record<string, number>
  persona: {
    ageBands: { label: string; value: number }[]
    genders: { label: string; value: number }[]
    groupSizes: { label: string; value: number }[]
  }
  stayRelation: unknown
  suggestions: string[]
}

/**
 * @description 按筛选条件获取运营分析看板。
 * @param {Record<string, unknown>} [params] 运营看板筛选参数。
 * @returns {Promise<DashboardData>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getDashboard(params: Record<string, unknown> = {}) {
  return request.get<DashboardData>({ url: '/api/admin/analytics/dashboard', params })
}

/**
 * @description 触发游客行为分析数据导入。
 * @returns {Promise<unknown>} 后端返回的行为数据导入摘要。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await importAnalytics()
 */
export function importAnalytics() {
  return request.post({ url: '/api/admin/analytics/import' })
}

// ---- 演示数据 ----
/**
 * @description 描述一批演示数据在各业务表中的生成数量。
 * @typedef {object} DemoDataCounts
 * @property {number} visitorSessions 游客会话数量。
 * @property {number} messages 消息数量。
 * @property {number} feedback 反馈数量。
 * @property {number} touristBehavior 游客行为记录数量。
 * @property {number} routeSelections 路线选择数量。
 * @property {number} messageAnnotations 消息标注数量。
 * @property {number} total 总数量。
 */
export interface DemoDataCounts {
  visitorSessions: number
  messages: number
  feedback: number
  touristBehavior: number
  routeSelections: number
  messageAnnotations: number
  total: number
}

/**
 * @description 描述演示数据生成批次、时间与可选统计。
 * @typedef {object} DemoDataGenerationResult
 * @property {string} [batchId] 生成批次标识。
 * @property {string} [generatedAt] 生成时间。
 * @property {Partial<DemoDataCounts>} [counts] 分类统计。
 */
export interface DemoDataGenerationResult {
  batchId?: string
  generatedAt?: string
  counts?: Partial<DemoDataCounts>
}

/**
 * @description 生成一批管理端演示数据。
 * @returns {Promise<DemoDataGenerationResult>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await generateDemoData()
 */
export function generateDemoData() {
  return request.post<DemoDataGenerationResult>({
    url: '/api/admin/demo-data/generate',
    showErrorMessage: false
  })
}

// ---- 会话与反馈 ----
/**
 * @description 描述管理端会话列表使用的消息量、满意度与关注主题摘要。
 * @typedef {object} ConversationSummary
 * @property {string} sessionId 会话标识。
 * @property {string} startedAt 处理开始时间。
 * @property {string} updatedAt 更新时间。
 * @property {number} messageCount 消息数量。
 * @property {number} userQuestionCount 游客提问数量。
 * @property {number | null} averageRating 平均评分。
 * @property {boolean} lowSatisfaction 是否为低满意度会话。
 * @property {string} mainFocus 主要关注主题。
 * @property {number} feedbackCount 关联反馈记录数量。
 */
export interface ConversationSummary {
  sessionId: string
  startedAt: string
  updatedAt: string
  messageCount: number
  userQuestionCount: number
  averageRating: number | null
  lowSatisfaction: boolean
  mainFocus: string
  feedbackCount: number
}

/**
 * @description 按满意度条件获取会话摘要列表。
 * @param {{ lowSatisfactionOnly?: boolean }} [params] 会话列表筛选参数。
 * @param {boolean} [params.lowSatisfactionOnly] 是否仅返回低满意度会话。
 * @returns {Promise<ConversationSummary[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getConversations(params: { lowSatisfactionOnly?: boolean } = {}) {
  return request.get<ConversationSummary[]>({ url: '/api/admin/conversations', params })
}

/**
 * @description 获取指定会话的消息、反馈和摘要。
 * @param {string} sessionId 会话标识。
 * @returns {Promise<{ sessionId: string messages: any[] feedback: any[] summary: ConversationSummary }>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getConversationDetail(sessionId: string) {
  return request.get<{
    sessionId: string
    messages: any[]
    feedback: any[]
    summary: ConversationSummary
  }>({
    url: `/api/admin/conversations/${sessionId}`
  })
}

/**
 * @description 为指定问答消息添加质量标注。
 * @param {string} messageId 消息标识。
 * @param {{ label: string; note?: string }} data 消息质量标签与可选备注。
 * @param {string} data.label 显示名称或分类标签。
 * @param {string} [data.note] 补充说明。
 * @returns {Promise<unknown>} 后端返回的消息质量标注结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function annotateMessage(messageId: string, data: { label: string; note?: string }) {
  return request.post({ url: `/api/admin/messages/${messageId}/annotation`, data })
}

/**
 * @description 描述由低质量问答创建的知识补充草稿。
 * @typedef {object} KnowledgeDraft
 * @property {string} id 唯一标识。
 * @property {string} title 标题。
 * @property {string} question 问题文本。
 * @property {string} suggestedAnswer 建议答案。
 * @property {string} sourceMessageId 来源消息标识。
 * @property {string} createdAt 创建时间。
 */
export interface KnowledgeDraft {
  id: string
  title: string
  question: string
  suggestedAnswer: string
  sourceMessageId: string
  createdAt: string
}
/**
 * @description 根据指定消息创建知识补充草稿。
 * @param {string} messageId 消息标识。
 * @returns {Promise<KnowledgeDraft>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function createKnowledgeDraft(messageId: string) {
  return request.post<KnowledgeDraft>({ url: `/api/admin/messages/${messageId}/knowledge-draft` })
}

/**
 * @description 描述按问题聚合的反馈数量、平均评分和样本。
 * @typedef {object} FeedbackCluster
 * @property {string} label 显示名称或分类标签。
 * @property {number} count 样本数量或播放次数。
 * @property {number} averageRating 平均评分。
 * @property {{ comment?: string; rating?: number; vote?: string }[]} samples 反馈样本。
 */
export interface FeedbackCluster {
  label: string
  count: number
  averageRating: number
  samples: { comment?: string; rating?: number; vote?: string }[]
}
/**
 * @description 获取聚类后的游客反馈。
 * @returns {Promise<FeedbackCluster[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getFeedbackClusters()
 */
export function getFeedbackClusters() {
  return request.get<FeedbackCluster[]>({ url: '/api/admin/feedback/clusters' })
}

/**
 * @description 描述会话质量、低满意度、错误回答和优化建议汇总。
 * @typedef {object} ServiceQualityReport
 * @property {string} generatedAt 生成时间。
 * @property {number} conversationCount 会话数量。
 * @property {number} lowSatisfactionCount 低满意度会话数量。
 * @property {number} averageSatisfaction 平均满意度。
 * @property {FeedbackCluster[]} commonIssues 常见问题聚类。
 * @property {number} wrongAnswerCount 错误回答数量。
 * @property {string[]} optimizationSuggestions 优化建议列表。
 */
export interface ServiceQualityReport {
  generatedAt: string
  conversationCount: number
  lowSatisfactionCount: number
  averageSatisfaction: number
  commonIssues: FeedbackCluster[]
  wrongAnswerCount: number
  optimizationSuggestions: string[]
}
/**
 * @description 获取服务质量分析报告。
 * @returns {Promise<ServiceQualityReport>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getServiceQualityReport()
 */
export function getServiceQualityReport() {
  return request.get<ServiceQualityReport>({ url: '/api/admin/service-quality/report' })
}

// ---- 系统用户管理（产品闭环）----
/**
 * @description 描述管理端用户的账号、角色、状态和个人资料。
 * @typedef {object} AdminUser
 * @property {string} id 唯一标识。
 * @property {string} username 登录用户名。
 * @property {string} displayName 显示名称。
 * @property {string} role 用户角色或消息角色。
 * @property {'active' | 'disabled'} status 当前状态。
 * @property {string} [createdAt] 创建时间。
 * @property {string} [avatar] 头像地址。
 * @property {string} [realName] 真实姓名。
 * @property {string} [gender] 性别。
 * @property {string} [nickname] 昵称。
 * @property {string} [email] 电子邮箱。
 * @property {string} [phone] 手机号码。
 * @property {string} [address] 联系地址。
 * @property {string} [bio] 个人简介。
 */
export interface AdminUser {
  id: string
  username: string
  displayName: string
  role: string
  status: 'active' | 'disabled'
  createdAt?: string
  avatar?: string
  realName?: string
  gender?: string
  nickname?: string
  email?: string
  phone?: string
  address?: string
  bio?: string
}
/**
 * @description 获取系统用户列表。
 * @returns {Promise<AdminUser[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await getAdminUsers()
 */
export function getAdminUsers() {
  return request.get<AdminUser[]>({ url: '/api/admin/users' })
}
/**
 * @description 创建系统用户。
 * @param {{ username: string password: string displayName?: string role?: string }} data 新用户账号、密码、显示名称与角色。
 * @param {string} data.username 登录用户名。
 * @param {string} data.password 登录密码。
 * @param {string} [data.displayName] 显示名称。
 * @param {string} [data.role] 用户角色或消息角色。
 * @returns {Promise<AdminUser>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function createAdminUser2(data: {
  username: string
  password: string
  displayName?: string
  role?: string
}) {
  return request.post<AdminUser>({ url: '/api/admin/users', data })
}
/**
 * @description 更新系统用户及可选密码。
 * @param {string} id 唯一标识。
 * @param {Partial<AdminUser> & { password?: string }} data 用户资料及可选新密码。
 * @returns {Promise<AdminUser>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateAdminUser(id: string, data: Partial<AdminUser> & { password?: string }) {
  return request.put<AdminUser>({ url: `/api/admin/users/${id}`, data })
}
/**
 * @description 删除指定系统用户。
 * @param {string} id 唯一标识。
 * @returns {Promise<unknown>} 后端返回的用户删除结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function deleteAdminUser(id: string) {
  return request.del({ url: `/api/admin/users/${id}` })
}

/**
 * @description 描述系统角色的编码、状态、权限和创建时间。
 * @typedef {object} AdminRole
 * @property {number} roleId 角色标识。
 * @property {string} roleName 角色名称。
 * @property {string} roleCode 角色编码。
 * @property {string} description 说明文本。
 * @property {boolean} enabled 是否启用。
 * @property {string[]} permissions 权限标识列表。
 * @property {string} createTime 创建时间。
 */
export interface AdminRole {
  roleId: number
  roleName: string
  roleCode: string
  description: string
  enabled: boolean
  permissions: string[]
  createTime: string
}

/**
 * @description 按条件获取系统角色列表。
 * @param {Record<string, unknown>} [params] 角色列表筛选参数。
 * @returns {Promise<AdminRole[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function getAdminRoles(params: Record<string, unknown> = {}) {
  return request.get<AdminRole[]>({ url: '/api/admin/roles', params })
}

/**
 * @description 创建系统角色。
 * @param {Partial<AdminRole>} data 待创建的角色字段。
 * @returns {Promise<AdminRole>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function createAdminRole(data: Partial<AdminRole>) {
  return request.post<AdminRole>({ url: '/api/admin/roles', data })
}

/**
 * @description 更新系统角色。
 * @param {number} id 唯一标识。
 * @param {Partial<AdminRole>} data 待更新的角色字段。
 * @returns {Promise<AdminRole>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateAdminRole(id: number, data: Partial<AdminRole>) {
  return request.put<AdminRole>({ url: `/api/admin/roles/${id}`, data })
}

/**
 * @description 替换指定角色的权限集合。
 * @param {number} id 唯一标识。
 * @param {string[]} permissions 权限标识列表。
 * @returns {Promise<AdminRole>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateAdminRolePermissions(id: number, permissions: string[]) {
  return request.put<AdminRole>({ url: `/api/admin/roles/${id}/permissions`, data: { permissions } })
}

/**
 * @description 删除指定系统角色。
 * @param {number} id 唯一标识。
 * @returns {Promise<unknown>} 后端返回的角色删除结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function deleteAdminRole(id: number) {
  return request.del({ url: `/api/admin/roles/${id}` })
}
