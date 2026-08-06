import type { AvatarDisplayState, ScenicAreaId } from '@/types/map-guide'

export const DEFAULT_SCENIC_AREA_ID: ScenicAreaId = 'lingshan'
export const ACTIVE_SCENIC_AREA_STORAGE_KEY = 'map-guide:active-area:v1'

export interface ClearedScenicAreaInteractionState {
  selectedSpotId?: string
  selectedRouteId?: string
  selectedCategoryIds: string[]
  query: string
  routeDrawerOpen: boolean
  routeDetailOpen: boolean
  panoramaOpen: boolean
  activePanoramaId?: string
  activeNarrationId?: string
  avatarDisplayState: AvatarDisplayState
  handDrawnVisible: boolean
}

export function normalizeScenicAreaId(value?: string | null): ScenicAreaId {
  return value === 'nianhuawan' ? 'nianhuawan' : DEFAULT_SCENIC_AREA_ID
}

export function scenicAreaStateStorageKey(areaId: ScenicAreaId): string {
  return `map-guide:${areaId}:state:v1`
}

export function clearedScenicAreaInteractionState(): ClearedScenicAreaInteractionState {
  return {
    selectedSpotId: undefined,
    selectedRouteId: undefined,
    selectedCategoryIds: ['36'],
    query: '',
    routeDrawerOpen: false,
    routeDetailOpen: false,
    panoramaOpen: false,
    activePanoramaId: undefined,
    activeNarrationId: undefined,
    avatarDisplayState: 'idle',
    handDrawnVisible: true
  }
}
