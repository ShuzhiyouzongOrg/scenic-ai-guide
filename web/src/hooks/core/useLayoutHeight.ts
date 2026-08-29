/**
 * @fileoverview 计算页面内容区域可用高度并同步 CSS 变量。
 * @description 支持直接元素引用和按元素 ID 自动查找两种布局高度管理方式。
 */

/**
 * @description useLayoutHeight - 页面布局高度管理
 *
 * 自动计算和管理页面内容区域的高度，确保内容区域能够正确填充剩余空间。
 * 监听头部元素高度变化，动态调整内容区域高度，避免出现滚动条或布局错乱。
 *
 * ## 主要功能
 *
 * 1. 动态高度计算 - 根据头部元素高度自动计算内容区域高度
 * 2. 响应式监听 - 自动监听元素尺寸变化并更新高度
 * 3. CSS 变量同步 - 自动更新 CSS 变量，方便全局使用
 * 4. 灵活配置 - 支持自定义间距、CSS 变量名等
 * 5. 自动查找模式 - 提供通过 ID 自动查找元素的便捷方式
 *
 * @module useLayoutHeight
 *
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useElementSize } from '@vueuse/core'

/**
 * @description 页面容器高度配置
 */
interface LayoutHeightOptions {
  /**
   * @description 额外的间距（默认 15px）
   */
  extraSpacing?: number
  /**
   * @description 是否自动更新 CSS 变量（默认 true）
   */
  updateCssVar?: boolean
  /**
   * @description CSS 变量名称（默认 '--art-full-height'）
   */
  cssVarName?: string
}

/**
 * @description 监听两个头部元素的尺寸，计算内容区最小高度并按需同步 CSS 变量。
 * @param {LayoutHeightOptions} [options={}] 额外间距、CSS 变量同步开关和变量名称。
 * @returns {ReturnType<typeof useLayoutHeight>} 内容区最小高度、两个元素引用及对应高度的响应式对象。
 * @example
 * const { headerRef, contentHeaderRef, containerMinHeight } = useLayoutHeight()
 */
export function useLayoutHeight(options: LayoutHeightOptions = {}) {
  const { extraSpacing = 15, updateCssVar = true, cssVarName = '--art-full-height' } = options

  // 元素引用
  const headerRef = ref<HTMLElement>()
  const contentHeaderRef = ref<HTMLElement>()

  // 使用 VueUse 自动监听元素尺寸变化
  const { height: headerHeight } = useElementSize(headerRef)
  const { height: contentHeaderHeight } = useElementSize(contentHeaderRef)

  // 计算容器最小高度（响应式）
  const containerMinHeight = computed(() => {
    const totalHeight = headerHeight.value + contentHeaderHeight.value + extraSpacing
    return `calc(100vh - ${totalHeight}px)`
  })

  if (updateCssVar) {
    watch(
      containerMinHeight,
      (newHeight) => {
        requestAnimationFrame(() => {
          document.documentElement.style.setProperty(cssVarName, newHeight)
        })
      },
      { immediate: true }
    )
  }

  return {
    /**
     * @description 容器最小高度（响应式）
     */
    containerMinHeight,
    /**
     * @description 头部元素引用
     */
    headerRef,
    /**
     * @description 内容头部元素引用
     */
    contentHeaderRef,
    /**
     * @description 头部高度（响应式）
     */
    headerHeight,
    /**
     * @description 内容头部高度（响应式）
     */
    contentHeaderHeight
  }
}

/**
 * @description 通过 ID 自动查找元素的布局高度管理
 * 适用于无法直接获取元素引用的场景
 *
 * @param {string[]} [headerIds] 头部元素的 ID 数组，默认查找应用头部与内容头部。
 * @param {LayoutHeightOptions} [options={}] 配置选项。
 * @returns {ReturnType<typeof useAutoLayoutHeight>} 内容区最小高度、自动绑定的元素引用及对应高度的响应式对象。
 * @example
 * const layout = useAutoLayoutHeight(['app-header', 'app-content-header'])
 */
export function useAutoLayoutHeight(
  headerIds: string[] = ['app-header', 'app-content-header'],
  options: LayoutHeightOptions = {}
) {
  const { extraSpacing = 15, updateCssVar = true, cssVarName = '--art-full-height' } = options

  // 创建元素引用
  const headerRef = ref<HTMLElement>()
  const contentHeaderRef = ref<HTMLElement>()

  // 使用 VueUse 自动监听元素尺寸变化
  const { height: headerHeight } = useElementSize(headerRef)
  const { height: contentHeaderHeight } = useElementSize(contentHeaderRef)

  // 计算容器最小高度（响应式）
  const containerMinHeight = computed(() => {
    const totalHeight = headerHeight.value + contentHeaderHeight.value + extraSpacing
    return `calc(100vh - ${totalHeight}px)`
  })

  if (updateCssVar) {
    watch(
      containerMinHeight,
      (newHeight) => {
        requestAnimationFrame(() => {
          document.documentElement.style.setProperty(cssVarName, newHeight)
        })
      },
      { immediate: true }
    )
  }

  // 在 DOM 挂载后查找元素
  onMounted(() => {
    if (typeof document !== 'undefined') {
      // 使用 nextTick 确保 DOM 完全渲染
      requestAnimationFrame(() => {
        const header = document.getElementById(headerIds[0])
        const contentHeader = document.getElementById(headerIds[1])

        if (header) {
          headerRef.value = header
        }
        if (contentHeader) {
          contentHeaderRef.value = contentHeader
        }
      })
    }
  })

  return {
    /**
     * @description 容器最小高度（响应式）
     */
    containerMinHeight,
    /**
     * @description 头部元素引用
     */
    headerRef,
    /**
     * @description 内容头部元素引用
     */
    contentHeaderRef,
    /**
     * @description 头部高度（响应式）
     */
    headerHeight,
    /**
     * @description 内容头部高度（响应式）
     */
    contentHeaderHeight
  }
}
