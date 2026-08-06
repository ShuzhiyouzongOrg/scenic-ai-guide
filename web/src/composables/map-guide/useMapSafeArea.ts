import { computed, reactive } from 'vue'
import type { MapSafeArea } from '@/types/map-guide'

export function useMapSafeArea(initial?: Partial<MapSafeArea>) {
  const safeArea = reactive<MapSafeArea>({
    top: initial?.top ?? 20,
    right: initial?.right ?? 20,
    bottom: initial?.bottom ?? 20,
    left: initial?.left ?? 20
  })

  const leafletPadding = computed(
    () =>
      [
        [safeArea.left, safeArea.top],
        [safeArea.right, safeArea.bottom]
      ] as [[number, number], [number, number]]
  )

  function update(next: Partial<MapSafeArea>) {
    Object.assign(safeArea, next)
  }

  function reset() {
    Object.assign(safeArea, { top: 20, right: 20, bottom: 20, left: 20 })
  }

  return { safeArea, leafletPadding, update, reset }
}
