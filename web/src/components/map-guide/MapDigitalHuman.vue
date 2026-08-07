<script setup lang="ts">
  import { ref } from 'vue'
  import DigitalHumanAvatar from '@/components/digital-human/DigitalHumanAvatar.vue'
  import DigitalHumanNarrationDock from './DigitalHumanNarrationDock.vue'
  import type { AvatarDisplayState, NarrationSegment, NarrationState } from '@/types/map-guide'
  import type { AvatarNarrationHandle } from '@/composables/map-guide/avatar-narration-adapter'

  defineProps<{
    displayState: AvatarDisplayState
    narrationState: NarrationState
    segments: NarrationSegment[]
    segmentIndex: number
    fallbackText?: string
    progress?: number
  }>()

  const emit = defineEmits<{
    start: []
    expand: []
    compact: []
    pause: []
    resume: []
    stop: []
    ready: []
    error: [message: string]
  }>()

  const avatarRef = ref<InstanceType<typeof DigitalHumanAvatar>>()

  function enableAvatarAudio() {
    return avatarRef.value?.enableAudio()
  }

  function startNarration() {
    void enableAvatarAudio()
    emit('start')
  }

  function expandNarration() {
    void enableAvatarAudio()
    emit('expand')
  }

  const handle: AvatarNarrationHandle = {
    enableAudio: enableAvatarAudio,
    speak: (text, emotion) => avatarRef.value?.speak(text, emotion) ?? Promise.resolve(false),
    speakAudio: (url) => avatarRef.value?.speakAudio(url) ?? Promise.resolve(false),
    pause: () => avatarRef.value?.pause(),
    resume: () => avatarRef.value?.resume(),
    interrupt: () => avatarRef.value?.interrupt(),
    getStatus: () => avatarRef.value?.getStatus() || 'idle',
    getSubtitle: () => avatarRef.value?.getSubtitle() || ''
  }

  defineExpose({ handle })
</script>

<template>
  <aside class="map-digital-human" :class="`state-${displayState}`">
    <DigitalHumanAvatar
      ref="avatarRef"
      class="map-digital-human__engine"
      @ready="emit('ready')"
      @error="emit('error', $event)"
    />
    <button
      v-if="displayState !== 'speaking'"
      class="map-digital-human__trigger"
      type="button"
      :aria-label="$t('app.mapGuideClickNarration')"
      :title="$t('app.mapGuideClickNarration')"
      @click="displayState === 'idle' ? startNarration() : expandNarration()"
    />

    <div v-else class="map-digital-human__active-shell">
      <DigitalHumanNarrationDock
        class="map-digital-human__dock"
        :segments="segments"
        :segment-index="segmentIndex"
        :fallback-text="fallbackText"
        :state="narrationState"
        :progress="progress || 0"
        @pause="emit('pause')"
        @resume="emit('resume')"
        @stop="emit('stop')"
        @compact="emit('compact')"
      />
    </div>
  </aside>
</template>

