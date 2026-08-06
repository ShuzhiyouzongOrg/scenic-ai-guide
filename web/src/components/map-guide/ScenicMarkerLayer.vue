<script setup lang="ts">
  import { onBeforeUnmount, watch } from 'vue'
  import * as L from 'leaflet'
  import type { CoordinateBounds, ScenicSpot } from '@/types/map-guide'
  import { facilityColor } from '@/utils/map-guide/facility-style'
  import { toScenicDisplayCoordinate } from '@/utils/map-guide/scenic-projection'

  const props = defineProps<{
    map: L.Map
    spots: ScenicSpot[]
    selectedSpotId?: string
    narratingSpotId?: string
    artworkBounds: CoordinateBounds
    rotationDegrees: number
  }>()

  const emit = defineEmits<{ select: [spot: ScenicSpot] }>()
  const markers = new Map<string, L.Marker>()
  const layer = L.layerGroup().addTo(props.map)
  let visibleLabelIds = new Set<string>()

  interface LabelRectangle {
    left: number
    right: number
    top: number
    bottom: number
  }

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }
      return entities[character]
    })
  }

  function overlaps(first: LabelRectangle, second: LabelRectangle): boolean {
    const gap = 4
    return !(
      first.right + gap < second.left ||
      first.left > second.right + gap ||
      first.bottom + gap < second.top ||
      first.top > second.bottom + gap
    )
  }

  function calculateVisibleLabels(): Set<string> {
    const visible = new Set<string>()
    const occupied: LabelRectangle[] = []
    const mapSize = props.map.getSize()
    const candidates = [...props.spots].sort((left, right) => {
      const priority = (spot: ScenicSpot) =>
        spot.id === props.selectedSpotId
          ? 0
          : spot.id === props.narratingSpotId
            ? 1
            : spot.kind === 'scenic'
              ? 2
              : 3
      return priority(left) - priority(right) || (right.pointLevel || 0) - (left.pointLevel || 0)
    })

    for (const spot of candidates) {
      const converted = toScenicDisplayCoordinate(
        {
          latitude: spot.latitude,
          longitude: spot.longitude,
          coordinateSystem: spot.coordinateSystem
        },
        props.artworkBounds,
        props.rotationDegrees
      )
      const point = props.map.latLngToContainerPoint([converted.latitude, converted.longitude])
      const width = Math.min(108, Math.max(48, Array.from(spot.name).length * 12 + 14))
      const rectangle: LabelRectangle = {
        left: point.x - width / 2,
        right: point.x + width / 2,
        top: point.y - 61,
        bottom: point.y - 37
      }
      const selected = spot.id === props.selectedSpotId || spot.id === props.narratingSpotId
      const inViewport =
        rectangle.right >= 6 &&
        rectangle.left <= mapSize.x - 6 &&
        rectangle.bottom >= 6 &&
        rectangle.top <= mapSize.y - 6
      const labelOverlaps = occupied.some((item) => overlaps(rectangle, item))
      if (!inViewport || (!selected && labelOverlaps)) continue
      visible.add(spot.id)
      occupied.push(rectangle)
    }
    return visible
  }

  function markerIcon(spot: ScenicSpot): L.DivIcon {
    const selected = spot.id === props.selectedSpotId
    const narrating = spot.id === props.narratingSpotId
    const facility = spot.kind === 'facility'
    const facilityStyle = facility
      ? ` style="--facility-color:${facilityColor(spot.categoryId)}"`
      : ''
    const classes = [
      'scenic-marker',
      facility ? 'is-facility' : 'is-scenic',
      selected ? 'is-selected' : '',
      narrating ? 'is-narrating' : ''
    ]
      .filter(Boolean)
      .join(' ')
    const escapedName = escapeHtml(spot.name)
    const label = visibleLabelIds.has(spot.id)
      ? `<span class="scenic-marker__label ${facility ? 'is-facility' : ''}"${facilityStyle}>${escapedName}</span>`
      : ''
    return L.divIcon({
      className: 'scenic-marker-host',
      html: `<div class="scenic-marker-wrap">${label}<button class="${classes}"${facilityStyle} type="button" aria-label="${escapedName}"><span>${facility ? 'i' : ''}</span></button></div>`,
      iconSize: selected || narrating ? [34, 42] : [28, 36],
      iconAnchor: selected || narrating ? [17, 40] : [14, 34]
    })
  }

  function sync() {
    visibleLabelIds = calculateVisibleLabels()
    const desired = new Set(props.spots.map((spot) => spot.id))
    for (const [id, marker] of markers) {
      if (!desired.has(id)) {
        layer.removeLayer(marker)
        markers.delete(id)
      }
    }
    for (const spot of props.spots) {
      const converted = toScenicDisplayCoordinate(
        {
          latitude: spot.latitude,
          longitude: spot.longitude,
          coordinateSystem: spot.coordinateSystem
        },
        props.artworkBounds,
        props.rotationDegrees
      )
      let marker = markers.get(spot.id)
      if (!marker) {
        marker = L.marker([converted.latitude, converted.longitude], {
          icon: markerIcon(spot),
          keyboard: true,
          riseOnHover: true,
          title: spot.name
        })
        marker.on('click', () => emit('select', spot))
        marker.addTo(layer)
        markers.set(spot.id, marker)
      } else {
        marker.setLatLng([converted.latitude, converted.longitude])
        marker.setIcon(markerIcon(spot))
      }
    }
  }

  watch(
    () =>
      [
        props.spots,
        props.selectedSpotId,
        props.narratingSpotId,
        props.artworkBounds,
        props.rotationDegrees
      ] as const,
    sync,
    { immediate: true, deep: true }
  )

  props.map.on('zoomend moveend resize', sync)

  onBeforeUnmount(() => {
    props.map.off('zoomend moveend resize', sync)
    layer.remove()
    markers.clear()
  })
