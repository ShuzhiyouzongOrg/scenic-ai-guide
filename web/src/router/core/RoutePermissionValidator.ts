/**
 * @fileoverview 路由权限验证器。
 * @description 根据菜单路由树验证目标路径访问权限，并支持嵌套路径和动态参数匹配。
 */

import type { AppRouteRecord } from '@/types/router'

/**
 * @description 根据菜单路由树判断目标路径是否可访问。
 * @class
 * @example
 * const instance = new RoutePermissionValidator()
 */
export class RoutePermissionValidator {
  /**
   * @description 判断目标路径是否存在于用户菜单路由树。
   * @param {string} targetPath 待校验的目标路由路径。
   * @param {AppRouteRecord[]} menuList 菜单列表。
   * @returns {boolean} 路由树允许访问目标路径时返回 `true`。
   */
  static hasPermission(targetPath: string, menuList: AppRouteRecord[]): boolean {
    // 根路径始终允许访问
    if (targetPath === '/') {
      return true
    }

    return this.matchRoute(targetPath, menuList)
  }

  /**
   * @description 递归构建规范化菜单路径集合。
   * @param {AppRouteRecord[]} menuList 菜单列表。
   * @param {Set<string>} [pathSet] 用于累积规范化路径的集合。
   * @returns {Set<string>} 包含全部菜单路径的集合。
   */
  static buildMenuPathSet(
    menuList: AppRouteRecord[],
    pathSet: Set<string> = new Set()
  ): Set<string> {
    if (!Array.isArray(menuList) || menuList.length === 0) {
      return pathSet
    }

    for (const menuItem of menuList) {
      if (!menuItem.path) {
        continue
      }

      // 标准化路径并添加到集合
      const menuPath = menuItem.path.startsWith('/') ? menuItem.path : `/${menuItem.path}`
      pathSet.add(menuPath)

      // 递归处理子菜单
      if (menuItem.children?.length) {
        this.buildMenuPathSet(menuItem.children, pathSet)
      }
    }

    return pathSet
  }

  /**
   * @description 检查目标路径是否匹配集合中的菜单路径前缀。
   * @param {string} targetPath 待校验的目标路由路径。
   * @param {Set<string>} pathSet 可访问的菜单路径集合。
   * @returns {boolean} 任一菜单路径为目标路径前缀时返回 `true`。
   */
  static checkPathPrefix(targetPath: string, pathSet: Set<string>): boolean {
    // 遍历路径集合，检查是否有前缀匹配
    for (const menuPath of pathSet) {
      if (targetPath.startsWith(`${menuPath}/`)) {
        return true
      }
    }
    return false
  }

  /**
   * @description 递归匹配静态、嵌套或动态参数路由。
   * @param {string} targetPath 待匹配的目标路由路径。
   * @param {AppRouteRecord[]} routes 路线列表。
   * @returns {boolean} 路由树中存在匹配项时返回 `true`。
   */
  static matchRoute(targetPath: string, routes: AppRouteRecord[]): boolean {
    if (!Array.isArray(routes) || routes.length === 0) {
      return false
    }

    for (const route of routes) {
      if (!route.path) {
        continue
      }

      const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`

      if (
        routePath === targetPath ||
        this.isDynamicRouteMatch(targetPath, routePath) ||
        targetPath.startsWith(`${routePath}/`)
      ) {
        return true
      }

      if (route.children?.length && this.matchRoute(targetPath, route.children)) {
        return true
      }
    }

    return false
  }

  /**
   * @description 判断目标路径是否匹配含参数的路由模板。
   * @param {string} targetPath 实际访问路径。
   * @param {string} routePath 含动态参数的路由模板。
   * @returns {boolean} 实际路径匹配动态路由模板时返回 `true`。
   */
  static isDynamicRouteMatch(targetPath: string, routePath: string): boolean {
    if (!routePath.includes(':')) {
      return false
    }

    const pattern = routePath
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([^/]+)/g, '[^/]+')
      .replace(/\\\*/g, '.*')

    return new RegExp(`^${pattern}$`).test(targetPath)
  }

  /**
   * @description 返回通过权限校验的目标路径或首页回退路径。
   * @param {string} targetPath 待校验的目标路由路径。
   * @param {AppRouteRecord[]} menuList 菜单列表。
   * @param {string} [homePath] 无权限时使用的首页回退路径。
   * @returns {{ path: string; hasPermission: boolean }} 最终导航路径及权限判定结果。
   */
  static validatePath(
    targetPath: string,
    menuList: AppRouteRecord[],
    homePath: string = '/'
  ): { path: string; hasPermission: boolean } {
    const hasPermission = this.hasPermission(targetPath, menuList)

    if (hasPermission) {
      return { path: targetPath, hasPermission: true }
    }

    return { path: homePath, hasPermission: false }
  }
}
