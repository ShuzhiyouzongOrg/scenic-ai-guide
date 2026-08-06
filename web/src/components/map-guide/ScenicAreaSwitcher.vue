<script setup lang="ts">
  import type { ScenicAreaId } from '@/types/map-guide'

  defineProps<{ modelValue: ScenicAreaId; loading?: boolean }>()

  const emit = defineEmits<{
    'update:modelValue': [areaId: ScenicAreaId]
  }>()

  const areas: ReadonlyArray<{
    id: ScenicAreaId
    labelKey: 'app.mapGuideAreaLingshan' | 'app.mapGuideAreaNianhuawan'
  }> = [
    { id: 'lingshan', labelKey: 'app.mapGuideAreaLingshan' },
    { id: 'nianhuawan', labelKey: 'app.mapGuideAreaNianhuawan' }
  ]
</script>

<template>
  <nav class="scenic-area-switcher" :aria-label="$t('app.mapGuideAreaSelect')">
    <span class="scenic-area-switcher__icon" aria-hidden="true">
      <ArtSvgIcon icon="ri:landscape-line" />
    </span>
    <button
      v-for="area in areas"
      :key="area.id"
      type="button"
      :class="{ active: modelValue === area.id }"
      :aria-pressed="modelValue === area.id"
      :disabled="loading"
      @click="emit('update:modelValue', area.id)"
    >
      {{ $t(area.labelKey) }}
    </button>
  </nav>
</template>

<style scoped lang="scss">
  .scenic-area-switcher {
    position: absolute;
    top: 16px;
    left: 50%;
    z-index: 450;
    display: grid;
    grid-template-columns: 30px repeat(2, minmax(92px, 1fr));
    gap: 3px;
    align-items: center;
    min-width: 246px;
    padding: 4px;
    background: rgb(255 255 251 / 96%);
    border: 1px solid rgb(54 87 77 / 18%);
    border-radius: 8px;
    box-shadow: 0 8px 22px rgb(29 50 43 / 16%);
    transform: translateX(-50%);
  }

  .scenic-area-switcher__icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: #426c63;
  }

  .scenic-area-switcher button {
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    color: #5b6e68;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 6px;
    transition:
      color 160ms ease-out,
      background 220ms ease-out,
      box-shadow 220ms ease-out;
  }

  .scenic-area-switcher button:hover:not(:disabled) {
    color: #315f57;
    background: #eef3ed;
  }

  .scenic-area-switcher button.active {
    color: #fff;
    background: #39766c;
    box-shadow: 0 3px 9px rgb(38 80 70 / 20%);
  }

  .scenic-area-switcher button:disabled {
    cursor: wait;
  }

  @media (width <= 760px) {
    .scenic-area-switcher {
      top: 10px;
      grid-template-columns: repeat(2, minmax(88px, 1fr));
      min-width: 214px;
    }

    .scenic-area-switcher__icon {
      display: none;
    }
  }

  @media (width <= 390px) {
    .scenic-area-switcher {
      min-width: 198px;
    }

    .scenic-area-switcher button {
      padding: 0 7px;
      font-size: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scenic-area-switcher button {
      transition: none;
    }
  }
</style>
