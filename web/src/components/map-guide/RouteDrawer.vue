<script setup lang="ts">
  import type { GuideRoute } from '@/types/map-guide'

  defineProps<{
    open: boolean
    routes: GuideRoute[]
    selectedRouteId?: string
  }>()

  const emit = defineEmits<{
    close: []
    select: [route: GuideRoute]
  }>()
</script>

<template>
  <aside class="route-drawer" :class="{ open }" :aria-hidden="!open">
    <header>
      <div>
        <small>{{ $t('app.mapGuideRouteOfficial') }}</small>
        <h2>{{ $t('app.mapGuideRoutes') }}</h2>
        <p>{{ $t('app.mapGuideOfficialRouteHint') }}</p>
      </div>
      <button type="button" @click="emit('close')"><ArtSvgIcon icon="ri:close-line" /></button>
    </header>

    <div class="route-drawer__list">
      <button
        v-for="route in routes"
        :key="route.id"
        class="route-card"
        type="button"
        :class="{ selected: selectedRouteId === route.id }"
        @click="emit('select', route)"
      >
        <span class="route-card__content">
          <span class="route-card__badge">{{ $t('app.mapGuideRouteOfficial') }}</span>
          <strong>{{ route.name }}</strong>
          <span class="route-card__description">{{ route.description }}</span>
          <span class="route-card__meta">
            <span><ArtSvgIcon icon="ri:time-line" />{{ route.durationMinutes || '—' }} min</span>
            <span><ArtSvgIcon icon="ri:map-pin-line" />{{ route.nodes.length }}</span>
          </span>
        </span>
        <ArtSvgIcon class="route-card__arrow" icon="ri:arrow-right-s-line" />
      </button>
      <p v-if="!routes.length" class="route-drawer__empty">{{ $t('app.mapGuideNoRoutes') }}</p>
    </div>
  </aside>
</template>

<style scoped lang="scss">
  .route-drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 470;
    box-sizing: border-box;
    width: min(380px, 92vw);
    padding: 22px 18px 18px;
    overflow: hidden;
    color: #314943;
    pointer-events: none;
    visibility: hidden;
    background: #fbfbf6;
    border-right: 1px solid #dde2da;
    box-shadow: 10px 0 30px rgb(25 47 40 / 14%);
    transition:
      transform 280ms ease-out,
      visibility 280ms;
    transform: translateX(-100%);

    &.open {
      pointer-events: auto;
      visibility: visible;
      transform: translateX(0);
    }
  }

  header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0 2px 16px;
    border-bottom: 1px solid #e5e8e1;
  }

  header small {
    font-size: 10px;
    color: #9d6a28;
    letter-spacing: 0.06em;
  }

  header h2 {
    margin: 3px 0 4px;
    font-size: 21px;
    font-weight: 650;
  }

  header p {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: #77847f;
  }

  header button {
    display: grid;
    flex: none;
    place-items: center;
    width: 34px;
    height: 34px;
    color: #455f58;
    cursor: pointer;
    background: #eef1eb;
    border: 0;
    border-radius: 9px;
  }

  .route-drawer__list {
    height: calc(100% - 104px);
    padding: 14px 2px 0;
    overflow: auto;
  }

  .route-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px;
    gap: 12px;
    align-items: center;
    width: 100%;
    min-height: 108px;
    padding: 14px 13px 12px 15px;
    margin-bottom: 9px;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: #fff;
    border: 1px solid #e2e6df;
    border-radius: 12px;
    transition:
      background 160ms ease-out,
      border-color 160ms ease-out,
      transform 160ms ease-out;
  }

  .route-card:hover {
    background: #fdfdf9;
    border-color: #bbc9c0;
    transform: translateY(-1px);
  }

  .route-card.selected {
    background: #f3f7f2;
    border-color: #4f7b71;
  }

  .route-card__badge {
    display: inline-block;
    width: fit-content;
    padding: 3px 7px;
    margin-bottom: 7px;
    font-size: 9px;
    color: #8d5e22;
    background: #f4ead9;
    border: 1px solid #ead8b8;
    border-radius: 999px;
  }

  .route-card__content {
    display: block;
    min-width: 0;
  }

  .route-card__content > strong {
    display: block;
    margin-bottom: 4px;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .route-card__description {
    display: -webkit-box;
    min-height: 32px;
    overflow: hidden;
    font-size: 11px;
    line-height: 1.45;
    color: #76847e;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .route-card__meta {
    display: flex;
    gap: 11px;
    margin-top: 7px;
    font-size: 10px;
    color: #66766f;
  }

  .route-card__meta > span {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }

  .route-card__arrow {
    color: #71827b;
  }

  .route-drawer__empty {
    padding: 60px 0;
    color: #8a9792;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .route-drawer,
    .route-card {
      transition: none;
    }
  }
</style>
