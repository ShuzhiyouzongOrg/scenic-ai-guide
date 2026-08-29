/**
 * @fileoverview 管理景区路线节点的顺序播放与自动衔接。
 * @description 维护当前路线、节点索引和播放状态，并在讲解完成后调度下一节点。
 */

import { computed, onScopeDispose, ref } from 'vue'
import type { GuideRoute, GuideRouteNode, RoutePlaybackSnapshot } from '@/types/map-guide'

/**
 * @description 创建路线节点选择、顺序播放和自动衔接状态。
 * @param {object} [options] 路线播放回调和时间配置。
 * @param {(node: GuideRouteNode, index: number) => void | Promise<void>} [options.onNodeChange] 节点变化时执行的异步或同步回调。
 * @param {() => void} [options.onCompleted] 播放到路线末尾时执行的回调。
 * @param {number} [options.pauseBetweenNodesMs=3000] 自动播放相邻节点之间的等待毫秒数。
 * @returns {object} 当前路线、节点状态和路线播放控制方法。
 * @example
 * const playback = useRoutePlayback({ onNodeChange: focusRouteNode })
 * playback.selectRoute(route)
 * playback.start()
 */
export function useRoutePlayback(options?: {
  onNodeChange?: (node: GuideRouteNode, index: number) => void | Promise<void>
  onCompleted?: () => void
  pauseBetweenNodesMs?: number
}) {
  const route = ref<GuideRoute>()
  const nodeIndex = ref(0)
  const playing = ref(false)
  const autoPlay = ref(false)
  let nextTimer: number | undefined

  const currentNode = computed(() => route.value?.nodes[nodeIndex.value])
  const snapshot = computed<RoutePlaybackSnapshot>(() => ({
    routeId: route.value?.id,
    nodeIndex: nodeIndex.value,
    playing: playing.value,
    autoPlay: autoPlay.value
  }))

  /**
   * @description 取消等待下一路线节点的定时任务，并清空定时器标识。
   * @returns {void} 无返回值。
   */
  function clearNextTimer() {
    if (nextTimer !== undefined) window.clearTimeout(nextTimer)
    nextTimer = undefined
  }

  /**
   * @description 选择新的导览路线并把节点索引限制在有效范围内。
   * @param {GuideRoute} nextRoute 待切换的路线。
   * @param {number} [startIndex=0] 初始路线节点索引。
   * @returns {void} 无返回值。
   */
  function selectRoute(nextRoute: GuideRoute, startIndex = 0) {
    clearNextTimer()
    route.value = nextRoute
    nodeIndex.value = Math.max(0, Math.min(startIndex, nextRoute.nodes.length - 1))
    playing.value = false
  }

  /**
   * @description 跳转到指定路线节点，并在节点存在时执行节点变化回调。
   * @param {number} index 目标路线节点索引。
   * @returns {Promise<void>} 节点变化回调执行完成后的 Promise。
   */
  async function goTo(index: number) {
    if (!route.value?.nodes.length) return
    clearNextTimer()
    nodeIndex.value = Math.max(0, Math.min(index, route.value.nodes.length - 1))
    const node = currentNode.value
    if (node) await options?.onNodeChange?.(node, nodeIndex.value)
  }

  /**
   * @description 前进到下一路线节点；到达末尾时停止播放并触发完成回调。
   * @returns {Promise<void>} 节点前进或完成回调处理结束后的 Promise。
   */
  async function next() {
    if (!route.value) return
    if (nodeIndex.value >= route.value.nodes.length - 1) {
      playing.value = false
      options?.onCompleted?.()
      return
    }
    await goTo(nodeIndex.value + 1)
  }

  /**
   * @description 在自动播放期间于当前讲解结束后延时调度下一路线节点。
   * @returns {void} 无返回值。
   */
  function narrationCompleted() {
    if (!autoPlay.value || !playing.value) return
    clearNextTimer()
    nextTimer = window.setTimeout(() => void next(), options?.pauseBetweenNodesMs ?? 3000)
  }

  /**
   * @description 从指定或当前节点索引开始路线播放。
   * @param {number} [index=nodeIndex.value] 开始播放的路线节点索引。
   * @returns {void} 无返回值。
   */
  function start(index = nodeIndex.value) {
    playing.value = true
    void goTo(index)
  }

  /**
   * @description 暂停路线自动播放并取消下一节点定时任务。
   * @returns {void} 无返回值。
   */
  function pause() {
    playing.value = false
    clearNextTimer()
  }

  /**
   * @description 停止路线播放并把当前节点重置到路线起点。
   * @returns {void} 无返回值。
   */
  function stop() {
    pause()
    nodeIndex.value = 0
  }

  /**
   * @description 清空路线、节点索引及全部播放状态。
   * @returns {void} 无返回值。
   */
  function clear() {
    clearNextTimer()
    route.value = undefined
    nodeIndex.value = 0
    playing.value = false
    autoPlay.value = false
  }

  onScopeDispose(clearNextTimer)

  return {
    route,
    currentNode,
    nodeIndex,
    playing,
    autoPlay,
    snapshot,
    selectRoute,
    goTo,
    next,
    start,
    pause,
    stop,
    clear,
    narrationCompleted
  }
}
