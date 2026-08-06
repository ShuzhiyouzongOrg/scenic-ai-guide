import { computed, onScopeDispose, ref } from 'vue'
import type { GuideRoute, GuideRouteNode, RoutePlaybackSnapshot } from '@/types/map-guide'

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

  function clearNextTimer() {
    if (nextTimer !== undefined) window.clearTimeout(nextTimer)
    nextTimer = undefined
  }

  function selectRoute(nextRoute: GuideRoute, startIndex = 0) {
    clearNextTimer()
    route.value = nextRoute
    nodeIndex.value = Math.max(0, Math.min(startIndex, nextRoute.nodes.length - 1))
    playing.value = false
  }

  async function goTo(index: number) {
    if (!route.value?.nodes.length) return
    clearNextTimer()
    nodeIndex.value = Math.max(0, Math.min(index, route.value.nodes.length - 1))
    const node = currentNode.value
    if (node) await options?.onNodeChange?.(node, nodeIndex.value)
  }

  async function next() {
    if (!route.value) return
    if (nodeIndex.value >= route.value.nodes.length - 1) {
      playing.value = false
      options?.onCompleted?.()
      return
    }
    await goTo(nodeIndex.value + 1)
  }

  function narrationCompleted() {
    if (!autoPlay.value || !playing.value) return
    clearNextTimer()
    nextTimer = window.setTimeout(() => void next(), options?.pauseBetweenNodesMs ?? 3000)
  }

  function start(index = nodeIndex.value) {
    playing.value = true
    void goTo(index)
  }

  function pause() {
    playing.value = false
    clearNextTimer()
  }

  function stop() {
    pause()
    nodeIndex.value = 0
  }

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
