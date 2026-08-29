/**
 * @fileoverview 景区切换状态工具。
 * @description 规范化景区编号、生成分区存储键，并构造切换景区时使用的初始交互状态。
 */

import type { AvatarDisplayState, ScenicAreaId } from '@/types/map-guide'

/**
 * @description 地图导览首次进入时使用的默认景区编号。
 * @type {ScenicAreaId}
 */
export const DEFAULT_SCENIC_AREA_ID: ScenicAreaId = 'lingshan'

/**
 * @description 记录当前激活景区编号的本地存储键。
 * @type {string}
 */
export const ACTIVE_SCENIC_AREA_STORAGE_KEY = 'map-guide:active-area:v1'

/**
 * @typedef ClearedScenicAreaInteractionState
 * @description 切换景区后用于重置地图导览交互的完整状态。
 * @property {string} [selectedSpotId] 当前选中的景点编号。
 * @property {string} [selectedRouteId] 当前选中的推荐路线编号。
 * @property {string[]} selectedCategoryIds 当前筛选的设施分类编号列表。
 * @property {string} query 景点搜索关键词。
 * @property {boolean} routeDrawerOpen 路线选择抽屉是否展开。
 * @property {boolean} routeDetailOpen 路线详情是否展开。
 * @property {boolean} panoramaOpen 全景预览是否打开。
 * @property {string} [activePanoramaId] 当前全景场景编号。
 * @property {string} [activeNarrationId] 当前数字人讲解编号。
 * @property {AvatarDisplayState} avatarDisplayState 数字人的界面显示状态。
 * @property {boolean} handDrawnVisible 手绘地图覆盖层是否可见。
 */
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

/**
 * @description 将外部景区编号限制为系统支持的灵山胜境或拈花湾编号。
 * @param {string | null} [value] URL、存储或接口返回的候选景区编号。
 * @returns {ScenicAreaId} `nianhuawan` 保持不变，其他输入统一回退为默认景区。
 * @example
 * normalizeScenicAreaId(route.query.area as string)
 */
export function normalizeScenicAreaId(value?: string | null): ScenicAreaId {
  return value === 'nianhuawan' ? 'nianhuawan' : DEFAULT_SCENIC_AREA_ID
}

/**
 * @description 生成指定景区独立保存地图交互状态的版本化本地存储键。
 * @param {ScenicAreaId} areaId 景区编号。
 * @returns {string} 形如 `map-guide:lingshan:state:v1` 的存储键。
 * @example
 * scenicAreaStateStorageKey('lingshan')
 */
export function scenicAreaStateStorageKey(areaId: ScenicAreaId): string {
  return `map-guide:${areaId}:state:v1`
}

/**
 * @description 构造景区切换后的默认交互状态，保留默认景点分类并显示手绘地图。
 * @returns {ClearedScenicAreaInteractionState} 每次调用都新建的可变状态对象。
 * @example
 * const interaction = clearedScenicAreaInteractionState()
 */
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
