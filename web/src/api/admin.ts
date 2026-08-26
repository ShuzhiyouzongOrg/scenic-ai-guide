import request from '@/utils/http'
import type { AxiosProgressEvent } from 'axios'
import type { ScenicSpot } from '@/api/guide'

/** 管理后台 API（知识库 / 景点 / FAQ / 分析 / 会话 / 反馈 / 服务质量） */

// ---- 知识库 ----
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

export function getKnowledgeSummary() {
  return request.get<KnowledgeSummary>({ url: '/api/knowledge/summary' })
}

export function rebuildKnowledge() {
  return request.post({ url: '/api/knowledge/rebuild' })
}

export interface KnowledgeIndexVersion {
  indexVersion: string
  chunkerVersion: string
  generatedAt: string
  documentCount: number
  chunkCount: number
  active: boolean
}

export function getKnowledgeIndexVersions() {
  return request.get<KnowledgeIndexVersion[]>({ url: '/api/admin/knowledge/index-versions' })
}

export function activateKnowledgeIndexVersion(indexVersion: string) {
  return request.post<{
    activeVersion: string
    previousVersion: string
    versions: KnowledgeIndexVersion[]
  }>({
    url: `/api/admin/knowledge/index-versions/${encodeURIComponent(indexVersion)}/activate`
  })
}

export function getUploads() {
  return request.get<UploadRecord[]>({ url: '/api/uploads' })
}

export function getUploadPreview(id: string) {
  return request.get<UploadPreview>({ url: `/api/uploads/${encodeURIComponent(id)}/preview` })
}

export function getUploadContent(id: string) {
  return request.get<ArrayBuffer>({
    url: `/api/uploads/${encodeURIComponent(id)}/content`,
    responseType: 'arraybuffer',
    rawResponse: true,
    showErrorMessage: false
  })
}

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

export function reprocessUpload(id: string) {
  return request.post<UploadRecord>({
    url: `/api/uploads/${encodeURIComponent(id)}/reprocess`
  })
}

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

export function setUploadEnabled(id: string, enabled: boolean) {
  return request.put<UploadRecord>({
    url: `/api/uploads/${encodeURIComponent(id)}`,
    data: { enabled }
  })
}

export function getUploadCitations(id: string) {
  return request.get<{
    document: UploadRecord
    indexVersion: string | null
    citations: UploadCitation[]
  }>({ url: `/api/uploads/${encodeURIComponent(id)}/citations` })
}

export interface KnowledgeHit {
  id?: string
  title?: string
  content: string
  score?: number
  scenicSpotName?: string
  documentName?: string
}

export function searchKnowledge(data: { query: string; mode?: 'hybrid' | 'keyword' }) {
  return request.post<{ results: KnowledgeHit[] }>({ url: '/api/knowledge/search', data })
}

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

export function getRagExperimentReport() {
  return request.get<RagExperimentReport>({ url: '/api/admin/rag-experiment' })
}

export function resetRagExperiment() {
  return request.post<RagExperimentReport>({ url: '/api/admin/rag-experiment/reset' })
}

// ---- 景点管理 ----
export function getAdminSpots() {
  return request.get<ScenicSpot[]>({ url: '/api/admin/scenic-spots' })
}
export function createAdminSpot(data: Partial<ScenicSpot>) {
  return request.post<ScenicSpot>({ url: '/api/admin/scenic-spots', data })
}
export function updateAdminSpot(id: string, data: Partial<ScenicSpot>) {
  return request.put<ScenicSpot>({ url: `/api/admin/scenic-spots/${id}`, data })
}
export function deleteAdminSpot(id: string) {
  return request.del({ url: `/api/admin/scenic-spots/${id}` })
}

// ---- FAQ 管理 ----
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
export function getAdminFaqs() {
  return request.get<AdminFaq[]>({ url: '/api/admin/faqs' })
}
export function createAdminFaq(data: Partial<AdminFaq>) {
  return request.post<AdminFaq>({ url: '/api/admin/faqs', data })
}
export function updateAdminFaq(id: string, data: Partial<AdminFaq>) {
  return request.put<AdminFaq>({ url: `/api/admin/faqs/${id}`, data })
}

