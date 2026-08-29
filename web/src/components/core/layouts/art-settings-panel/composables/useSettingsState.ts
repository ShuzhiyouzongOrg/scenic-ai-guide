/**
 * @fileoverview 提供系统设置状态的初始化与菜单布局切换能力。
 * @description 将色弱模式和菜单主题联动逻辑集中封装，供设置面板调用。
 */

import { useSettingStore } from '@/store/modules/setting'
import { MenuThemeEnum, MenuTypeEnum } from '@/enums/appEnum'

/**
 * @description 设置状态管理
 * @returns {object} 色弱模式初始化方法与菜单布局切换方法。
 * @example
 * const { initColorWeak, switchMenuLayouts } = useSettingsState()
 */
export function useSettingsState() {
  const settingStore = useSettingStore()

  // 色弱模式初始化
  const initColorWeak = () => {
    if (settingStore.colorWeak) {
      const el = document.getElementsByTagName('html')[0]
      setTimeout(() => {
        el.classList.add('color-weak')
      }, 100)
    }
  }

  // 菜单布局切换
  const switchMenuLayouts = (type: MenuTypeEnum) => {
    if (type === MenuTypeEnum.LEFT || type === MenuTypeEnum.TOP_LEFT) {
      settingStore.setMenuOpen(true)
    }
    settingStore.switchMenuLayouts(type)
    if (type === MenuTypeEnum.DUAL_MENU) {
      settingStore.switchMenuStyles(MenuThemeEnum.DESIGN)
      settingStore.setMenuOpen(true)
    }
  }

  return {
    // 方法
    initColorWeak,
    switchMenuLayouts
  }
}
