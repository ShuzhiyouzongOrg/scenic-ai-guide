/**
 * @fileoverview iframe 路由管理器。
 * @description 以单例方式维护 iframe 路由集合，并支持会话级持久化与恢复。
 */

import type { AppRouteRecord } from '@/types/router'

/**
 * @description 以单例维护 iframe 路由及其会话存储。
 * @class
 * @example
 * const instance = new IframeRouteManager()
 */
export class IframeRouteManager {
  private static instance: IframeRouteManager
  private iframeRoutes: AppRouteRecord[] = []

  private constructor() {}

  /**
   * @description 获取 iframe 路由管理器单例。
   * @returns {IframeRouteManager} 全局唯一的 iframe 路由管理器实例。
   */
  static getInstance(): IframeRouteManager {
    if (!IframeRouteManager.instance) {
      IframeRouteManager.instance = new IframeRouteManager()
    }
    return IframeRouteManager.instance
  }

  /**
   * @description 添加尚未登记的 iframe 路由。
   * @param {AppRouteRecord} route 待登记的 iframe 路由记录。
   * @returns {void} 无返回值。
   */
  add(route: AppRouteRecord): void {
    if (!this.iframeRoutes.find((r) => r.path === route.path)) {
      this.iframeRoutes.push(route)
    }
  }

  /**
   * @description 获取当前维护的全部 iframe 路由。
   * @returns {AppRouteRecord[]} 当前维护的 iframe 路由列表。
   */
  getAll(): AppRouteRecord[] {
    return this.iframeRoutes
  }

  /**
   * @description 按路径查找 iframe 路由。
   * @param {string} path 路由或资源路径。
   * @returns {AppRouteRecord | undefined} 匹配的 iframe 路由；不存在时返回 `undefined`。
   */
  findByPath(path: string): AppRouteRecord | undefined {
    return this.iframeRoutes.find((route) => route.path === path)
  }

  /**
   * @description 清空全部 iframe 路由。
   * @returns {void} 无返回值。
   */
  clear(): void {
    this.iframeRoutes = []
  }

  /**
   * @description 将非空 iframe 路由列表写入会话存储。
   * @returns {void} 无返回值。
   */
  save(): void {
    if (this.iframeRoutes.length > 0) {
      sessionStorage.setItem('iframeRoutes', JSON.stringify(this.iframeRoutes))
    }
  }

  /**
   * @description 从会话存储恢复 iframe 路由；解析失败时重置为空列表。
   * @returns {void} 无返回值。
   */
  load(): void {
    try {
      const data = sessionStorage.getItem('iframeRoutes')
      if (data) {
        this.iframeRoutes = JSON.parse(data)
      }
    } catch (error) {
      console.error('[IframeRouteManager] 加载 iframe 路由失败:', error)
      this.iframeRoutes = []
    }
  }
}
