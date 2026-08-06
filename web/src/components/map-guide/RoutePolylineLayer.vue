<script setup lang="ts">
  import { onBeforeUnmount, watch } from 'vue'
  import * as L from 'leaflet'
  import type { CoordinateBounds, GuideRoute, GuideRouteNode, ScenicSpot } from '@/types/map-guide'
  import {
    resolveRouteNodeCoordinate,
    resolveRoutePathCoordinates
  } from '@/utils/map-guide/route-geometry'
  import { toScenicDisplayCoordinate } from '@/utils/map-guide/scenic-projection'

  const props = defineProps<{
    map: L.Map
    route?: GuideRoute
    currentNodeIndex?: number
    spots: ScenicSpot[]
    artworkBounds: CoordinateBounds
    rotationDegrees: number
  }>()

  const emit = defineEmits<{ selectNode: [node: GuideRouteNode, index: number] }>()
  const group = L.layerGroup().addTo(props.map)

  function point(node: GuideRouteNode): L.LatLngExpression | undefined {
    const coordinate = resolveRouteNodeCoordinate(node, props.spots)
    if (!coordinate) return
    const converted = toScenicDisplayCoordinate(
      coordinate,
      props.artworkBounds,
      props.rotationDegrees
    )
    return [converted.latitude, converted.longitude]
  }

  function pathPoint(coordinate: GuideRoute['polyline'][number]): L.LatLngExpression {
    const converted = toScenicDisplayCoordinate(
      coordinate,
      props.artworkBounds,
      props.rotationDegrees
    )
    return [converted.latitude, converted.longitude]
  }

  function render() {
    group.clearLayers()
    if (!props.route) return
    const points = resolveRoutePathCoordinates(props.route, props.spots).map(pathPoint)
    if (points.length > 1) {
      L.polyline(points, {
        color: 'rgba(255, 255, 248, 0.92)',
        weight: 9,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(group)
      L.polyline(points, {
        color: props.route.source === 'official' ? '#9c6722' : '#2e756d',
        weight: 5,
        opacity: 0.88,
        dashArray:
          props.route.geometryKind === 'schematic' ||
          (!props.route.geometryKind && !props.route.isPreciseNavigation)
            ? '10 10'
            : undefined,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(group)
    }
    props.route.nodes.forEach((node, index) => {
      const coordinate = point(node)
      if (!coordinate) return
      const current = index === props.currentNodeIndex
      const marker = L.marker(coordinate, {
        zIndexOffset: current ? 900 : 500,
        icon: L.divIcon({
          className: 'route-node-host',
          html: `<button type="button" class="route-node ${current ? 'is-current' : ''}" aria-label="${node.name.replaceAll('"', '&quot;')}">${node.order}</button>`,
          iconSize: current ? [36, 36] : [30, 30],
          iconAnchor: current ? [18, 18] : [15, 15]
        })
      })
      marker.on('click', () => emit('selectNode', node, index))
      marker.addTo(group)
    })
  }

  watch(
    () =>
      [
        props.route,
        props.currentNodeIndex,
        props.spots,
        props.artworkBounds,
        props.rotationDegrees
      ] as const,
    render,
    { immediate: true, deep: true }
  )
  onBeforeUnmount(() => group.remove())
</script>

<template><span class="headless-map-layer" aria-hidden="true" /></template>

<style lang="scss">
  .route-node-host {
    background: transparent;
    border: 0;
  }

  .route-node {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    color: #fff;
    cursor: pointer;
    background: #765329;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgb(50 40 25 / 28%);
    transition:
      transform 200ms ease-out,
      background 200ms ease-out;

    &.is-current {
      width: 36px;
      height: 36px;
      background: #c78025;
      transform: scale(1.04);
    }
  }
</style>
