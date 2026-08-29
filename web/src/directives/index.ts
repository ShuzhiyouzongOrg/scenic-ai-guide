/**
 * @fileoverview 统一注册并导出应用级 Vue 指令。
 * @description 集中装配权限、角色权限和水波纹指令，供应用入口一次注册。
 */

import type { App } from 'vue'
import { setupAuthDirective, type AuthDirective } from './core/auth'
import { setupRippleDirective, type RippleDirective } from './business/ripple'
import { setupRolesDirective, type RolesDirective } from './core/roles'

/**
 * @description 一次性注册权限、角色权限和水波纹三个应用级指令。
 * @param {App} app 待装配全局指令的 Vue 应用实例。
 * @returns {void} 无返回值。
 * @example
 * setupGlobDirectives(app)
 */
export function setupGlobDirectives(app: App) {
  setupAuthDirective(app) // 权限指令
  setupRolesDirective(app) // 角色权限指令
  setupRippleDirective(app) // 水波纹指令
}

/**
 * @description 重导出应用级指令类型，供业务组件声明指令参数时使用。
 * @see AuthDirective
 * @see RippleDirective
 * @see RolesDirective
 */
export type { AuthDirective, RippleDirective, RolesDirective }
