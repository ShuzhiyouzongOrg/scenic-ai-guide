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
  import {
    fromScenicDisplayCoordinate,
    scenicDisplayBounds,
    toScenicDisplayCoordinate
  } from '@/utils/map-guide/scenic-projection'
  import {
    loadTencentMapSdk,
    scenicDisplayToTencentMapCoordinate,
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

  const { t } = useI18n()
  const tencentMapElement = ref<HTMLDivElement>()
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
  let disposed = false
  let minimumScenicZoom = props.config.minZoom

  function effectiveMaxZoom(): number {
    return window.devicePixelRatio > 1.25 && props.config.highDpiMaxZoom
      ? Math.min(props.config.maxZoom, props.config.highDpiMaxZoom)
      : props.config.maxZoom
  }

  function currentRotation(): number {
    return props.config.rotationDegrees
  }

  function toLatLng(coordinate: GuideCoordinate): L.LatLngExpression {
    const converted = toScenicDisplayCoordinate(
      coordinate,
      props.config.tileLayer.bounds,
      props.config.rotationDegrees
    )
    return [converted.latitude, converted.longitude]
  }

  function scenicBounds(): L.LatLngBounds {
    const bounds = scenicDisplayBounds(props.config.tileLayer.bounds, props.config.rotationDegrees)
    return L.latLngBounds(
      [bounds.southwest.latitude, bounds.southwest.longitude],
      [bounds.northeast.latitude, bounds.northeast.longitude]
    )
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
      map.attributionControl.addAttribution(t('app.mapGuideArtworkAttribution'))
      baseLayer.addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapInstance.value = map
      applyScenicBounds(true)
      map.on('move zoom resize', scheduleTencentViewSync)
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize({ pan: false })
        applyScenicBounds(false)
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
    map.setMaxBounds(bounds)
    minimumScenicZoom = Math.max(
      props.config.minZoom,
      map.getBoundsZoom(bounds, true, L.point(34, 34))
    )
    map.setMinZoom(minimumScenicZoom)
    if (reset || map.getZoom() < minimumScenicZoom) {
      map.setView(bounds.getCenter(), minimumScenicZoom, { animate: false })
    }
    map.panInsideBounds(bounds, { animate: false })
  }

  function activateLeafletFallback() {
    tencentInitializationAttempt += 1
    const map = mapInstance.value
    baseProvider.value = 'leaflet'
    if (!map || !baseLayer) return
    if (!map.hasLayer(baseLayer)) baseLayer.addTo(map)
  }

  function currentTencentCenter(): GuideCoordinate | undefined {
    const map = mapInstance.value
    if (!map) return
    const center = map.getCenter()
    return scenicDisplayToTencentMapCoordinate(
      { latitude: center.lat, longitude: center.lng, coordinateSystem: 'WGS84' },
      props.config.tileLayer.bounds,
      props.config.rotationDegrees
    )
  }

  function syncTencentView() {
    tencentSyncFrame = undefined
    const center = currentTencentCenter()
    const zoom = mapInstance.value?.getZoom()
    if (!center || zoom === undefined || !tencentMapApi || !tencentMapInstance) return
    tencentMapInstance.setCenter(new tencentMapApi.LatLng(center.latitude, center.longitude))
    tencentMapInstance.setZoom(zoom)
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
      baseProvider.value = 'tencent'
      if (baseLayer && mapInstance.value.hasLayer(baseLayer))
        baseLayer.removeFrom(mapInstance.value)
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
    const displayCoordinate = toScenicDisplayCoordinate(
      coordinate,
      props.config.tileLayer.bounds,
      props.config.rotationDegrees
    )
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
      const displayCoordinate = toScenicDisplayCoordinate(
        coordinate,
        props.config.tileLayer.bounds,
        props.config.rotationDegrees
      )
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
    const bounds = scenicBounds()
    mapInstance.value?.flyTo(bounds.getCenter(), minimumScenicZoom, { duration: 0.38 })
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
      center: fromScenicDisplayCoordinate(
        displayCenter,
        props.config.tileLayer.bounds,
        props.config.rotationDegrees
      ),
      zoom: mapInstance.value.getZoom()
    }
  }

  function restoreView(state?: { center: GuideCoordinate; zoom: number }) {
    const map = mapInstance.value
    if (!state || !map) return
    const zoom = Math.max(minimumScenicZoom, Math.min(state.zoom, effectiveMaxZoom()))
    map.setView(toLatLng(state.center), zoom, { animate: false })
    map.panInsideBounds(scenicBounds(), { animate: false })
  }

  watch(
    () => props.route?.id,
    () => {
      if (props.route) focusRoute(props.route)
    }
  )
  watch(() => props.safeArea, invalidateSize, { deep: true })

  onMounted(createMap)
  onBeforeUnmount(() => {
    disposed = true
    tencentInitializationAttempt += 1
    window.removeEventListener('online', initializeTencentBaseMap)
    window.removeEventListener('offline', activateLeafletFallback)
    if (tencentSyncFrame !== undefined) window.cancelAnimationFrame(tencentSyncFrame)
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
  <div class="scenic-map-shell" :data-base-provider="baseProvider">
    <div
      ref="tencentMapElement"
      class="scenic-map-tencent-base"
      :class="{ 'is-active': baseProvider === 'tencent' }"
      aria-hidden="true"
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
        :visible="true"
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
