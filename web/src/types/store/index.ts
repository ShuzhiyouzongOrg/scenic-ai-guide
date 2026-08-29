/**
 * @fileoverview 状态管理类型定义。
 * @description 声明系统主题、菜单主题、设置、工作标签页、用户和根状态结构。
 */

import { MenuThemeEnum, SystemThemeEnum } from '@/enums/appEnum'
import { LocationQueryRaw } from 'vue-router'

// 系统主题样式（light | dark）
/**
 * @description 描述系统主题对应的 CSS 类名。
 * @typedef {object} SystemThemeType
 * @property {string} className 主题 CSS 类名。
 */
export interface SystemThemeType {
  /**
   * @description 主题类名
   */
  className: string
}

// 定义包含多个主题的类型
/**
 * @description 定义亮色和暗色主题到样式配置的映射。
 * @typedef {{ [key in Exclude<SystemThemeEnum, SystemThemeEnum.AUTO>]: SystemThemeType }} SystemThemeTypes
 */
export type SystemThemeTypes = {
  [key in Exclude<SystemThemeEnum, SystemThemeEnum.AUTO>]: SystemThemeType
}

// 菜单主题样式
/**
 * @description 描述菜单主题的背景、文字、图标和图片。
 * @typedef {object} MenuThemeType
 * @property {MenuThemeEnum} theme 主题类型。
 * @property {string} background 背景颜色。
 * @property {string} systemNameColor 系统名称颜色。
 * @property {string} textColor 文字颜色。
 * @property {string} iconColor 图标颜色。
 * @property {string} [img] 预览或背景图片。
 */
export interface MenuThemeType {
  /**
   * @description 主题类型
   */
  theme: MenuThemeEnum
  /**
   * @description 背景颜色
   */
  background: string
  /**
   * @description 系统名称颜色
   */
  systemNameColor: string
  /**
   * @description 文本颜色
   */
  textColor: string
  /**
   * @description 图标颜色
   */
  iconColor: string
  /**
   * @description 背景图片
   */
  img?: string
}

// 设置中心
/**
 * @description 描述设置中心的主题与界面显示状态。
 * @typedef {object} SettingState
 * @property {string} theme 主题类型。
 * @property {boolean} uniqueOpened 是否只展开一个子菜单。
 * @property {boolean} menuButton 菜单按钮配置或状态。
 * @property {boolean} showRefreshButton 是否显示刷新按钮。
 * @property {boolean} showCrumbs 是否显示面包屑。
 * @property {boolean} autoClose 是否自动关闭。
 * @property {boolean} showWorkTab 是否显示工作标签页。
 * @property {boolean} showLanguage 是否显示语言切换。
 * @property {boolean} showNprogress 是否显示顶部进度条。
 * @property {string} themeModel 主题模式。
 */
export interface SettingState {
  /**
   * @description 主题
   */
  theme: string
  /**
   * @description 是否只保持一个子菜单的展开
   */
  uniqueOpened: boolean
  /**
   * @description 是否显示菜单按钮
   */
  menuButton: boolean
  /**
   * @description 是否显示刷新按钮
   */
  showRefreshButton: boolean
  /**
   * @description 是否显示面包屑
   */
  showCrumbs: boolean
  /**
   * @description 是否自动关闭
   */
  autoClose: boolean
  /**
   * @description 是否显示工作标签页
   */
  showWorkTab: boolean
  /**
   * @description 是否显示语言切换
   */
  showLanguage: boolean
  /**
   * @description 是否显示进度条
   */
  showNprogress: boolean
  /**
   * @description 主题模式
   */
  themeModel: string
}

// 多标签
/**
 * @description 描述一个工作标签页的路由、缓存和固定状态。
 * @typedef {object} WorkTab
 * @property {string} title 标题。
 * @property {string} [customTitle] 自定义标签标题。
 * @property {string} path 路由或资源路径。
 * @property {string} name 名称。
 * @property {boolean} keepAlive 是否缓存页面。
 * @property {boolean} [fixedTab] 是否固定标签页。
 * @property {object} [params] 标签页对应的动态路由参数。
 * @property {LocationQueryRaw} [query] 路由查询参数或检索问题。
 * @property {string} [icon] 图标标识。
 * @property {boolean} [isActive] 是否激活。
 */
