<script setup lang="ts">
  import { computed } from 'vue'
  import type { NarrationSegment, NarrationState } from '@/types/map-guide'

  const props = defineProps<{
    segments: NarrationSegment[]
    segmentIndex: number
    fallbackText?: string
    state: NarrationState
  }>()

  const currentText = computed(
    () => props.segments[props.segmentIndex]?.text || props.fallbackText || ''
  )
</script>

<template>
  <div class="narration-subtitle" aria-live="polite">
    <span :class="`state-${state}`" />
    <p>{{ currentText }}</p>
  </div>
</template>

<style scoped lang="scss">
  .narration-subtitle {
    display: grid;
    grid-template-columns: 7px 1fr;
    gap: 9px;
    align-items: start;
    padding: 11px 12px;
    color: #e8f0ed;
    background: rgb(22 42 37 / 76%);
    border-radius: 9px;
  }

  .narration-subtitle > span {
    width: 7px;
    height: 7px;
    margin-top: 7px;
    background: #9aa9a3;
    border-radius: 50%;
  }

  .narration-subtitle > span.state-playing {
    background: #d5ad69;
  }

  .narration-subtitle p {
    max-height: 8.4em;
    margin: 0;
    overflow: auto;
    font-size: 13px;
    line-height: 1.7;
  }
</style>
