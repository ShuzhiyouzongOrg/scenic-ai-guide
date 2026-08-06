import { computed, ref } from 'vue'
import type { GuideRoute } from '@/types/map-guide'

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