// ---- 运营分析 ----
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

export function getDashboard(params: Record<string, unknown> = {}) {
  return request.get<DashboardData>({ url: '/api/admin/analytics/dashboard', params })
}

export function importAnalytics() {
  return request.post({ url: '/api/admin/analytics/import' })
}

// ---- 演示数据 ----
export interface DemoDataCounts {
  visitorSessions: number
  messages: number
  feedback: number
  touristBehavior: number
  routeSelections: number
  messageAnnotations: number
  total: number
}

export interface DemoDataGenerationResult {
  batchId?: string
  generatedAt?: string
  counts?: Partial<DemoDataCounts>
}

export function generateDemoData() {
  return request.post<DemoDataGenerationResult>({
    url: '/api/admin/demo-data/generate',
    showErrorMessage: false
  })
}

// ---- 会话与反馈 ----
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

export function getConversations(params: { lowSatisfactionOnly?: boolean } = {}) {
  return request.get<ConversationSummary[]>({ url: '/api/admin/conversations', params })
}

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

export function annotateMessage(messageId: string, data: { label: string; note?: string }) {
  return request.post({ url: `/api/admin/messages/${messageId}/annotation`, data })
}

export interface KnowledgeDraft {
  id: string
  title: string
  question: string
  suggestedAnswer: string
  sourceMessageId: string
  createdAt: string
}
export function createKnowledgeDraft(messageId: string) {
  return request.post<KnowledgeDraft>({ url: `/api/admin/messages/${messageId}/knowledge-draft` })
}

export interface FeedbackCluster {
  label: string
  count: number
  averageRating: number
  samples: { comment?: string; rating?: number; vote?: string }[]
}
export function getFeedbackClusters() {
  return request.get<FeedbackCluster[]>({ url: '/api/admin/feedback/clusters' })
}

export interface ServiceQualityReport {
  generatedAt: string
  conversationCount: number
  lowSatisfactionCount: number
  averageSatisfaction: number
  commonIssues: FeedbackCluster[]
  wrongAnswerCount: number
  optimizationSuggestions: string[]
}
export function getServiceQualityReport() {
  return request.get<ServiceQualityReport>({ url: '/api/admin/service-quality/report' })
}

// ---- 系统用户管理（产品闭环）----
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
export function getAdminUsers() {
  return request.get<AdminUser[]>({ url: '/api/admin/users' })
}
export function createAdminUser2(data: {
  username: string
  password: string
  displayName?: string
  role?: string
}) {
  return request.post<AdminUser>({ url: '/api/admin/users', data })
}
export function updateAdminUser(id: string, data: Partial<AdminUser> & { password?: string }) {
  return request.put<AdminUser>({ url: `/api/admin/users/${id}`, data })
}
export function deleteAdminUser(id: string) {
  return request.del({ url: `/api/admin/users/${id}` })
}

export interface AdminRole {
  roleId: number
  roleName: string
  roleCode: string
  description: string
  enabled: boolean
  permissions: string[]
  createTime: string
}

export function getAdminRoles(params: Record<string, unknown> = {}) {
  return request.get<AdminRole[]>({ url: '/api/admin/roles', params })
}

export function createAdminRole(data: Partial<AdminRole>) {
  return request.post<AdminRole>({ url: '/api/admin/roles', data })
}

export function updateAdminRole(id: number, data: Partial<AdminRole>) {
  return request.put<AdminRole>({ url: `/api/admin/roles/${id}`, data })
}

export function updateAdminRolePermissions(id: number, permissions: string[]) {
  return request.put<AdminRole>({ url: `/api/admin/roles/${id}/permissions`, data: { permissions } })
}

export function deleteAdminRole(id: number) {
  return request.del({ url: `/api/admin/roles/${id}` })
}
