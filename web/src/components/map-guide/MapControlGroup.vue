<script setup lang="ts">
  defineProps<{ panoramaAvailable: boolean; routeActive?: boolean }>()
  const emit = defineEmits<{
    browseRoutes: []
    locate: []
    reset: []
    panorama: []
    clearRoute: []
  }>()
</script>

<template>
  <div class="map-control-group" aria-label="Map controls">
    <el-tooltip :content="$t('app.mapGuideRoutes')" placement="left">
      <button type="button" :aria-label="$t('app.mapGuideRoutes')" @click="emit('browseRoutes')">
        <ArtSvgIcon icon="ri:route-line" />
      </button>
    </el-tooltip>
    <el-tooltip :content="$t('app.mapGuideLocate')" placement="left">
      <button type="button" :aria-label="$t('app.mapGuideLocate')" @click="emit('locate')"
        ><ArtSvgIcon icon="ri:focus-3-line"
      /></button>
    </el-tooltip>
    <el-tooltip :content="$t('app.mapGuideReset')" placement="left">
      <button type="button" :aria-label="$t('app.mapGuideReset')" @click="emit('reset')"
        ><ArtSvgIcon icon="ri:home-4-line"
      /></button>
    </el-tooltip>
    <el-tooltip v-if="panoramaAvailable" :content="$t('app.mapGuidePanorama')" placement="left">
      <button type="button" :aria-label="$t('app.mapGuidePanorama')" @click="emit('panorama')"
        ><ArtSvgIcon icon="ri:drag-move-2-line"
      /></button>
    </el-tooltip>
    <el-tooltip v-if="routeActive" :content="$t('app.mapGuideClearRoute')" placement="left">
      <button
        class="danger"
        type="button"
        :aria-label="$t('app.mapGuideClearRoute')"
        @click="emit('clearRoute')"
      >
        <ArtSvgIcon icon="ri:delete-bin-line" />
      </button>
    </el-tooltip>
  </div>
</template>

<style scoped lang="scss">
  .map-control-group {
    position: absolute;
    right: 14px;
    bottom: 104px;
    z-index: 430;
    display: grid;
    gap: 7px;
    justify-items: end;
  }

  .map-control-group button {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    color: #365c55;
    cursor: pointer;
    background: rgb(255 255 252 / 94%);
    border: 1px solid rgb(54 92 85 / 18%);
    border-radius: 9px;
    box-shadow: 0 5px 15px rgb(30 55 49 / 14%);
    transition:
      transform 150ms ease-out,
      background 150ms ease-out;
  }

  .map-control-group button:hover {
    background: #fff;
    transform: translateY(-1px);
  }

  .map-control-group button.danger {
    color: #855e43;
    background: rgb(255 249 242 / 96%);
  }
</style>
