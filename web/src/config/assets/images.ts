/**
 * @fileoverview 界面图片资源配置。
 * @description 集中声明系统设置、主题和菜单布局使用的图片资源地址。
 */

import lightTheme from '@imgs/settings/theme_styles/light.png'
import darkTheme from '@imgs/settings/theme_styles/dark.png'
import systemTheme from '@imgs/settings/theme_styles/system.png'
import verticalLayout from '@imgs/settings/menu_layouts/vertical.png'
import horizontalLayout from '@imgs/settings/menu_layouts/horizontal.png'
import mixedLayout from '@imgs/settings/menu_layouts/mixed.png'
import dualColumnLayout from '@imgs/settings/menu_layouts/dual_column.png'
import designStyle from '@imgs/settings/menu_styles/design.png'
import darkStyle from '@imgs/settings/menu_styles/dark.png'
import lightStyle from '@imgs/settings/menu_styles/light.png'

/**
 * @description 系统设置、主题和菜单布局使用的图片资源映射。
 * @type {Record<string, string>}
 */
export const configImages = {
  /**
   * @description 系统主题预览图
   */
  themeStyles: {
    /**
     * @description 亮色主题
     */
    light: lightTheme,
    /**
     * @description 暗色主题
     */
    dark: darkTheme,
    /**
     * @description 自动主题（跟随系统）
     */
    system: systemTheme
  },
  /**
   * @description 菜单布局预览图
   */
  menuLayouts: {
    /**
     * @description 左侧菜单
     */
    vertical: verticalLayout,
    /**
     * @description 顶部菜单
     */
    horizontal: horizontalLayout,
    /**
     * @description 混合菜单
     */
    mixed: mixedLayout,
    /**
     * @description 双栏菜单
     */
    dualColumn: dualColumnLayout
  },
  /**
   * @description 菜单风格预览图
   */
  menuStyles: {
    /**
     * @description 设计风格
     */
    design: designStyle,
    /**
     * @description 暗色风格
     */
    dark: darkStyle,
    /**
     * @description 亮色风格
     */
    light: lightStyle
  }
}
