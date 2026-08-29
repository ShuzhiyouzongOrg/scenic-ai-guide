/**
 * @fileoverview 页面标题与路由进度条工具。
 * @description 统一配置 NProgress，并依据路由元信息和国际化资源生成浏览器标题。
 * @module utils/router
 */
import { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'
import AppConfig from '@/config'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import i18n, { $t } from '@/locales'

/**
 * @typedef AppRouteRecordRaw
 * @description 在 Vue Router 原始路由记录上增加菜单隐藏标记。
 * @property {boolean} [hidden] 是否在菜单中隐藏该路由。
 */
export type AppRouteRecordRaw = RouteRecordRaw & {
  hidden?: boolean
}

/**
 * @description 使用项目统一的缓动、速度和挂载节点配置顶部进度条。
 * @returns {void} 无返回值。
 * @example
 * configureNProgress()
 */
export const configureNProgress = () => {
  NProgress.configure({
    easing: 'ease',
    speed: 600,
    showSpinner: false,
    parent: 'body'
  })
}

/**
 * @description 根据路由标题和系统名称延迟更新浏览器页面标题。
 * @param {RouteLocationNormalized} to 当前标准化路由对象。
 * @returns {void} 无返回值。
 * @example
 * setPageTitle(to)
 */
export const setPageTitle = (to: RouteLocationNormalized): void => {
  const { title } = to.meta
  if (title) {
    setTimeout(() => {
      document.title = `${formatMenuTitle(String(title))} - ${AppConfig.systemInfo.name}`
    }, 150)
  }
}

/**
 * @description 将菜单标题解析为国际化文本；未注册的点分隔键回退为最后一段。
 * @param {string} title 菜单标题、国际化键或普通字符串。
 * @returns {string} 可直接展示的菜单标题。
 * @example
 * formatMenuTitle('menus.guide.title')
 */
export const formatMenuTitle = (title: string): string => {
  if (title) {
    // 路由标题允许使用任意 i18n key，业务菜单不再局限于框架的 menus.* 命名空间。
    if (i18n.global.te(title)) {
      return $t(title)
    }
    if (title.includes('.')) {
      return title.split('.').pop() || title
    }
    return title
  }
  return ''
}
