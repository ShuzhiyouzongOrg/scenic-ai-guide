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

  const { t } = useI18n()
  const mapElement = ref<HTMLDivElement>()
  const mapInstance = ref<L.Map>()
  const initializationError = ref('')
  let baseLayer: L.TileLayer | undefined
  let resizeObserver: ResizeObserver | undefined
  let minimumScenicZoom = props.config.minZoom

  function effectiveMaxZoom(): number {
    return window.devicePixelRatio > 1.25 && props.config.highDpiMaxZoom
      ? Math.min(props.config.maxZoom, props.config.highDpiMaxZoom)
      : props.config.maxZoom
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
      const attribution = [
        import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors',
        t('app.mapGuideArtworkAttribution')
      ]
        .filter(Boolean)
        .join(' · ')
      baseLayer = L.tileLayer(tileUrl, {
        attribution,
        maxZoom: effectiveMaxZoom(),
        crossOrigin: true,
        updateWhenIdle: true
      })
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapInstance.value = map
      applyMapMode(true)
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize({ pan: false })
        if (props.handDrawnVisible) applyScenicBounds(false)
      })
      resizeObserver.observe(mapElement.value)
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

  function applyMapMode(reset: boolean) {
    const map = mapInstance.value
    if (!map || !baseLayer) return
    if (props.handDrawnVisible) {
      if (map.hasLayer(baseLayer)) baseLayer.removeFrom(map)
      map.getContainer().classList.add('is-hand-drawn-only')
      applyScenicBounds(reset)
      return
    }
    map.getContainer().classList.remove('is-hand-drawn-only')
    map.setMinZoom(props.config.minZoom)
    map.setMaxBounds([
      [-85, -180],
      [85, 180]
    ])
    if (!map.hasLayer(baseLayer)) baseLayer.addTo(map)
    if (reset) {
      const center = transformCoordinate(props.config.center, 'WGS84')
      map.setView([center.latitude, center.longitude], props.config.initialZoom, {
        animate: false
      })
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
    if (props.handDrawnVisible) map.panInsideBounds(scenicBounds(), { animate: false })
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
    () => {
      applyMapMode(true)
    }
  )

  onMounted(createMap)
  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
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
  <div class="scenic-map-shell">
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
    z-index: 0;
    background: #e8ece5;
  }

  .scenic-map-canvas.is-hand-drawn-only {
    background: #b8d9a9;
  }

  .hand-drawn-map-tile {
    pointer-events: none;
  }

  .leaflet-control-attribution {
    font-size: 10px;
  }

  .leaflet-control-attribution a {
    color: #285e58;
  }

  .leaflet-control-zoom a {
    color: #285e58;
  }
</style>
