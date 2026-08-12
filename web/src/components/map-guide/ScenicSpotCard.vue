<script setup lang="ts">
  import type { ScenicSpot } from '@/types/map-guide'

  defineProps<{
    spot: ScenicSpot
    panoramaAvailable: boolean
    originalAudioAvailable: boolean
    searchPanelOpen: boolean
  }>()
  const emit = defineEmits<{
    close: []
    narrate: [spot: ScenicSpot]
    narrateOriginal: [spot: ScenicSpot]
    panorama: [spot: ScenicSpot]
    navigate: [spot: ScenicSpot]
  }>()
</script>

<template>
  <article
    class="scenic-spot-card"
    :class="{ 'no-cover': !spot.media.coverUrl, 'search-panel-open': searchPanelOpen }"
  >
    <button class="scenic-spot-card__close" type="button" aria-label="Close" @click="emit('close')">
      <ArtSvgIcon icon="ri:close-line" />
    </button>
    <img
      v-if="spot.media.coverUrl"
      :src="spot.media.coverUrl"
      :alt="spot.name"
      loading="lazy"
      @error="($event.target as HTMLImageElement).style.display = 'none'"
    />
    <div class="scenic-spot-card__body">
      <small>{{ spot.categoryName }}</small>
      <h2>{{ spot.name }}</h2>
      <p>{{ spot.description || spot.detail || '—' }}</p>
      <div class="scenic-spot-card__actions">
        <button class="primary" type="button" @click="emit('narrate', spot)">
          <ArtSvgIcon icon="ri:speak-line" />{{ $t('app.mapGuideStartNarration') }}
        </button>
        <button v-if="originalAudioAvailable" type="button" @click="emit('narrateOriginal', spot)">
          <ArtSvgIcon icon="ri:headphone-line" />{{ $t('app.mapGuideOriginalAudio') }}
        </button>
        <button v-if="panoramaAvailable" type="button" @click="emit('panorama', spot)">
          <ArtSvgIcon icon="ri:drag-move-2-line" />{{ $t('app.mapGuidePanorama') }}
        </button>
        <button type="button" @click="emit('navigate', spot)"
          ><ArtSvgIcon icon="ri:navigation-line"
        /></button>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
  .scenic-spot-card {
    position: absolute;
    bottom: 18px;
    left: 50%;
    z-index: 440;
    display: grid;
    grid-template-columns: 122px 1fr;
    width: min(560px, calc(100% - 92px));
    min-height: 142px;
    overflow: hidden;
    color: #324942;
    background: rgb(255 255 251 / 80%);
    border: 1px solid rgb(57 92 82 / 16%);
    border-radius: 15px;
    box-shadow: 0 12px 30px rgb(28 49 42 / 18%);
    transform: translateX(-50%);
    animation: spot-card-in 220ms ease-out;
  }

  @media (width > 760px) {
    .scenic-spot-card.search-panel-open {
      // Keep a 12px gap from the 300px search panel while preserving the map-centred anchor.
      width: min(560px, max(340px, calc(100% - 656px)));
    }
  }

  .scenic-spot-card > img {
    width: 122px;
    height: 100%;
    min-height: 142px;
    object-fit: cover;
    background: #edf0ea;
  }

  .scenic-spot-card.no-cover {
    grid-template-columns: 1fr;
  }

  .scenic-spot-card__body {
    min-width: 0;
    padding: 15px 44px 13px 16px;
  }

  .scenic-spot-card__body > small {
    color: #a46e27;
  }

  .scenic-spot-card h2 {
    margin: 3px 0 6px;
    font-size: 19px;
  }

  .scenic-spot-card p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.6;
    color: #63736e;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .scenic-spot-card__close {
    position: absolute;
    top: 9px;
    right: 9px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    cursor: pointer;
    background: #f2f4ef;
    border: 0;
    border-radius: 50%;
  }

  .scenic-spot-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 10px;
  }

  .scenic-spot-card__actions button {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 10px;
    color: #4c665f;
    white-space: nowrap;
    cursor: pointer;
    background: #f0f3ee;
    border: 0;
    border-radius: 8px;
  }

  .scenic-spot-card__actions button.primary {
    color: #fff;
    background: #39786d;
  }

  @keyframes spot-card-in {
    from {
      opacity: 0;
      transform: translate(-50%, 12px);
    }
  }

  @media (width <= 600px) {
    .scenic-spot-card {
      right: 10px;
      bottom: 86px;
      left: 10px;
      grid-template-columns: 84px 1fr;
      width: auto;
      min-height: 112px;
      transform: none;
    }

    .scenic-spot-card > img {
      width: 84px;
      min-height: 112px;
    }

    .scenic-spot-card__body {
      padding: 11px 36px 10px 11px;
    }

    .scenic-spot-card h2 {
      font-size: 16px;
    }

    .scenic-spot-card__actions button {
      padding: 0 8px;
    }

    @keyframes spot-card-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
  }
</style>
