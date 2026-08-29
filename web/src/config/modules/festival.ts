/**
 * @fileoverview 节日效果配置模块。
 * @description 定义节日日期范围、提示文本、烟花资源和播放次数。
 */

import { FestivalConfig } from '@/types/config'

// 导入烟花图片（根据需要取消注释）
// import sd from '@imgs/ceremony/sd.png'
// import yd from '@imgs/ceremony/yd.png'

/**
 * @description 按日期生效的节日展示配置列表。
 * @type {FestivalConfig[]}
 */
export const festivalConfigList: FestivalConfig[] = [
  // 跨日期示例
  // {
  //   name: 'v3.0 Sass 升级至 TailwindCSS',
  //   date: '2025-11-03',
  //   endDate: '2025-11-09',
  //   image: '',
  //   count: 3,
  //   scrollText:
  //     '🚀 系统 v3.0 测试阶段正式开启！测试周期为 11 月 3 日 - 11 月 16 日，通过 TailwindCSS 重构样式体系、统一 Iconify 图标方案，带来更高效现代的开发体验，正式发布敬请期待～'
  // }
  // 单日示例：圣诞节
  // {
  //   name: '圣诞节',
  //   date: '2024-12-25',
  //   image: sd,
  //   count: 3 // 可选，不设置则使用默认值 3 次
  //   scrollText: 'Merry Christmas！灵山胜境 AI 导览 祝您圣诞快乐，愿节日的欢乐与祝福如雪花般纷至沓来！',
  // }
]
