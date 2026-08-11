<!-- 更新日志页面 -->
<template>
  <div class="change-log-page">
    <h3>{{ t('app.changeLogTitle') }}</h3>
    <div class="log-list">
      <article v-for="item in projectChangeLog" :key="item.version" class="log-card art-card-sm">
        <div class="log-meta"><span class="log-version">{{ item.version }}</span><span>{{ item.date }}</span></div>
        <h4>{{ item.title }}</h4>
        <ul><li v-for="detail in item.detail" :key="detail">{{ detail }}</li></ul>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { projectChangeLog } from '@/mock/upgrade/changeLog'

  defineOptions({ name: 'ChangeLog' })
  const { t } = useI18n()
</script>

<style scoped lang="scss">
  .change-log-page { max-width: 1100px; margin: 0 auto; padding: 20px 0 28px; }
  .change-log-page > h3 { margin: 0 0 28px; color: var(--el-text-color-primary); font-size: 26px; font-weight: 600; }
  .log-list { display: grid; gap: 18px; }
  .log-card { padding: 22px 24px; transition: box-shadow 180ms ease, transform 180ms ease; }
  .log-card:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgb(32 66 61 / 10%); }
  .log-meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: var(--el-text-color-secondary); font-size: 13px; }
  .log-version { padding: 5px 12px; color: var(--theme-color); background: var(--el-color-primary-light-9); border-radius: 999px; }
  .log-card h4 { margin: 16px 0 12px; color: var(--el-text-color-primary); font-size: 19px; font-weight: 600; }
  .log-card ul { display: grid; gap: 8px; margin: 0; padding-left: 20px; color: var(--el-text-color-regular); font-size: 14px; line-height: 1.6; }
  @media (max-width: 640px) { .change-log-page { padding: 16px 0 24px; } .log-card { padding: 18px; } }
</style>
