/**
 * @fileoverview 管理地图导览中的官方路线选择状态。
 * @description 从动态路线来源中过滤官方路线，并计算当前选中的路线对象。
 */

import { computed, ref } from 'vue'
import type { GuideRoute } from '@/types/map-guide'

/**
 * @description 从路线数据源中过滤官方路线并维护当前路线选择。
 * @param {() => GuideRoute[]} initialRoutes 返回最新路线集合的数据源函数。
 * @returns {object} 官方路线列表、选中路线编号和选中路线计算属性。
 * @example
 * const { routes, selectedRouteId, selectedRoute } = useGuideRoutes(() => routeList.value)
 */
export function useGuideRoutes(initialRoutes: () => GuideRoute[]) {
  const selectedRouteId = ref<string>()
  const routes = computed(() => initialRoutes().filter((route) => route.source === 'official'))
  const selectedRoute = computed(() =>
    routes.value.find((route) => route.id === selectedRouteId.value)
  )

  return {
    routes,
    selectedRouteId,
    selectedRoute
  }
}
