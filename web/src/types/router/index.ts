/**
 * @fileoverview 应用路由类型定义。
 * @description 扩展 Vue Router 的路由元数据和业务路由记录结构。
 */

import { RouteRecordRaw } from 'vue-router'

/**
 * @description 描述路由标题、图标、可见性、缓存和权限元数据。
 * @typedef {object} RouteMeta
 * @property {string} title 标题。
 * @property {string} [icon] 图标标识。
 * @property {boolean} [showBadge] 是否显示徽章。
 * @property {string} [showTextBadge] 文本徽章内容。
 * @property {boolean} [isHide] 是否在菜单中隐藏。
 * @property {boolean} [isHideTab] 是否在标签页中隐藏。
 * @property {string} [link] 外部链接。
 * @property {boolean} [isIframe] 是否使用 iframe。
 * @property {boolean} [keepAlive] 是否缓存页面。
 * @property {Array<{ title: string authMark: string }>} [authList] 按钮权限列表。
 * @property {boolean} [isFirstLevel] 是否为一级路由。
 * @property {string[]} [roles] 角色列表。
 * @property {boolean} [fixedTab] 是否固定标签页。
 * @property {string} [activePath] 菜单激活路径。
 * @property {boolean} [isFullPage] 是否使用全屏页面。
 * @property {boolean} [isAuthButton] 是否为权限按钮行。
 * @property {string} [authMark] 权限标识。
 * @property {string} [parentPath] 父路由路径。
 */
export interface RouteMeta extends Record<string | number | symbol, unknown> {
  /**
   * @description 路由标题
   */
  title: string
  /**
   * @description 路由图标
   */
  icon?: string
  /**
   * @description 是否显示徽章
   */
  showBadge?: boolean
  /**
   * @description 文本徽章
   */
  showTextBadge?: string
  /**
   * @description 是否在菜单中隐藏
   */
  isHide?: boolean
  /**
   * @description 是否在标签页中隐藏
   */
  isHideTab?: boolean
  /**
   * @description 外部链接
   */
  link?: string
  /**
   * @description 是否为iframe
   */
  isIframe?: boolean
  /**
   * @description 是否缓存
   */
  keepAlive?: boolean
  /**
   * @description 操作权限
   */
  authList?: Array<{
    title: string
    authMark: string
  }>
  /**
   * @description 是否为一级菜单
   */
  isFirstLevel?: boolean
  /**
   * @description 角色权限
   */
  roles?: string[]
  /**
   * @description 是否固定标签页
   */
  fixedTab?: boolean
  /**
   * @description 激活菜单路径
   */
  activePath?: string
  /**
   * @description 是否为全屏页面
   */
  isFullPage?: boolean
  /**
   * @description 是否为权限按钮行
   */
  isAuthButton?: boolean
  /**
   * @description 权限标识
   */
  authMark?: string
  /**
   * @description 父级路径
   */
  parentPath?: string
}

/**
 * @description 描述项目扩展后的 Vue Router 路由记录。
 * @typedef {object} AppRouteRecord
 * @property {number} [id] 后端菜单记录标识。
 * @property {RouteMeta} meta 路由展示、缓存与权限元数据。
 * @property {AppRouteRecord[]} [children] 子路由列表。
 * @property {string | (() => Promise<any>)} [component] Vue 组件实现。
 */
export interface AppRouteRecord extends Omit<RouteRecordRaw, 'meta' | 'children' | 'component'> {
  id?: number
  meta: RouteMeta
  children?: AppRouteRecord[]
  component?: string | (() => Promise<any>)
}
