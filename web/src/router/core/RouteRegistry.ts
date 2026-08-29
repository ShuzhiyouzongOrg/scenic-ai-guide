/**
 * @fileoverview 动态路由注册器。
 * @description 验证、转换并注册用户菜单路由，同时维护注销函数和注册状态。
 */

import type { Router, RouteRecordRaw } from 'vue-router'
import type { AppRouteRecord } from '@/types/router'
import { ComponentLoader } from './ComponentLoader'
import { RouteValidator } from './RouteValidator'
import { RouteTransformer } from './RouteTransformer'

/**
 * @description 验证、转换、注册和注销动态路由。
 * @class
 * @example
 * const instance = new RouteRegistry()
 */
export class RouteRegistry {
  private router: Router
  private componentLoader: ComponentLoader
  private validator: RouteValidator
  private transformer: RouteTransformer
  private removeRouteFns: (() => void)[] = []
  private registered = false

  /**
   * @description 使用指定 Vue Router 创建注册器及其加载、验证和转换依赖。
   * @param {Router} router 接收动态路由注册操作的 Vue Router 实例。
   */
  constructor(router: Router) {
    this.router = router
    this.componentLoader = new ComponentLoader()
    this.validator = new RouteValidator()
    this.transformer = new RouteTransformer(this.componentLoader)
  }

  /**
   * @description 验证并注册菜单对应的动态路由。
   * @param {AppRouteRecord[]} menuList 菜单列表。
   * @returns {void} 无返回值。
   * @throws {Error} 路由配置校验失败时抛出。
   */
  register(menuList: AppRouteRecord[]): void {
    if (this.registered) {
      console.warn('[RouteRegistry] 路由已注册，跳过重复注册')
      return
    }

    // 验证路由配置
    const validationResult = this.validator.validate(menuList)
    if (!validationResult.valid) {
      throw new Error(`路由配置验证失败: ${validationResult.errors.join(', ')}`)
    }

    // 转换并注册路由
    const removeRouteFns: (() => void)[] = []

    menuList.forEach((route) => {
      if (route.name && !this.router.hasRoute(route.name)) {
        const routeConfig = this.transformer.transform(route)
        const removeRouteFn = this.router.addRoute(routeConfig as RouteRecordRaw)
        removeRouteFns.push(removeRouteFn)
      }
    })

    this.removeRouteFns = removeRouteFns
    this.registered = true
  }

  /**
   * @description 注销当前注册器添加的全部动态路由。
   * @returns {void} 无返回值。
   */
  unregister(): void {
    this.removeRouteFns.forEach((fn) => fn())
    this.removeRouteFns = []
    this.registered = false
  }

  /**
   * @description 读取动态路由是否已经注册。
   * @returns {boolean} 已完成动态路由注册时返回 `true`。
   */
  isRegistered(): boolean {
    return this.registered
  }

  /**
   * @description 获取动态路由注销函数列表。
   * @returns {(() => void)[]} 当前动态路由对应的注销函数列表。
   */
  getRemoveRouteFns(): (() => void)[] {
    return this.removeRouteFns
  }

  /**
   * @description 将注册状态标记为已完成。
   * @returns {void} 无返回值。
   */
  markAsRegistered(): void {
    this.registered = true
  }
}
