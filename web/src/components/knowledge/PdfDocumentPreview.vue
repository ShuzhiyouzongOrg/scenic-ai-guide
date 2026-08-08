<template>
  <section class="pdf-preview" :aria-label="$t('app.docsPdfPreview')">
    <div class="pdf-preview__toolbar">
      <div class="pdf-preview__pages">
        <ElButton size="small" :disabled="pageNumber <= 1 || loading" @click="goToPage(-1)">
          {{ $t('app.previous') }}
        </ElButton>
        <span>{{ $t('app.docsPdfPage', { page: pageNumber, total: pageCount || '-' }) }}</span>
        <ElButton size="small" :disabled="pageNumber >= pageCount || loading" @click="goToPage(1)">
          {{ $t('app.next') }}
        </ElButton>
      </div>
      <div class="pdf-preview__zoom">
        <ElButton size="small" :disabled="zoom <= minZoom || loading" @click="changeZoom(-0.25)">
          −
        </ElButton>
        <button class="pdf-preview__zoom-value" type="button" @click="resetZoom">
          {{ Math.round(zoom * 100) }}%
        </button>
        <ElButton size="small" :disabled="zoom >= maxZoom || loading" @click="changeZoom(0.25)">
          +
        </ElButton>
      </div>
    </div>

    <div ref="stageRef" v-loading="loading" class="pdf-preview__stage">
      <ElEmpty v-if="error" :description="error">
        <ElButton type="primary" plain @click="loadDocument">{{ $t('app.retry') }}</ElButton>
      </ElEmpty>
      <canvas v-show="!error" ref="canvasRef" :aria-label="fileName"></canvas>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import {
    getDocument,
    GlobalWorkerOptions,
    type PDFDocumentLoadingTask,
    type PDFDocumentProxy,
    type RenderTask
  } from 'pdfjs-dist/legacy/build/pdf.mjs'
  import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ data: ArrayBuffer; fileName: string }>()
  const { t } = useI18n()

  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const stageRef = ref<HTMLElement | null>(null)
  const loading = ref(true)
  const error = ref('')
  const pageNumber = ref(1)
  const pageCount = ref(0)
  const zoom = ref(1)
  const minZoom = 0.75
  const maxZoom = 2

  let loadingTask: PDFDocumentLoadingTask | null = null
  let documentProxy: PDFDocumentProxy | null = null
  let renderTask: RenderTask | null = null
  let resizeObserver: ResizeObserver | null = null
  let resizeFrame = 0
  let loadVersion = 0
  let pdfWorker: Worker | null = null

  function ensurePdfWorker() {
    if (!pdfWorker) pdfWorker = new PdfWorker()
    GlobalWorkerOptions.workerPort = pdfWorker
  }

  async function disposeDocument() {
    renderTask?.cancel()
    renderTask = null
    if (loadingTask) {
      await loadingTask.destroy().catch(() => undefined)
    }
    loadingTask = null
    documentProxy = null
  }

  async function loadDocument() {
    const version = ++loadVersion
    loading.value = true
    error.value = ''
    pageNumber.value = 1
    pageCount.value = 0
    await disposeDocument()

    try {
      const data = new Uint8Array(props.data.slice(0))
      loadingTask = getDocument({ data })
      const pdf = await loadingTask.promise
      if (version !== loadVersion) {
        await pdf.destroy()
        return
      }
      documentProxy = pdf
      pageCount.value = pdf.numPages
      await renderCurrentPage()
    } catch (reason) {
      if (version !== loadVersion) return
      error.value = reason instanceof Error ? reason.message : t('app.docsPreviewFailed')
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }

  async function renderCurrentPage() {
    const pdf = documentProxy
    const canvas = canvasRef.value
    const stage = stageRef.value
    if (!pdf || !canvas || !stage) return

    renderTask?.cancel()
    const page = await pdf.getPage(pageNumber.value)
    const naturalViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(stage.clientWidth - 24, 240)
    const fittedScale = availableWidth / naturalViewport.width
    const viewport = page.getViewport({ scale: fittedScale * zoom.value })
    const outputScale = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    renderTask = page.render({
      canvas,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
    })
    try {
      await renderTask.promise
    } catch (reason) {
      if (!(reason instanceof Error) || reason.name !== 'RenderingCancelledException') throw reason
    } finally {
      renderTask = null
    }
  }

  async function goToPage(offset: number) {
    const nextPage = Math.min(Math.max(pageNumber.value + offset, 1), pageCount.value)
    if (nextPage === pageNumber.value) return
    pageNumber.value = nextPage
    loading.value = true
    try {
      await renderCurrentPage()
    } finally {
      loading.value = false
    }
  }

  async function changeZoom(delta: number) {
    zoom.value = Math.min(Math.max(zoom.value + delta, minZoom), maxZoom)
    await renderCurrentPage()
  }

  async function resetZoom() {
    zoom.value = 1
    await renderCurrentPage()
  }

  function scheduleResponsiveRender() {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = window.requestAnimationFrame(() => void renderCurrentPage())
  }

  watch(() => props.data, loadDocument)

  onMounted(async () => {
    ensurePdfWorker()
    await nextTick()
    if (stageRef.value) {
      resizeObserver = new ResizeObserver(scheduleResponsiveRender)
      resizeObserver.observe(stageRef.value)
    }
    await loadDocument()
  })

  onBeforeUnmount(() => {
    loadVersion += 1
    resizeObserver?.disconnect()
    window.cancelAnimationFrame(resizeFrame)
    void disposeDocument().finally(() => {
      if (GlobalWorkerOptions.workerPort === pdfWorker) GlobalWorkerOptions.workerPort = null
      pdfWorker?.terminate()
      pdfWorker = null
    })
  })
</script>

<style scoped lang="scss">
  .pdf-preview {
    display: grid;
    gap: 10px;
  }

  .pdf-preview__toolbar,
  .pdf-preview__pages,
  .pdf-preview__zoom {
    display: flex;
    align-items: center;
  }

  .pdf-preview__toolbar {
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
    padding: 8px 10px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-light);
  }

  .pdf-preview__pages,
  .pdf-preview__zoom {
    gap: 8px;
    color: var(--el-text-color-regular);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .pdf-preview__zoom-value {
    min-width: 46px;
    padding: 2px 4px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .pdf-preview__stage {
    display: flex;
    min-height: 360px;
    max-height: calc(100vh - 210px);
    justify-content: flex-start;
    padding: 12px;
    overflow: auto;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: #e9e7e2;
  }

  canvas {
    display: block;
    margin: 0 auto;
    background: white;
    box-shadow: 0 3px 14px rgb(44 38 28 / 14%);
  }

  @media (max-width: 640px) {
    .pdf-preview__toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .pdf-preview__pages,
    .pdf-preview__zoom {
      justify-content: space-between;
    }

    .pdf-preview__stage {
      min-height: 300px;
      max-height: calc(100dvh - 210px);
      padding: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
    }
  }
</style>
