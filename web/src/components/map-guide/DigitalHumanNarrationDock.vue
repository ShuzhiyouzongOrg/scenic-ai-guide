<script setup lang="ts">
  import type { NarrationSegment, NarrationState } from '@/types/map-guide'
  import NarrationSubtitle from './NarrationSubtitle.vue'

  defineProps<{
    segments: NarrationSegment[]
    segmentIndex: number
    fallbackText?: string
    state: NarrationState
    progress: number
  }>()

  const emit = defineEmits<{ pause: []; resume: []; stop: []; compact: [] }>()
</script>

<template>
  <div class="digital-human-dock">
    <button
      class="digital-human-dock__compact"
      type="button"
      :aria-label="$t('app.mapGuideCollapseRouteDetails')"
      :title="$t('app.mapGuideCollapseRouteDetails')"
      @click="emit('compact')"
      ><ArtSvgIcon icon="ri:contract-left-right-line"
    /></button>
    <div class="digital-human-dock__avatar"><slot /></div>
    <NarrationSubtitle
      :segments="segments"
      :segment-index="segmentIndex"
      :fallback-text="fallbackText"
      :state="state"
    />
    <div class="digital-human-dock__progress"><span :style="{ width: `${progress}%` }" /></div>
    <footer>
      <button v-if="state === 'playing'" type="button" @click="emit('pause')"
        ><ArtSvgIcon icon="ri:pause-line" />{{ $t('app.mapGuidePause') }}</button
      >
      <button v-else type="button" @click="emit('resume')"
        ><ArtSvgIcon icon="ri:play-line" />{{ $t('app.mapGuideResume') }}</button
      >
      <button type="button" @click="emit('stop')"
        ><ArtSvgIcon icon="ri:stop-line" />{{ $t('app.mapGuideStop') }}</button
      >
    </footer>
  </div>
</template>

<style scoped lang="scss">
  .digital-human-dock {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 14px;
    overflow: hidden;
    color: #304a43;
    background: #fff;
    border-left: 1px solid rgb(50 92 81 / 14%);
  }

  .digital-human-dock__compact {
    position: absolute;
    top: 22px;
    right: 22px;
    z-index: 4;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: #385a52;
    cursor: pointer;
    background: rgb(255 255 252 / 90%);
    border: 1px solid rgb(50 92 81 / 16%);
    border-radius: 50%;
    box-shadow: 0 4px 12px rgb(25 50 42 / 12%);
  }

  .digital-human-dock__avatar {
    flex: 0 0 clamp(210px, 38vh, 340px);
    min-height: 210px;
    max-height: 340px;
    margin-bottom: 12px;
    overflow: hidden;
    border-radius: 14px;
  }

  .digital-human-dock__progress {
    flex: none;
    height: 3px;
    margin: 10px 0;
    background: rgb(50 92 81 / 12%);
    border-radius: 2px;
  }

  .digital-human-dock__progress span {
    display: block;
    height: 100%;
    background: #d4ad69;
    transition: width 180ms ease-out;
  }

  footer {
    display: flex;
    flex: none;
    gap: 7px;
  }

  footer button {
    display: inline-flex;
    flex: 1;
    gap: 5px;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    color: #f4f7f5;
    cursor: pointer;
    background: #3e5952;
    border: 1px solid #587068;
    border-radius: 8px;
  }

  .narration-subtitle {
    flex: 1 1 auto;
    min-height: 0;
  }

  :deep(.narration-subtitle) {
    color: #f5f8f7;
    background: #1c342e;
    border: 1px solid #405750;
  }

  @media (width <= 760px) {
    .digital-human-dock {
      padding: 14px;
    }

    .digital-human-dock__avatar {
      flex-basis: 120px;
      min-height: 120px;
      margin-bottom: 7px;
    }

    .digital-human-dock__compact {
      top: 19px;
      right: 20px;
    }
  }
</style>
