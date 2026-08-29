/**
 * @fileoverview 异步路由列表。
 * @description 导出由各业务路由模块聚合得到的动态路由配置。
 */
// 权限说明后续在项目官方文档页面中补充。
import { AppRouteRecord } from '@/types/router'
import { routeModules } from '../modules'

/**
 * @description 根据业务模块生成的异步路由列表。
 * @type {AppRouteRecord[]}
 */
export const asyncRoutes: AppRouteRecord[] = routeModules
