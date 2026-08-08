<template>
  <section class="sheet-preview" :aria-label="$t('app.docsSpreadsheetPreview')">
    <div class="sheet-preview__toolbar">
      <label>
        <span>{{ $t('app.docsSpreadsheetSheet') }}</span>
        <select v-model.number="selectedSheetIndex" :disabled="loading || !sheets.length">
          <option v-for="(sheet, index) in sheets" :key="sheet.name" :value="index">
            {{ sheet.name }}
          </option>
        </select>
      </label>
      <span v-if="sheetsTruncated" class="sheet-preview__notice">
        {{ $t('app.docsSpreadsheetSheetsLimited', { count: sheets.length }) }}
      </span>
    </div>

    <div v-loading="loading" class="sheet-preview__stage">
      <ElEmpty v-if="error" :description="error">
        <ElButton type="primary" plain @click="parseWorkbook">{{ $t('app.retry') }}</ElButton>
      </ElEmpty>
      <ElEmpty v-else-if="!loading && !activeSheet?.rows.length" :description="$t('app.noData')" />
      <template v-else-if="activeSheet">
        <ElAlert
          v-if="activeSheet.truncated"
          type="info"
          :closable="false"
          :title="$t('app.docsSpreadsheetLimited')"
        />
        <div class="sheet-preview__table-wrap">
          <table>
            <thead>
              <tr>
                <th class="row-index"></th>
                <th v-for="column in columnCount" :key="column">{{ columnName(column) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in activeSheet.rows" :key="rowIndex">
                <th class="row-index">{{ rowIndex + 1 }}</th>
                <td v-for="column in columnCount" :key="column" :title="row[column - 1] || ''">
                  {{ row[column - 1] || '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  interface PreviewSheet {
    name: string
    rows: string[][]
    truncated: boolean
  }

  interface WorkerResponse {
    id: number
    ok: boolean
    sheets?: PreviewSheet[]
    sheetsTruncated?: boolean
    error?: string
  }

  const props = defineProps<{ data: ArrayBuffer }>()
  const { t } = useI18n()

  const loading = ref(true)
  const error = ref('')
  const sheets = ref<PreviewSheet[]>([])
  const selectedSheetIndex = ref(0)
  const sheetsTruncated = ref(false)
  const activeSheet = computed(() => sheets.value[selectedSheetIndex.value])
  const columnCount = computed(() =>
    Math.max(0, ...(activeSheet.value?.rows.map((row) => row.length) || []))
  )

  let worker: Worker | null = null
  let requestId = 0

  function parseWorkbook() {
    worker?.terminate()
    const id = ++requestId
    loading.value = true
    error.value = ''
    sheets.value = []
    selectedSheetIndex.value = 0
    sheetsTruncated.value = false
    worker = new Worker(new URL('./xlsx-preview.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      loading.value = false
      if (!event.data.ok) {
        error.value = event.data.error || t('app.docsPreviewFailed')
        return
      }
      sheets.value = event.data.sheets || []
      sheetsTruncated.value = Boolean(event.data.sheetsTruncated)
    }
    worker.onerror = () => {
      if (id !== requestId) return
      loading.value = false
      error.value = t('app.docsPreviewFailed')
    }

    const copy = props.data.slice(0)
    worker.postMessage({ id, data: copy }, [copy])
  }

  function columnName(column: number) {
    let value = column
    let label = ''
    while (value > 0) {
      value -= 1
      label = String.fromCharCode(65 + (value % 26)) + label
      value = Math.floor(value / 26)
    }
    return label
  }

  watch(() => props.data, parseWorkbook)
  onMounted(parseWorkbook)
  onBeforeUnmount(() => {
    requestId += 1
    worker?.terminate()
  })
</script>

<style scoped lang="scss">
  .sheet-preview,
  .sheet-preview__stage {
    display: grid;
    gap: 10px;
  }

  .sheet-preview__toolbar,
  .sheet-preview__toolbar label {
    display: flex;
    align-items: center;
  }

  .sheet-preview__toolbar {
    flex-wrap: wrap;
    gap: 10px 18px;
    justify-content: space-between;
    padding: 8px 10px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-light);
  }

  .sheet-preview__toolbar label {
    gap: 8px;
    color: var(--el-text-color-regular);
    font-size: 13px;
  }

  select {
    max-width: 260px;
    height: 30px;
    padding: 0 28px 0 9px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
  }

  .sheet-preview__notice {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .sheet-preview__stage {
    min-height: 320px;
  }

  .sheet-preview__table-wrap {
    max-height: calc(100vh - 250px);
    overflow: auto;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
  }

  table {
    width: max-content;
    min-width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    color: var(--el-text-color-primary);
    font-size: 12px;
  }

  th,
  td {
    min-width: 112px;
    max-width: 260px;
    padding: 8px 10px;
    overflow: hidden;
    border-right: 1px solid var(--el-border-color-lighter);
    border-bottom: 1px solid var(--el-border-color-lighter);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    z-index: 2;
    top: 0;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    text-align: center;
  }

  .row-index {
    position: sticky;
    z-index: 1;
    left: 0;
    min-width: 46px;
    width: 46px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    text-align: center;
  }

  thead .row-index {
    z-index: 3;
  }

  tbody tr:hover td {
    background: var(--el-fill-color-lighter);
  }

  @media (max-width: 640px) {
    .sheet-preview__toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .sheet-preview__toolbar label,
    select {
      width: 100%;
      max-width: none;
    }

    .sheet-preview__table-wrap {
      max-height: calc(100dvh - 250px);
    }

    th,
    td {
      min-width: 104px;
      max-width: 210px;
    }
  }
</style>
