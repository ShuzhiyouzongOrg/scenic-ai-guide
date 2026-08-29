/**
 * @fileoverview 全局全屏 Loading 单例管理工具。
 * @description 根据明暗主题生成加载背景，并确保同一时刻只维护一个 Element Plus Loading 实例。
 *
 * 提供统一的全屏加载动画管理
 *
 * ## 主要功能
 *
 * - 全屏 Loading 显示和隐藏
 * - 自动适配明暗主题背景色
 * - 自定义 SVG 加载动画
 * - 单例模式防止重复创建
 * - 锁定页面交互
 *
 * ## 使用场景
 *
 * - 页面初始化加载
 * - 大量数据请求
 * - 路由切换过渡
 * - 异步操作等待
 *
 * ## 特性
 *
 * - 自动检测当前主题并应用对应背景色
 * - 使用自定义 SVG 动画（四点旋转）
 * - 单例模式确保同时只有一个 Loading
 * - 提供便捷的显示/隐藏方法
 *
 * @module utils/ui/loading
 */
import { fourDotsSpinnerSvg } from '@/assets/svg/loading'

/**
 * @description 根据根元素是否包含 dark 类返回全屏加载背景色。
 * @returns {string} 暗色半透明背景或白色背景。
 */
const getLoadingBackground = (): string => {
  const isDark = document.documentElement.classList.contains('dark')
  return isDark ? 'rgba(7, 7, 7, 0.85)' : '#fff'
}

/**
 * @description 全屏 Loading 的静态配置和动态背景访问器。
 * @type {{lock: true, readonly background: string, svg: string, svgViewBox: string, customClass: string}}
 */
const DEFAULT_LOADING_CONFIG = {
  lock: true,
  get background() {
    return getLoadingBackground()
  },
  svg: fourDotsSpinnerSvg,
  svgViewBox: '0 0 40 40',
  customClass: 'art-loading-fix'
} as const

/**
 * @typedef LoadingInstance
 * @description 当前模块管理的最小 Loading 实例接口。
 * @property {() => void} close 关闭并销毁 Loading 的方法。
 */
interface LoadingInstance {
  close: () => void
}

/**
 * @description 当前活动的全屏 Loading 实例。
 * @type {LoadingInstance | null}
 */
let loadingInstance: LoadingInstance | null = null

/**
 * @description 提供全局 Loading 的显示与隐藏方法，并复用当前活动实例。
 * @type {{showLoading: () => () => void, hideLoading: () => void}}
 * @example
 * const close = loadingService.showLoading()
 * close()
 */
export const loadingService = {
  /**
   * @description 显示全屏 Loading；已有实例时直接复用。
   * @returns {() => void} 用于隐藏当前 Loading 的函数。
   */
  showLoading(): () => void {
    if (!loadingInstance) {
      // 每次显示时获取最新的配置，确保背景色与当前主题同步
      const config = {
        ...DEFAULT_LOADING_CONFIG,
        background: getLoadingBackground()
      }
      loadingInstance = ElLoading.service(config)
    }
    return () => this.hideLoading()
  },

  /**
   * @description 关闭当前 Loading 并清除实例引用。
   * @returns {void} 无返回值。
   */
  hideLoading(): void {
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  }
}
