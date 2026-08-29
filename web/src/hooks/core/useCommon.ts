/**
 * @fileoverview 提供页面刷新、首页路径和内容区滚动等通用能力。
 * @description 统一封装菜单与设置仓库相关操作，供各页面复用。
 */

/**
 * @description useCommon - 通用功能集合
 *
 * 提供常用的页面操作功能，包括页面刷新、滚动控制、路径获取等。
 * 这些功能在多个页面和组件中都会用到，统一封装便于复用。
 *
 * ## 主要功能
 *
 * 1. 首页路径 - 获取系统配置的首页路径
 * 2. 页面刷新 - 刷新当前页面内容
 * 3. 滚动控制 - 提供多种滚动到顶部和指定位置的方法
 * 4. 平滑滚动 - 支持平滑滚动动画效果
 *
 * @module useCommon
 *
 */

import { computed } from 'vue'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'

/**
 * @description 创建首页路径、页面刷新和主内容区滚动的通用页面工具。
 * @returns {ReturnType<typeof useCommon>} 包含首页计算属性及刷新、定位、置顶和平滑置顶方法的对象。
 * @example
 * const { refresh, scrollToTop } = useCommon()
 * refresh()
 * scrollToTop()
 */
export function useCommon() {
  const menuStore = useMenuStore()
  const settingStore = useSettingStore()

  /**
   * @description 首页路径
   * 从菜单 store 中获取配置的首页路径
   */
  const homePath = computed(() => menuStore.getHomePath())

  /**
   * @description 刷新当前页面
   * 通过切换 setting store 中的 refresh 状态触发页面重新渲染
   */
  const refresh = () => {
    settingStore.reload()
  }

  /**
   * @description 滚动到页面顶部
   * 查找主内容区域并将其滚动位置重置为顶部
   */
  const scrollToTop = () => {
    const scrollContainer = document.getElementById('app-main')
    if (scrollContainer) {
      scrollContainer.scrollTop = 0
    }
  }

  /**
   * @description 平滑滚动到页面顶部
   * 使用 smooth 行为实现平滑滚动效果
   */
  const smoothScrollToTop = () => {
    const scrollContainer = document.getElementById('app-main')
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
  }

  /**
   * @description 滚动到指定位置。
   * @param {number} top 目标滚动位置（像素）。
   * @param {boolean} [smooth=false] 是否使用平滑滚动。
   */
  const scrollTo = (top: number, smooth: boolean = false) => {
    const scrollContainer = document.getElementById('app-main')
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top,
        behavior: smooth ? 'smooth' : 'auto'
      })
    }
  }

  return {
    homePath,
    refresh,
    scrollTo,
    scrollToTop,
    smoothScrollToTop
  }
}
