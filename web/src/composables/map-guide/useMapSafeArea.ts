/**
 * @fileoverview 管理地图控件和浮层共同使用的安全边距。
 * @description 将四向边距转换为 Leaflet 适配的填充数组，并支持更新与重置。
 */

import { computed, reactive } from 'vue'
import type { MapSafeArea } from '@/types/map-guide'

/**
 * @description 创建可更新的地图安全边距及对应的 Leaflet 双点填充值。
 * @param {Partial<MapSafeArea>} [initial] 需要覆盖默认二十像素边距的初始值。
 * @returns {object} 响应式安全边距、Leaflet 填充值及更新和重置方法。
 * @example
 * const { safeArea, leafletPadding, update } = useMapSafeArea({ left: 320 })
 * update({ bottom: 96 })
 */
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
