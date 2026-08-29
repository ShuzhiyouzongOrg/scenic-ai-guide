/**
 * @fileoverview 菜单处理器。
 * @description 按运行模式获取菜单并执行权限过滤、空项过滤、路径校验和规范化。
 */

import type { AppRouteRecord } from '@/types/router'
import { useUserStore } from '@/store/modules/user'
import { useAppMode } from '@/hooks/core/useAppMode'
import { fetchGetMenuList } from '@/api/system-manage'
import { asyncRoutes } from '../routes/asyncRoutes'
import { RoutesAlias } from '../routesAlias'
import { formatMenuTitle } from '@/utils'

/**
 * @description 获取、过滤、校验并规范化当前用户菜单。
 * @class
 * @example
 * const instance = new MenuProcessor()
 */
export class MenuProcessor {
  /**
   * @description 按前端或后端控制模式获取并规范化用户菜单。
   * @returns {Promise<AppRouteRecord[]>} 经过权限过滤、空项清理、路径校验和路径规范化的菜单列表。
   */
  async getMenuList(): Promise<AppRouteRecord[]> {
    const { isFrontendMode } = useAppMode()

    let menuList: AppRouteRecord[]
    if (isFrontendMode.value) {
      menuList = await this.processFrontendMenu()
    } else {
      menuList = await this.processBackendMenu()
    }

    // 在规范化路径之前，验证原始路径配置
    this.validateMenuPaths(menuList)

    // 规范化路径（将相对路径转换为完整路径）
    return this.normalizeMenuPaths(menuList)
  }

  /**
   * @description 根据当前用户的权限路径或兼容角色过滤前端静态菜单。
   * @returns {Promise<AppRouteRecord[]>} 已按当前用户权限过滤并清除空项的前端菜单。
   */
  private async processFrontendMenu(): Promise<AppRouteRecord[]> {
    const userStore = useUserStore()
    const roles = userStore.info?.roles
    const permissions = userStore.info?.permissions

    let menuList = [...asyncRoutes]

    // 新版服务端返回角色管理页配置的路径权限；保留角色过滤作为旧接口兼容。
    if (Array.isArray(permissions)) {
      menuList = this.filterMenuByPermissions(menuList, permissions)
    } else if (roles && roles.length > 0) {
      menuList = this.filterMenuByRoles(menuList, roles)
    }

    return this.filterEmptyMenus(menuList)
  }

  /**
   * @description 从后端读取菜单并清除没有有效内容的菜单项。
   * @returns {Promise<AppRouteRecord[]>} 后端返回且经过空项过滤的菜单列表。
   * @throws {Error} 菜单接口请求失败时由请求层向上传递。
   */
  private async processBackendMenu(): Promise<AppRouteRecord[]> {
    const list = await fetchGetMenuList()
    return this.filterEmptyMenus(list)
  }

  /**
   * @description 递归保留未限制角色或命中任一当前角色的菜单项。
   * @param {AppRouteRecord[]} menu 待过滤的菜单树。
   * @param {string[]} roles 当前用户拥有的角色编码。
   * @returns {AppRouteRecord[]} 按角色权限过滤后的菜单树副本。
   */
  private filterMenuByRoles(menu: AppRouteRecord[], roles: string[]): AppRouteRecord[] {
    return menu.reduce((acc: AppRouteRecord[], item) => {
      const itemRoles = item.meta?.roles
      const hasPermission = !itemRoles || itemRoles.some((role) => roles?.includes(role))

      if (hasPermission) {
        const filteredItem = { ...item }
        if (filteredItem.children?.length) {
          filteredItem.children = this.filterMenuByRoles(filteredItem.children, roles)
        }
        acc.push(filteredItem)
      }

      return acc
    }, [])
  }

