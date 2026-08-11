<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import * as L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import HandDrawnTileLayer from './HandDrawnTileLayer.vue'
  import ScenicMarkerLayer from './ScenicMarkerLayer.vue'
  import RoutePolylineLayer from './RoutePolylineLayer.vue'
  import type {
    GuideCoordinate,
    GuideRoute,
    GuideRouteNode,
    MapGuideConfig,
    MapSafeArea,
    ScenicSpot
  } from '@/types/map-guide'
  import { transformCoordinate } from '@/utils/map-guide/coordinate'
  import {
    fromScenicDisplayCoordinate,
    scenicDisplayBounds,
    toScenicDisplayCoordinate
  } from '@/utils/map-guide/scenic-projection'
  import {
    loadTencentMapSdk,
    scenicDisplayToTencentMapCoordinate,
    toTencentMapCoordinate,
    type TencentMapApi,
    type TencentMapInstance
  } from '@/utils/map-guide/tencent-map'
  import { resolveRoutePathCoordinates } from '@/utils/map-guide/route-geometry'

  const props = defineProps<{
    config: MapGuideConfig
    spots: ScenicSpot[]
    allSpots: ScenicSpot[]
    selectedSpotId?: string
    narratingSpotId?: string
    route?: GuideRoute
    currentRouteNodeIndex?: number
    handDrawnVisible: boolean
    loadedTileIds: string[]
    safeArea: MapSafeArea
  }>()

  const emit = defineEmits<{
    ready: []
    selectSpot: [spot: ScenicSpot]
    selectRouteNode: [node: GuideRouteNode, index: number]
    locationError: [error: GeolocationPositionError]
    mapError: [error: Error]
  }>()

  const { t, locale } = useI18n()
  const tencentMapElement = ref<HTMLDivElement>()
  const tencentAttributionElement = ref<HTMLDivElement>()
  const mapElement = ref<HTMLDivElement>()
  const mapInstance = ref<L.Map>()
  const initializationError = ref('')
  const baseProvider = ref<'loading' | 'tencent' | 'leaflet'>('leaflet')
  let baseLayer: L.TileLayer | undefined
  let tencentMapApi: TencentMapApi | undefined
  let tencentMapInstance: TencentMapInstance | undefined
  let resizeObserver: ResizeObserver | undefined
  let tencentInitializationAttempt = 0
  let tencentSyncFrame: number | undefined
  let tencentAttributionTimer: number | undefined
  let disposed = false
  let artworkAttribution = ''
  let minimumScenicZoom = props.config.minZoom
  const leafletAttributionPrefix = '<a href="https://leafletjs.com" title="Leaflet">Leaflet</a>'

  function effectiveMaxZoom(): number {
    return window.devicePixelRatio > 1.25 && props.config.highDpiMaxZoom
      ? Math.min(props.config.maxZoom, props.config.highDpiMaxZoom)
      : props.config.maxZoom
  }

  function artworkBackgroundColor(): string {
    if (props.config.artworkBackgroundColor) return props.config.artworkBackgroundColor
    return props.config.tileLayer.tiles.some((tile) => tile.url.includes('/nianhuawan/'))
      ? '#90d070'
      : '#b0d8b8'
  }

  function currentRotation(): number {
    return props.handDrawnVisible ? props.config.rotationDegrees : 0
  }

  function toLatLng(coordinate: GuideCoordinate): L.LatLngExpression {
    const converted = props.handDrawnVisible
      ? toScenicDisplayCoordinate(
          coordinate,
          props.config.tileLayer.bounds,
          props.config.rotationDegrees
        )
      : transformCoordinate(coordinate, 'WGS84')
    return [converted.latitude, converted.longitude]
  }

  function scenicBounds(): L.LatLngBounds {
    const bounds = scenicDisplayBounds(props.config.tileLayer.bounds, props.config.rotationDegrees)
    return L.latLngBounds(
      [bounds.southwest.latitude, bounds.southwest.longitude],
      [bounds.northeast.latitude, bounds.northeast.longitude]
    )
  }

  function syncAttribution() {
    const attributionControl = mapInstance.value?.attributionControl
    if (!attributionControl) return
    attributionControl.setPrefix(
      baseProvider.value === 'leaflet' ? leafletAttributionPrefix : false
    )
    if (artworkAttribution) attributionControl.removeAttribution(artworkAttribution)
    artworkAttribution = props.handDrawnVisible ? t('app.mapGuideArtworkAttribution') : ''
    if (artworkAttribution) attributionControl.addAttribution(artworkAttribution)
  }

  function paddingOptions(): Pick<L.FitBoundsOptions, 'paddingTopLeft' | 'paddingBottomRight'> {
    return {
      paddingTopLeft: [props.safeArea.left, props.safeArea.top],
      paddingBottomRight: [props.safeArea.right, props.safeArea.bottom]
    }
  }

  function createMap() {
    if (!mapElement.value || mapInstance.value) return
    initializationError.value = ''
    try {
      const map = L.map(mapElement.value, {
        center: toLatLng(props.config.center),
        zoom: props.config.initialZoom,
        minZoom: props.config.minZoom,
        maxZoom: effectiveMaxZoom(),
        maxBoundsViscosity: 1,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true
      })
      const tileUrl =
        import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      const attribution =
        import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors'
      baseLayer = L.tileLayer(tileUrl, {
        attribution,
        maxZoom: effectiveMaxZoom(),
        crossOrigin: true,
        updateWhenIdle: true
      })
      baseLayer.addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapInstance.value = map
      syncAttribution()
      applyMapMode(true)
      map.on('move zoom resize', scheduleTencentViewSync)
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize({ pan: false })
        if (props.handDrawnVisible) applyScenicBounds(false)
      })
      resizeObserver.observe(mapElement.value)
      window.addEventListener('online', initializeTencentBaseMap)
      window.addEventListener('offline', activateLeafletFallback)
      void initializeTencentBaseMap()
      emit('ready')
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      resizeObserver?.disconnect()
      resizeObserver = undefined
      baseLayer?.remove()
      baseLayer = undefined
      mapInstance.value?.off()
      mapInstance.value?.remove()
      mapInstance.value = undefined
      initializationError.value = error.message
      emit('mapError', error)
    }
  }

  function applyScenicBounds(reset: boolean) {
    const map = mapInstance.value
    if (!map) return
    const bounds = scenicBounds()
    const navigationBounds = bounds.pad(0.25)
    minimumScenicZoom = props.config.minZoom
    map.setMaxBounds(navigationBounds)
    map.setMinZoom(minimumScenicZoom)
    if (reset || map.getZoom() < minimumScenicZoom) {
      map.setView(bounds.getCenter(), minimumScenicZoom, { animate: false })
    }
    map.panInsideBounds(navigationBounds, { animate: false })
  }

  function applyMapMode(reset: boolean) {
    const map = mapInstance.value
    if (!map) return
    syncAttribution()
    if (props.handDrawnVisible) {
      map.getContainer().classList.add('is-hand-drawn')
      applyScenicBounds(reset)
    } else {
      map.getContainer().classList.remove('is-hand-drawn')
      map.setMinZoom(props.config.minZoom)
      map.setMaxBounds([
        [-85, -180],
        [85, 180]
      ])
      if (reset) {
        const center = transformCoordinate(props.config.center, 'WGS84')
        map.setView([center.latitude, center.longitude], props.config.initialZoom, {
          animate: false
        })
      }
    }
    scheduleTencentViewSync()
  }

  function activateLeafletFallback() {
    tencentInitializationAttempt += 1
    const map = mapInstance.value
    baseProvider.value = 'leaflet'
    syncAttribution()
    if (!map || !baseLayer) return
    if (!map.hasLayer(baseLayer)) baseLayer.addTo(map)
  }

  function currentTencentCenter(): GuideCoordinate | undefined {
    const map = mapInstance.value
    if (!map) return
    const center = map.getCenter()
    const coordinate: GuideCoordinate = {
      latitude: center.lat,
      longitude: center.lng,
      coordinateSystem: 'WGS84'
    }
    return props.handDrawnVisible
      ? scenicDisplayToTencentMapCoordinate(
          coordinate,
          props.config.tileLayer.bounds,
          props.config.rotationDegrees
        )
      : toTencentMapCoordinate(coordinate)
  }

  function syncTencentView() {
    tencentSyncFrame = undefined
    const center = currentTencentCenter()
    const zoom = mapInstance.value?.getZoom()
    if (!center || zoom === undefined || !tencentMapApi || !tencentMapInstance) return
    tencentMapInstance.setCenter(new tencentMapApi.LatLng(center.latitude, center.longitude))
    tencentMapInstance.setZoom(zoom)
  }

  function syncTencentAttribution(attempt = 0) {
    if (tencentAttributionTimer !== undefined) window.clearTimeout(tencentAttributionTimer)
    tencentAttributionTimer = undefined
    const target = tencentAttributionElement.value
    const link = tencentMapElement.value?.querySelector<HTMLAnchorElement>('a[href*="map.qq.com"]')
    const officialControl = link?.parentElement
    if (target && officialControl) {
      target.replaceChildren(officialControl.cloneNode(true))
      return
    }
    if (!disposed && attempt < 20) {
      tencentAttributionTimer = window.setTimeout(() => syncTencentAttribution(attempt + 1), 100)
    }
  }

  function scheduleTencentViewSync() {
    if (!tencentMapInstance || tencentSyncFrame !== undefined) return
    tencentSyncFrame = window.requestAnimationFrame(syncTencentView)
  }

  async function initializeTencentBaseMap() {
    const apiKey = String(import.meta.env.VITE_TENCENT_MAP_KEY || '').trim()
    if (!apiKey || !navigator.onLine || !tencentMapElement.value || !mapInstance.value) {
      activateLeafletFallback()
      return
    }

    const attempt = ++tencentInitializationAttempt
    baseProvider.value = 'loading'
    try {
      tencentMapApi = await loadTencentMapSdk(apiKey)
      if (disposed || attempt !== tencentInitializationAttempt || !navigator.onLine) return
      const center = currentTencentCenter()
      if (!center) throw new Error('Tencent map center is unavailable')
      if (!tencentMapInstance) {
        tencentMapInstance = new tencentMapApi.Map(tencentMapElement.value, {
          center: new tencentMapApi.LatLng(center.latitude, center.longitude),
          zoom: mapInstance.value.getZoom(),
          minZoom: props.config.minZoom,
          maxZoom: effectiveMaxZoom(),
          pitch: 0,
          rotation: 0,
          showControl: false
        })
      } else {
        syncTencentView()
      }
      syncTencentAttribution()
      baseProvider.value = 'tencent'
      if (baseLayer && mapInstance.value.hasLayer(baseLayer))
        baseLayer.removeFrom(mapInstance.value)
      syncAttribution()
    } catch {
      if (!disposed && attempt === tencentInitializationAttempt) activateLeafletFallback()
    }
  }

  function focusCoordinate(
    coordinate: GuideCoordinate,
    zoom = Math.max(props.config.initialZoom, 17)
  ) {
    const map = mapInstance.value
    if (!map) return
    const targetZoom = Math.min(zoom, effectiveMaxZoom())
    const displayCoordinate = props.handDrawnVisible
      ? toScenicDisplayCoordinate(
          coordinate,
          props.config.tileLayer.bounds,
          props.config.rotationDegrees
        )
      : transformCoordinate(coordinate, 'WGS84')
    const target = L.latLng(displayCoordinate.latitude, displayCoordinate.longitude)
    const safeAreaOffset = L.point(
      (props.safeArea.left - props.safeArea.right) / 2,
      (props.safeArea.top - props.safeArea.bottom) / 2
    )
    const targetCenter = map.unproject(
      map.project(target, targetZoom).subtract(safeAreaOffset),
      targetZoom
    )
    map.flyTo(targetCenter, targetZoom, {
      duration: 0.38,
      easeLinearity: 0.35
    })
  }

  function focusSpot(spot: ScenicSpot) {
    focusCoordinate({
      latitude: spot.latitude,
      longitude: spot.longitude,
      coordinateSystem: spot.coordinateSystem
    })
  }

  function focusRoute(route: GuideRoute) {
    const points = resolveRoutePathCoordinates(route, props.allSpots).map((coordinate) => {
      const displayCoordinate = props.handDrawnVisible
        ? toScenicDisplayCoordinate(
            coordinate,
            props.config.tileLayer.bounds,
            props.config.rotationDegrees
          )
        : transformCoordinate(coordinate, 'WGS84')
      return L.latLng(displayCoordinate.latitude, displayCoordinate.longitude)
    })
    if (points.length === 1) mapInstance.value?.setView(points[0], 17)
    if (points.length > 1)
      mapInstance.value?.fitBounds(L.latLngBounds(points), {
        ...paddingOptions(),
        maxZoom: Math.min(18, effectiveMaxZoom()),
        animate: true,
        duration: 0.42
      })
  }

  function resetView() {
    if (props.handDrawnVisible) {
      const bounds = scenicBounds()
      mapInstance.value?.flyTo(bounds.getCenter(), minimumScenicZoom, { duration: 0.38 })
    } else {
      mapInstance.value?.flyTo(toLatLng(props.config.center), props.config.initialZoom, {
        duration: 0.38
      })
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      resetView()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate: GuideCoordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          coordinateSystem: 'WGS84'
        }
        focusCoordinate(coordinate, 18)
        if (mapInstance.value) {
          L.circleMarker(toLatLng(coordinate), {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#277c72',
            fillOpacity: 1
          }).addTo(mapInstance.value)
        }
      },
      (error) => {
        resetView()
        emit('locationError', error)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }

  function invalidateSize() {
    void nextTick(() => mapInstance.value?.invalidateSize({ animate: true }))
  }

  function getViewState() {
    if (!mapInstance.value) return
    const center = mapInstance.value.getCenter()
    const displayCenter: GuideCoordinate = {
      latitude: center.lat,
      longitude: center.lng,
      coordinateSystem: 'WGS84'
    }
    return {
      center: props.handDrawnVisible
        ? fromScenicDisplayCoordinate(
            displayCenter,
            props.config.tileLayer.bounds,
            props.config.rotationDegrees
          )
        : displayCenter,
      zoom: mapInstance.value.getZoom()
    }
  }

  function restoreView(state?: { center: GuideCoordinate; zoom: number }) {
    const map = mapInstance.value
    if (!state || !map) return
    const zoom = Math.max(
      props.handDrawnVisible ? minimumScenicZoom : props.config.minZoom,
      Math.min(state.zoom, effectiveMaxZoom())
    )
    map.setView(toLatLng(state.center), zoom, { animate: false })
    if (props.handDrawnVisible) map.panInsideBounds(scenicBounds().pad(0.25), { animate: false })
  }

  watch(
    () => props.route?.id,
    () => {
      if (props.route) focusRoute(props.route)
    }
  )
  watch(() => props.safeArea, invalidateSize, { deep: true })
  watch(
    () => props.handDrawnVisible,
    () => applyMapMode(true)
  )
  watch(locale, syncAttribution)

  onMounted(createMap)
  onBeforeUnmount(() => {
    disposed = true
    tencentInitializationAttempt += 1
    window.removeEventListener('online', initializeTencentBaseMap)
    window.removeEventListener('offline', activateLeafletFallback)
    if (tencentSyncFrame !== undefined) window.cancelAnimationFrame(tencentSyncFrame)
    if (tencentAttributionTimer !== undefined) window.clearTimeout(tencentAttributionTimer)
    resizeObserver?.disconnect()
    resizeObserver = undefined
    tencentMapInstance?.destroy?.()
    tencentMapInstance = undefined
    baseLayer?.remove()
    mapInstance.value?.off()
    mapInstance.value?.remove()
    mapInstance.value = undefined
  })

  defineExpose({
    focusCoordinate,
    focusSpot,
    focusRoute,
    resetView,
    locate,
    invalidateSize,
    getViewState,
    restoreView
  })
