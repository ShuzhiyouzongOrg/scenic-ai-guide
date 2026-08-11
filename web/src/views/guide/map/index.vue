<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useMediaQuery } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import ScenicMap from '@/components/map-guide/ScenicMap.vue'
  import ScenicSearchPanel from '@/components/map-guide/ScenicSearchPanel.vue'
  import ScenicSpotCard from '@/components/map-guide/ScenicSpotCard.vue'
  import RouteDrawer from '@/components/map-guide/RouteDrawer.vue'
  import RouteDetailPanel from '@/components/map-guide/RouteDetailPanel.vue'
  import MapControlGroup from '@/components/map-guide/MapControlGroup.vue'
  import MapLoadingProgress from '@/components/map-guide/MapLoadingProgress.vue'
  import MapDigitalHuman from '@/components/map-guide/MapDigitalHuman.vue'
  import PanoramaViewer from '@/components/map-guide/PanoramaViewer.vue'
  import ScenicAreaSwitcher from '@/components/map-guide/ScenicAreaSwitcher.vue'
  import { fetchMapGuideBootstrap } from '@/api/map-guide'
  import { narrateRouteNode, narrateSpot } from '@/api/guide'
  import { useHandDrawnTiles } from '@/composables/map-guide/useHandDrawnTiles'
  import { useGuideRoutes } from '@/composables/map-guide/useGuideRoutes'
  import { useMapSafeArea } from '@/composables/map-guide/useMapSafeArea'
  import { useNarrationCoordinator } from '@/composables/map-guide/useNarrationCoordinator'
  import { useRoutePlayback } from '@/composables/map-guide/useRoutePlayback'
  import type { AvatarNarrationHandle } from '@/composables/map-guide/avatar-narration-adapter'
  import type {
    AvatarDisplayState,
    GuideCoordinate,
    GuideRoute,
    GuideRouteNode,
    MapGuideBootstrap,
    NarrationContent,
    NarrationEmotion,
    NarrationSegment,
    PanoramaRecord,
    PersistedMapGuideState,
    ScenicAreaId,
    ScenicSpot
  } from '@/types/map-guide'
  import { transformCoordinate } from '@/utils/map-guide/coordinate'
  import { resolvePanoramaForTarget } from '@/utils/map-guide/panorama'
  import { resolveRouteNodeCoordinate } from '@/utils/map-guide/route-geometry'
  import {
    ACTIVE_SCENIC_AREA_STORAGE_KEY,
    clearedScenicAreaInteractionState,
    normalizeScenicAreaId,
    scenicAreaStateStorageKey
  } from '@/utils/map-guide/scenic-area'
  import { matchSpot } from '@/utils/map-guide/spot-mapping'

  defineOptions({ name: 'GuideMap' })

  interface ScenicMapExpose {
    focusSpot(spot: ScenicSpot): void
    focusRoute(route: GuideRoute): void
    focusCoordinate(coordinate: GuideCoordinate, zoom?: number): void
    resetView(): void
    locate(): void
    invalidateSize(): void
    getViewState(): { center: GuideCoordinate; zoom: number } | undefined
    restoreView(state?: { center: GuideCoordinate; zoom: number }): void
  }

  interface MapDigitalHumanExpose {
    handle: AvatarNarrationHandle
  }

  const { t } = useI18n()
  const isMobile = useMediaQuery('(max-width: 760px)')
  const mapRef = ref<ScenicMapExpose>()
  const digitalHumanRef = ref<MapDigitalHumanExpose>()
  const avatarHandle = computed(() => digitalHumanRef.value?.handle)
  const activeAreaId = ref<ScenicAreaId>(
    normalizeScenicAreaId(localStorage.getItem(ACTIVE_SCENIC_AREA_STORAGE_KEY))
  )
  const bootstrap = ref<MapGuideBootstrap>()
  const loading = ref(true)
  const areaSwitching = ref(false)
  const loadError = ref('')
  const query = ref('')
  const selectedCategoryIds = ref<string[]>(['36'])
  const selectedSpotId = ref<string>()
  const panelCollapsed = ref(false)
  const routeDrawerOpen = ref(false)
  const routeDetailOpen = ref(false)
  const handDrawnVisible = ref(true)
  const panoramaOpen = ref(false)
  const activePanorama = ref<PanoramaRecord>()
  const avatarDisplayState = ref<AvatarDisplayState>('idle')
  const avatarReady = ref(false)
  const avatarFailed = ref(false)
  const activeNarration = ref<NarrationContent>()
  const activeSegments = ref<NarrationSegment[]>([])
  const subtitleSegmentIndex = ref(0)
  const narrationProgress = ref(0)
  const panoramaMapState = ref<{ center: GuideCoordinate; zoom: number }>()
  const beforePanoramaAvatarState = ref<AvatarDisplayState>('idle')
  let subtitleTimer: number | undefined
  let subtitleElapsedMs = 0
  let loadAbortController: AbortController | undefined

  const tileLoader = useHandDrawnTiles({ concurrency: 4, retries: 2, timeoutMs: 12000 })
  const { safeArea, update: updateSafeArea } = useMapSafeArea()
  const narration = useNarrationCoordinator(avatarHandle)
  const routeState = useGuideRoutes(() => bootstrap.value?.routes || [])
  const routePlayback = useRoutePlayback({
    pauseBetweenNodesMs: 3500,
    onNodeChange: async (node) => {
      await startRouteNodeNarration(node)
    }
  })

  const selectedSpot = computed(() =>
    bootstrap.value?.spots.find((spot) => spot.id === selectedSpotId.value)
  )
  const spotCardVisible = computed(
    () =>
      Boolean(selectedSpot.value) &&
      !panoramaOpen.value &&
      !routeDrawerOpen.value &&
      avatarDisplayState.value !== 'speaking'
  )
  const selectedRoute = computed(() => routeState.selectedRoute.value)
  const selectedPanorama = computed(() => activePanorama.value || bootstrap.value?.panoramas[0])
  const activeAreaName = computed(() =>
    t(activeAreaId.value === 'lingshan' ? 'app.mapGuideAreaLingshan' : 'app.mapGuideAreaNianhuawan')
  )
  const loadedTileIds = computed(() =>
    Object.entries(tileLoader.statuses.value)
      .filter(([, status]) => status.state === 'loaded')
      .map(([id]) => id)
  )
  const visibleSpots = computed(() => {
    const allSpots = bootstrap.value?.spots || []
    const normalizedQuery = query.value.trim().toLocaleLowerCase()
    return allSpots.filter((spot) => {
      const categoryMatches =
        selectedCategoryIds.value.length === 0 ||
        selectedCategoryIds.value.includes(spot.categoryId) ||
        spot.categoryIds?.some((categoryId) => selectedCategoryIds.value.includes(categoryId))
      const queryMatches =
        !normalizedQuery ||
        [spot.name, spot.categoryName, ...spot.aliases]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      return categoryMatches && queryMatches
    })
  })
  const mapSpots = computed(() => (selectedRoute.value ? [] : visibleSpots.value))
  const narrationText = computed(
    () =>
      activeSegments.value[subtitleSegmentIndex.value]?.text || activeNarration.value?.script || ''
  )
  const originalAudioAvailable = computed(
    () =>
      import.meta.env.VITE_MAP_ALLOW_SOURCE_MEDIA === 'true' &&
      Boolean(
        selectedSpot.value?.narration?.sourceAssetUrl || selectedSpot.value?.narration?.audioUrl
      )
  )

  function splitNarration(text: string, emotion: NarrationEmotion = 'neutral'): NarrationSegment[] {
    const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text]
    return sentences
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence, index) => ({
        id: `segment-${index + 1}`,
        text: sentence,
        emotion,
        pauseAfterMs: sentence.endsWith('。') ? 380 : 220
      }))
  }

  function emotionFor(text: string): NarrationEmotion {
    if (/纪念|肃穆|战争|历史/.test(text)) return 'solemn'
    if (/欢迎|祝您|很高兴/.test(text)) return 'friendly'
    if (/故事|传说|相传/.test(text)) return 'storytelling'
    return 'neutral'
  }

  function buildContent(
    id: string,
    title: string,
    text: string,
    source: NarrationContent['source']
  ): NarrationContent {
    const normalized = text.trim()
    return {
      id,
      title,
      source,
      script: normalized,
      allowAvatarSynthesis: true,
      segments: splitNarration(normalized, emotionFor(normalized))
    }
  }

  async function resolveSpotNarration(spot: ScenicSpot): Promise<NarrationContent> {
    const projectText = spot.detail?.trim() || spot.description?.trim()
    if (projectText && projectText !== '景区导览点位' && projectText !== '拈花湾景区导览点位') {
      return buildContent(`project-${spot.id}`, spot.name, projectText, 'project-script')
    }
    if (activeAreaId.value === 'nianhuawan') {
      return buildContent(
        `fallback-${spot.id}`,
        spot.name,
        t('app.mapGuideSpotFallbackNarration', { name: spot.name }),
        'fallback-text'
      )
    }
    const result = await narrateSpot({ spotId: spot.targetSpotId || spot.id, spotName: spot.name })
    return buildContent(`ai-${spot.id}-${Date.now()}`, spot.name, result.narration, 'ai-generated')
  }

  async function beginNarration(content: NarrationContent, preferOfficialAudio = false) {
    activeNarration.value = content
    activeSegments.value = content.segments
    subtitleSegmentIndex.value = 0
    narrationProgress.value = 0
    subtitleElapsedMs = 0
    panelCollapsed.value = true
    routeDrawerOpen.value = false
    avatarDisplayState.value = panoramaOpen.value ? 'compact' : 'speaking'
    await nextTick()
    mapRef.value?.invalidateSize()
    const ok = await narration.play(content, {
      preferOfficialAudio,
      allowSourceMedia: import.meta.env.VITE_MAP_ALLOW_SOURCE_MEDIA === 'true'
    })
    if (!ok && narration.snapshot.value.state === 'error') {
      ElMessage.warning(t('app.mapGuideAvatarUnavailable'))
    }
  }

  async function startSpotNarration(spot: ScenicSpot) {
    void avatarHandle.value?.enableAudio()
    selectedSpotId.value = spot.id
    const content = await resolveSpotNarration(spot)
    void beginNarration(content)
  }

  function startOriginalNarration(spot: ScenicSpot) {
    if (!spot.narration) return
    void avatarHandle.value?.enableAudio()
    selectedSpotId.value = spot.id
    void beginNarration(spot.narration, true)
  }

  async function startRouteNodeNarration(node: GuideRouteNode) {
    const spot = bootstrap.value?.spots.find(
      (item) => item.id === node.spotId || item.sourcePointId === node.sourcePointId
    )
    if (spot) selectedSpotId.value = spot.id
    let content: NarrationContent
    if (node.narrationText?.trim()) {
      content = buildContent(
        `route-script-${node.id}`,
        node.name,
        node.narrationText,
        'official-script'
      )
    } else if (activeAreaId.value === 'nianhuawan') {
      content = buildContent(
        `route-fallback-${node.id}`,
        node.name,
        spot?.detail ||
          spot?.description ||
          t('app.mapGuideRouteNodeFallback', { name: node.name, order: node.order }),
        'fallback-text'
      )
    } else {
      try {
        const result = await narrateRouteNode({
          nodeId: node.id,
          spotId: spot?.targetSpotId || node.spotId,
          spotName: node.name
        })
        content = buildContent(
          `route-${node.id}-${Date.now()}`,
          node.name,
          result.narration,
          'ai-generated'
        )
      } catch {
        content = buildContent(
          `route-fallback-${node.id}`,
          node.name,
          spot?.detail ||
            spot?.description ||
            t('app.mapGuideRouteNodeFallback', { name: node.name, order: node.order }),
          'fallback-text'
        )
      }
    }
    void beginNarration(content)
  }

  function startWelcomeNarration() {
    void avatarHandle.value?.enableAudio()
    const areaName = bootstrap.value?.area.name || t('app.mapGuideAreaLingshan')
    const content = buildContent(
      `map-guide-welcome-${activeAreaId.value}`,
      areaName,
      activeAreaId.value === 'nianhuawan'
        ? t('app.mapGuideWelcomeNarrationNianhuawan')
        : t('app.mapGuideWelcomeNarration'),
      'project-script'
    )
    void beginNarration(content)
  }

  function focusSpot(spot: ScenicSpot) {
    selectedSpotId.value = spot.id
    panelCollapsed.value = true
    routeDrawerOpen.value = false
    mapRef.value?.focusSpot(spot)
  }

  function openRouteDrawer() {
    selectedSpotId.value = undefined
    panelCollapsed.value = true
    routeDrawerOpen.value = true
    if (avatarDisplayState.value === 'speaking') compactNarration()
  }

  function focusRouteNode(node: GuideRouteNode) {
    const coordinate = resolveRouteNodeCoordinate(node, bootstrap.value?.spots || [])
    if (coordinate) mapRef.value?.focusCoordinate(coordinate, 18)
  }

  async function selectRoute(route: GuideRoute) {
    void avatarHandle.value?.enableAudio()
    selectedSpotId.value = undefined
    panelCollapsed.value = true
    routeDrawerOpen.value = false
    routeDetailOpen.value = true
    routeState.selectedRouteId.value = route.id
    await routePlayback.selectRoute(route)
    mapRef.value?.focusRoute(route)
    persistPageState()
  }

  async function selectRouteNode(node: GuideRouteNode, index: number) {
    void avatarHandle.value?.enableAudio()
    routeDetailOpen.value = true
    await routePlayback.goTo(index)
    focusRouteNode(node)
  }

  function startRoutePlayback() {
    void avatarHandle.value?.enableAudio()
    routePlayback.start()
  }

  function clearRoute() {
    routeState.selectedRouteId.value = undefined
    routeDetailOpen.value = false
    routePlayback.clear()
    selectedSpotId.value = undefined
    persistPageState()
  }

  function openExternalNavigation(spot: ScenicSpot) {
    const coordinate = transformCoordinate(
      {
        latitude: spot.latitude,
        longitude: spot.longitude,
        coordinateSystem: spot.coordinateSystem
      },
      'GCJ02'
    )
    const url = `https://uri.amap.com/marker?position=${coordinate.longitude},${coordinate.latitude}&name=${encodeURIComponent(spot.name)}&coordinate=gaode&callnative=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openPanorama(target?: ScenicSpot | GuideRouteNode) {
    const allSpots = bootstrap.value?.spots || []
    const spot = target
      ? 'media' in target
        ? target
        : matchSpot({ id: target.sourcePointId || target.spotId, name: target.name }, allSpots).spot
      : undefined
    const panorama = resolvePanoramaForTarget(bootstrap.value?.panoramas || [], {
      spotId: spot?.id || (target && 'spotId' in target ? target.spotId : undefined),
      name: spot?.name || target?.name,
      panoramaIds: spot?.panoramaIds,
      vrUrl: target && 'vrUrl' in target ? target.vrUrl : undefined
    })
    if (!panorama) return
    panoramaMapState.value = mapRef.value?.getViewState()
    beforePanoramaAvatarState.value = avatarDisplayState.value
    activePanorama.value = panorama
    panoramaOpen.value = true
    if (avatarDisplayState.value !== 'idle') avatarDisplayState.value = 'compact'
  }

  function closePanorama() {
    panoramaOpen.value = false
    avatarDisplayState.value = beforePanoramaAvatarState.value
    void nextTick(() => {
      mapRef.value?.invalidateSize()
      mapRef.value?.restoreView(panoramaMapState.value)
    })
  }

  function closeNarration() {
    void narration.stop()
    avatarDisplayState.value = 'idle'
    selectedSpotId.value = undefined
    activeNarration.value = undefined
  }

  function compactNarration() {
    avatarDisplayState.value = 'compact'
    void nextTick(() => mapRef.value?.invalidateSize())
  }

  function expandNarration() {
    avatarDisplayState.value = 'speaking'
    void nextTick(() => mapRef.value?.invalidateSize())
  }

  function updateResponsiveSafeArea() {
    updateSafeArea({
      top: 68,
      left: panelCollapsed.value || isMobile.value ? 22 : 350,
      right: 70,
      bottom: spotCardVisible.value ? (isMobile.value ? 210 : 180) : isMobile.value ? 100 : 70
    })
  }

  async function retryFailedTiles() {
    if (!bootstrap.value) return
    const failed = new Set(tileLoader.failedIds.value)
    await Promise.all(
      bootstrap.value.config.tileLayer.tiles
        .filter((tile) => failed.has(tile.id))
        .map(tileLoader.retry)
    )
    if (tileLoader.allFailed.value) handDrawnVisible.value = false
  }

  function persistPageState() {
    const view = mapRef.value?.getViewState()
    const state: PersistedMapGuideState = {
      version: 1,
      center: view?.center,
      zoom: view?.zoom,
      selectedSpotId: selectedSpotId.value,
      favoriteRouteIds: [],
      layerMode: handDrawnVisible.value ? 'hand-drawn' : 'base'
    }
    localStorage.setItem(scenicAreaStateStorageKey(activeAreaId.value), JSON.stringify(state))
  }

  function restorePageState() {
    try {
      const areaState = localStorage.getItem(scenicAreaStateStorageKey(activeAreaId.value))
      const legacyState =
        activeAreaId.value === 'lingshan' ? localStorage.getItem('map-guide:state:v1') : null
      const state = JSON.parse(areaState || legacyState || 'null') as PersistedMapGuideState | null
      if (!state || state.version !== 1) return
      selectedSpotId.value = bootstrap.value?.spots.some((spot) => spot.id === state.selectedSpotId)
        ? state.selectedSpotId
        : undefined
      handDrawnVisible.value = state.layerMode !== 'base'
      routeState.selectedRouteId.value = undefined
      routePlayback.clear()
      if (state.center && state.zoom !== undefined) {
        void nextTick(() =>
          mapRef.value?.restoreView({
            center: state.center as GuideCoordinate,
            zoom: state.zoom as number
          })
        )
      }
    } catch {
      // Ignore incompatible local state and keep the deterministic park defaults.
    }
  }

  function advanceSubtitle() {
    if (subtitleTimer !== undefined) window.clearInterval(subtitleTimer)
    subtitleTimer = window.setInterval(() => {
      if (narration.snapshot.value.state !== 'playing' || !activeSegments.value.length) return
      const sdkSubtitle = avatarHandle.value?.getSubtitle().trim()
      if (sdkSubtitle) {
        const sdkIndex = activeSegments.value.findIndex(
          (segment) => segment.text.includes(sdkSubtitle) || sdkSubtitle.includes(segment.text)
        )
        if (sdkIndex >= 0) subtitleSegmentIndex.value = sdkIndex
      } else {
        subtitleElapsedMs += 250
        let cumulativeMs = 0
        const estimatedIndex = activeSegments.value.findIndex((segment) => {
          cumulativeMs += Math.max(1600, segment.text.length * 230) + (segment.pauseAfterMs || 0)
          return subtitleElapsedMs < cumulativeMs
        })
        subtitleSegmentIndex.value =
          estimatedIndex >= 0 ? estimatedIndex : activeSegments.value.length - 1
      }
      narrationProgress.value = Math.round(
        ((subtitleSegmentIndex.value + 1) / activeSegments.value.length) * 100
      )
    }, 250)
  }

  function resetAreaInteractionState() {
    const cleared = clearedScenicAreaInteractionState()
    routeState.selectedRouteId.value = cleared.selectedRouteId
    routeDetailOpen.value = cleared.routeDetailOpen
    routeDrawerOpen.value = cleared.routeDrawerOpen
    routePlayback.clear()
    selectedSpotId.value = cleared.selectedSpotId
    selectedCategoryIds.value = cleared.selectedCategoryIds
    query.value = cleared.query
    panoramaOpen.value = cleared.panoramaOpen
    activePanorama.value = undefined
    activeNarration.value = undefined
    activeSegments.value = []
    avatarDisplayState.value = cleared.avatarDisplayState
    handDrawnVisible.value = cleared.handDrawnVisible
  }

  async function switchScenicArea(areaId: ScenicAreaId) {
    if (areaId === activeAreaId.value || areaSwitching.value) return
    persistPageState()
    await narration.stop()
    tileLoader.cancel()
    resetAreaInteractionState()
    activeAreaId.value = areaId
    localStorage.setItem(ACTIVE_SCENIC_AREA_STORAGE_KEY, areaId)
    await loadData(areaId)
  }

  async function loadData(areaId: ScenicAreaId = activeAreaId.value) {
    loadAbortController?.abort()
    const controller = new AbortController()
    loadAbortController = controller
    loading.value = true
    areaSwitching.value = Boolean(bootstrap.value && bootstrap.value.area.id !== areaId)
    loadError.value = ''
    try {
      const nextBootstrap = await fetchMapGuideBootstrap(areaId, controller.signal)
      if (controller.signal.aborted) return
      bootstrap.value = nextBootstrap
      activeAreaId.value = nextBootstrap.area.id
      await nextTick()
      restorePageState()
      void tileLoader.preload(nextBootstrap.config.tileLayer.tiles).then(() => {
        if (tileLoader.allFailed.value) handDrawnVisible.value = false
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        if (bootstrap.value && bootstrap.value.area.id !== areaId) {
          activeAreaId.value = bootstrap.value.area.id
          localStorage.setItem(ACTIVE_SCENIC_AREA_STORAGE_KEY, activeAreaId.value)
          ElMessage.warning(t('app.mapGuideLoadFailure'))
          restorePageState()
        } else {
          loadError.value = error instanceof Error ? error.message : String(error)
        }
      }
    } finally {
      if (loadAbortController === controller) {
        loading.value = false
        areaSwitching.value = false
      }
    }
  }

  watch([panelCollapsed, isMobile, spotCardVisible], updateResponsiveSafeArea, { immediate: true })
  watch(
    isMobile,
    (mobile) => {
      if (mobile) panelCollapsed.value = true
    },
    { immediate: true }
  )
  watch(avatarDisplayState, () => void nextTick(() => mapRef.value?.invalidateSize()))
  watch(
    () => narration.snapshot.value.state,
    (state) => {
      if (state === 'playing') advanceSubtitle()
      if (state === 'completed') {
        narrationProgress.value = 100
        routePlayback.narrationCompleted()
      }
      if (state === 'idle' && subtitleTimer !== undefined) {
        window.clearInterval(subtitleTimer)
        subtitleTimer = undefined
      }
    }
  )

  onMounted(() => void loadData())
  onBeforeUnmount(() => {
    loadAbortController?.abort()
    if (subtitleTimer !== undefined) window.clearInterval(subtitleTimer)
    persistPageState()
  })
</script>

<template>
  <div class="map-guide-page">
    <section
      class="map-guide-workspace"
      :class="{
        'narration-open': avatarDisplayState === 'speaking',
        'route-detail-open': routeDetailOpen,
        'route-drawer-open': routeDrawerOpen
      }"
    >
      <main class="map-guide-stage">
        <ScenicAreaSwitcher
          v-if="!panoramaOpen"
          :model-value="activeAreaId"
          :loading="areaSwitching"
          @update:model-value="switchScenicArea"
        />
        <div v-if="areaSwitching" class="map-guide-area-switching" role="status">
          <span />
          <p>{{ $t('app.mapGuideAreaSwitching', { name: activeAreaName }) }}</p>
        </div>
        <div v-if="loading && !bootstrap" class="map-guide-state"
          ><span /><p>{{ $t('app.mapGuideTitle') }}</p></div
        >
        <div v-else-if="loadError || !bootstrap" class="map-guide-state error"
          ><ArtSvgIcon icon="ri:map-2-line" /><h2>{{ $t('app.mapGuideLoadFailure') }}</h2
          ><p>{{ loadError }}</p
          ><button type="button" @click="loadData()">{{ $t('app.mapGuideRetry') }}</button></div
        >
        <template v-else>
          <ScenicMap
            :key="bootstrap.area.id"
            v-show="!panoramaOpen"
            ref="mapRef"
            :config="bootstrap.config"
            :spots="mapSpots"
            :all-spots="bootstrap.spots"
            :selected-spot-id="selectedSpotId"
            :narrating-spot-id="
              narration.snapshot.value.state === 'playing' ? selectedSpotId : undefined
            "
            :route="selectedRoute"
            :current-route-node-index="routePlayback.nodeIndex.value"
            :hand-drawn-visible="handDrawnVisible"
            :loaded-tile-ids="loadedTileIds"
            :safe-area="safeArea"
            @select-spot="focusSpot"
            @select-route-node="selectRouteNode"
            @location-error="ElMessage.warning($t('app.mapGuideLocationDenied'))"
            @map-error="ElMessage.error($t('app.mapGuideMapInitializationFailure'))"
          />
          <ScenicSearchPanel
            v-if="!panoramaOpen"
            v-model:query="query"
            v-model:selected-category-ids="selectedCategoryIds"
            :categories="bootstrap.categories"
            :spots="visibleSpots"
            :collapsed="panelCollapsed"
            @select-spot="focusSpot"
            @toggle-collapse="panelCollapsed = !panelCollapsed"
          />
          <MapLoadingProgress
            :progress="tileLoader.progress.value"
            :failed-count="tileLoader.failedIds.value.length"
            :visible="
              !panoramaOpen && (tileLoader.loading.value || tileLoader.failedIds.value.length > 0)
            "
            @retry="retryFailedTiles"
          />
          <MapControlGroup
            v-if="!panoramaOpen && (!isMobile || (!routeDrawerOpen && !routeDetailOpen))"
            :hand-drawn-visible="handDrawnVisible"
            :panorama-available="bootstrap.panoramas.length > 0"
            :route-active="Boolean(selectedRoute)"
            @browse-routes="openRouteDrawer"
            @locate="mapRef?.locate()"
            @reset="mapRef?.resetView()"
            @toggle-layer="handDrawnVisible = !handDrawnVisible"
            @panorama="openPanorama"
            @clear-route="clearRoute"
          />
          <ScenicSpotCard
            v-if="selectedSpot && spotCardVisible"
            :spot="selectedSpot"
            :panorama-available="bootstrap.panoramas.length > 0"
            :original-audio-available="originalAudioAvailable"
            @close="selectedSpotId = undefined"
            @narrate="startSpotNarration"
            @narrate-original="startOriginalNarration"
            @panorama="openPanorama"
            @navigate="openExternalNavigation"
          />
          <RouteDrawer
            :open="routeDrawerOpen"
            :routes="routeState.routes.value"
            :selected-route-id="routeState.selectedRouteId.value"
            @close="routeDrawerOpen = false"
            @select="selectRoute"
          />
          <RouteDetailPanel
            v-if="
              selectedRoute && routeDetailOpen && !routeDrawerOpen && !panoramaOpen && !selectedSpot
            "
            :route="selectedRoute"
            :current-index="routePlayback.nodeIndex.value"
            :playing="routePlayback.playing.value"
            :panorama-available="bootstrap.panoramas.length > 0"
            @select-node="selectRouteNode"
            @start="startRoutePlayback"
            @pause="routePlayback.pause()"
            @next="routePlayback.next()"
            @panorama="openPanorama"
            @close="routeDetailOpen = false"
            @clear="clearRoute"
          />
          <PanoramaViewer
            v-if="selectedPanorama"
            :panorama="selectedPanorama"
            :open="panoramaOpen"
            @close="closePanorama"
          />
        </template>
      </main>

      <MapDigitalHuman
        v-show="!isMobile || !routeDrawerOpen"
        ref="digitalHumanRef"
        :style="isMobile && routeDetailOpen ? { bottom: '362px' } : undefined"
        :display-state="avatarDisplayState"
        :narration-state="narration.snapshot.value.state"
        :segments="activeSegments"
        :segment-index="subtitleSegmentIndex"
        :fallback-text="narrationText"
        :progress="narrationProgress"
        @start="startWelcomeNarration"
        @expand="expandNarration"
        @compact="compactNarration"
        @pause="narration.pause()"
        @resume="narration.resume()"
        @stop="closeNarration"
        @ready="avatarReady = true"
        @error="avatarFailed = true"
      />
    </section>
  </div>
</template>

<style scoped lang="scss">
  .map-guide-page {
    display: flex;
    flex-direction: column;
    width: calc(100% + 20px);
    height: calc(100vh - 118px);
    min-height: 650px;
    padding: 2px;
    margin-inline: -10px;
    overflow: hidden;
    color: #304840;
  }

  .map-guide-workspace {
    position: relative;
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) 0;
    min-height: 0;
    overflow: hidden;
    background: #e5e9e2;
    border: 1px solid rgb(51 88 78 / 14%);
    border-radius: 17px;
    box-shadow: 0 8px 28px rgb(25 47 40 / 10%);
    transition: grid-template-columns 320ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }

  .map-guide-workspace.narration-open {
    grid-template-columns: minmax(0, 1fr) min(360px, 28vw);
  }

  .map-guide-stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .map-guide-area-switching {
    position: absolute;
    inset: 0;
    z-index: 445;
    display: grid;
    gap: 9px;
    place-content: center;
    justify-items: center;
    color: #3f6058;
    pointer-events: auto;
    background: rgb(237 241 234 / 72%);
    backdrop-filter: blur(2px);
    animation: map-area-fade 220ms ease-out;
  }

  .map-guide-area-switching span {
    width: 28px;
    height: 28px;
    border: 3px solid #c9d4ca;
    border-top-color: #39766c;
    border-radius: 50%;
    animation: map-spin 0.8s linear infinite;
  }

  .map-guide-area-switching p {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .map-guide-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    place-items: center;
    color: #49645d;
    background: #edf0e9;
  }

  .map-guide-state > span {
    width: 36px;
    height: 36px;
    border: 3px solid #cad5cc;
    border-top-color: #3c776c;
    border-radius: 50%;
    animation: map-spin 0.8s linear infinite;
  }

  .map-guide-state.error {
    gap: 8px;
    text-align: center;
  }

  .map-guide-state.error svg {
    font-size: 44px;
    color: #a87936;
  }

  .map-guide-state.error h2,
  .map-guide-state.error p {
    margin: 0;
  }

  .map-guide-state.error button {
    padding: 8px 13px;
    color: #fff;
    cursor: pointer;
    background: #3c776c;
    border: 0;
    border-radius: 8px;
  }

  @keyframes map-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes map-area-fade {
    from {
      opacity: 0;
    }
  }

  @media (width <= 1100px) {
    .map-guide-workspace.narration-open {
      grid-template-columns: minmax(0, 1fr) min(340px, 31vw);
    }
  }

  @media (width <= 760px) {
    .map-guide-page {
      width: calc(100% + 15px);
      height: calc(100vh - 96px);
      min-height: 540px;
      margin-inline: -7.5px;
    }

    .map-guide-workspace,
    .map-guide-workspace.narration-open {
      display: block;
    }

    .map-guide-stage {
      height: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .map-guide-workspace,
    .map-guide-state > span,
    .map-guide-area-switching,
    .map-guide-area-switching span {
      transition: none;
      animation: none;
    }
  }
</style>
