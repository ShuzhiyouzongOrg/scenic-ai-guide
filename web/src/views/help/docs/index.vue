<!-- 官方文档占位页：正式文档上线前沿用统一 404 体验。 -->
<template>
  <ArtException
    :data="{
      title: '404',
      desc: $t('exceptionPage.404'),
      btnText: $t('exceptionPage.gohome'),
      imgUrl
    }"
  />
</template>

<script setup lang="ts">
  import imgUrl from '@imgs/svg/404.svg'

  defineOptions({ name: 'OfficialDocs' })
</script>
