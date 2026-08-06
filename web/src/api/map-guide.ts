import request from '@/utils/http'
import type {
  GuideRoute,
  MapGuideBootstrap,
  PanoramaRecord,
  ScenicAreaId,
  ScenicSpot
} from '@/types/map-guide'

const DEFAULT_AREA: ScenicAreaId = 'lingshan'

function publicSnapshotUrl(areaId: ScenicAreaId): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return areaId === DEFAULT_AREA
    ? `${base}map-guide/data/bootstrap.json`
    : `${base}map-guide/data/${areaId}/bootstrap.json`
}

async function fetchSnapshot(
  areaId: ScenicAreaId,
  signal?: AbortSignal
): Promise<MapGuideBootstrap> {
  const response = await fetch(publicSnapshotUrl(areaId), { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Map guide snapshot is unavailable (${response.status})`)
  const data = (await response.json()) as MapGuideBootstrap
  return normalizeBootstrap(data, areaId)
}

function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function controlledMediaUrl(sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined
  const mediaBase = String(import.meta.env.VITE_MAP_MEDIA_BASE_URL || '').trim()
  if (mediaBase) {
    const source = new URL(sourceUrl)
    return `${mediaBase.replace(/\/$/, '')}/${source.pathname.replace(/^\//, '')}`
  }
  return import.meta.env.VITE_MAP_ALLOW_SOURCE_MEDIA === 'true' ? sourceUrl : undefined
}

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

export function fetchMapGuideSpots(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<ScenicSpot[]>({
    url: '/api/map-guide/spots',
    params: { area: areaId },
    signal
  })
}

export function fetchMapGuideRoutes(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<GuideRoute[]>({
    url: '/api/map-guide/routes',
    params: { area: areaId },
    signal
  })
}

export function fetchMapGuidePanoramas(areaId: ScenicAreaId = DEFAULT_AREA, signal?: AbortSignal) {
  return request.get<PanoramaRecord[]>({
    url: '/api/map-guide/panoramas',
    params: { area: areaId },
    signal
  })
}
