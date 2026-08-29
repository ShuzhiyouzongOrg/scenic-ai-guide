/**
 * @fileoverview 应用基础枚举模块。
 * @description 定义菜单布局、系统主题、菜单主题、菜单宽度、语言和容器宽度枚举。
 */

/**
 * @description 定义系统支持的菜单布局。
 * @enum {string}
 */
export enum MenuTypeEnum {
  /**
   * @description 左侧菜单
   */
  LEFT = 'left',
  /**
   * @description 顶部菜单
   */
  TOP = 'top',
  /**
   * @description 顶部+左侧菜单
   */
  TOP_LEFT = 'top-left',
  /**
   * @description 双栏菜单
   */
  DUAL_MENU = 'dual-menu'
}

/**
 * @description 定义系统支持的明暗主题模式。
 * @enum {string}
 */
export enum SystemThemeEnum {
  /**
   * @description 暗色主题
   */
  DARK = 'dark',
  /**
   * @description 亮色主题
   */
  LIGHT = 'light',
  /**
   * @description 自动主题（跟随系统）
   */
  AUTO = 'auto'
}

/**
 * @description 定义菜单区域支持的主题样式。
 * @enum {string}
 */
export enum MenuThemeEnum {
  /**
   * @description 暗色主题
   */
  DARK = 'dark',
  /**
   * @description 亮色主题
   */
  LIGHT = 'light',
  /**
   * @description 设计主题
   */
  DESIGN = 'design'
}

/**
 * @description 定义菜单折叠状态使用的宽度。
 * @enum {string}
 */
export enum MenuWidth {
  /**
   * @description 收起宽度
   */
  CLOSE = '64px'
}

/**
 * @description 定义界面支持的语言代码。
 * @enum {string}
 */
export enum LanguageEnum {
  /**
   * @description 简体中文
   */
  ZH = 'zh',
  /**
   * @description 英文
   */
  EN = 'en',
  /**
   * @description 韩文
   */
  KO = 'ko',
  /**
   * @description 繁体中文
   */
  ZH_TW = 'zh-TW',
  /**
   * @description 日文
   */
  JA = 'ja',
  /**
   * @description 泰文
   */
  TH = 'th'
}

/**
 * @description 定义页面容器的宽度模式。
 * @enum {string}
 */
export enum ContainerWidthEnum {
  /**
   * @description 全屏宽度
   */
  FULL = '100%',
  /**
   * @description 固定宽度
   */
  BOXED = '1200px'
}