  /**
   * @description 递归保留与任一授权路径相等或存在父子路径关系的菜单项。
   * @param {AppRouteRecord[]} menu 待过滤的菜单树。
   * @param {string[]} permissions 当前用户拥有的授权路径；`*` 表示全部权限。
   * @param {string} [parentPath] 当前递归层级的父路径。
   * @returns {AppRouteRecord[]} 按路径权限过滤后的菜单树副本。
   */
  private filterMenuByPermissions(
    menu: AppRouteRecord[],
    permissions: string[],
    parentPath = ''
  ): AppRouteRecord[] {
    if (permissions.includes('*')) return menu

    return menu.reduce((acc: AppRouteRecord[], item) => {
      const fullPath = this.buildFullPath(item.path || '', parentPath)
      const hasPermission = permissions.some((permission) => {
        const normalized = permission.trim().replace(/\/$/, '')
        return (
          normalized.length > 0 &&
          (normalized === fullPath ||
            normalized.startsWith(`${fullPath}/`) ||
            fullPath.startsWith(`${normalized}/`))
        )
      })

      if (hasPermission) {
        const filteredItem = { ...item }
        if (filteredItem.children?.length) {
          filteredItem.children = this.filterMenuByPermissions(
            filteredItem.children,
            permissions,
            fullPath
          )
        }
        acc.push(filteredItem)
      }

      return acc
    }, [])
  }

  /**
   * @description 递归过滤既无组件、子菜单、外链也非 iframe 的空菜单项。
   * @param {AppRouteRecord[]} menuList 待清理的菜单树。
   * @returns {AppRouteRecord[]} 保留有效目录和可导航菜单项的新菜单树。
   */
  private filterEmptyMenus(menuList: AppRouteRecord[]): AppRouteRecord[] {
    return menuList
      .map((item) => {
        // 如果有子菜单，先递归过滤子菜单
        if (item.children && item.children.length > 0) {
          const filteredChildren = this.filterEmptyMenus(item.children)
          return {
            ...item,
            children: filteredChildren
          }
        }
        return item
      })
      .filter((item) => {
        // 如果定义了 children 属性（即使是空数组），说明这是一个目录菜单，应该保留
        if ('children' in item) {
          return true
        }

        // 如果有外链或 iframe，保留
        if (item.meta?.isIframe === true || item.meta?.link) {
          return true
        }

        // 如果有有效的 component，保留
        if (item.component && item.component !== '' && item.component !== RoutesAlias.Layout) {
          return true
        }

        // 其他情况过滤掉
        return false
      })
  }

  /**
   * @description 检查菜单列表是否为非空数组。
   * @param {AppRouteRecord[]} menuList 菜单列表。
   * @returns {boolean} 参数为至少包含一个菜单项的数组时返回 `true`。
   */
  validateMenuList(menuList: AppRouteRecord[]): boolean {
    return Array.isArray(menuList) && menuList.length > 0
  }

  /**
   * @description 递归将相对菜单路径转换为完整路径，并为目录推导默认跳转地址。
   * @param {AppRouteRecord[]} menuList 待规范化的菜单树。
   * @param {string} [parentPath] 当前递归层级的父路径。
   * @returns {AppRouteRecord[]} 路径和目录重定向均已规范化的菜单树副本。
   */
  private normalizeMenuPaths(menuList: AppRouteRecord[], parentPath = ''): AppRouteRecord[] {
    return menuList.map((item) => {
      // 构建完整路径
      const fullPath = this.buildFullPath(item.path || '', parentPath)

      // 递归处理子菜单
      const children = item.children?.length
        ? this.normalizeMenuPaths(item.children, fullPath)
        : item.children

      const redirect = item.redirect || this.resolveDefaultRedirect(children)

      return {
        ...item,
        path: fullPath,
        redirect,
        children
      }
    })
  }

  /**
   * @description 在子路由树中查找第一个可导航页面作为目录默认跳转地址。
   * @param {AppRouteRecord[]} [children] 目录下的子路由列表。
   * @returns {string | undefined} 首个可导航页面路径；不存在时返回 `undefined`。
   */
  private resolveDefaultRedirect(children?: AppRouteRecord[]): string | undefined {
    if (!children?.length) {
      return undefined
    }

    for (const child of children) {
      if (this.isNavigableRoute(child)) {
        return child.path
      }

      const nestedRedirect = this.resolveDefaultRedirect(child.children)
      if (nestedRedirect) {
        return nestedRedirect
      }
    }

    return undefined
  }

