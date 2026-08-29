/**
 * @fileoverview 菜单路由转换器。
 * @description 将应用菜单记录转换为 Vue Router 配置，并处理布局、普通页面和 iframe 路由。
 */

import type { RouteRecordRaw } from 'vue-router'
import type { AppRouteRecord } from '@/types/router'
import { ComponentLoader } from './ComponentLoader'
import { IframeRouteManager } from './IframeRouteManager'

interface ConvertedRoute extends Omit<RouteRecordRaw, 'children'> {
  id?: number
  children?: ConvertedRoute[]
  component?: RouteRecordRaw['component'] | (() => Promise<any>)
}

/**
 * @description 将业务菜单记录转换为 Vue Router 路由记录。
 * @class
 * @example
 * const instance = new RouteTransformer()
 */
export class RouteTransformer {
  private componentLoader: ComponentLoader
  private iframeManager: IframeRouteManager

  /**
   * @description 使用指定组件加载器创建路由转换器。
   * @param {ComponentLoader} componentLoader 用于解析页面、布局和 iframe 组件的加载器。
   */
  constructor(componentLoader: ComponentLoader) {
    this.componentLoader = componentLoader
    this.iframeManager = IframeRouteManager.getInstance()
  }

  /**
   * @description 递归将业务路由转换为 Vue Router 路由记录。
   * @param {AppRouteRecord} route 待转换的业务菜单路由记录。
   * @param {number} [depth] 当前记录在菜单树中的层级，顶层为 `0`。
   * @returns {ConvertedRoute} 可供 Vue Router 注册的路由记录。
   */
  transform(route: AppRouteRecord, depth = 0): ConvertedRoute {
    const { component, children, ...routeConfig } = route

    // 基础路由配置
    const converted: ConvertedRoute = {
      ...routeConfig,
      component: undefined
    }

    // 处理不同类型的路由
    if (route.meta.isIframe) {
      this.handleIframeRoute(converted, route, depth)
    } else if (this.isFirstLevelRoute(route, depth)) {
      this.handleFirstLevelRoute(converted, route, component as string)
    } else {
      this.handleNormalRoute(converted, component as string)
    }

    // 递归处理子路由
    if (children?.length) {
      converted.children = children.map((child) => this.transform(child, depth + 1))
    }

    return converted
  }

  /**
   * @description 判断路由是否为需要布局组件包裹的一级叶子路由。
   * @param {AppRouteRecord} route 待判断的业务路由。
   * @param {number} depth 路由在菜单树中的层级。
   * @returns {boolean} 顶层且没有子路由时返回 `true`。
   */
  private isFirstLevelRoute(route: AppRouteRecord, depth: number): boolean {
    return depth === 0 && (!route.children || route.children.length === 0)
  }

  /**
   * @description 为 iframe 路由设置布局或 iframe 组件，并登记持久化所需的路由信息。
   * @param {ConvertedRoute} targetRoute 正在构造的 Vue Router 路由记录。
   * @param {AppRouteRecord} sourceRoute 原始业务菜单路由。
   * @param {number} depth 当前路由层级。
   * @returns {void} 直接修改目标路由记录，不返回数据。
   */
  private handleIframeRoute(
    targetRoute: ConvertedRoute,
    sourceRoute: AppRouteRecord,
    depth: number
  ): void {
    if (depth === 0) {
      // 顶级 iframe：用 Layout 包裹
      targetRoute.component = this.componentLoader.loadLayout()
      targetRoute.path = this.extractFirstSegment(sourceRoute.path || '')
      targetRoute.name = ''

      targetRoute.children = [
        {
          ...sourceRoute,
          component: this.componentLoader.loadIframe()
        } as ConvertedRoute
      ]
    } else {
      // 非顶级（嵌套）iframe：直接使用 Iframe.vue
      targetRoute.component = this.componentLoader.loadIframe()
    }

    // 记录 iframe 路由
    this.iframeManager.add(sourceRoute)
  }

  /**
   * @description 使用布局组件包裹一级叶子路由，并把实际页面放入其子路由。
   * @param {ConvertedRoute} converted 正在构造的 Vue Router 路由记录。
   * @param {AppRouteRecord} route 原始业务菜单路由。
   * @param {string | undefined} component 页面组件路径。
   * @returns {void} 直接修改目标路由记录，不返回数据。
   */
  private handleFirstLevelRoute(
    converted: ConvertedRoute,
    route: AppRouteRecord,
    component: string | undefined
  ): void {
    converted.component = this.componentLoader.loadLayout()
    converted.path = this.extractFirstSegment(route.path || '')
    converted.name = ''
    route.meta.isFirstLevel = true

    converted.children = [
      {
        ...route,
        component: component ? this.componentLoader.load(component) : undefined
      } as ConvertedRoute
    ]
  }

  /**
   * @description 为普通路由加载已配置的页面组件。
   * @param {ConvertedRoute} converted 正在构造的 Vue Router 路由记录。
   * @param {string | undefined} component 页面组件路径。
   * @returns {void} 直接修改目标路由记录，不返回数据。
   */
  private handleNormalRoute(converted: ConvertedRoute, component: string | undefined): void {
    if (component) {
      converted.component = this.componentLoader.load(component)
    }
  }

  /**
   * @description 提取路由路径的首个有效片段并补齐前导斜杠。
   * @param {string} path 待拆分的路由路径。
   * @returns {string} 首段绝对路径；没有有效片段时返回根路径。
   */
  private extractFirstSegment(path: string): string {
    const segments = path.split('/').filter(Boolean)
    return segments.length > 0 ? `/${segments[0]}` : '/'
  }
}
