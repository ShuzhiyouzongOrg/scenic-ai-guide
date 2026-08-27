<template>
  <Icon v-if="iconData" :icon="iconData" v-bind="bindAttrs" class="auth-icon inline" />
</template>

<script setup lang="ts">
  import { Icon } from '@iconify/vue/offline'
  import { authIconData } from '@/assets/svg/auth-iconify.generated'

  defineOptions({ name: 'AuthIcon', inheritAttrs: false })

  const props = defineProps<{ icon?: keyof typeof authIconData }>()
  const attrs = useAttrs()
  const iconData = computed(() => (props.icon ? authIconData[props.icon] : undefined))
  const bindAttrs = computed(() => ({
    class: (attrs.class as string) || '',
    style: (attrs.style as string) || ''
  }))
</script>
