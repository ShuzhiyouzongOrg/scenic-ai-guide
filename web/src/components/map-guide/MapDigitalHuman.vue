<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DigitalHumanAvatar from '@/components/digital-human/DigitalHumanAvatar.vue'
  import DigitalHumanNarrationDock from './DigitalHumanNarrationDock.vue'
  import type { AvatarDisplayState, NarrationSegment, NarrationState } from '@/types/map-guide'
  import type { AvatarNarrationHandle } from '@/composables/map-guide/avatar-narration-adapter'

  const props = defineProps<{
    displayState: AvatarDisplayState
    narrationState: NarrationState
    title?: string
    guideName?: string
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
  const { t } = useI18n()
  const guideName = computed(() => props.guideName || t('app.mapGuideGuideName'))

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
      engine-override="xfyun"
      @ready="emit('ready')"
      @error="emit('error', $event)"
    />
    <button
      v-if="displayState === 'idle'"
      class="map-digital-human__idle"
      type="button"
      :aria-label="$t('app.mapGuideClickNarration')"
      :title="$t('app.mapGuideClickNarration')"
      @click="startNarration"
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
      <button
        v-if="displayState === 'compact'"
        class="map-digital-human__compact-label"
        type="button"
        @click="expandNarration"
      >
        <span
          ><strong>{{ title || guideName }}</strong
          ><small><i />{{ $t('app.mapGuideNarrating') }}</small></span
        >
      </button>
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

  .map-digital-human__idle {
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

  .map-digital-human__idle:hover {
    box-shadow: 0 13px 30px rgb(25 50 42 / 24%);
    transform: translateY(-2px);
  }

  .map-digital-human__idle:focus-visible {
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
  .map-digital-human__engine :deep(.dh-stage) {
    border-radius: inherit;
  }

  .state-idle .map-digital-human__engine :deep(.dh-badge),
  .state-compact .map-digital-human__engine :deep(.dh-badge),
  .state-idle .map-digital-human__engine :deep(.dh-audio-mask),
  .state-compact .map-digital-human__engine :deep(.dh-audio-mask) {
    display: none;
  }

  .state-idle .map-digital-human__engine {
    inset: 7px;
    width: 90px;
    height: 90px;
    background: #fff;
    border-radius: 50%;
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

  .state-compact .map-digital-human__engine {
    top: 0;
    left: 0;
    width: 78px;
    height: 82px;
    border-radius: 42px;
  }

  .map-digital-human__compact strong,
  .map-digital-human__compact small {
    display: block;
  }

  .map-digital-human__active-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .state-compact .map-digital-human__active-shell {
    width: 250px;
    height: 82px;
    overflow: hidden;
    background: #29483f;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 46px 12px 12px 46px;
    box-shadow: 0 10px 28px rgb(20 38 33 / 24%);
  }

  .state-compact .map-digital-human__dock {
    padding: 0;
    background: transparent;
  }

  .state-compact .map-digital-human__dock :deep(.digital-human-dock__compact),
  .state-compact .map-digital-human__dock :deep(.narration-subtitle),
  .state-compact .map-digital-human__dock :deep(.digital-human-dock__progress),
  .state-compact .map-digital-human__dock :deep(footer) {
    display: none;
  }

  .state-compact .map-digital-human__dock :deep(.digital-human-dock__avatar) {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 78px;
    min-height: 0;
    margin: 0;
    border-radius: 42px;
  }

  .map-digital-human__compact-label {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: 78px 1fr;
    align-items: center;
    width: 100%;
    padding: 7px 12px 7px 7px;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
  }

  .map-digital-human__compact-label > span {
    grid-column: 2;
    min-width: 0;
  }

  .map-digital-human__compact-label strong,
  .map-digital-human__compact-label small {
    display: block;
  }

  .map-digital-human__compact-label strong {
    overflow: hidden;
    font-size: 12px;
    color: #fff;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-digital-human__compact-label small {
    margin-top: 5px;
    font-size: 10px;
    color: #d4bb8a;
  }

  .map-digital-human__compact-label small i {
    display: inline-block;
    width: 5px;
    height: 13px;
    margin-right: 5px;
    vertical-align: middle;
    background: #d4ae69;
    border-radius: 3px;
    animation: audio-wave 900ms ease-in-out infinite alternate;
  }

  @keyframes audio-wave {
    to {
      height: 5px;
    }
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

    .map-digital-human__idle {
      width: 92px;
      height: 92px;
    }

    .state-idle .map-digital-human__engine {
      inset: 6px;
      width: 80px;
      height: 80px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .map-digital-human,
    .map-digital-human__idle,
    .map-digital-human__compact-label small i {
      transition: none;
      animation: none;
    }
  }
</style>
