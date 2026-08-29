/**
 * @fileoverview 应用路由入口。
 * @description 创建哈希路由实例并集中安装前置、后置守卫和顶部进度条。
 */
import type { App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { staticRoutes } from './routes/staticRoutes'
import { configureNProgress } from '@/utils/router'
import { setupBeforeEachGuard } from './guards/beforeEach'
import { setupAfterEachGuard } from './guards/afterEach'

// 创建路由实例
/**
 * @description 应用使用的 Vue Router 哈希路由实例。
 * @type {object}
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes // 静态路由
})

// 初始化路由
/**
 * @description 向 Vue 应用安装路由、进度条和全局守卫。
 * @param {App<Element>} app 待安装路由插件的 Vue 应用实例。
 * @returns {void} 路由及其全局守卫安装完成后不返回值。
 */
export function initRouter(app: App<Element>): void {
  configureNProgress() // 顶部进度条
  setupBeforeEachGuard(router) // 路由前置守卫
  setupAfterEachGuard(router) // 路由后置守卫
  app.use(router)
}

// 主页路径，默认使用菜单第一个有效路径，配置后使用此路径
/**
 * @description 显式配置的主页路径；为空时由菜单推导。
 * @type {object}
 */
export const HOME_PAGE_PATH = ''