export interface WorkTab {
  /**
   * @description 标签标题
   */
  title: string
  /**
   * @description 自定义标题
   */
  customTitle?: string
  /**
   * @description 路由路径
   */
  path: string
  /**
   * @description 路由名称
   */
  name: string
  /**
   * @description 是否缓存
   */
  keepAlive: boolean
  /**
   * @description 是否固定标签
   */
  fixedTab?: boolean
  /**
   * @description 路由参数
   */
  params?: object
  /**
   * @description 路由查询参数
   */
  query?: LocationQueryRaw
  /**
   * @description 图标
   */
  icon?: string
  /**
   * @description 是否激活
   */
  isActive?: boolean
}

// 用户Store状态
/**
 * @description 描述用户身份、令牌、角色和权限状态。
 * @typedef {object} UserState
 * @property {Api.Auth.UserInfo | null} userInfo 用户信息。
 * @property {string | null} token 访问令牌。
 * @property {string[]} roles 角色列表。
 * @property {string[]} permissions 权限标识列表。
 */
export interface UserState {
  /**
   * @description 用户信息
   */
  userInfo: Api.Auth.UserInfo | null
  /**
   * @description 认证令牌
   */
  token: string | null
  /**
   * @description 用户角色列表
   */
  roles: string[]
  /**
   * @description 用户权限列表
   */
  permissions: string[]
}

// 设置Store状态
/**
 * @description 描述设置 Store 扩展的设备、语言和折叠状态。
 * @typedef {object} SettingStoreState
 * @property {boolean} collapsed 菜单是否折叠。
 * @property {'desktop' | 'mobile'} device 设备类型。
 * @property {string} language 内容语言。
 */
export interface SettingStoreState extends SettingState {
  // 额外的设置状态
  /**
   * @description 菜单是否折叠
   */
  collapsed: boolean
  /**
   * @description 设备类型
   */
  device: 'desktop' | 'mobile'
  /**
   * @description 当前语言
   */
  language: string
}

// 工作标签页Store状态
/**
 * @description 描述工作标签页列表、活动项和缓存项。
 * @typedef {object} WorkTabState
 * @property {WorkTab[]} tabs 标签页列表。
 * @property {string} activeTab 当前活动标签。
 * @property {string[]} cachedTabs 缓存标签页列表。
 */
export interface WorkTabState {
  /**
   * @description 标签页列表
   */
  tabs: WorkTab[]
  /**
   * @description 当前激活的标签页
   */
  activeTab: string
  /**
   * @description 缓存的标签页列表
   */
  cachedTabs: string[]
}

// 菜单Store状态
/**
 * @description 描述菜单列表、加载和折叠状态。
 * @typedef {object} MenuState
 * @property {any[]} menuList 菜单列表。
 * @property {boolean} isLoaded 菜单是否已加载。
 * @property {boolean} collapsed 菜单是否折叠。
 */
export interface MenuState {
  /**
   * @description 菜单列表
   */
  menuList: any[]
  /**
   * @description 菜单是否已加载
   */
  isLoaded: boolean
  /**
   * @description 菜单是否折叠
   */
  collapsed: boolean
}

// 根Store状态类型
/**
 * @description 描述应用各业务 Store 组成的根状态。
 * @typedef {object} RootState
 * @property {UserState} user 用户状态。
 * @property {SettingStoreState} setting 设置状态。
 * @property {WorkTabState} workTab 工作标签页状态。
 * @property {MenuState} menu 菜单状态。
 */
export interface RootState {
  /**
   * @description 用户状态
   */
  user: UserState
  /**
   * @description 设置状态
   */
  setting: SettingStoreState
  /**
   * @description 工作标签页状态
   */
  workTab: WorkTabState
  /**
   * @description 菜单状态
   */
  menu: MenuState
}
