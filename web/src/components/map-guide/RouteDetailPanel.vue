<script setup lang="ts">
  import type { GuideRoute, GuideRouteNode } from '@/types/map-guide'

  defineProps<{
    route: GuideRoute
    currentIndex: number
    playing: boolean
    panoramaAvailable: boolean
  }>()
  const emit = defineEmits<{
    selectNode: [node: GuideRouteNode, index: number]
    start: []
    pause: []
    next: []
    panorama: [node: GuideRouteNode | undefined]
    close: []
    clear: []
  }>()
</script>

<template>
  <section class="route-detail-panel">
    <header>
      <div>
        <small>{{ $t('app.mapGuideRouteOfficial') }}</small>
        <h3>{{ route.name }}</h3>
      </div>
      <button
        type="button"
        :aria-label="$t('app.mapGuideCollapseRouteDetails')"
        :title="$t('app.mapGuideCollapseRouteDetails')"
        @click="emit('close')"
      >
        <ArtSvgIcon icon="ri:close-line" />
      </button>
    </header>

    <div class="route-detail-panel__nodes">
      <button
        v-for="(node, index) in route.nodes"
        :key="node.id"
        type="button"
        :class="{ current: index === currentIndex }"
        @click="emit('selectNode', node, index)"
      >
        <span>{{ node.order }}</span>
        <strong>{{ node.name }}</strong>
        <small>{{ node.stayMinutes || 5 }} min</small>
      </button>
    </div>

    <footer>
      <div class="route-detail-panel__primary-actions">
        <button class="primary" type="button" @click="playing ? emit('pause') : emit('start')">
          <ArtSvgIcon :icon="playing ? 'ri:pause-line' : 'ri:play-line'" />
          {{ playing ? $t('app.mapGuidePause') : $t('app.mapGuideStartNarration') }}
        </button>
        <button type="button" @click="emit('next')">
          <ArtSvgIcon icon="ri:skip-forward-line" />{{ $t('app.mapGuideNextStop') }}
        </button>
        <button
          v-if="panoramaAvailable"
          type="button"
          @click="emit('panorama', route.nodes[currentIndex])"
        >
          <ArtSvgIcon icon="ri:drag-move-2-line" />{{ $t('app.mapGuidePanorama') }}
        </button>
      </div>

      <div class="route-detail-panel__secondary-actions">
        <button class="clear-route" type="button" @click="emit('clear')">
          <ArtSvgIcon icon="ri:delete-bin-line" />{{ $t('app.mapGuideClearRoute') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
  .route-detail-panel {
    position: absolute;
    top: 16px;
    right: 62px;
    z-index: 425;
    box-sizing: border-box;
    width: min(560px, calc(100% - 86px));
    padding: 16px;
    color: #304a43;
    background: rgb(255 255 250 / 80%);
    border: 1px solid rgb(70 91 76 / 20%);
    border-radius: 14px;
    box-shadow: 0 12px 30px rgb(28 50 43 / 16%);
  }

  header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
  }

  header small {
    font-size: 10px;
    color: #9a6a2a;
    letter-spacing: 0.04em;
  }

  header h3 {
    margin: 3px 0 0;
    font-size: 17px;
    font-weight: 650;
  }

  header button {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    color: #49615a;
    cursor: pointer;
    background: #eff1eb;
    border: 0;
    border-radius: 8px;
  }

  .route-detail-panel__nodes {
    display: grid;
    grid-auto-columns: minmax(112px, 132px);
    grid-auto-flow: column;
    gap: 7px;
    padding: 13px 0 10px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: thin;
  }

  .route-detail-panel__nodes button {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 9px 10px;
    text-align: left;
    cursor: pointer;
    background: #f2f3ed;
    border: 1px solid transparent;
    border-radius: 9px;
  }

  .route-detail-panel__nodes button.current {
    color: #fff;
    background: #4b766e;
  }

  .route-detail-panel__nodes span {
    display: grid;
    place-items: center;
    width: 21px;
    height: 21px;
    font-size: 10px;
    color: #fff;
    background: #a9742d;
    border-radius: 50%;
  }

  .route-detail-panel__nodes strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .route-detail-panel__nodes small {
    color: inherit;
    opacity: 0.7;
  }

  footer {
    display: flex;
    gap: 8px 12px;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid #e5e7df;
  }

  .route-detail-panel__primary-actions,
  .route-detail-panel__secondary-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .route-detail-panel__secondary-actions {
    justify-content: flex-end;
  }

  footer button {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 7px 10px;
    color: #3d655e;
    white-space: nowrap;
    cursor: pointer;
    background: #edf1ec;
    border: 1px solid transparent;
    border-radius: 8px;
  }

  footer button.primary {
    color: #fff;
    background: #39776d;
  }

  footer .clear-route {
    color: #765741;
    background: #f5efe8;
    border-color: #eadfd3;
  }

  @media (width <= 1280px) {
    .route-detail-panel {
      width: min(500px, calc(100% - 86px));
    }

    footer {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (width <= 760px) {
    .route-detail-panel {
      inset: auto 10px 10px;
      width: auto;
      padding: 13px;
    }

    footer,
    .route-detail-panel__primary-actions,
    .route-detail-panel__secondary-actions {
      flex-wrap: wrap;
    }

    .route-detail-panel__primary-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    footer button {
      min-width: 0;
    }

    .route-detail-panel__secondary-actions {
      width: 100%;
    }
  }
</style>
