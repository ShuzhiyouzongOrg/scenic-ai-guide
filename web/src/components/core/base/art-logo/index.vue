<!-- 系统logo -->
<template>
  <div class="flex-cc">
    <img
      :style="logoStyle"
      :src="logo46"
      :srcset="logoSrcSet"
      alt="灵山胜境 AI 导览"
      class="w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
  import logo46 from '@imgs/common/logo-46.webp'
  import logo92 from '@imgs/common/logo-92.webp'

  defineOptions({ name: 'ArtLogo' })

  interface Props {
    /** logo 大小 */
    size?: number | string
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 36
  })

  const logoStyle = computed(() => ({ width: `${props.size}px` }))
  const logoSrcSet = `${logo46} 1x, ${logo92} 2x`
</script>
