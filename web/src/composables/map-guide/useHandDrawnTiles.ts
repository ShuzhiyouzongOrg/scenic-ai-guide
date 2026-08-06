import { computed, onBeforeUnmount, readonly, ref } from 'vue'
import type { HandDrawnTile } from '@/types/map-guide'

export type TileLoadState = 'idle' | 'loading' | 'loaded' | 'error'

interface TileStatus {
  state: TileLoadState
  attempts: number
  error?: string
}

function loadImage(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeout = window.setTimeout(() => {
      image.src = ''
      reject(new Error(`Tile timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    image.onload = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    image.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error(`Tile failed to load: ${url}`))
    }
    image.decoding = 'async'
    image.src = url
  })
}

export function useHandDrawnTiles(options?: {
  concurrency?: number
  retries?: number
  timeoutMs?: number
}) {
  const concurrency = Math.max(1, options?.concurrency ?? 4)
  const retries = Math.max(0, options?.retries ?? 2)
  const timeoutMs = Math.max(1000, options?.timeoutMs ?? 12000)
  const statuses = ref<Record<string, TileStatus>>({})
  const activeRun = ref(0)
  const total = ref(0)

  const completedCount = computed(
    () =>
      Object.values(statuses.value).filter(
        (item) => item.state === 'loaded' || item.state === 'error'
      ).length
  )
  const loadedCount = computed(
    () => Object.values(statuses.value).filter((item) => item.state === 'loaded').length
  )
  const failedIds = computed(() =>
    Object.entries(statuses.value)
      .filter(([, item]) => item.state === 'error')
      .map(([id]) => id)
  )
  const progress = computed(() =>
    total.value ? Math.round((completedCount.value / total.value) * 100) : 0
  )
  const loading = computed(() => completedCount.value < total.value)
  const allFailed = computed(() => total.value > 0 && failedIds.value.length === total.value)

  async function loadOne(tile: HandDrawnTile, run: number, retryLimit = retries): Promise<boolean> {
    for (let attempt = 1; attempt <= retryLimit + 1; attempt += 1) {
      if (run !== activeRun.value) return false
      statuses.value[tile.id] = { state: 'loading', attempts: attempt }
      try {
        await loadImage(tile.url, timeoutMs)
        if (run !== activeRun.value) return false
        statuses.value[tile.id] = { state: 'loaded', attempts: attempt }
        return true
      } catch (error) {
        if (attempt > retryLimit) {
          statuses.value[tile.id] = {
            state: 'error',
            attempts: attempt,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }
    return false
  }

  async function preload(tiles: HandDrawnTile[]): Promise<void> {
    const run = activeRun.value + 1
    activeRun.value = run
    total.value = tiles.length
    statuses.value = Object.fromEntries(
      tiles.map((tile) => [tile.id, { state: 'idle', attempts: 0 }])
    )
    let cursor = 0
    async function worker() {
      while (cursor < tiles.length && run === activeRun.value) {
        const tile = tiles[cursor]
        cursor += 1
        await loadOne(tile, run)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker))
  }

  async function retry(tile: HandDrawnTile): Promise<boolean> {
    const run = activeRun.value
    return loadOne(tile, run, retries)
  }

  function cancel() {
    activeRun.value += 1
  }

  onBeforeUnmount(cancel)

  return {
    statuses: readonly(statuses),
    progress,
    loading,
    loadedCount,
    failedIds,
    allFailed,
    preload,
    retry,
    cancel
  }
}
