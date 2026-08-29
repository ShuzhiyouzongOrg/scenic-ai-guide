/**
 * @fileoverview 类型统一导出入口。
 * @description 重新导出通用、组件、状态、路由和配置类型。
 */
/**
 * @description 类型定义统一导出模块
 * 提供全局类型定义的统一导出入口
 *
 * @module types/index
 * @author Scenic AI Guide Team
 */

/**
 * @description 通用类型定义（基础类型、工具类型等）
 */
export * from './common'

/**
 * @description 组件相关类型定义
 */
export * from './component'

/**
 * @description 状态管理相关类型定义
 */
export * from './store'

/**
 * @description 路由相关类型定义
 */
export * from './router'

/**
 * @description 配置相关类型定义
 */
export * from './config'