  /**
   * @description 判断路由是否具备本地组件且不属于根路径、外链或 iframe。
   * @param {AppRouteRecord} route 待判断的子路由。
   * @returns {boolean} 路由可作为目录默认落点时返回 `true`。
   */
  private isNavigableRoute(route: AppRouteRecord): boolean {
    return Boolean(
      route.path &&
        route.path !== '/' &&
        !route.meta?.link &&
        route.meta?.isIframe !== true &&
        route.component &&
        route.component !== ''
    )
  }

  /**
   * @description 递归检查非一级菜单是否错误使用以斜杠开头的绝对路径。
   * @param {AppRouteRecord[]} menuList 待检查的菜单树。
   * @param {number} [level] 当前菜单层级，一级菜单从 `1` 开始。
   * @returns {void} 校验结果通过日志输出，不返回数据。
   */
  private validateMenuPaths(menuList: AppRouteRecord[], level = 1): void {
    menuList.forEach((route) => {
      if (!route.children?.length) return

      const parentName = String(route.name || route.path || '未知路由')

      route.children.forEach((child) => {
        const childPath = child.path || ''

        // 跳过合法的绝对路径：外部链接和 iframe 路由
        if (this.isValidAbsolutePath(childPath)) return

        // 检测非法的绝对路径
        if (childPath.startsWith('/')) {
          this.logPathError(child, childPath, parentName, level)
        }
      })

      // 递归检查更深层级的子路由
      this.validateMenuPaths(route.children, level + 1)
    })
  }

  /**
   * @description 判断路径是否为允许保留的外部链接或 iframe 绝对路径。
   * @param {string} path 待判断的路由路径。
   * @returns {boolean} 路径属于允许的绝对路径时返回 `true`。
   */
  private isValidAbsolutePath(path: string): boolean {
    return (
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('/outside/iframe/')
    )
  }

  /**
   * @description 输出子菜单误用绝对路径的定位信息和修正建议。
   * @param {AppRouteRecord} route 配置错误的子路由。
   * @param {string} path 当前配置的错误路径。
   * @param {string} parentName 父级菜单名称。
   * @param {number} level 父级菜单所在层级。
   * @returns {void} 错误信息写入控制台，不返回数据。
   */
  private logPathError(
    route: AppRouteRecord,
    path: string,
    parentName: string,
    level: number
  ): void {
    const routeName = String(route.name || path || '未知路由')
    const menuTitle = route.meta?.title || routeName
    const suggestedPath = path.split('/').pop() || path.slice(1)

    console.error(
      `[路由配置错误] 菜单 "${formatMenuTitle(menuTitle)}" (name: ${routeName}, path: ${path}) 配置错误\n` +
        `  位置: ${parentName} > ${routeName}\n` +
        `  问题: ${level + 1}级菜单的 path 不能以 / 开头\n` +
        `  当前配置: path: '${path}'\n` +
        `  应该改为: path: '${suggestedPath}'`
    )
  }

  /**
   * @description 将相对子路径与父路径拼接为完整路径，并原样保留外链和绝对路径。
   * @param {string} path 当前菜单路径。
   * @param {string} parentPath 父级菜单完整路径。
   * @returns {string} 规范化后的完整路径；空路径返回空字符串。
   */
  private buildFullPath(path: string, parentPath: string): string {
    if (!path) return ''

    // 外部链接直接返回
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path
    }

    // 如果已经是绝对路径，直接返回
    if (path.startsWith('/')) {
      return path
    }

    // 拼接父路径和当前路径
    if (parentPath) {
      // 移除父路径末尾的斜杠，移除子路径开头的斜杠，然后拼接
      const cleanParent = parentPath.replace(/\/$/, '')
      const cleanChild = path.replace(/^\//, '')
      return `${cleanParent}/${cleanChild}`
    }

    // 没有父路径，添加前导斜杠
    return `/${path}`
  }
}