</script>

<template>
  <div
    class="scenic-map-shell"
    :data-base-provider="baseProvider"
    :style="{ '--scenic-artwork-background': artworkBackgroundColor() }"
  >
    <div
      ref="tencentMapElement"
      class="scenic-map-tencent-base"
      :class="{ 'is-active': baseProvider === 'tencent' }"
      aria-hidden="true"
    />
    <div
      v-show="baseProvider === 'tencent'"
      ref="tencentAttributionElement"
      class="scenic-tencent-attribution"
      aria-label="Tencent map attribution"
    />
    <div ref="mapElement" class="scenic-map-canvas" role="application" aria-label="Scenic map" />
    <div v-if="initializationError" class="scenic-map-error" role="alert">
      <ArtSvgIcon icon="ri:map-2-line" />
      <p>{{ t('app.mapGuideMapInitializationFailure') }}</p>
      <button type="button" @click="createMap">{{ t('app.mapGuideRetry') }}</button>
    </div>
    <template v-if="mapInstance">
      <HandDrawnTileLayer
        :map="mapInstance"
        :bounds="config.tileLayer.bounds"
        :tiles="config.tileLayer.tiles"
        :rows="config.tileLayer.rows"
        :columns="config.tileLayer.columns"
        :loaded-ids="loadedTileIds"
        :rotation-degrees="config.rotationDegrees"
        :visible="handDrawnVisible"
      />
      <ScenicMarkerLayer
        :map="mapInstance"
        :spots="spots"
        :selected-spot-id="selectedSpotId"
        :narrating-spot-id="narratingSpotId"
        :artwork-bounds="config.tileLayer.bounds"
        :rotation-degrees="currentRotation()"
        @select="emit('selectSpot', $event)"
      />
      <RoutePolylineLayer
        :map="mapInstance"
        :route="route"
        :spots="allSpots"
        :current-node-index="currentRouteNodeIndex"
        :artwork-bounds="config.tileLayer.bounds"
        :rotation-degrees="currentRotation()"
        @select-node="(node, index) => emit('selectRouteNode', node, index)"
      />
    </template>
  </div>
