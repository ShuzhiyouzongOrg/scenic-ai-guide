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

    <Transition name="upload-progress">
      <ElCard v-if="uploadTasks.length" shadow="never" class="upload-progress-card">
        <section aria-live="polite">
          <div class="upload-progress-heading">
            <div>
              <p class="upload-progress-title">{{ $t('app.docsUploadProgress') }}</p>
              <p class="upload-progress-subtitle"
                >{{ terminalTaskCount }} / {{ uploadTasks.length }}</p
              >
            </div>
            <div class="upload-progress-rate">
              <span>{{ $t('app.docsUploadRate') }}</span>
              <strong>{{ formatRate(uploadRate) }}</strong>
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
        <ElTableColumn
          prop="fileName"
          :label="$t('app.fileName')"
          min-width="200"
          show-overflow-tooltip
        />
        <ElTableColumn prop="fileType" :label="$t('app.type')" width="110" />
        <ElTableColumn :label="$t('app.size')" width="110">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="$t('app.status')" width="110">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)" effect="light">{{ row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn
          prop="chunkCount"
          :label="$t('app.docsChunkCount')"
          width="100"
          align="center"
        />
        <ElTableColumn :label="$t('app.uploadTime')" min-width="180">
          <template #default="{ row }">{{ formatTimestamp(row.createdAt) }}</template>
        </ElTableColumn>
        <template #empty>
          <ElEmpty :description="$t('app.docsEmpty')" />
        </template>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { Refresh, UploadFilled } from '@element-plus/icons-vue'
  import type { UploadFile } from 'element-plus'
  import { ElMessageBox } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { formatDateTime } from '@/utils/date'
  import {
    getKnowledgeSummary,
    getUploads,
    rebuildKnowledge,
    uploadDocument,
    type KnowledgeSummary,
    type UploadRecord
  } from '@/api/admin'

  defineOptions({ name: 'KnowledgeDocuments' })

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
  const uploadTasks = ref<UploadTask[]>([])
  const loading = ref(false)
  const rebuilding = ref(false)
  const uploading = ref(false)
  let batchTimer: number | undefined

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
    if (status === 'processing' || status === 'pending') return 'warning'
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

  async function refresh() {
    await Promise.all([loadSummary(), loadUploads()])
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
          contentBase64
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
