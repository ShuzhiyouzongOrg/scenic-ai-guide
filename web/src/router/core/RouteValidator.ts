/**
 * @fileoverview 路由配置验证器。
 * @description 检查路由名称、组件路径和布局层级配置并汇总错误与警告。
 */

import type { AppRouteRecord } from '@/types/router'
import { RoutesAlias } from '../routesAlias'

/**
 * @description 描述路由配置验证产生的有效状态、错误和警告。
 * @typedef {object} ValidationResult
 * @property {boolean} valid 未发现阻断性配置错误时为 `true`。
 * @property {string[]} errors 阻止路由配置通过验证的错误消息列表。
 * @property {string[]} warnings 不阻断验证但需要关注的重复配置警告列表。
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * @description 检查路由配置并汇总错误和警告。
 * @class
 * @example
 * const instance = new RouteValidator()
 */
export class RouteValidator {
  // 用于记录已经提示过的路由，避免重复提示
  private warnedRoutes = new Set<string>()

  /**
   * @description 检查路由重复项、组件配置和布局层级。
   * @param {AppRouteRecord[]} routes 待检查的应用路由配置列表。
   * @returns {ValidationResult} 包含有效状态、错误消息和警告消息的验证结果。
   */
  validate(routes: AppRouteRecord[]): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 检测重复路由
    this.checkDuplicates(routes, errors, warnings)

    // 检测组件配置
    this.checkComponents(routes, errors, warnings)

    // 检测嵌套菜单的 /index/index 配置
    this.checkNestedIndexComponent(routes)

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * @description 递归检测同一菜单树中的重复路由名称和同级重复组件路径。
   * @param {AppRouteRecord[]} routes 待检查的路由树。
   * @param {string[]} errors 用于累积阻断性错误的列表。
   * @param {string[]} warnings 用于累积重复配置警告的列表。
   * @param {string} [parentPath] 当前递归层级的父路径。
   * @returns {void} 检查结果写入传入的错误和警告列表。
   */
  private checkDuplicates(
    routes: AppRouteRecord[],
    errors: string[],
    warnings: string[],
    parentPath = ''
  ): void {
    const routeNameMap = new Map<string, string>()
    const componentPathMap = new Map<string, string>()

    const checkRoutes = (routes: AppRouteRecord[], parentPath = '') => {
      routes.forEach((route) => {
        const currentPath = route.path || ''
        const fullPath = this.resolvePath(parentPath, currentPath)

        // 名称重复检测
        if (route.name) {
          const routeName = String(route.name)
          if (routeNameMap.has(routeName)) {
            warnings.push(`路由名称重复: "${routeName}" (${fullPath})`)
          } else {
            routeNameMap.set(routeName, fullPath)
          }
        }

        // 组件路径重复检测
        if (route.component && typeof route.component === 'string') {
          const componentPath = route.component
          if (componentPath !== RoutesAlias.Layout) {
            const componentKey = `${parentPath}:${componentPath}`
            if (componentPathMap.has(componentKey)) {
              warnings.push(`组件路径重复: "${componentPath}" (${fullPath})`)
            } else {
              componentPathMap.set(componentKey, fullPath)
            }
          }
        }

        // 递归处理子路由
        if (route.children?.length) {
          checkRoutes(route.children, fullPath)
        }
      })
    }

    checkRoutes(routes, parentPath)
  }

  /**
   * @description 递归检查一级菜单和叶子路由是否配置了符合层级要求的组件。
   * @param {AppRouteRecord[]} routes 待检查的路由树。
   * @param {string[]} errors 用于累积缺失组件错误的列表。
   * @param {string[]} warnings 保留给调用链的警告列表。
   * @param {string} [parentPath] 当前递归层级的父路径。
   * @returns {void} 检查结果写入传入的错误列表。
   */
  private checkComponents(
    routes: AppRouteRecord[],
    errors: string[],
    warnings: string[],
    parentPath = ''
  ): void {
    routes.forEach((route) => {
      const hasExternalLink = !!route.meta?.link?.trim()
      const hasChildren = Array.isArray(route.children) && route.children.length > 0
      const routePath = route.path || '[未定义路径]'
      const isIframe = route.meta?.isIframe

      // 如果配置了 component，则无需校验
      if (route.component) {
        // 递归检查子路由
        if (route.children?.length) {
          const fullPath = this.resolvePath(parentPath, route.path || '')
          this.checkComponents(route.children, errors, warnings, fullPath)
        }
        return
      }

      // 一级菜单：必须指定 Layout，除非是外链或 iframe
      if (parentPath === '' && !hasExternalLink && !isIframe) {
        errors.push(`一级菜单(${routePath}) 缺少 component，必须指向 ${RoutesAlias.Layout}`)
        return
      }

      // 非一级菜单：如果既不是外链、iframe，也没有子路由，则必须配置 component
      if (!hasExternalLink && !isIframe && !hasChildren) {
        errors.push(`路由(${routePath}) 缺少 component 配置`)
      }

      // 递归检查子路由
      if (route.children?.length) {
        const fullPath = this.resolvePath(parentPath, route.path || '')
        this.checkComponents(route.children, errors, warnings, fullPath)
      }
    })
  }

  /**
   * @description 递归检测二级及以下菜单是否误用仅限一级菜单的布局组件。
   * @param {AppRouteRecord[]} routes 待检查的路由树。
   * @param {number} [level] 当前路由层级，一级路由从 `1` 开始。
   * @returns {void} 配置问题通过日志输出，不返回数据。
   */
  private checkNestedIndexComponent(routes: AppRouteRecord[], level = 1): void {
    routes.forEach((route) => {
      // 检查二级及以下菜单是否错误使用了 Layout
      if (level > 1 && route.component === RoutesAlias.Layout) {
        this.logLayoutError(route, level)
      }

      // 递归检查子路由
      if (route.children?.length) {
        this.checkNestedIndexComponent(route.children, level + 1)
      }
    })
  }

  /**
   * @description 输出嵌套路由误用布局组件的定位信息，并避免同一路由重复提示。
   * @param {AppRouteRecord} route 配置错误的路由。
   * @param {number} level 当前路由层级。
   * @returns {void} 错误信息写入控制台，不返回数据。
   */
  private logLayoutError(route: AppRouteRecord, level: number): void {
    const routeName = String(route.name || route.path || '未知路由')
    const routeKey = `${routeName}_${route.path}`

    // 避免重复提示
    if (this.warnedRoutes.has(routeKey)) return
    this.warnedRoutes.add(routeKey)

    const menuTitle = route.meta?.title || routeName
    const routePath = route.path || '/'

    console.error(
      `[路由配置错误] 菜单 "${menuTitle}" (name: ${routeName}, path: ${routePath}) 配置错误\n` +
        `  问题: ${level}级菜单不能使用 ${RoutesAlias.Layout} 作为 component\n` +
        `  说明: 只有一级菜单才能使用 ${RoutesAlias.Layout}，二级及以下菜单应该指向具体的组件路径\n` +
        `  当前配置: component: '${RoutesAlias.Layout}'\n` +
        `  应该改为: component: '/your/component/path' 或留空 ''（如果是目录菜单）`
    )
  }

  /**
   * @description 拼接父子路由路径，并清理连接处的重复斜杠。
   * @param {string} parent 父级路由路径。
   * @param {string} child 子路由路径。
   * @returns {string} 拼接后的路由路径。
   */
  private resolvePath(parent: string, child: string): string {
    return [parent.replace(/\/$/, ''), child.replace(/^\//, '')].filter(Boolean).join('/')
  }
}