</template>

<style lang="scss">
  .scenic-map-shell,
  .scenic-map-canvas {
    width: 100%;
    height: 100%;
    min-height: 420px;
  }

  .scenic-map-shell {
    position: relative;
    overflow: hidden;
    background: #e8ece5;
  }

  .scenic-map-tencent-base {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 180ms ease-out;
  }

  .scenic-map-tencent-base.is-active {
    opacity: 1;
  }

  .scenic-tencent-attribution {
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 450;
    max-width: calc(100% - 180px);
    overflow: hidden;
    pointer-events: auto;
  }

  .scenic-map-error {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    gap: 10px;
    place-content: center;
    justify-items: center;
    padding: 24px;
    color: #40534d;
    text-align: center;
    background: #eef1eb;
  }

  .scenic-map-error svg {
    font-size: 36px;
  }

  .scenic-map-error p {
    max-width: 420px;
    margin: 0;
  }

  .scenic-map-error button {
    padding: 8px 16px;
    color: #fff;
    cursor: pointer;
    background: #39766c;
    border: 0;
    border-radius: 8px;
  }

  .scenic-map-canvas {
    z-index: 1;
    background: transparent;
    transition: background-color 160ms ease-out;
  }

  .scenic-map-canvas.is-hand-drawn {
    background: var(--scenic-artwork-background, #b0d8b8);
  }

  .scenic-map-canvas.is-hand-drawn .leaflet-tile-pane {
    opacity: 0;
  }

  .hand-drawn-map-tile {
    pointer-events: none;
  }

  .leaflet-control-attribution {
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 10px;
    line-height: 1.2;
  }

  .leaflet-control-attribution a {
    color: #285e58;
  }

  .leaflet-control-zoom a {
    color: #285e58;
  }
</style>
