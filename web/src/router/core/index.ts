/**
 * @fileoverview 路由核心模块入口。
 * @description 统一重新导出路由注册、加载、验证、转换、菜单处理和权限校验类。
 */
/**
 * @description 路由核心模块导出
 *
 * @module router/core
 * @author Scenic AI Guide Team
 */

export { RouteRegistry } from './RouteRegistry'
export { ComponentLoader } from './ComponentLoader'
export { RouteValidator } from './RouteValidator'
export { RouteTransformer } from './RouteTransformer'
export { IframeRouteManager } from './IframeRouteManager'
export { MenuProcessor } from './MenuProcessor'
export { RoutePermissionValidator } from './RoutePermissionValidator'
