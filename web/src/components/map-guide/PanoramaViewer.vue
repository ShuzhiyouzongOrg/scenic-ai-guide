<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import type { PanoramaRecord } from '@/types/map-guide'

  const props = defineProps<{ panorama: PanoramaRecord; open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const frameKey = ref(0)
  let watchdog: number | undefined

  const safePanoramaUrl = computed(() => {
    try {
      const parsed = new URL(props.panorama.url)
      if (parsed.protocol !== 'https:') return ''
      const configured = String(import.meta.env.VITE_MAP_PANORAMA_HOSTS || '720yun.com')
        .split(',')
        .map((host) => host.trim().toLocaleLowerCase())
        .filter(Boolean)
      const allowed = configured.some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      )
      return allowed ? parsed.toString() : ''
    } catch {
      return ''
    }
  })

  function clearWatchdog() {
    if (watchdog !== undefined) window.clearTimeout(watchdog)
    watchdog = undefined
  }

  function load() {
    clearWatchdog()
    status.value = 'loading'
    if (!safePanoramaUrl.value) {
      status.value = 'error'
      return
    }
    frameKey.value += 1
    watchdog = window.setTimeout(() => {
      if (status.value === 'loading') status.value = 'error'
    }, 15000)
  }

  function loaded() {
    clearWatchdog()
    status.value = 'ready'
  }

  function failed() {
    clearWatchdog()
    status.value = 'error'
  }

  function openExternal() {
    if (safePanoramaUrl.value) {
      window.open(safePanoramaUrl.value, '_blank', 'noopener,noreferrer')
    }
  }

  watch(
    () => props.open,
    (open) => {
      if (open) load()
      else {
        clearWatchdog()
        status.value = 'idle'
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(clearWatchdog)
</script>

<template>
  <section v-if="open" class="panorama-viewer">
    <iframe
      v-if="status !== 'error'"
      :key="frameKey"
      :src="safePanoramaUrl"
      :title="panorama.title"
      allow="fullscreen; gyroscope; accelerometer"
      referrerpolicy="strict-origin-when-cross-origin"
      @load="loaded"
      @error="failed"
    />
    <div v-if="status === 'loading'" class="panorama-viewer__loading">
      <span class="panorama-viewer__spinner" />{{ $t('app.mapGuidePanoramaLoading') }}
    </div>
    <div v-if="status === 'error'" class="panorama-viewer__fallback">
      <img v-if="panorama.coverUrl" :src="panorama.coverUrl" :alt="panorama.title" />
      <ArtSvgIcon v-else icon="ri:landscape-line" class="panorama-viewer__placeholder" />
      <h2>{{ panorama.title }}</h2>
      <p>{{ panorama.description }}</p>
      <div
        ><button type="button" @click="load">{{ $t('app.mapGuideRetry') }}</button
        ><button type="button" @click="openExternal">{{
          $t('app.mapGuidePanoramaExternal')
        }}</button></div
      >
    </div>
    <header>
      <button type="button" @click="emit('close')"
        ><ArtSvgIcon icon="ri:arrow-left-line" />{{ $t('app.mapGuidePanoramaBack') }}</button
      >
    </header>
  </section>
</template>

<style scoped lang="scss">
  .panorama-viewer {
    position: absolute;
    inset: 0;
    z-index: 600;
    overflow: hidden;
    color: #fff;
    background: #1f2925;
  }

  .panorama-viewer iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }

  .panorama-viewer header {
    position: absolute;
    top: 14px;
    left: 14px;
  }

  .panorama-viewer header button {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    min-height: 34px;
    padding: 0 9px;
    color: #fff;
    cursor: pointer;
    background: rgb(255 255 255 / 12%);
    border: 1px solid rgb(255 255 255 / 18%);
    border-radius: 7px;
  }

  .panorama-viewer__loading,
  .panorama-viewer__fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    place-items: center;
    text-align: center;
  }

  .panorama-viewer__loading {
    z-index: 1;
    gap: 12px;
    background: #2b3631;
  }

  .panorama-viewer__spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgb(255 255 255 / 24%);
    border-top-color: #d4ae70;
    border-radius: 50%;
    animation: panorama-spin 0.9s linear infinite;
  }

  .panorama-viewer__fallback {
    gap: 12px;
    padding: 24px;
    background: linear-gradient(145deg, #34453f, #202b27);
  }

  .panorama-viewer__fallback img {
    width: min(560px, 86vw);
    max-height: 44vh;
    object-fit: cover;
    border-radius: 12px;
  }

  .panorama-viewer__placeholder {
    font-size: 64px;
    color: #c6a66c;
  }

  .panorama-viewer__fallback h2,
  .panorama-viewer__fallback p {
    max-width: 640px;
    margin: 0;
  }

  .panorama-viewer__fallback p {
    color: rgb(255 255 255 / 68%);
  }

  .panorama-viewer__fallback button {
    padding: 9px 14px;
    margin: 0 4px;
    color: #fff;
    cursor: pointer;
    background: #3d776c;
    border: 0;
    border-radius: 8px;
  }

  @keyframes panorama-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panorama-viewer__spinner {
      animation: none;
    }
  }
</style>
