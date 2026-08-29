/**
 * @fileoverview 应用配置类型定义。
 * @description 声明主题、菜单、节日、快速入口、系统、环境和顶部栏配置结构。
 */

import { MenuTypeEnum, SystemThemeEnum } from '@/enums/appEnum'
import { MenuThemeType, SystemThemeTypes } from '@/types/store'

// 主题设置
/**
 * @description 描述可选系统主题的颜色和预览资源。
 * @typedef {object} ThemeSetting
 * @property {string} name 名称。
 * @property {SystemThemeEnum} theme 主题类型。
 * @property {string[]} color 主题颜色组。
 * @property {string} leftLineColor 左侧装饰线颜色。
 * @property {string} rightLineColor 右侧装饰线颜色。
 * @property {string} img 预览或背景图片。
 */
export interface ThemeSetting {
  /**
   * @description 主题名称
   */
  name: string
  /**
   * @description 系统主题类型
   */
  theme: SystemThemeEnum
  /**
   * @description 主题颜色数组
   */
  color: string[]
  /**
   * @description 左侧线条颜色
   */
  leftLineColor: string
  /**
   * @description 右侧线条颜色
   */
  rightLineColor: string
  /**
   * @description 主题图片
   */
  img: string
}

// 菜单布局
/**
 * @description 描述菜单布局的名称、类型和预览资源。
 * @typedef {object} MenuLayout
 * @property {string} name 名称。
 * @property {MenuTypeEnum} value 数据值。
 * @property {string} img 预览或背景图片。
 * @property {string} [description] 说明文本。
 */
export interface MenuLayout {
  /**
   * @description 布局名称
   */
  name: string
  /**
   * @description 菜单类型值
   */
  value: MenuTypeEnum
  /**
   * @description 布局预览图
   */
  img: string
  /**
   * @description 布局描述
   */
  description?: string
}

// 节日配置
/**
 * @description 描述节日日期、名称、图片、文本和播放设置。
 * @typedef {object} FestivalConfig
 * @property {string} date 发布日期。
 * @property {string} [endDate] 结束日期。
 * @property {string} name 名称。
 * @property {string} image 图片资源。
 * @property {string} scrollText 滚动提示文本。
 * @property {boolean} [isActive] 是否激活。
 * @property {number} [count] 样本数量或播放次数。
 */
export interface FestivalConfig {
  /**
   * @description 节日日期（单日）或开始日期（日期范围）
   */
  date: string
  /**
   * @description 节日结束日期（可选，用于跨日期节日）
   */
  endDate?: string
  /**
   * @description 节日名称
   */
  name: string
  /**
   * @description 烟花图片
   */
  image: string
  /**
   * @description 滚动文本
   */
  scrollText: string
  /**
   * @description 是否激活
   */
  isActive?: boolean
  /**
   * @description 烟花播放次数（可选，默认为 3 次）
   */
  count?: number
}

// 系统基础配置
/**
 * @description 描述系统名称、品牌资源和版权信息。
 * @typedef {object} SystemBasicConfig
 * @property {string} name 名称。
 * @property {string} [description] 说明文本。
 * @property {string} [logo] 系统标志地址。
 * @property {string} [favicon] 浏览器图标地址。
 * @property {string} [copyright] 版权信息。
 */
export interface SystemBasicConfig {
  // 系统名称
  name: string
  // 系统描述
  description?: string
  // 系统logo
  logo?: string
  // 系统favicon
  favicon?: string
  // 版权信息
  copyright?: string
}

// 快速入口基础项
/**
 * @description 描述快速入口共用的名称、顺序和跳转字段。
 * @typedef {object} FastEnterBaseItem
 * @property {string} name 名称。
 * @property {boolean} [enabled] 是否启用。
 * @property {number} [order] 排序序号。
 * @property {string} [routeName] 目标路由名称。
 * @property {string} [link] 外部链接。
 * @property {string} [nameI18nKey] 名称国际化键。
 */
export interface FastEnterBaseItem {
  /**
   * @description 名称
   */
  name: string
  /**
   * @description 是否启用
   */
  enabled?: boolean
  /**
   * @description 排序权重
   */
  order?: number
  /**
   * @description 路由名称
   */
  routeName?: string
  /**
   * @description 外部链接
   */
  link?: string
  /**
   * @description 项目名称的国际化键
   */
  nameI18nKey?: string
}

// 快速入口内置操作
/**
 * @description 定义快速入口支持的内置操作。
 * @typedef {'generateDemoData'} FastEnterAction
 */
export type FastEnterAction = 'generateDemoData'

// 快速入口应用项
/**
 * @description 描述快速入口应用的图标、说明和内置操作。
 * @typedef {object} FastEnterApplication
 * @property {string} description 说明文本。
 * @property {string} icon 图标标识。
 * @property {string} iconColor 图标颜色。
 * @property {string} [descriptionI18nKey] 说明国际化键。
 * @property {FastEnterAction} [action] 动作标识或内置操作。
 */
export interface FastEnterApplication extends FastEnterBaseItem {
  /**
   * @description 应用描述
   */
  description: string
  /**
   * @description 图标代码
   */
  icon: string
  /**
   * @description 图标颜色
   */
  iconColor: string
  /**
   * @description 项目描述的国际化键
   */
  descriptionI18nKey?: string
  /**
   * @description 点击时执行的内置操作
   */
  action?: FastEnterAction
}

// 快速链接项
/**
 * @description 定义快速外链配置项。
 * @typedef {FastEnterBaseItem} FastEnterQuickLink
 */
export type FastEnterQuickLink = FastEnterBaseItem

