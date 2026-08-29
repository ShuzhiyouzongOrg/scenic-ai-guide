/**
 * @fileoverview 工作标签页样式对应的布局尺寸配置。
 * @description 为默认、卡片和浏览器风格标签页提供打开与关闭状态的顶部距离和总高度。
 *
 * 提供不同标签页样式的高度和间距配置
 *
 * ## 主要功能
 *
 * - 多种标签页样式配置（默认、卡片、谷歌风格）
 * - 标签页打开/关闭状态的高度管理
 * - 顶部间距自动计算
 * - 配置获取和默认值处理
 *
 * ## 使用场景
 *
 * - 工作标签页（Worktab）布局计算
 * - 页面内容区域高度调整
 * - 标签页显示/隐藏时的动画
 * - 响应式布局适配
 *
 * ## 配置项说明
 *
 * - openTop: 标签页显示时，内容区域距离顶部的距离
 * - closeTop: 标签页隐藏时，内容区域距离顶部的距离
 * - openHeight: 标签页显示时的总高度（包含标签栏）
 * - closeHeight: 标签页隐藏时的总高度（仅头部）
 *
 * ## 支持的样式
 *
 * - tab-default: 默认标签页样式
 * - tab-card: 卡片式标签页
 * - tab-google: 谷歌浏览器风格标签页
 *
 * @module utils/ui/tabs
 */
/**
 * @description 各标签页样式在打开和关闭状态下的布局尺寸映射。
 * @type {Record<string, {openTop: number, closeTop: number, openHeight: number, closeHeight: number}>}
 */
export const TAB_CONFIG = {
  'tab-default': {
    openTop: 106,
    closeTop: 60,
    openHeight: 121,
    closeHeight: 75
  },
  'tab-card': {
    openTop: 122,
    closeTop: 78,
    openHeight: 139,
    closeHeight: 95
  },
  'tab-google': {
    openTop: 122,
    closeTop: 78,
    openHeight: 139,
    closeHeight: 95
  }
}

/**
 * @description 获取指定标签页样式的布局配置，未知样式回退为卡片样式。
 * @param {string} style 标签页样式名称。
 * @returns {(typeof TAB_CONFIG)[keyof typeof TAB_CONFIG]} 对应的布局尺寸配置。
 * @example
 * const config = getTabConfig('tab-default')
 */
export const getTabConfig = (style: string) => {
  return TAB_CONFIG[style as keyof typeof TAB_CONFIG] || TAB_CONFIG['tab-card'] // 默认使用 tab-card 配置
}
