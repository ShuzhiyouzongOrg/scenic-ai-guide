/**
 * @fileoverview Vue 全局指令类型声明。
 * @description 扩展 Vue 全局指令类型并注册权限、角色、水波纹和高亮指令。
 */
import type {
  AuthDirective,
  RolesDirective,
  RippleDirective,
  HighlightDirective
} from '@/directives'

declare module 'vue' {
  export interface GlobalDirectives {
    vAuth: AuthDirective
    vRoles: RolesDirective
    vRipple: RippleDirective
    vHighlight: HighlightDirective
  }
}
