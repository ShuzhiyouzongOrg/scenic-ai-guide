<script setup lang="ts">
  import { onBeforeUnmount, watch } from 'vue'
  import * as L from 'leaflet'
  import type { CoordinateBounds, HandDrawnTile } from '@/types/map-guide'
  import { transformCoordinate } from '@/utils/map-guide/coordinate'
  import { sortTilesRowMajor } from '@/utils/map-guide/tile-grid'

  const props = defineProps<{
    map: L.Map
    bounds: CoordinateBounds
    tiles: HandDrawnTile[]
    rows: number
    columns: number
    loadedIds: string[]
    rotationDegrees: number
    visible: boolean
  }>()

  const paneName = 'scenicArtwork'
  const pane = props.map.getPane(paneName) || props.map.createPane(paneName)
  pane.style.zIndex = '220'
  pane.style.pointerEvents = 'none'

  const frame = L.DomUtil.create(
    'div',
    `hand-drawn-artwork-frame ${props.map.options.zoomAnimation ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide'}`,
    pane
  )
  const mosaic = L.DomUtil.create('div', 'hand-drawn-artwork-mosaic', frame)

  interface OverlayProjectionMap extends L.Map {
    _latLngBoundsToNewLayerBounds(bounds: L.LatLngBounds, zoom: number, center: L.LatLng): L.Bounds
  }

  function artworkCorners(): { northwest: L.LatLng; southeast: L.LatLng } {
    const southwest = transformCoordinate(props.bounds.southwest, 'WGS84')
    const northeast = transformCoordinate(props.bounds.northeast, 'WGS84')
    return {
      northwest: L.latLng(northeast.latitude, southwest.longitude),
      southeast: L.latLng(southwest.latitude, northeast.longitude)
    }
  }

  function updateGeometry() {
    const { northwest, southeast } = artworkCorners()
    const northwestPoint = props.map.latLngToLayerPoint(northwest)
    const southeastPoint = props.map.latLngToLayerPoint(southeast)
    L.DomUtil.setPosition(frame, northwestPoint)
    frame.style.width = `${Math.max(1, southeastPoint.x - northwestPoint.x)}px`
    frame.style.height = `${Math.max(1, southeastPoint.y - northwestPoint.y)}px`
    mosaic.style.transform = `rotate(${props.rotationDegrees}deg)`
  }

  function artworkBounds(): L.LatLngBounds {
    const { northwest, southeast } = artworkCorners()
    return L.latLngBounds(northwest, southeast)
  }

  function animateZoom(event: L.ZoomAnimEvent) {
    const projected = (props.map as OverlayProjectionMap)._latLngBoundsToNewLayerBounds(
      artworkBounds(),
      event.zoom,
      event.center
    )
    if (!projected.min) return
    L.DomUtil.setTransform(frame, projected.min, props.map.getZoomScale(event.zoom))
  }

  function syncTiles() {
    const loaded = new Set(props.loadedIds)
    mosaic.replaceChildren()
    mosaic.style.gridTemplateColumns = `repeat(${props.columns}, minmax(0, 1fr))`
    mosaic.style.gridTemplateRows = `repeat(${props.rows}, minmax(0, 1fr))`

    for (const tile of sortTilesRowMajor(props.tiles)) {
      const cell = document.createElement('span')
      cell.className = 'hand-drawn-artwork-cell'
      if (loaded.has(tile.id)) {
        const image = document.createElement('img')
        image.src = tile.url
        image.alt = ''
        image.decoding = 'async'
        image.draggable = false
        cell.append(image)
      }
      mosaic.append(cell)
    }
  }

  function syncVisibility() {
    frame.style.display = props.visible ? '' : 'none'
  }

  props.map.on('viewreset zoomend moveend resize', updateGeometry)
  props.map.on('zoomanim', animateZoom)

  watch(() => [props.bounds, props.rotationDegrees] as const, updateGeometry, {
    immediate: true,
    deep: true
  })
  watch(
    () => [props.tiles, props.loadedIds.join('|'), props.rows, props.columns] as const,
    syncTiles,
    { immediate: true, deep: true }
  )
  watch(() => props.visible, syncVisibility, { immediate: true })

  onBeforeUnmount(() => {
    props.map.off('viewreset zoomend moveend resize', updateGeometry)
    props.map.off('zoomanim', animateZoom)
    frame.remove()
  })
</script>

<template><span class="headless-map-layer" aria-hidden="true" /></template>

<style lang="scss">
  .hand-drawn-artwork-frame {
    position: absolute;
    pointer-events: none;
  }

  .hand-drawn-artwork-mosaic {
    position: absolute;
    inset: 0;
    display: grid;
    overflow: visible;
    pointer-events: none;
    background: var(--scenic-artwork-background, #b0d8b8);
    transform-origin: center;
    backface-visibility: hidden;
  }

  .hand-drawn-artwork-cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .hand-drawn-artwork-cell img {
    position: absolute;
    inset: -0.6px;
    display: block;
    width: calc(100% + 1.2px);
    max-width: none;
    height: calc(100% + 1.2px);
    pointer-events: none;
  }
</style>