</script>

<template><span class="headless-map-layer" aria-hidden="true" /></template>

<style lang="scss">
  .scenic-marker-host {
    background: transparent;
    border: 0;
  }

  .scenic-marker-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .scenic-marker__label {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    z-index: 2;
    max-width: 108px;
    padding: 3px 7px;
    overflow: hidden;
    font: 600 11px/16px sans-serif;
    color: #2f5048;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    background: rgb(255 255 251 / 94%);
    border: 1px solid rgb(52 91 80 / 20%);
    border-radius: 6px;
    box-shadow: 0 3px 9px rgb(30 54 47 / 15%);
    transform: translateX(-50%);
  }

  .scenic-marker__label.is-facility {
    max-width: 96px;
    padding: 2px 5px;
    font-size: 10px;
    line-height: 14px;
    color: var(--facility-color);
    border-color: color-mix(in srgb, var(--facility-color) 42%, transparent);
  }

  .scenic-marker {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    color: #fff;
    cursor: pointer;
    background: #2e756d;
    border: 2px solid rgb(255 255 255 / 94%);
    border-radius: 50% 50% 50% 8px;
    box-shadow: 0 5px 14px rgb(20 55 50 / 26%);
    transition:
      transform 180ms ease-out,
      box-shadow 180ms ease-out,
      background 180ms ease-out;
    transform: rotate(-45deg);

    span {
      font: 700 11px/1 sans-serif;
      transform: rotate(45deg);
    }

    &.is-facility {
      background: var(--facility-color, #687a73);
    }

    &.is-selected,
    &.is-narrating {
      width: 34px;
      height: 34px;
      background: #b87822;
      box-shadow: 0 7px 18px rgb(99 61 15 / 32%);
      transform: rotate(-45deg) scale(1.06);
    }

    &.is-narrating::after {
      position: absolute;
      inset: -5px;
      content: '';
      border: 2px solid rgb(184 120 34 / 50%);
      border-radius: 50%;
      animation: marker-breathe 2.4s ease-in-out infinite;
    }
  }

  @keyframes marker-breathe {
    50% {
      opacity: 0.25;
      transform: scale(1.18);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scenic-marker {
      transition: none;
    }

    .scenic-marker.is-narrating::after {
      animation: none;
    }
  }
</style>
