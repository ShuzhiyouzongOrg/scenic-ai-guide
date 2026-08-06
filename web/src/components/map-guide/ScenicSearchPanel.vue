<script setup lang="ts">
  import type { ScenicCategory, ScenicSpot } from '@/types/map-guide'
  import { facilityColor } from '@/utils/map-guide/facility-style'

  defineProps<{
    query: string
    categories: ScenicCategory[]
    selectedCategoryIds: string[]
    spots: ScenicSpot[]
    collapsed: boolean
  }>()

  const emit = defineEmits<{
    'update:query': [value: string]
    'update:selectedCategoryIds': [value: string[]]
    selectSpot: [spot: ScenicSpot]
    toggleCollapse: []
  }>()

  function toggleCategory(id: string, selected: string[]) {
    emit('update:selectedCategoryIds', selected.includes(id) ? [] : [id])
  }
</script>

<template>
  <aside class="scenic-search-panel" :class="{ collapsed }">
    <button class="scenic-search-panel__toggle" type="button" @click="emit('toggleCollapse')">
      <ArtSvgIcon :icon="collapsed ? 'ri:menu-unfold-line' : 'ri:menu-fold-line'" />
    </button>
    <template v-if="!collapsed">
      <div class="scenic-search-panel__search">
        <ArtSvgIcon icon="ri:search-line" />
        <input
          :value="query"
          type="search"
          :placeholder="$t('app.mapGuideSearchPlaceholder')"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <section>
        <h3>{{ $t('app.mapGuideCategories') }}</h3>
        <div class="category-chips">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            :class="{ active: selectedCategoryIds.includes(category.id) }"
            :style="
              category.kind === 'facility'
                ? { '--category-color': facilityColor(category.id) }
                : undefined
            "
            @click="toggleCategory(category.id, selectedCategoryIds)"
          >
            {{ category.name }}
          </button>
        </div>
      </section>

      <section class="spot-results">
        <h3
          >{{ $t('app.mapGuideSpots') }} <small>{{ spots.length }}</small></h3
        >
        <div class="spot-results__list">
          <button
            v-for="spot in spots"
            :key="spot.id"
            type="button"
            @click="emit('selectSpot', spot)"
          >
            <span
              class="spot-results__kind"
              :class="spot.kind"
              :style="
                spot.kind === 'facility'
                  ? { '--category-color': facilityColor(spot.categoryId) }
                  : undefined
              "
              >{{ spot.categoryName.slice(0, 1) }}</span
            >
            <span
              ><strong>{{ spot.name }}</strong
              ><small>{{ spot.categoryName }}</small></span
            >
            <ArtSvgIcon icon="ri:arrow-right-s-line" />
          </button>
          <p v-if="!spots.length" class="spot-results__empty">{{ $t('app.mapGuideNoSpots') }}</p>
        </div>
      </section>
    </template>
  </aside>
</template>

<style scoped lang="scss">
  .scenic-search-panel {
    position: absolute;
    top: 16px;
    bottom: 16px;
    left: 16px;
    z-index: 420;
    display: flex;
    flex-direction: column;
    width: min(300px, calc(100% - 32px));
    padding: 16px;
    overflow: hidden;
    color: #304840;
    background: rgb(255 255 251 / 96%);
    border: 1px solid rgb(59 91 80 / 16%);
    border-radius: 15px;
    box-shadow: 0 12px 32px rgb(28 48 42 / 15%);
    transition:
      width 260ms ease-out,
      padding 260ms ease-out;

    &.collapsed {
      bottom: auto;
      width: 46px;
      height: 46px;
      padding: 0;
    }
  }

  .scenic-search-panel__toggle {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: #3b6d64;
    cursor: pointer;
    background: #eef3ed;
    border: 0;
    border-radius: 8px;
  }

  .collapsed .scenic-search-panel__toggle {
    inset: 8px;
  }

  .scenic-search-panel__search {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 9px 11px;
    margin-right: 36px;
    background: #f3f5f0;
    border: 1px solid #e0e6de;
    border-radius: 10px;
  }

  .scenic-search-panel__search input {
    width: 100%;
    color: #334b45;
    background: transparent;
    border: 0;
    outline: none;
  }

  section h3 {
    display: flex;
    gap: 7px;
    align-items: center;
    margin: 17px 0 10px;
    font-size: 14px;
  }

  section h3 small {
    font-weight: 500;
    color: #83938d;
  }

  .category-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    max-height: 105px;
    overflow: auto;
  }

  .category-chips button {
    padding: 6px 10px;
    color: #566b64;
    cursor: pointer;
    background: #f5f6f2;
    border: 1px solid #e2e5de;
    border-radius: 15px;
    transition: 150ms ease-out;
  }

  .category-chips button.active {
    color: #fff;
    background: #3c776c;
    border-color: #3c776c;
  }

  .category-chips button[style].active {
    background: var(--category-color);
    border-color: var(--category-color);
  }

  .spot-results {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .spot-results__list {
    min-height: 0;
    overflow: auto;
  }

  .spot-results__list > button {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    align-items: center;
    width: 100%;
    padding: 9px 4px;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #edf0eb;
  }

  .spot-results__list > button:hover {
    background: #f6f7f2;
  }

  .spot-results__list strong,
  .spot-results__list small {
    display: block;
  }

  .spot-results__list strong {
    font-size: 13px;
    color: #304c45;
  }

  .spot-results__list small {
    margin-top: 2px;
    font-size: 11px;
    color: #829088;
  }

  .spot-results__kind {
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    font-size: 11px;
    color: #fff;
    background: #75867e;
    border-radius: 50%;
  }

  .spot-results__kind.facility {
    background: var(--category-color, #687a73);
  }

  .spot-results__kind.scenic {
    background: #b0782b;
  }

  .spot-results__empty {
    padding: 36px 0;
    color: #8b9893;
    text-align: center;
  }

  @media (width <= 760px) {
    .scenic-search-panel {
      top: 10px;
      bottom: auto;
      left: 10px;
      max-height: min(56vh, 480px);
    }
  }
</style>
