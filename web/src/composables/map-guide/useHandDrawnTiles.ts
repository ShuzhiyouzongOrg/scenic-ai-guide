/**
 * @fileoverview 管理景区手绘地图瓦片的并发预加载状态。
 * @description 提供超时、重试、进度统计、失败重试和取消加载能力。
 */

import { computed, onBeforeUnmount, readonly, ref } from 'vue'
import type { HandDrawnTile } from '@/types/map-guide'

/**
 * @typedef {'idle' | 'loading' | 'loaded' | 'error'} TileLoadState
 * @description 手绘地图瓦片从待加载到完成或失败的状态枚举。
 * @example
 * const state: TileLoadState = 'loading'
 */
export type TileLoadState = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * @typedef {object} TileStatus
 * @description 单张手绘地图瓦片的加载状态记录。
 * @property {TileLoadState} state 当前加载阶段。
 * @property {number} attempts 已执行的加载尝试次数。
 * @property {string} [error] 最后一次失败的错误信息。
 */
interface TileStatus {
  state: TileLoadState
  attempts: number
  error?: string
}

/**
 * @description 创建图片对象并等待资源完成加载，同时通过定时器限制单次请求时长。
 * @param {string} url 待预加载的图片地址。
 * @param {number} timeoutMs 判定加载超时的毫秒数。
 * @returns {Promise<void>} 图片加载成功时完成的 Promise。
 * @throws {Error} 图片加载失败或超过指定时限时拒绝 Promise。
 */
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

/**
 * @description 创建带并发限制、超时和重试机制的手绘瓦片预加载器。
 * @param {object} [options] 瓦片加载策略。
 * @param {number} [options.concurrency=4] 同时加载的最大瓦片数量。
 * @param {number} [options.retries=2] 单张瓦片失败后的重试次数。
 * @param {number} [options.timeoutMs=12000] 单次图片请求的超时时间，单位为毫秒。
 * @returns {object} 只读加载状态、进度统计和预加载控制方法。
 * @example
 * const tiles = useHandDrawnTiles({ concurrency: 3, retries: 1 })
 * await tiles.preload(handDrawnTiles)
 */
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

  /**
   * @description 在当前加载批次中按重试上限预加载单张瓦片，并同步更新状态记录。
   * @param {HandDrawnTile} tile 待加载的手绘地图瓦片。
   * @param {number} run 当前加载批次编号。
   * @param {number} [retryLimit=retries] 失败后的最大重试次数。
   * @returns {Promise<boolean>} 当前批次内成功加载时返回 true；取消或最终失败时返回 false。
   */
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

  /**
   * @description 创建新的加载批次，并按并发上限预加载全部手绘地图瓦片。
   * @param {HandDrawnTile[]} tiles 待预加载的瓦片列表。
   * @returns {Promise<void>} 当前批次的全部工作协程结束后的 Promise。
   */
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

  /**
   * @description 在当前批次中重新加载一张失败或待更新的手绘地图瓦片。
   * @param {HandDrawnTile} tile 待重试的瓦片。
   * @returns {Promise<boolean>} 重试成功时返回 true；批次取消或加载失败时返回 false。
   */
  async function retry(tile: HandDrawnTile): Promise<boolean> {
    const run = activeRun.value
    return loadOne(tile, run, retries)
  }

  /**
   * @description 递增批次编号，使当前仍在执行的瓦片加载任务停止写入状态。
   * @returns {void} 无返回值。
   */
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
