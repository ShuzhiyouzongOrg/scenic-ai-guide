/**
 * @fileoverview 菜单与外部链接跳转工具。
 * @description 根据菜单元信息选择浏览器新窗口、当前路由或首个可导航子菜单。
 *
 * 提供统一的页面跳转和导航功能
 *
 * ## 主要功能
 *
 * - 外部链接打开（新窗口）
 * - 菜单项跳转处理（支持内部路由和外部链接）
 * - iframe 页面跳转支持
 * - 递归查找并跳转到第一个可见的子菜单
 * - 智能判断跳转目标类型（外部链接/内部路由）
 *
 * @module utils/navigation/jump
 */
import { AppRouteRecord } from '@/types/router'
import { router } from '@/router'
import { isNavigableMenuItem } from './route'

/**
 * @description 在新的浏览器标签页中打开外部链接。
 * @param {string} link 待打开的完整链接。
 * @returns {void} 无返回值。
 * @example
 * openExternalLink('https://www.example.com')
 */
export const openExternalLink = (link: string) => {
  window.open(link, '_blank')
}

/**
 * @description 根据菜单类型跳转到外链、当前路由或首个可导航的叶子菜单。
 * @param {AppRouteRecord} item 待处理的菜单项。
 * @param {boolean} [jumpToFirst=false] 是否优先进入首个可导航子菜单。
 * @returns {void | ReturnType<typeof router.push>} 外链场景无返回值，内部导航返回路由跳转结果。
 * @example
 * handleMenuJump(menuItem, true)
 */
export const handleMenuJump = (item: AppRouteRecord, jumpToFirst: boolean = false) => {
  // 处理外部链接
  const { link, isIframe } = item.meta
  if (link && !isIframe) {
    return openExternalLink(link)
  }

  // 如果不需要跳转到第一个子菜单，或者没有子菜单，直接跳转当前路径
  if (!jumpToFirst || !item.children?.length) {
    return router.push(item.path)
  }

  // 递归查找第一个可导航的叶子节点菜单
  const findFirstLeafMenu = (items: AppRouteRecord[]): AppRouteRecord | undefined => {
    for (const child of items) {
      if (isNavigableMenuItem(child)) {
        return child.children?.length ? findFirstLeafMenu(child.children) || child : child
      }
    }
    return undefined
  }

  const firstChild = findFirstLeafMenu(item.children)

  // 如果子菜单都不可见，则回退到父级页面自身。
  if (!firstChild) {
    return router.push(item.path)
  }

  // 如果第一个子菜单是外部链接则打开新窗口
  if (firstChild.meta?.link) {
    return openExternalLink(firstChild.meta.link)
  }

  // 跳转到子菜单路径
  router.push(firstChild.path)
}
