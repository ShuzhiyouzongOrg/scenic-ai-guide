<!--
  Live2D 数字人展示组件（讯飞数字人的本地兜底渲染）。
  在本地 canvas 上渲染 Live2D 模型，语音由后端 TTS 提供并实时驱动口型。
  对外暴露 speak()/enableAudio()/interrupt()，与讯飞组件接口一致，便于按引擎切换。
  加载失败时降级为静态形象 + 文本提示。
-->
<template>
  <div class="l2d-avatar" :class="`l2d-status-${live2d.status.value}`">
    <div class="l2d-stage">
      <!-- Live2D 渲染画布：用 v-show 保持挂载，确保初始化时能取到画布 -->
      <canvas
        ref="canvasRef"
        class="l2d-canvas"
        :class="{ 'is-visible': isRendering }"
        aria-hidden="true"
      ></canvas>

      <!-- 降级 / 加载态 -->
      <div v-if="!isRendering" class="l2d-fallback">
        <div
          class="l2d-loading-visual"
          :class="{ 'is-error': live2d.status.value === 'error' }"
          aria-hidden="true"
        >
          <span class="l2d-loading-orbit"></span>
          <span class="l2d-loading-core"></span>
        </div>
        <p class="l2d-fallback-name">{{ config?.name || $t('app.avatarGuideName') }}</p>
        <p class="l2d-fallback-tip">{{ fallbackTip }}</p>
      </div>

      <!-- 状态标签 -->
      <div class="l2d-badge">
        <span class="l2d-dot" :class="`dot-${live2d.status.value}`"></span>
        {{ statusText }}
      </div>

      <!-- 音频解锁提示 -->
      <div
        v-if="isRendering && !live2d.audioReady.value"
        class="l2d-audio-mask"
        @click="enableAudio"
      >
        <ElButton type="primary" round :icon="Microphone">{{
          $t('app.avatarEnableAudio')
        }}</ElButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { Microphone } from '@element-plus/icons-vue'
  import { useLive2dAvatar } from '@/composables/useLive2dAvatar'
  import type { DigitalHumanConfig } from '@/api/digital-human'
  import type { Live2dPresentation } from '@/lib/live2d/resource'

  defineOptions({ name: 'Live2dAvatar' })

  const { t } = useI18n()

  const props = withDefaults(
    defineProps<{
      config: DigitalHumanConfig | null
      presentation?: Live2dPresentation
    }>(),
    { presentation: 'stage' }
  )
  const emit = defineEmits<{
    (e: 'ready', config: DigitalHumanConfig | null): void
    (e: 'error', message: string): void
  }>()

  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const config = computed(() => props.config)
  const live2d = useLive2dAvatar()

  const isRendering = computed(() => ['ready', 'speaking'].includes(live2d.status.value))

  const statusText = computed(() => {
    switch (live2d.status.value) {
      case 'connecting':
        return t('app.avatarLoading')
      case 'ready':
        return t('app.avatarOnline')
      case 'speaking':
        return t('app.avatarSpeaking')
      case 'error':
        return t('app.avatarTextMode')
      default:
        return t('app.avatarIdle')
    }
  })

  const fallbackTip = computed(() => {
    if (live2d.status.value === 'connecting') return t('app.avatarModelLoading')
    if (live2d.status.value === 'error')
      return live2d.errorMessage.value || t('app.guideUnavailable')
    return t('app.avatarPreparing')
  })

  function onWinResize() {
    live2d.onResize()
  }

  async function init() {
    if (
      config.value &&
      (config.value.serviceStatus === 'text_only' || !config.value.assetAvailable)
    ) {
      live2d.status.value = 'error'
      live2d.errorMessage.value = t('app.avatarTextOnly')
      emit('ready', config.value)
      return
    }
    if (!canvasRef.value) {
      live2d.status.value = 'error'
      live2d.errorMessage.value = t('app.avatarTextOnly')
      emit('error', live2d.errorMessage.value)
      return
    }
    const ok = await live2d.start({
      modelId: config.value?.modelId,
      vcn: config.value?.vcn,
      speechRate: config.value?.speechRate,
      canvas: canvasRef.value,
      presentation: props.presentation
    })
    if (ok) {
      emit('ready', config.value)
      window.addEventListener('resize', onWinResize)
    } else {
      emit('error', live2d.errorMessage.value)
    }
  }

  async function speak(text: string, emotion?: string): Promise<boolean> {
    return live2d.speak(text, { emotion })
  }
  async function speakAudio(url: string): Promise<boolean> {
    return live2d.speakAudio(url)
  }
  function enableAudio() {
    return live2d.enableAudio()
  }
  function interrupt() {
    return live2d.interrupt()
  }
  function pause() {
    return live2d.pause()
  }
  function resume() {
    return live2d.resume()
  }
  function getStatus() {
    return live2d.status.value
  }
  function getSubtitle() {
    return ''
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
    status: live2d.status,
    audioReady: live2d.audioReady,
    config
  })

  onMounted(init)
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onWinResize)
    live2d.destroy()
  })
