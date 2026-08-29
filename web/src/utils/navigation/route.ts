/**
 * @fileoverview 菜单路由识别与默认路径查找工具。
 * @description 判断 iframe 与可导航菜单，并递归解析菜单树中的首个有效落点。
 *
 * 提供路由处理和菜单路径相关的工具函数
 *
 * ## 主要功能
 *
 * - iframe 路由检测，判断是否为外部嵌入页面
 * - 菜单项有效性验证，过滤隐藏和无效菜单
 * - 路径标准化处理，统一路径格式
 * - 递归查找菜单树中第一个有效路径
 * - 支持多级嵌套菜单的路径解析
 *
 * ## 使用场景
 *
 * - 系统初始化时获取默认跳转路径
 * - 菜单权限过滤后获取首个可访问页面
 * - 路由重定向逻辑处理
 * - iframe 页面特殊处理
 *
 * @module utils/navigation/route
 */

import { AppRouteRecord } from '@/types'

/**
 * @description 判断路由地址是否属于系统约定的 iframe 路由。
 * @param {string} url 待检查的路由地址。
 * @returns {boolean} 地址以 iframe 路由前缀开头时返回 true。
 * @example
 * isIframe('/outside/iframe/docs')
 */
export function isIframe(url: string): boolean {
  return url.startsWith('/outside/iframe/')
}

/**
 * @description 判断菜单项是否可作为默认导航落点；隐藏的全屏页面仍可视为合法落点。
 * @param {AppRouteRecord} menuItem 待判断的菜单项。
 * @returns {boolean} 路径有效且菜单可导航时返回 true。
 * @example
 * const navigable = isNavigableMenuItem(menuItem)
 */
export const isNavigableMenuItem = (menuItem: AppRouteRecord): boolean => {
  if (!menuItem.path || !menuItem.path.trim()) {
    return false
  }

  if (!menuItem.meta?.isHide) {
    return true
  }

  return menuItem.meta?.isFullPage === true
}

/**
 * @description 确保路径以正斜杠开头。
 * @param {string} path 原始路径。
 * @returns {string} 标准化后的绝对路由路径。
 */
const normalizePath = (path: string): string => {
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * @description 深度优先查找菜单树中的首个可导航路径，并将其标准化。
 * @param {AppRouteRecord[]} menuList 菜单列表。
 * @returns {string} 首个有效路径；未找到时返回空字符串。
 * @example
 * const homePath = getFirstMenuPath(menuList)
 */
export const getFirstMenuPath = (menuList: AppRouteRecord[]): string => {
  if (!Array.isArray(menuList) || menuList.length === 0) {
    return ''
  }

  for (const menuItem of menuList) {
    if (!isNavigableMenuItem(menuItem)) {
      continue
    }

    // 如果有子菜单，优先查找子菜单
    if (menuItem.children?.length) {
      const childPath = getFirstMenuPath(menuItem.children)
      if (childPath) {
        return childPath
      }
    }

    // 返回当前菜单项的标准化路径
    return normalizePath(menuItem.path!)
  }

  return ''
}
