/**
 * @fileoverview 地图导览数据 API 客户端。
 * @description 读取多景区地图初始化数据、景点、路线和全景记录，并提供静态数据回退。
 */
import request from '@/utils/http'
import type {
  GuideRoute,
  MapGuideBootstrap,
  PanoramaRecord,
  ScenicAreaId,
  ScenicSpot
} from '@/types/map-guide'

/**
 * @description 地图导览接口未显式指定景区时使用的默认景区。
 * @type {ScenicAreaId}
 */
const DEFAULT_AREA: ScenicAreaId = 'lingshan'

/**
 * @description 根据景区标识生成随 Web 应用部署的地图快照地址。
 * @param {ScenicAreaId} areaId 目标景区标识。
 * @returns {string} 对应景区的公开初始化快照 URL。
 */
function publicSnapshotUrl(areaId: ScenicAreaId): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return areaId === DEFAULT_AREA
    ? `${base}map-guide/data/bootstrap.json`
    : `${base}map-guide/data/${areaId}/bootstrap.json`
}

/**
 * @description 获取并规范化随 Web 应用部署的地图导览快照。
 * @param {ScenicAreaId} areaId 目标景区标识。
 * @param {AbortSignal} [signal] 用于取消快照请求的信号。
 * @returns {Promise<MapGuideBootstrap>} 规范化后的地图导览初始化数据。
 * @throws {Error} 请求被取消、网络失败、响应状态异常或 JSON 无法解析时抛出。
 */
async function fetchSnapshot(
  areaId: ScenicAreaId,
  signal?: AbortSignal
): Promise<MapGuideBootstrap> {
  const response = await fetch(publicSnapshotUrl(areaId), { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Map guide snapshot is unavailable (${response.status})`)
  const data = (await response.json()) as MapGuideBootstrap
  return normalizeBootstrap(data, areaId)
}

/**
 * @description 将地图资源路径拼接到应用公开基础路径下。
 * @param {string} path 以斜杠开头或不带斜杠的资源路径。
 * @returns {string} 可由当前 Web 部署访问的资源 URL。
 */
function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * @description 按媒体代理和源站放行配置生成可对外使用的媒体地址。
 * @param {string} [sourceUrl] 原始媒体 URL。
 * @returns {string | undefined} 代理地址、获准使用的源站地址或 `undefined`。
 * @throws {TypeError} 配置媒体代理且原始媒体地址不是合法 URL 时抛出。
 */
function controlledMediaUrl(sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined
  const mediaBase = String(import.meta.env.VITE_MAP_MEDIA_BASE_URL || '').trim()
  if (mediaBase) {
    const source = new URL(sourceUrl)
    return `${mediaBase.replace(/\/$/, '')}/${source.pathname.replace(/^\//, '')}`
  }
  return import.meta.env.VITE_MAP_ALLOW_SOURCE_MEDIA === 'true' ? sourceUrl : undefined
}

/**
 * @description 补齐景区元数据、旋转角度和受控媒体地址，并规范化地图快照资源路径。
 * @param {MapGuideBootstrap} data 原始地图导览初始化数据。
 * @param {ScenicAreaId} areaId 当前景区标识。
 * @returns {MapGuideBootstrap} 保留原始业务数据且资源地址已规范化的新对象。
 */
function normalizeBootstrap(data: MapGuideBootstrap, areaId: ScenicAreaId): MapGuideBootstrap {
  return {
    ...data,
    area: data.area || {
      id: areaId,
      name: areaId === 'lingshan' ? '灵山胜境' : '拈花湾',
      shortName: areaId === 'lingshan' ? '灵山胜境' : '拈花湾',
      sourceProject:
        areaId === 'lingshan' ? 'lingshan-miniapp-rebuild' : 'nianhuawan-miniapp-rebuild'
    },
    config: {
      ...data.config,
      rotationDegrees: data.config.rotationDegrees ?? (areaId === 'lingshan' ? 30 : 0),
      tileLayer: {
        ...data.config.tileLayer,
        tiles: data.config.tileLayer.tiles.map((tile) => ({
          ...tile,
          url: tile.url.startsWith('/map-guide/') ? publicAssetUrl(tile.url) : tile.url
        }))
      }
    },
    categories: data.categories.map((category) => ({
      ...category,
      iconUrl: category.iconUrl || controlledMediaUrl(category.sourceIconUrl)
    })),
    spots: data.spots.map((spot) => ({
      ...spot,
      media: {
        ...spot.media,
        coverUrl: spot.media.coverUrl || controlledMediaUrl(spot.media.sourceCoverUrl),
        imageUrls: spot.media.imageUrls.length
          ? spot.media.imageUrls
          : [controlledMediaUrl(spot.media.sourceCoverUrl)].filter((url): url is string =>
              Boolean(url)
            )
      },
      narration: spot.narration
        ? {
            ...spot.narration,
            audioUrl: spot.narration.audioUrl || controlledMediaUrl(spot.narration.sourceAssetUrl)
          }
        : undefined
    })),
    routes: data.routes.map((route) => ({
      ...route,
      coverUrl: route.coverUrl || controlledMediaUrl(route.sourceCoverUrl),
      nodes: route.nodes.map((node) => ({
        ...node,
        audioUrl: node.audioUrl || controlledMediaUrl(node.sourceAudioUrl),
        imageUrl: node.imageUrl || controlledMediaUrl(node.sourceImageUrl)
      }))
    }))
  }
}

/**
 * @description 获取指定景区的完整地图导览初始化数据。
 * @param {ScenicAreaId} [areaId] 目标景区标识，默认使用灵山胜境。
 * @param {AbortSignal} [signal] 用于取消本次地图数据请求的信号。
 * @returns {Promise<MapGuideBootstrap>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export async function fetchMapGuideBootstrap(
  areaId: ScenicAreaId = DEFAULT_AREA,
  signal?: AbortSignal
): Promise<MapGuideBootstrap> {
  try {
    const data = await request.get<MapGuideBootstrap>({
      url: '/api/map-guide/bootstrap',
      params: { area: areaId },
      signal,
      showErrorMessage: false
    })
    return normalizeBootstrap(data, areaId)
  } catch (error) {
    if (signal?.aborted) throw error
    return fetchSnapshot(areaId, signal)
  }
}

/**
 * @description 获取指定景区的地图点位。
 * @param {ScenicAreaId} [areaId] 目标景区标识，默认使用灵山胜境。
 * @param {AbortSignal} [signal] 用于取消本次点位请求的信号。
 * @returns {Promise<ScenicSpot[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchMapGuideSpots(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<ScenicSpot[]>({
    url: '/api/map-guide/spots',
    params: { area: areaId },
    signal
  })
}

/**
 * @description 获取指定景区的导览路线。
 * @param {ScenicAreaId} [areaId] 目标景区标识，默认使用灵山胜境。
 * @param {AbortSignal} [signal] 用于取消本次路线请求的信号。
 * @returns {Promise<GuideRoute[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchMapGuideRoutes(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<GuideRoute[]>({
    url: '/api/map-guide/routes',
    params: { area: areaId },
    signal
  })
}

/**
 * @description 获取指定景区的全景记录。
 * @param {ScenicAreaId} [areaId] 目标景区标识，默认使用灵山胜境。
 * @param {AbortSignal} [signal] 用于取消本次全景数据请求的信号。
 * @returns {Promise<PanoramaRecord[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchMapGuidePanoramas(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<PanoramaRecord[]>({
    url: '/api/map-guide/panoramas',
    params: { area: areaId },
    signal
  })
}