</script>

<style scoped lang="scss">
  .l2d-avatar {
    width: 100%;
    height: 100%;
  }

  .l2d-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: linear-gradient(160deg, #0f3d3e 0%, #135158 55%, #1c6b6b 100%);
    border-radius: 12px;
  }

  .l2d-canvas {
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 180ms ease-out;

    &.is-visible {
      opacity: 1;
    }
  }

  .l2d-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgb(255 255 255 / 88%);
    text-align: center;
  }

  .l2d-loading-visual {
    position: relative;
    display: grid;
    place-items: center;
    width: 92px;
    height: 92px;
    margin-bottom: 18px;
    background: radial-gradient(circle, rgb(255 255 255 / 16%) 0 38%, transparent 40%);
    border-radius: 50%;
    box-shadow: 0 12px 32px rgb(4 38 38 / 18%);
  }

  .l2d-loading-orbit {
    position: absolute;
    inset: 5px;
    border: 2px solid rgb(255 255 255 / 20%);
    border-top-color: #d4af37;
    border-right-color: #7fd8c9;
    border-radius: 50%;
    animation: l2d-loading-spin 1s linear infinite;
  }

  .l2d-loading-core {
    position: relative;
    width: 34px;
    height: 42px;
    background: linear-gradient(160deg, #f4d875, #d4af37);
    border-radius: 70% 70% 58% 58% / 78% 78% 42% 42%;
    box-shadow: 0 0 18px rgb(212 175 55 / 35%);
    transform: scale(0.72) rotate(45deg);

    &::before,
    &::after {
      position: absolute;
      width: 100%;
      height: 100%;
      content: '';
      background: inherit;
      border-radius: inherit;
    }

    &::before {
      transform: rotate(60deg);
    }

    &::after {
      transform: rotate(-60deg);
    }
  }

  .l2d-loading-visual.is-error {
    filter: grayscale(0.55);

    .l2d-loading-orbit {
      border-top-color: #f0a3a3;
      border-right-color: #f0a3a3;
      animation: none;
    }
  }

  .l2d-fallback-name {
    font-size: 16px;
    font-weight: 600;
  }

  .l2d-fallback-tip {
    margin-top: 6px;
    font-size: 12px;
    color: rgb(255 255 255 / 65%);
  }

  .l2d-audio-mask {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 24px;
    cursor: pointer;
    background: linear-gradient(to top, rgb(0 0 0 / 35%), transparent 40%);
  }

  .l2d-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    padding: 3px 10px;
    font-size: 12px;
    color: #fff;
    background: rgb(0 0 0 / 35%);
    border-radius: 999px;
  }

  .l2d-dot {
    width: 7px;
    height: 7px;
    margin-right: 6px;
    background: #909399;
    border-radius: 50%;

    &.dot-ready,
    &.dot-speaking {
      background: #3dcd9f;
    }

    &.dot-connecting {
      background: #e6a23c;
    }

    &.dot-error {
      background: #f56c6c;
    }
  }

  @keyframes l2d-loading-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .l2d-loading-orbit {
      animation: none;
    }
  }
</style>