<style scoped lang="scss">
  .map-digital-human {
    position: relative;
    z-index: 500;
    transition:
      width 290ms ease-out,
      transform 260ms ease-out;
  }

  .map-digital-human.state-idle,
  .map-digital-human.state-compact {
    position: absolute;
    right: 64px;
    bottom: 20px;
  }

  .map-digital-human.state-speaking {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .map-digital-human__trigger {
    display: block;
    width: 104px;
    height: 104px;
    padding: 0;
    cursor: pointer;
    background: rgb(255 255 252 / 98%);
    border: 1px solid rgb(50 92 81 / 24%);
    border-radius: 50%;
    box-shadow: 0 10px 26px rgb(25 50 42 / 20%);
    transition:
      transform 180ms ease-out,
      box-shadow 180ms ease-out;
  }

  .map-digital-human__trigger:hover {
    box-shadow: 0 13px 30px rgb(25 50 42 / 24%);
    transform: translateY(-2px);
  }

  .map-digital-human__trigger:focus-visible {
    outline: 3px solid rgb(57 120 109 / 42%);
    outline-offset: 3px;
  }

  .map-digital-human__engine {
    position: absolute;
    z-index: 3;
    overflow: hidden;
    pointer-events: none;
  }

  .map-digital-human__engine :deep(.dh-avatar),
  .map-digital-human__engine :deep(.dh-stage),
  .map-digital-human__engine :deep(.l2d-avatar),
  .map-digital-human__engine :deep(.l2d-stage) {
    border-radius: inherit;
  }

  .state-idle .map-digital-human__engine :deep(.dh-badge),
  .state-compact .map-digital-human__engine :deep(.dh-badge),
  .state-idle .map-digital-human__engine :deep(.dh-audio-mask),
  .state-compact .map-digital-human__engine :deep(.dh-audio-mask),
  .state-idle .map-digital-human__engine :deep(.l2d-badge),
  .state-compact .map-digital-human__engine :deep(.l2d-badge),
  .state-idle .map-digital-human__engine :deep(.l2d-audio-mask),
  .state-compact .map-digital-human__engine :deep(.l2d-audio-mask) {
    display: none;
  }

  .state-idle .map-digital-human__engine,
  .state-compact .map-digital-human__engine {
    inset: 7px;
    width: 90px;
    height: 90px;
    background: #fff;
    border-radius: 50%;
  }

  .state-idle .map-digital-human__engine :deep(.dh-host),
  .state-compact .map-digital-human__engine :deep(.dh-host),
  .state-idle .map-digital-human__engine :deep(.dh-avatar),
  .state-compact .map-digital-human__engine :deep(.dh-avatar),
  .state-idle .map-digital-human__engine :deep(.dh-stage),
  .state-compact .map-digital-human__engine :deep(.dh-stage),
  .state-idle .map-digital-human__engine :deep(.dh-loading),
  .state-compact .map-digital-human__engine :deep(.dh-loading),
  .state-idle .map-digital-human__engine :deep(.l2d-avatar),
  .state-compact .map-digital-human__engine :deep(.l2d-avatar),
  .state-idle .map-digital-human__engine :deep(.l2d-stage),
  .state-compact .map-digital-human__engine :deep(.l2d-stage) {
    background: #fff;
    border-radius: 50%;
  }

  .state-idle .map-digital-human__engine :deep(.l2d-canvas),
  .state-compact .map-digital-human__engine :deep(.l2d-canvas) {
    border-radius: 50%;
  }

  .state-idle .map-digital-human__engine :deep(.l2d-fallback-name),
  .state-compact .map-digital-human__engine :deep(.l2d-fallback-name),
  .state-idle .map-digital-human__engine :deep(.l2d-fallback-tip),
  .state-compact .map-digital-human__engine :deep(.l2d-fallback-tip) {
    display: none;
  }

  .state-idle .map-digital-human__engine :deep(.l2d-fallback-portrait),
  .state-compact .map-digital-human__engine :deep(.l2d-fallback-portrait) {
    width: 100%;
    max-height: 100%;
    margin: 0;
  }

  .state-speaking .map-digital-human__engine {
    top: 14px;
    right: 14px;
    left: 14px;
    height: clamp(210px, 38vh, 340px);
    pointer-events: auto;
    border: 1px solid rgb(50 92 81 / 14%);
    border-radius: 14px;
  }

  .map-digital-human__active-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }

  @media (width <= 760px) {
    .map-digital-human.state-speaking {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      width: 100%;
      height: min(38vh, 330px);
    }

    .map-digital-human.state-idle,
    .map-digital-human.state-compact {
      right: 58px;
      bottom: 14px;
      transform: scale(0.9);
      transform-origin: right bottom;
    }

    .state-speaking .map-digital-human__engine {
      top: 12px;
      right: 14px;
      left: 14px;
      height: 120px;
    }

    .map-digital-human__trigger {
      width: 92px;
      height: 92px;
    }

    .state-idle .map-digital-human__engine,
    .state-compact .map-digital-human__engine {
      inset: 6px;
      width: 80px;
      height: 80px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .map-digital-human,
    .map-digital-human__trigger {
      transition: none;
      animation: none;
    }
  }
</style>
