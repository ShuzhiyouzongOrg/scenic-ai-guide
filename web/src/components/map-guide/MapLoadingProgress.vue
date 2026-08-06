<script setup lang="ts">
  defineProps<{ progress: number; failedCount: number; visible: boolean }>()
  const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="visible" class="map-loading-progress" role="status" aria-live="polite">
    <div class="map-loading-progress__row">
      <span>{{ $t('app.mapGuideTileProgress', { progress }) }}</span>
      <button v-if="failedCount" type="button" @click="emit('retry')">{{
        $t('app.mapGuideRetry')
      }}</button>
    </div>
    <div class="map-loading-progress__track">
      <span :style="{ width: `${progress}%` }" />
    </div>
    <small v-if="failedCount">{{ $t('app.mapGuideTileFailure') }} · {{ failedCount }}</small>
  </div>
</template>

<style scoped lang="scss">
  .map-loading-progress {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 450;
    width: min(360px, calc(100% - 32px));
    padding: 10px 14px;
    color: #314d48;
    background: rgb(255 255 252 / 94%);
    border: 1px solid rgb(60 104 94 / 18%);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgb(30 50 43 / 13%);
    transform: translateX(-50%);
  }

  .map-loading-progress__row {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    font-size: 13px;
  }

  .map-loading-progress__row button {
    color: #277168;
    cursor: pointer;
    background: none;
    border: 0;
  }

  .map-loading-progress__track {
    height: 4px;
    margin-top: 7px;
    overflow: hidden;
    background: #dde5df;
    border-radius: 3px;
  }

  .map-loading-progress__track span {
    display: block;
    height: 100%;
    background: #397a70;
    transition: width 180ms ease-out;
  }

  .map-loading-progress small {
    display: block;
    margin-top: 5px;
    color: #9b641e;
  }
</style>
