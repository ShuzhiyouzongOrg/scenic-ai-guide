/**
 * @fileoverview 系统设置默认值模块。
 * @description 声明界面布局、主题、菜单和交互选项默认值，并提供读取与重置能力。
 */

import AppConfig from '@/config'
import { SystemThemeEnum, MenuThemeEnum, MenuTypeEnum, ContainerWidthEnum } from '@/enums/appEnum'

/**
 * @description 系统界面和交互设置的默认值。
 * @type {object}
 */
export const SETTING_DEFAULT_CONFIG = {
  /**
   * @description 菜单类型
   */
  menuType: MenuTypeEnum.LEFT,
  /**
   * @description 菜单展开宽度
   */
  menuOpenWidth: 230,
  /**
   * @description 菜单是否展开
   */
  menuOpen: true,
  /**
   * @description 双菜单是否显示文本
   */
  dualMenuShowText: false,
  /**
   * @description 系统主题类型
   */
  systemThemeType: SystemThemeEnum.AUTO,
  /**
   * @description 系统主题模式
   */
  systemThemeMode: SystemThemeEnum.AUTO,
  /**
   * @description 菜单风格
   */
  menuThemeType: MenuThemeEnum.DESIGN,
  /**
   * @description 系统主题颜色
   */
  systemThemeColor: AppConfig.systemMainColor[0],
  /**
   * @description 是否显示菜单按钮
   */
  showMenuButton: true,
  /**
   * @description 是否显示快速入口
   */
  showFastEnter: true,
  /**
   * @description 是否显示刷新按钮
   */
  showRefreshButton: true,
  /**
   * @description 是否显示面包屑
   */
  showCrumbs: true,
  /**
   * @description 是否显示工作台标签
   */
  showWorkTab: true,
  /**
   * @description 是否显示语言切换
   */
  showLanguage: true,
  /**
   * @description 是否显示进度条
   */
  showNprogress: false,
  /**
   * @description 是否显示设置引导
   */
  showSettingGuide: true,
  /**
   * @description 是否显示节日文本
   */
  showFestivalText: false,
  /**
   * @description 是否显示水印
   */
  watermarkVisible: false,
  /**
   * @description 是否自动关闭
   */
  autoClose: false,
  /**
   * @description 是否唯一展开
   */
  uniqueOpened: true,
  /**
   * @description 是否色弱模式
   */
  colorWeak: false,
  /**
   * @description 是否刷新
   */
  refresh: false,
  /**
   * @description 是否加载节日烟花
   */
  holidayFireworksLoaded: false,
  /**
   * @description 边框模式
   */
  boxBorderMode: true,
  /**
   * @description 页面过渡效果
   */
  pageTransition: 'slide-left',
  /**
   * @description 标签页样式
   */
  tabStyle: 'tab-default',
  /**
   * @description 自定义圆角
   */
  customRadius: '0.75',
  /**
   * @description 容器宽度
   */
  containerWidth: ContainerWidthEnum.FULL,
  /**
   * @description 节日日期
   */
  festivalDate: ''
}

/**
 * @description 返回系统设置默认值的浅拷贝。
 * @returns {typeof SETTING_DEFAULT_CONFIG} 可独立修改顶层属性的系统设置默认配置副本。
 * @example
 * const result = getSettingDefaults()
 */
export function getSettingDefaults() {
  return { ...SETTING_DEFAULT_CONFIG }
}

/**
 * @description 将已有设置对象中的已知字段重置为默认值。
 * @param {Record<string, any>} currentSettings 需要原位重置的现有设置对象。
 * @returns {void} 已存在字段原位重置完成后不返回值。
 */
export function resetToDefaults(currentSettings: Record<string, any>) {
  const defaults = getSettingDefaults()
  Object.keys(defaults).forEach((key) => {
    if (key in currentSettings) {
      currentSettings[key] = defaults[key as keyof typeof defaults]
    }
  })
}
