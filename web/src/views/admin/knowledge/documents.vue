<!--
  知识库文档管理：统计、重建、批量上传及上传进度。
-->
<template>
  <div class="kn-documents">
    <ElRow :gutter="16" class="stat-row">
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <p class="stat-value">{{ summary?.documents ?? '-' }}</p>
          <p class="stat-label">{{ $t('app.docsCount') }}</p>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <p class="stat-value">{{ summary?.spots ?? '-' }}</p>
          <p class="stat-label">{{ $t('app.docsSpotCount') }}</p>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <p class="stat-value">{{ summary?.guideSections ?? '-' }}</p>
          <p class="stat-label">{{ $t('app.docsSections') }}</p>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <p class="stat-value">{{ summary?.chunks ?? '-' }}</p>
          <p class="stat-label">{{ $t('app.docsChunks') }}</p>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <p class="stat-value stat-text">
            <template v-if="scopeLines.length">
              <span v-for="line in scopeLines" :key="line" class="scope-line">{{ line }}</span>
            </template>
            <template v-else>-</template>
          </p>
          <p class="stat-label">{{ $t('app.docsScope') }}</p>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8" :md="4">
        <ElCard shadow="hover" class="stat-card">
          <ElTag :type="summary?.status === 'ready' ? 'success' : 'info'" effect="light">
            {{ summary?.status || '-' }}
          </ElTag>
          <p class="stat-label">{{ $t('app.status') }}</p>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElCard shadow="never" class="action-card">
      <div class="action-bar">
        <div class="action-left">
          <div class="upload-profile">
            <ElSelect
              v-model="uploadProfile.knowledgeScope"
              :disabled="uploading"
              :aria-label="$t('app.docsUploadScope')"
              class="upload-profile__select"
            >
              <ElOption value="visitor_qa" :label="$t('app.docsScopeVisitor')" />
              <ElOption value="operations_analytics" :label="$t('app.docsScopeOperations')" />
              <ElOption value="internal_reference" :label="$t('app.docsScopeInternal')" />
            </ElSelect>
            <ElSelect
              v-model="uploadProfile.scenicArea"
              :disabled="uploading"
              :aria-label="$t('app.docsScenicArea')"
              class="upload-profile__select"
            >
              <ElOption value="" :label="$t('app.docsScenicAreaGeneral')" />
              <ElOption value="lingshan" :label="$t('app.docsScenicAreaLingshan')" />
              <ElOption value="nianhuawan" :label="$t('app.docsScenicAreaNianhuawan')" />
            </ElSelect>
            <ElSelect
              v-model="uploadProfile.language"
              :disabled="uploading"
              :aria-label="$t('app.docsLanguage')"
              class="upload-profile__language"
            >
              <ElOption value="zh" label="简体中文" />
              <ElOption value="zh-TW" label="繁體中文" />
              <ElOption value="en" label="English" />
              <ElOption value="ja" label="日本語" />
              <ElOption value="ko" label="한국어" />
              <ElOption value="th" label="ไทย" />
            </ElSelect>
          </div>
          <ElUpload
            multiple
            :auto-upload="false"
            :show-file-list="false"
            :disabled="uploading"
            :on-change="onFileChange"
            accept=".docx,.xlsx,.txt,.md,.pdf"
          >
            <ElButton type="primary" :loading="uploading">
              <ElIcon><UploadFilled /></ElIcon>
              <span>{{ $t('app.docsUpload') }}</span>
            </ElButton>
          </ElUpload>
          <div class="accept-tip">
            <span>{{ $t('app.docsSupported') }}</span>
            <span class="accept-tip__multiple">{{ $t('app.docsUploadMultiple') }}</span>
          </div>
        </div>
        <div class="action-right">
          <ElButton :loading="loading" @click="refresh">
            <ElIcon><Refresh /></ElIcon>
            <span>{{ $t('app.refresh') }}</span>
          </ElButton>
          <ElButton
            type="warning"
            :loading="rebuilding"
            :disabled="uploading"
            @click="handleRebuild"
          >
            <ElIcon><Refresh /></ElIcon>
            <span>{{ $t('app.docsRebuild') }}</span>
          </ElButton>
        </div>
      </div>
    </ElCard>

    <ElCard shadow="never" class="index-versions-card">
      <template #header>
        <div class="index-versions-heading">
          <strong>{{ $t('app.docsIndexVersions') }}</strong>
          <span>{{ $t('app.docsIndexVersionsHint') }}</span>
        </div>
      </template>
      <ElTable v-loading="versionsLoading" :data="indexVersions" size="small" border>
        <ElTableColumn :label="$t('app.docsIndexVersion')" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <code>{{ row.indexVersion }}</code>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="chunkerVersion" :label="$t('app.docsChunkerVersion')" min-width="135" />
        <ElTableColumn :label="$t('app.docsUpdatedAt')" min-width="180">
          <template #default="{ row }">{{ formatTimestamp(row.generatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="documentCount" :label="$t('app.docsCount')" width="100" align="center" />
        <ElTableColumn prop="chunkCount" :label="$t('app.docsChunks')" width="100" align="center" />
        <ElTableColumn :label="$t('app.status')" width="115" align="center">
          <template #default="{ row }">
            <ElTag :type="row.active ? 'success' : 'info'" effect="plain">
              {{ row.active ? $t('app.docsIndexActive') : $t('app.docsIndexHistory') }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.docsActions')" width="130" align="center">
          <template #default="{ row }">
            <ElButton
              v-if="!row.active"
              link
              type="warning"
              :loading="activatingVersion === row.indexVersion"
              @click="handleActivateVersion(row)"
            >
              {{ $t('app.docsIndexRestore') }}
            </ElButton>
            <span v-else>-</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <Transition name="upload-progress">
      <ElCard
        v-if="uploadTasks.length && uploadProgressVisible"
        shadow="never"
        class="upload-progress-card"
      >
        <section aria-live="polite">
          <div class="upload-progress-heading">
            <div>
              <p class="upload-progress-title">{{ $t('app.docsUploadProgress') }}</p>
              <p class="upload-progress-subtitle"
                >{{ terminalTaskCount }} / {{ uploadTasks.length }}</p
              >
            </div>
            <div class="upload-progress-actions">
              <div class="upload-progress-rate">
                <span>{{ $t('app.docsUploadRate') }}</span>
                <strong>{{ formatRate(uploadRate) }}</strong>
              </div>
              <ElButton
                v-if="!uploading"
                class="upload-progress-close"
                text
                circle
                size="small"
                :title="$t('app.docsUploadDismiss')"
                :aria-label="$t('app.docsUploadDismiss')"
                @click="uploadProgressVisible = false"
              >
                <ElIcon><Close /></ElIcon>
              </ElButton>
            </div>
          </div>
          <ElProgress :percentage="overallProgress" :stroke-width="8" :show-text="false" />
          <ul class="upload-task-list">
            <li
              v-for="task in uploadTasks"
              :key="task.id"
              class="upload-task"
              :class="`upload-task--${task.state}`"
            >
              <div class="upload-task__main">
                <span class="upload-task__name" :title="task.file.name">{{ task.file.name }}</span>
                <span class="upload-task__meta">
                  {{ formatSize(task.transferred) }} / {{ formatSize(task.file.size) }}
                </span>
              </div>
              <div class="upload-task__status">
                <span>{{ taskStatusLabel(task.state) }}</span>
                <span v-if="task.state === 'uploading'">{{ formatRate(task.rateBps) }}</span>
                <span v-else>{{ task.progress }}%</span>
              </div>
              <ElProgress
                class="upload-task__bar"
                :percentage="task.progress"
                :stroke-width="5"
                :show-text="false"
              />
              <p v-if="task.error" class="upload-task__error">{{ task.error }}</p>
            </li>
          </ul>
        </section>
      </ElCard>
    </Transition>

    <ElCard shadow="never" class="table-card">
      <ElTable v-loading="loading" :data="uploads" stripe border>
        <ElTableColumn :label="$t('app.fileName')" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <ElButton
              class="file-preview-link"
              link
              type="primary"
              :title="$t('app.docsPreview')"
              @click="handlePreview(row)"
            >
              {{ row.fileName }}
            </ElButton>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="fileType" :label="$t('app.type')" width="110" />
        <ElTableColumn :label="$t('app.docsScope')" min-width="170">
          <template #default="{ row }">
            <ElTag effect="plain" size="small">{{ row.knowledgeScope || 'visitor_qa' }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.size')" width="110">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.docsProcessingStage')" min-width="130">
          <template #default="{ row }">
            <ElTag :type="statusType(row.processingStage || row.status)" effect="plain">
              {{ row.processingStage || row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.status')" min-width="125">
          <template #default="{ row }">
            <div class="document-status-cell">
              <ElTooltip :disabled="!row.errorMessage" :content="row.errorMessage" placement="top">
                <ElTag :type="statusType(row.status)" effect="light">{{ row.status }}</ElTag>
              </ElTooltip>
              <ElTag :type="row.enabled === false ? 'info' : 'success'" effect="plain">
                {{ row.enabled === false ? $t('app.docsDisabled') : $t('app.docsEnabled') }}
              </ElTag>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn
          prop="chunkCount"
          :label="$t('app.docsChunkCount')"
          width="100"
          align="center"
        />
        <ElTableColumn :label="$t('app.docsUpdatedAt')" min-width="180">
          <template #default="{ row }">{{ formatTimestamp(row.updatedAt || row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.docsActions')" width="260" align="center">
          <template #default="{ row }">
            <div class="document-actions">
              <ElButton link type="primary" :title="$t('app.docsCitationOpen')" @click="handleCitations(row)">
                <ElIcon><View /></ElIcon>
                <span>{{ $t('app.docsCitations') }}</span>
              </ElButton>
              <ElButton
                v-if="row.status === 'failed' || row.status === 'needs_ocr'"
                link
                type="primary"
                :loading="reprocessingId === row.id"
                :title="$t('app.docsReprocess')"
                @click="handleReprocess(row)"
              >
                <ElIcon><Refresh /></ElIcon>
                <span>{{ $t('app.docsReprocess') }}</span>
              </ElButton>
              <ElButton
                link
                :type="row.enabled === false ? 'success' : 'danger'"
                :loading="togglingId === row.id"
                :title="row.enabled === false ? $t('app.docsEnable') : $t('app.docsDisable')"
                @click="handleToggleEnabled(row)"
              >
                <ElIcon><SwitchButton /></ElIcon>
                <span>{{ row.enabled === false ? $t('app.docsEnable') : $t('app.docsDisable') }}</span>
              </ElButton>
            </div>
          </template>
        </ElTableColumn>
        <template #empty>
          <ElEmpty :description="$t('app.docsEmpty')" />
        </template>
      </ElTable>
    </ElCard>

    <ElDrawer
      v-model="previewOpen"
      :title="preview?.fileName || $t('app.docsPreview')"
      size="min(960px, 96vw)"
      destroy-on-close
      class="document-preview-drawer"
      @closed="resetPreview"
    >
      <div v-loading="previewLoading" class="document-preview">
        <template v-if="preview">
          <div class="document-preview__meta">
            <ElTag effect="plain">{{ preview.fileType.toUpperCase() }}</ElTag>
            <span>{{ formatSize(preview.size) }}</span>
          </div>
          <ElAlert
            v-if="preview.truncated"
            class="document-preview__notice"
            type="warning"
            :closable="false"
            :title="$t('app.docsPreviewTruncated')"
          />
          <ElResult
            v-if="previewError"
            icon="error"
            :title="$t('app.docsPreviewFailed')"
            :sub-title="previewError"
          >
            <template #extra>
              <ElButton type="primary" plain @click="retryPreview">{{ $t('app.retry') }}</ElButton>
            </template>
          </ElResult>
          <PdfDocumentPreview
            v-else-if="previewFileType === 'pdf' && previewData"
            :data="previewData"
            :file-name="preview.fileName"
          />
          <SpreadsheetDocumentPreview
            v-else-if="previewFileType === 'xlsx' && previewData"
            :data="previewData"
          />
          <pre v-else-if="preview.previewable" class="document-preview__content">{{
            preview.content
          }}</pre>
          <ElEmpty v-else :description="$t('app.docsPreviewUnsupported')" />
        </template>
      </div>
    </ElDrawer>

    <ElDrawer
      v-model="citationOpen"
      :title="citationDocument?.fileName || $t('app.docsCitations')"
      size="min(860px, 94vw)"
      destroy-on-close
      class="document-citation-drawer"
      @closed="resetCitations"
    >
      <div v-loading="citationLoading" class="document-citations">
        <ElAlert
          v-if="citationDocument?.enabled === false"
          type="info"
          :closable="false"
          :title="$t('app.docsCitationDisabled')"
        />
        <p v-if="citationIndexVersion" class="document-citations__version">
          {{ $t('app.docsCitationIndexVersion') }}: {{ citationIndexVersion }}
        </p>
        <ElEmpty
          v-if="!citationLoading && !citations.length"
          :description="$t('app.docsCitationEmpty')"
        />
        <div v-else class="document-citation-list">
          <ElCard v-for="citation in citations" :key="citation.chunkId" shadow="never" class="document-citation">
            <div class="document-citation__heading">
              <ElTag type="primary" effect="plain">{{ citation.citationId }}</ElTag>
              <strong>{{ citation.sectionTitle || '-' }}</strong>
            </div>
            <p class="document-citation__quote">{{ citation.quote }}</p>
            <p class="document-citation__location">
              {{ $t('app.docsCitationLocation') }}:
              {{ citationLocation(citation) }}
            </p>
          </ElCard>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { defineAsyncComponent } from 'vue'
  import { Close, Refresh, SwitchButton, UploadFilled, View } from '@element-plus/icons-vue'
  import type { UploadFile } from 'element-plus'
  import { ElMessageBox } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { formatDateTime } from '@/utils/date'
  import {
    activateKnowledgeIndexVersion,
    getKnowledgeIndexVersions,
    getKnowledgeSummary,
    getUploadCitations,
    getUploadContent,
    getUploadPreview,
    getUploads,
    rebuildKnowledge,
    reprocessUpload,
    setUploadEnabled,
    uploadDocument,
    type KnowledgeSummary,
    type KnowledgeIndexVersion,
    type UploadCitation,
    type UploadPreview,
    type UploadRecord
  } from '@/api/admin'

  defineOptions({ name: 'KnowledgeDocuments' })

  const PdfDocumentPreview = defineAsyncComponent(
    () => import('@/components/knowledge/PdfDocumentPreview.vue')
  )
  const SpreadsheetDocumentPreview = defineAsyncComponent(
    () => import('@/components/knowledge/SpreadsheetDocumentPreview.vue')
  )

  type UploadTaskState = 'queued' | 'uploading' | 'indexing' | 'done' | 'duplicate' | 'failed'

  interface UploadTask {
    id: string
    file: File
    progress: number
    transferred: number
    rateBps: number
    startedAt?: number
    state: UploadTaskState
    error?: string
  }

  const { t, locale } = useI18n()
  const maxUploadConcurrency = 2

  const summary = ref<KnowledgeSummary | null>(null)
  const uploads = ref<UploadRecord[]>([])
  const indexVersions = ref<KnowledgeIndexVersion[]>([])
  const uploadTasks = ref<UploadTask[]>([])
  const uploadProgressVisible = ref(false)
  const loading = ref(false)
  const rebuilding = ref(false)
  const versionsLoading = ref(false)
  const activatingVersion = ref('')
  const reprocessingId = ref('')
  const togglingId = ref('')
  const uploading = ref(false)
  const uploadProfile = reactive<{
    knowledgeScope: 'visitor_qa' | 'operations_analytics' | 'internal_reference'
    scenicArea: string
    language: string
  }>({
    knowledgeScope: 'visitor_qa',
    scenicArea: '',
    language: 'zh'
  })
  const previewOpen = ref(false)
  const previewLoading = ref(false)
  const preview = ref<UploadPreview | null>(null)
  const previewData = ref<ArrayBuffer | null>(null)
  const previewError = ref('')
  const activePreviewRecord = ref<UploadRecord | null>(null)
  const citationOpen = ref(false)
  const citationLoading = ref(false)
  const citationDocument = ref<UploadRecord | null>(null)
  const citationIndexVersion = ref<string | null>(null)
  const citations = ref<UploadCitation[]>([])
  let batchTimer: number | undefined
  const maxInteractivePreviewBytes = 30 * 1024 * 1024

  const scopeLines = computed(() => (summary.value?.scope || '').split(/\s+/).filter(Boolean))
  const terminalTaskCount = computed(
    () =>
      uploadTasks.value.filter(
        (task) => task.state === 'done' || task.state === 'duplicate' || task.state === 'failed'
      ).length
  )
  const overallProgress = computed(() => {
    const totalSize = uploadTasks.value.reduce((total, task) => total + task.file.size, 0)
    if (!totalSize) return 0
    const transferred = uploadTasks.value.reduce((total, task) => total + task.transferred, 0)
    return Math.round((transferred / totalSize) * 100)
  })
  const uploadRate = computed(() =>
    uploadTasks.value
      .filter((task) => task.state === 'uploading')
      .reduce((total, task) => total + task.rateBps, 0)
  )
  const previewFileType = computed(() => preview.value?.fileType.toLowerCase() || '')

  function formatSize(size: number) {
    if (!Number.isFinite(size) || size < 0) return '-'
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatRate(rate: number) {
    return rate > 0 ? `${formatSize(rate)}/s` : '-'
  }

  function formatTimestamp(value?: string) {
    return formatDateTime(value, locale.value)
  }

  function statusType(status: string) {
    if (status === 'ready' || status === 'done' || status === 'processed') return 'success'
    if (status === 'failed' || status === 'error') return 'danger'
    if (status === 'processing' || status === 'pending' || status === 'needs_ocr' || status === 'extracting') return 'warning'
    return 'info'
  }

  function taskStatusLabel(state: UploadTaskState) {
    const labels: Record<UploadTaskState, string> = {
      queued: t('app.docsUploadQueued'),
      uploading: t('app.docsUploadUploading'),
      indexing: t('app.docsUploadIndexing'),
      done: t('app.docsUploadCompleted'),
      duplicate: t('app.docsUploadDuplicateState'),
      failed: t('app.docsUploadFailedState')
    }
    return labels[state]
  }

  async function loadSummary() {
    try {
      summary.value = await getKnowledgeSummary()
    } catch {
      ElMessage.error(t('app.docsSummaryFailed'))
    }
  }

  async function loadUploads() {
    loading.value = true
    try {
      uploads.value = await getUploads()
    } catch {
      ElMessage.error(t('app.docsListFailed'))
    } finally {
      loading.value = false
    }
  }

  async function loadIndexVersions() {
    versionsLoading.value = true
    try {
      indexVersions.value = await getKnowledgeIndexVersions()
    } catch {
      ElMessage.error(t('app.docsIndexLoadFailed'))
    } finally {
      versionsLoading.value = false
    }
  }

  async function refresh() {
    await Promise.all([loadSummary(), loadUploads(), loadIndexVersions()])
  }

  async function handleActivateVersion(row: KnowledgeIndexVersion) {
    try {
      await ElMessageBox.confirm(
        t('app.docsIndexRestoreConfirm', { version: row.indexVersion }),
        t('app.docsIndexRestore'),
        {
          type: 'warning',
          confirmButtonText: t('app.docsIndexRestore'),
          cancelButtonText: t('app.cancel')
        }
      )
    } catch {
      return
    }
    activatingVersion.value = row.indexVersion
    try {
      await activateKnowledgeIndexVersion(row.indexVersion)
      ElMessage.success(t('app.docsIndexRestoreDone'))
      await refresh()
    } catch {
      ElMessage.error(t('app.docsIndexRestoreFailed'))
    } finally {
      activatingVersion.value = ''
    }
  }

  async function handlePreview(row: UploadRecord) {
    previewOpen.value = true
    previewLoading.value = true
    preview.value = null
    previewData.value = null
    previewError.value = ''
    activePreviewRecord.value = row
    try {
      preview.value = await getUploadPreview(row.id)
      if (row.fileType === 'pdf' || row.fileType === 'xlsx') {
        if (row.size > maxInteractivePreviewBytes) {
          previewError.value = t('app.docsPreviewTooLarge', {
            size: formatSize(maxInteractivePreviewBytes)
          })
          return
        }
        previewData.value = await getUploadContent(row.id)
      }
    } catch {
      previewError.value = t('app.docsPreviewFailed')
      ElMessage.error(t('app.docsPreviewFailed'))
    } finally {
      previewLoading.value = false
    }
  }

  function retryPreview() {
    if (activePreviewRecord.value) void handlePreview(activePreviewRecord.value)
  }

  function resetPreview() {
    preview.value = null
    previewData.value = null
    previewError.value = ''
    activePreviewRecord.value = null
  }

  async function handleRebuild() {
    try {
      await ElMessageBox.confirm(t('app.docsRebuildConfirm'), t('app.docsRebuild'), {
        type: 'warning',
        confirmButtonText: t('app.docsConfirmRebuild'),
        cancelButtonText: t('app.cancel')
      })
    } catch {
      return
    }
    rebuilding.value = true
    try {
      await rebuildKnowledge()
      ElMessage.success(t('app.docsRebuildDone'))
      await refresh()
    } catch {
      ElMessage.error(t('app.docsRebuildFailed'))
    } finally {
      rebuilding.value = false
    }
  }

  function citationLocation(citation: UploadCitation) {
    if (citation.page) return `${t('app.docsCitationPage')} ${citation.page}`
    if (citation.sheetName && citation.range) return `${citation.sheetName} ${citation.range}`
    if (citation.sheetName) return citation.sheetName
    return citation.sectionTitle || '-'
  }

  async function handleCitations(row: UploadRecord) {
    citationOpen.value = true
    citationLoading.value = true
    citationDocument.value = row
    citationIndexVersion.value = null
    citations.value = []
    try {
      const result = await getUploadCitations(row.id)
      citationDocument.value = result.document
      citationIndexVersion.value = result.indexVersion
      citations.value = result.citations
    } catch {
      ElMessage.error(t('app.docsCitationFailed'))
    } finally {
      citationLoading.value = false
    }
  }

  function resetCitations() {
    citationDocument.value = null
    citationIndexVersion.value = null
    citations.value = []
  }

  async function handleToggleEnabled(row: UploadRecord) {
    const nextEnabled = row.enabled === false
    try {
      await ElMessageBox.confirm(
        t(nextEnabled ? 'app.docsEnableConfirm' : 'app.docsDisableConfirm', { fileName: row.fileName }),
        nextEnabled ? t('app.docsEnable') : t('app.docsDisable'),
        {
          type: nextEnabled ? 'info' : 'warning',
          confirmButtonText: nextEnabled ? t('app.docsEnable') : t('app.docsDisable'),
          cancelButtonText: t('app.cancel')
        }
      )
    } catch {
      return
    }
    togglingId.value = row.id
    try {
      await setUploadEnabled(row.id, nextEnabled)
      ElMessage.success(nextEnabled ? t('app.docsEnableDone') : t('app.docsDisableDone'))
      await refresh()
    } catch {
      ElMessage.error(nextEnabled ? t('app.docsEnableFailed') : t('app.docsDisableFailed'))
    } finally {
      togglingId.value = ''
    }
  }

  async function handleReprocess(row: UploadRecord) {
    try {
      await ElMessageBox.confirm(
        t('app.docsReprocessConfirm', { fileName: row.fileName }),
        t('app.docsReprocess'),
        {
          type: 'warning',
          confirmButtonText: t('app.docsConfirmReprocess'),
          cancelButtonText: t('app.cancel')
        }
      )
    } catch {
      return
    }
    reprocessingId.value = row.id
    try {
      await reprocessUpload(row.id)
      ElMessage.success(t('app.docsReprocessDone'))
      await refresh()
    } catch {
      ElMessage.error(t('app.docsReprocessFailed'))
    } finally {
      reprocessingId.value = ''
    }
  }

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  function onFileChange(uploadFile: UploadFile) {
    const raw = uploadFile.raw
    if (!raw || uploading.value) return

    uploadProgressVisible.value = true

    if (
      uploadTasks.value.every(
        (task) => task.state === 'done' || task.state === 'duplicate' || task.state === 'failed'
      )
    ) {
      uploadTasks.value = []
    }
    if (uploadTasks.value.some((task) => task.id === String(uploadFile.uid))) return

    uploadTasks.value.push({
      id: String(uploadFile.uid),
      file: raw,
      progress: 0,
      transferred: 0,
      rateBps: 0,
      state: 'queued'
    })
    if (batchTimer) window.clearTimeout(batchTimer)
    batchTimer = window.setTimeout(() => void uploadQueuedFiles(), 160)
  }

  async function uploadQueuedFiles() {
    batchTimer = undefined
    const tasks = uploadTasks.value.filter((task) => task.state === 'queued')
    if (!tasks.length) return

    uploading.value = true
    let nextTask = 0
    const worker = async () => {
      while (nextTask < tasks.length) {
        const task = tasks[nextTask]
        nextTask += 1
        await uploadTask(task)
      }
    }

    await Promise.all(Array.from({ length: Math.min(maxUploadConcurrency, tasks.length) }, worker))
    uploading.value = false
    await refresh()

    const succeeded = uploadTasks.value.filter((task) => task.state === 'done').length
    const duplicates = uploadTasks.value.filter((task) => task.state === 'duplicate').length
    const failed = uploadTasks.value.filter((task) => task.state === 'failed').length
    const message = t('app.docsUploadBatchDone', {
      success: succeeded,
      duplicate: duplicates,
      failed
    })
    if (failed || duplicates) ElMessage.warning(message)
    else ElMessage.success(message)
  }

  async function uploadTask(task: UploadTask) {
    try {
      task.startedAt = Date.now()
      task.state = 'uploading'
      const contentBase64 = await readAsBase64(task.file)
      const result = await uploadDocument(
        {
          fileName: task.file.name,
          mimeType: task.file.type || 'application/octet-stream',
          contentBase64,
          knowledgeScope: uploadProfile.knowledgeScope,
          scenicArea: uploadProfile.scenicArea,
          language: uploadProfile.language
        },
        {
          onUploadProgress: (event) => updateUploadProgress(task, event.loaded, event.total)
        }
      )
      task.progress = 100
      task.transferred = task.file.size
      task.rateBps = 0
      task.state = result.duplicate ? 'duplicate' : 'done'
    } catch {
      task.rateBps = 0
      task.state = 'failed'
      task.error = t('app.docsUploadFailed')
    }
  }

  function updateUploadProgress(task: UploadTask, loaded: number, total?: number) {
    const fraction = total && total > 0 ? Math.min(loaded / total, 1) : 0
    task.progress = Math.max(task.progress, Math.round(fraction * 100))
    task.transferred = Math.max(task.transferred, Math.round(task.file.size * fraction))
    const elapsedSeconds = Math.max((Date.now() - (task.startedAt || Date.now())) / 1000, 0.1)
    task.rateBps = Math.round(task.transferred / elapsedSeconds)
    if (fraction >= 1) task.state = 'indexing'
  }

  onMounted(() => {
    refresh()
  })

  onBeforeUnmount(() => {
    if (batchTimer) window.clearTimeout(batchTimer)
  })
</script>

<style scoped lang="scss">
  .kn-documents {
    padding: 12px;
  }

  .stat-row,
  .action-card,
  .index-versions-card,
  .upload-progress-card {
    margin-bottom: 12px;
  }

  .stat-card {
    margin-bottom: 12px;
    text-align: center;

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--el-color-primary);
    }

    .stat-text {
      font-size: 16px;
      line-height: 1.35;
    }

    .scope-line {
      display: block;
    }

    .stat-label {
      margin-top: 6px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
  }

  .action-bar,
  .action-left,
  .action-right,
  .upload-progress-heading,
  .upload-task__main,
  .upload-task__status {
    display: flex;
    align-items: center;
  }

  .action-bar {
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
  }

  .action-left,
  .action-right {
    gap: 10px;
  }

  .index-versions-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;

    span {
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }
  }

  .action-left {
    flex-wrap: wrap;
  }

  .upload-profile {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .upload-profile__select {
    width: 150px;
  }

  .upload-profile__language {
    width: 118px;
  }

  .accept-tip {
    display: grid;
    gap: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .accept-tip__multiple {
    color: var(--el-color-primary);
  }

  .upload-progress-card {
    border-color: var(--el-border-color-light);
    background: var(--el-fill-color-blank);
  }

  .upload-progress-heading {
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .upload-progress-title,
  .upload-progress-subtitle,
  .upload-task__error {
    margin: 0;
  }

  .upload-progress-title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .upload-progress-subtitle,
  .upload-progress-rate,
  .upload-task__meta,
  .upload-task__status {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .upload-progress-rate {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
  }

  .upload-progress-actions {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  .upload-progress-close {
    color: var(--el-text-color-secondary);

    &:hover {
      color: var(--el-text-color-primary);
      background: var(--el-fill-color-light);
    }
  }

  .upload-progress-rate strong {
    color: var(--el-text-color-primary);
    font-variant-numeric: tabular-nums;
  }

  .upload-task-list {
    display: grid;
    gap: 10px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  .upload-task {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 16px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    background: var(--el-fill-color-lighter);
    transition:
      background-color 180ms ease-out,
      border-color 180ms ease-out,
      transform 180ms ease-out;
  }

  .upload-task--uploading,
  .upload-task--indexing {
    border-color: color-mix(in srgb, var(--el-color-primary) 35%, var(--el-border-color-lighter));
    background: color-mix(in srgb, var(--el-color-primary-light-9) 80%, white);
  }

  .upload-task--done {
    border-color: color-mix(in srgb, var(--el-color-success) 25%, var(--el-border-color-lighter));
  }

  .upload-task--duplicate {
    border-color: color-mix(in srgb, var(--el-color-warning) 32%, var(--el-border-color-lighter));
    background: color-mix(in srgb, var(--el-color-warning-light-9) 75%, white);
  }

  .upload-task--failed {
    border-color: color-mix(in srgb, var(--el-color-danger) 28%, var(--el-border-color-lighter));
  }

  .upload-task__main {
    min-width: 0;
    gap: 10px;
  }

  .upload-task__name {
    overflow: hidden;
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upload-task__meta {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  .upload-task__status {
    justify-content: flex-end;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }

  .upload-task__bar {
    grid-column: 1 / -1;
  }

  .upload-task__error {
    grid-column: 1 / -1;
    font-size: 12px;
    color: var(--el-color-danger);
  }

  .upload-progress-enter-active,
  .upload-progress-leave-active {
    transition:
      opacity 180ms ease-out,
      transform 180ms ease-out;
  }

  .upload-progress-enter-from,
  .upload-progress-leave-to {
    opacity: 0;
    transform: translateY(-8px);
  }

  .table-card {
    :deep(.el-icon) {
      margin-right: 4px;
      vertical-align: middle;
    }
  }

  .table-action-placeholder {
    color: var(--el-text-color-placeholder);
  }

  .document-status-cell,
  .document-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: center;
  }

  .document-actions {
    gap: 2px;
  }

  .file-preview-link {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    font-weight: 500;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-preview {
    min-height: 240px;
  }

  .document-preview__meta {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  .document-preview__notice {
    margin-bottom: 12px;
  }

  .document-preview__content {
    max-height: calc(100vh - 190px);
    margin: 0;
    padding: 16px;
    overflow: auto;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-lighter);
    color: var(--el-text-color-primary);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.75;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .document-citations {
    min-height: 240px;
  }

  .document-citations__version,
  .document-citation__quote,
  .document-citation__location {
    margin: 0;
  }

  .document-citations__version {
    margin: 12px 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .document-citation-list {
    display: grid;
    gap: 10px;
  }

  .document-citation {
    border-color: var(--el-border-color-lighter);
  }

  .document-citation__heading {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .document-citation__heading strong {
    overflow: hidden;
    color: var(--el-text-color-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-citation__quote {
    margin-top: 10px;
    color: var(--el-text-color-primary);
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .document-citation__location {
    margin-top: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  @media (max-width: 640px) {
    .action-left,
    .action-right,
    .upload-progress-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .action-right {
      width: 100%;
    }

    .upload-task {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .upload-task__main,
    .upload-task__status {
      justify-content: space-between;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .upload-task,
    .upload-progress-enter-active,
    .upload-progress-leave-active {
      transition: none;
    }
  }
</style>