// 快速入口配置
/**
 * @description 描述快速入口的应用、链接与显示宽度。
 * @typedef {object} FastEnterConfig
 * @property {FastEnterApplication[]} applications 快速应用列表。
 * @property {FastEnterQuickLink[]} quickLinks 快速链接列表。
 * @property {number} [minWidth] 显示所需最小宽度。
 */
export interface FastEnterConfig {
  /**
   * @description 应用列表
   */
  applications: FastEnterApplication[]
  /**
   * @description 快速链接
   */
  quickLinks: FastEnterQuickLink[]
  /**
   * @description 显示条件（屏幕宽度）
   */
  minWidth?: number
}

// 系统配置
/**
 * @description 描述系统品牌、主题、菜单和功能配置。
 * @typedef {object} SystemConfig
 * @property {SystemBasicConfig} systemInfo 系统基础信息。
 * @property {SystemThemeTypes} systemThemeStyles 系统主题样式映射。
 * @property {ThemeSetting[]} settingThemeList 设置主题列表。
 * @property {MenuLayout[]} menuLayoutList 菜单布局列表。
 * @property {MenuThemeType[]} themeList 菜单主题列表。
 * @property {MenuThemeType[]} darkMenuStyles 暗色菜单样式列表。
 * @property {readonly string[]} systemMainColor 系统主色列表。
 * @property {FastEnterConfig} [fastEnter] 快速入口配置。
 * @property {HeaderBarFeatureConfig} [headerBar] 顶部栏配置。
 */
export interface SystemConfig {
  // 系统基础信息
  systemInfo: SystemBasicConfig
  // 系统主题样式
  systemThemeStyles: SystemThemeTypes
  // 设置主题列表
  settingThemeList: ThemeSetting[]
  // 菜单布局列表
  menuLayoutList: MenuLayout[]
  // 主题列表
  themeList: MenuThemeType[]
  // 暗色菜单样式
  darkMenuStyles: MenuThemeType[]
  // 系统主色调
  systemMainColor: readonly string[]
  // 快速入口配置
  fastEnter?: FastEnterConfig
  // 顶部栏功能配置
  headerBar?: HeaderBarFeatureConfig
}

// 环境配置
/**
 * @description 描述 Vite 构建和运行环境变量。
 * @typedef {object} EnvConfig
 * @property {string} NODE_ENV 当前 Node.js 运行环境名称。
 * @property {string} VITE_VERSION 当前应用版本号。
 * @property {string} VITE_PORT 本地开发服务器端口。
 * @property {string} VITE_BASE_URL 应用部署基础路径。
 * @property {string} VITE_API_URL 后端 API 基础地址。
 * @property {string} [VITE_USE_MOCK] 是否启用模拟接口的字符串开关。
 * @property {string} [VITE_USE_GZIP] 是否生成 Gzip 压缩资源的字符串开关。
 * @property {string} [VITE_USE_CDN] 是否启用 CDN 资源的字符串开关。
 */
export interface EnvConfig {
  // 环境名称
  NODE_ENV: string
  // 应用版本
  VITE_VERSION: string
  // 应用端口
  VITE_PORT: string
  // 应用基础路径
  VITE_BASE_URL: string
  // API 地址
  VITE_API_URL: string
  // 是否开启 Mock
  VITE_USE_MOCK?: string
  // 是否开启压缩
  VITE_USE_GZIP?: string
  // 是否开启 CDN
  VITE_USE_CDN?: string
}

// 应用配置
/**
 * @description 描述合并系统配置后的应用环境状态。
 * @typedef {object} AppConfig
 * @property {EnvConfig} env 环境配置。
 * @property {boolean} isDev 是否为开发环境。
 * @property {boolean} isProd 是否为生产环境。
 * @property {boolean} isTest 是否为测试环境。
 */
export interface AppConfig extends SystemConfig {
  // 环境配置
  env: EnvConfig
  // 开发模式
  isDev: boolean
  // 生产模式
  isProd: boolean
  // 测试模式
  isTest: boolean
}

// 功能配置项基础接口
/**
 * @description 描述一个可开关功能及其说明。
 * @typedef {object} FeatureConfigItem
 * @property {boolean} enabled 是否启用。
 * @property {string} description 说明文本。
 */
export interface FeatureConfigItem {
  enabled: boolean
  description: string
}

// 顶部栏功能配置接口
/**
 * @description 描述顶部栏各功能项配置。
 * @typedef {object} HeaderBarFeatureConfig
 * @property {FeatureConfigItem} menuButton 菜单按钮配置或状态。
 * @property {FeatureConfigItem} refreshButton 刷新按钮配置。
 * @property {FeatureConfigItem} fastEnter 快速入口配置。
 * @property {FeatureConfigItem} breadcrumb 面包屑配置。
 * @property {FeatureConfigItem} globalSearch 全局搜索配置。
 * @property {FeatureConfigItem} fullscreen 全屏功能配置。
 * @property {FeatureConfigItem} language 内容语言。
 * @property {FeatureConfigItem} settings 设置面板配置。
 * @property {FeatureConfigItem} themeToggle 主题切换配置。
 */
export interface HeaderBarFeatureConfig {
  /**
   * @description 菜单按钮
   */
  menuButton: FeatureConfigItem
  /**
   * @description 刷新按钮
   */
  refreshButton: FeatureConfigItem
  /**
   * @description 快速入口
   */
  fastEnter: FeatureConfigItem
  /**
   * @description 面包屑导航
   */
  breadcrumb: FeatureConfigItem
  /**
   * @description 全局搜索
   */
  globalSearch: FeatureConfigItem
  /**
   * @description 全屏功能
   */
  fullscreen: FeatureConfigItem
  /**
   * @description 多语言切换
   */
  language: FeatureConfigItem
  /**
   * @description 设置面板
   */
  settings: FeatureConfigItem
  /**
   * @description 主题切换
   */
  themeToggle: FeatureConfigItem
}
