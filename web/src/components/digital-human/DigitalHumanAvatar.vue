<!--
  数字人展示组件（引擎调度器）。
  读取后台启用的数字人配置，按 engine 选择渲染引擎：
    - xfyun：讯飞云端流式数字人（XfAvatar）
    - live2d：本地 Live2D 画布数字人（Live2dAvatar）——讯飞的本地兜底方案
  两套引擎互为冗余：任一引擎不可用时，管理员在后台切换到另一个即可。
  对外暴露 speak()/enableAudio()/interrupt()，转发给当前引擎，调用方无需感知差异。
-->
<template>
  <div class="dh-host">
    <Transition name="dh-fade" mode="out-in">
      <!-- 未取到配置前显示占位，避免闪烁 -->
      <div v-if="!loaded" key="loading" class="dh-loading">
        <div class="dh-loading-inner">
          <span class="dh-spinner"></span>
          <p>{{ $t('app.guideConnecting') }}</p>
        </div>
      </div>

      <Live2dAvatar
        v-else-if="engine === 'live2d'"
        key="live2d"
        ref="childRef"
        :config="effectiveConfig"
        @ready="onReady"
        @error="onError"
      />

      <XfAvatar
        v-else
        key="xfyun"
        ref="childRef"
        :config="config"
        @ready="onReady"
        @error="onError"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import XfAvatar from './XfAvatar.vue'
  import Live2dAvatar from './Live2dAvatar.vue'
  import {
    fetchActiveDigitalHuman,
    type DigitalHumanConfig,
    type DigitalHumanEngine
  } from '@/api/digital-human'

  defineOptions({ name: 'DigitalHumanAvatar' })

  const props = withDefaults(
    defineProps<{
      preferLocalFallback?: boolean
      fallbackModelId?: string
      engineOverride?: DigitalHumanEngine
    }>(),
    { preferLocalFallback: false, fallbackModelId: 'Kei' }
  )

  const emit = defineEmits<{
    (e: 'ready', config: DigitalHumanConfig | null): void
    (e: 'error', message: string): void
    (e: 'speak-end'): void
  }>()

  interface AvatarChild {
    speak: (text: string, emotion?: string) => Promise<boolean>
    speakAudio?: (url: string) => Promise<boolean>
    enableAudio: () => void | Promise<void>
    interrupt: () => void | Promise<void>
    pause?: () => void | Promise<void>
    resume?: () => void | Promise<void>
    getStatus?: () => 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'
    getSubtitle?: () => string
  }

  const config = ref<DigitalHumanConfig | null>(null)
  const loaded = ref(false)
  const childRef = ref<AvatarChild | null>(null)
  const forceLocalFallback = ref(false)

  const engine = computed(() =>
    forceLocalFallback.value ? 'live2d' : props.engineOverride || config.value?.engine || 'xfyun'
  )
  const effectiveConfig = computed<DigitalHumanConfig | null>(() => {
    if (!forceLocalFallback.value) return config.value
    return {
      id: config.value?.id || 'map-local-fallback',
      name: config.value?.name || 'Scenic guide',
      engine: 'live2d',
      avatarId: config.value?.avatarId || '',
      vcn: config.value?.vcn || '',
      modelId: props.fallbackModelId,
      welcomeText: config.value?.welcomeText || '',
      speechRate: config.value?.speechRate || 50,
      emotionStyle: config.value?.emotionStyle || 'neutral',
      serviceStatus: 'online',
      enabled: true,
      assetAvailable: true
    }
  })

  function onReady() {
    emit('ready', config.value)
  }
  function onError(message: string) {
    if (props.preferLocalFallback && !forceLocalFallback.value) {
      forceLocalFallback.value = true
      return
    }
    emit('error', message)
  }

  // ---- 转发给当前引擎 ----
  async function speak(text: string, emotion?: string): Promise<boolean> {
    return (await childRef.value?.speak(text, emotion)) ?? false
  }
  async function speakAudio(url: string): Promise<boolean> {
    return (await childRef.value?.speakAudio?.(url)) ?? false
  }
  function enableAudio() {
    return childRef.value?.enableAudio()
  }
  function interrupt() {
    return childRef.value?.interrupt()
  }

  function pause() {
    return childRef.value?.pause?.() ?? childRef.value?.interrupt()
  }

  function resume() {
    return childRef.value?.resume?.()
  }

  function getStatus() {
    return childRef.value?.getStatus?.() || 'idle'
  }

  function getSubtitle() {
    return childRef.value?.getSubtitle?.() || ''
  }

  defineExpose({
    speak,
    speakAudio,
    enableAudio,
    pause,
    resume,
    interrupt,
    getStatus,
    getSubtitle,
    config
  })

  onMounted(async () => {
    try {
      config.value = await fetchActiveDigitalHuman()
    } catch {
      config.value = null
    } finally {
      if (
        props.preferLocalFallback &&
        (!config.value || config.value.serviceStatus !== 'online' || !config.value.assetAvailable)
      ) {
        forceLocalFallback.value = true
      }
      loaded.value = true
    }
  })
</script>

<style scoped lang="scss">
  .dh-host {
    width: 100%;
    height: 100%;
  }

  .dh-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(160deg, #0f3d3e 0%, #135158 55%, #1c6b6b 100%);
    border-radius: 12px;
  }

  .dh-loading-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 13px;
    color: rgb(255 255 255 / 80%);
  }

  .dh-spinner {
    width: 26px;
    height: 26px;
    margin-bottom: 10px;
    border: 3px solid rgb(255 255 255 / 25%);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: dh-spin 0.8s linear infinite;
  }

  @keyframes dh-spin {
    to {
      transform: rotate(360deg);
    }
  }

  // 引擎切换时的淡入淡出
  .dh-fade-enter-active,
  .dh-fade-leave-active {
    transition: opacity 0.35s ease;
  }

  .dh-fade-enter-from,
  .dh-fade-leave-to {
    opacity: 0;
  }
</style>
