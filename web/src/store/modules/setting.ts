/**
 * @fileoverview 系统设置状态管理模块。
 * @description 维护主题、菜单、语言、页面布局和显示偏好，并处理持久化恢复。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { MenuThemeType } from '@/types/store'
import AppConfig from '@/config'
import { SystemThemeEnum, MenuThemeEnum, MenuTypeEnum, ContainerWidthEnum } from '@/enums/appEnum'
import { setElementThemeColor } from '@/utils/ui'
import { useCeremony } from '@/hooks/core/useCeremony'
import { StorageConfig } from '@/utils'
import { SETTING_DEFAULT_CONFIG } from '@/config/setting'

/**
 * @description 系统设置 Store 定义。
 * @type {import('pinia').StoreDefinition}
 */
export const useSettingStore = defineStore(
  'settingStore',
  () => {
    // 菜单相关设置
    /**
     * @description 菜单类型。
     */
    const menuType = ref(SETTING_DEFAULT_CONFIG.menuType)
    /**
     * @description 菜单展开宽度。
     */
    const menuOpenWidth = ref(SETTING_DEFAULT_CONFIG.menuOpenWidth)
    /**
     * @description 菜单是否展开。
     */
    const menuOpen = ref(SETTING_DEFAULT_CONFIG.menuOpen)
    /**
     * @description 双菜单是否显示文本。
     */
    const dualMenuShowText = ref(SETTING_DEFAULT_CONFIG.dualMenuShowText)

    // 主题相关设置
    /**
     * @description 系统主题类型。
     */
    const systemThemeType = ref(SETTING_DEFAULT_CONFIG.systemThemeType)
    /**
     * @description 系统主题模式。
     */
    const systemThemeMode = ref(SETTING_DEFAULT_CONFIG.systemThemeMode)
    /**
     * @description 菜单主题类型。
     */
    const menuThemeType = ref(SETTING_DEFAULT_CONFIG.menuThemeType)
    /**
     * @description 系统主题颜色。
     */
    const systemThemeColor = ref(SETTING_DEFAULT_CONFIG.systemThemeColor)

    // 界面显示设置
    /**
     * @description 是否显示菜单按钮。
     */
    const showMenuButton = ref(SETTING_DEFAULT_CONFIG.showMenuButton)
    /**
     * @description 是否显示快速入口。
     */
    const showFastEnter = ref(SETTING_DEFAULT_CONFIG.showFastEnter)
    /**
     * @description 是否显示刷新按钮。
     */
    const showRefreshButton = ref(SETTING_DEFAULT_CONFIG.showRefreshButton)
    /**
     * @description 是否显示面包屑。
     */
    const showCrumbs = ref(SETTING_DEFAULT_CONFIG.showCrumbs)
    /**
     * @description 是否显示工作台标签。
     */
    const showWorkTab = ref(SETTING_DEFAULT_CONFIG.showWorkTab)
    /**
     * @description 是否显示语言切换。
     */
    const showLanguage = ref(SETTING_DEFAULT_CONFIG.showLanguage)
    /**
     * @description 是否显示进度条。
     */
    const showNprogress = ref(SETTING_DEFAULT_CONFIG.showNprogress)
    /**
     * @description 是否显示设置引导。
     */
    const showSettingGuide = ref(SETTING_DEFAULT_CONFIG.showSettingGuide)
    /**
     * @description 是否显示节日文本。
     */
    const showFestivalText = ref(SETTING_DEFAULT_CONFIG.showFestivalText)
    /**
     * @description 是否显示水印。
     */
    const watermarkVisible = ref(SETTING_DEFAULT_CONFIG.watermarkVisible)

    // 功能设置
    /**
     * @description 是否自动关闭。
     */
    const autoClose = ref(SETTING_DEFAULT_CONFIG.autoClose)
    /**
     * @description 是否唯一展开。
     */
    const uniqueOpened = ref(SETTING_DEFAULT_CONFIG.uniqueOpened)
    /**
     * @description 是否色弱模式。
     */
    const colorWeak = ref(SETTING_DEFAULT_CONFIG.colorWeak)
    /**
     * @description 是否刷新。
     */
    const refresh = ref(SETTING_DEFAULT_CONFIG.refresh)
    /**
     * @description 是否加载节日烟花。
     */
    const holidayFireworksLoaded = ref(SETTING_DEFAULT_CONFIG.holidayFireworksLoaded)

    // 样式设置
    /**
     * @description 边框模式。
     */
    const boxBorderMode = ref(SETTING_DEFAULT_CONFIG.boxBorderMode)
    /**
     * @description 页面过渡效果。
     */
    const pageTransition = ref(SETTING_DEFAULT_CONFIG.pageTransition)
    /**
     * @description 标签页样式。
     */
    const tabStyle = ref(SETTING_DEFAULT_CONFIG.tabStyle)
    /**
     * @description 自定义圆角。
     */
    const customRadius = ref(SETTING_DEFAULT_CONFIG.customRadius)
    /**
     * @description 容器宽度。
     */
    const containerWidth = ref(SETTING_DEFAULT_CONFIG.containerWidth)

    // 节日相关
    /**
     * @description 节日日期。
     */
    const festivalDate = ref('')

    /**
     * @description 获取菜单主题。
     * 根据当前主题类型和暗色模式返回对应的主题配置
     */
    const getMenuTheme = computed((): MenuThemeType => {
      const list = AppConfig.themeList.filter((item) => item.theme === menuThemeType.value)
      if (isDark.value) {
        return AppConfig.darkMenuStyles[0]
      } else {
        return list[0]
      }
    })

    /**
     * @description 判断是否为暗色模式。
     */
    const isDark = computed((): boolean => {
      return systemThemeType.value === SystemThemeEnum.DARK
    })

    /**
     * @description 获取菜单展开宽度。
     */
    const getMenuOpenWidth = computed((): string => {
      return menuOpenWidth.value + 'px' || SETTING_DEFAULT_CONFIG.menuOpenWidth + 'px'
    })

    /**
     * @description 获取自定义圆角。
     */
    const getCustomRadius = computed((): string => {
      return customRadius.value + 'rem' || SETTING_DEFAULT_CONFIG.customRadius + 'rem'
    })

    /**
     * @description 是否显示烟花。
     * 根据当前日期和节日日期判断是否显示烟花效果
     */
    const isShowFireworks = computed((): boolean => {
      return festivalDate.value === useCeremony().currentFestivalData.value?.date ? false : true
    })

    /**
     * @description 切换菜单布局。
     * @param {MenuTypeEnum} type 菜单类型。
     */
    const switchMenuLayouts = (type: MenuTypeEnum) => {
      menuType.value = type
    }

    /**
     * @description 设置菜单展开宽度。
     * @param {number} width 菜单展开宽度。
     */
    const setMenuOpenWidth = (width: number) => {
      menuOpenWidth.value = width
    }

    /**
     * @description 设置全局主题。
     * @param {SystemThemeEnum} theme 主题类型。
     * @param {SystemThemeEnum} themeMode 主题模式。
     */
    const setGlopTheme = (theme: SystemThemeEnum, themeMode: SystemThemeEnum) => {
      systemThemeType.value = theme
      systemThemeMode.value = themeMode
      localStorage.setItem(StorageConfig.THEME_KEY, theme)
    }

    /**
     * @description 切换菜单样式。
     * @param {MenuThemeEnum} theme 菜单主题。
     */
    const switchMenuStyles = (theme: MenuThemeEnum) => {
      menuThemeType.value = theme
    }

    /**
     * @description 设置 Element Plus 主题颜色。
     * @param {string} theme 主题颜色。
     */
    const setElementTheme = (theme: string) => {
      systemThemeColor.value = theme
      setElementThemeColor(theme)
    }

    /**
     * @description 切换边框模式。
     */
    const setBorderMode = () => {
      boxBorderMode.value = !boxBorderMode.value
    }

    /**
     * @description 设置容器宽度。
     * @param {ContainerWidthEnum} width 容器宽度枚举值。
     */
    const setContainerWidth = (width: ContainerWidthEnum) => {
      containerWidth.value = width
    }

    /**
     * @description 切换唯一展开模式。
     */
    const setUniqueOpened = () => {
      uniqueOpened.value = !uniqueOpened.value
    }

    /**
     * @description 切换菜单按钮显示。
     */
    const setButton = () => {
      showMenuButton.value = !showMenuButton.value
    }

    /**
     * @description 切换快速入口显示。
     */
    const setFastEnter = () => {
      showFastEnter.value = !showFastEnter.value
    }

    /**
     * @description 切换自动关闭。
     */
    const setAutoClose = () => {
      autoClose.value = !autoClose.value
    }

    /**
     * @description 切换刷新按钮显示。
     */
    const setShowRefreshButton = () => {
      showRefreshButton.value = !showRefreshButton.value
    }

    /**
     * @description 切换面包屑显示。
     */
    const setCrumbs = () => {
      showCrumbs.value = !showCrumbs.value
    }

    /**
     * @description 设置工作台标签显示状态。
     * @param {boolean} show 是否显示工作台标签。
     */
    const setWorkTab = (show: boolean) => {
      showWorkTab.value = show
    }

    /**
     * @description 切换语言切换控件显示状态。
     */
    const setLanguage = () => {
      showLanguage.value = !showLanguage.value
    }

    /**
     * @description 切换进度条显示状态。
     */
    const setNprogress = () => {
      showNprogress.value = !showNprogress.value
    }

    /**
     * @description 切换色弱模式。
     */
    const setColorWeak = () => {
      colorWeak.value = !colorWeak.value
    }

    /**
     * @description 隐藏设置引导。
     */
    const hideSettingGuide = () => {
      showSettingGuide.value = false
    }

    /**
     * @description 显示设置引导。
     */
    const openSettingGuide = () => {
      showSettingGuide.value = true
    }

    /**
     * @description 设置页面过渡效果。
     * @param {string} transition 过渡效果名称。
     */
    const setPageTransition = (transition: string) => {
      pageTransition.value = transition
    }

    /**
     * @description 设置标签页样式。
     * @param {string} style 标签页样式名称。
     */
    const setTabStyle = (style: string) => {
      tabStyle.value = style
    }

    /**
     * @description 设置菜单展开状态。
     * @param {boolean} open 菜单是否展开。
     */
    const setMenuOpen = (open: boolean) => {
      menuOpen.value = open
    }

    /**
     * @description 刷新页面。
     */
    const reload = () => {
      refresh.value = !refresh.value
    }

    /**
     * @description 设置水印显示状态。
     * @param {boolean} visible 是否显示水印。
     */
    const setWatermarkVisible = (visible: boolean) => {
      watermarkVisible.value = visible
    }

    /**
     * @description 设置自定义圆角。
     * @param {string} radius 以 rem 为单位的圆角数值字符串。
     */
    const setCustomRadius = (radius: string) => {
      customRadius.value = radius
      document.documentElement.style.setProperty('--custom-radius', `${radius}rem`)
    }

    /**
     * @description 设置节日烟花加载状态。
     * @param {boolean} isLoad 节日烟花是否已加载。
     */
    const setholidayFireworksLoaded = (isLoad: boolean) => {
      holidayFireworksLoaded.value = isLoad
    }

    /**
     * @description 设置节日文本显示状态。
     * @param {boolean} show 是否显示节日文本。
     */
    const setShowFestivalText = (show: boolean) => {
      showFestivalText.value = show
    }

    const setFestivalDate = (date: string) => {
      festivalDate.value = date
    }

    const setDualMenuShowText = (show: boolean) => {
      dualMenuShowText.value = show
    }

    return {
      menuType,
      menuOpenWidth,
      systemThemeType,
      systemThemeMode,
      menuThemeType,
      systemThemeColor,
      boxBorderMode,
      uniqueOpened,
      showMenuButton,
      showFastEnter,
      showRefreshButton,
      showCrumbs,
      autoClose,
      showWorkTab,
      showLanguage,
      showNprogress,
      colorWeak,
      showSettingGuide,
      pageTransition,
      tabStyle,
      menuOpen,
      refresh,
      watermarkVisible,
      customRadius,
      holidayFireworksLoaded,
      showFestivalText,
      festivalDate,
      dualMenuShowText,
      containerWidth,
      getMenuTheme,
      isDark,
      getMenuOpenWidth,
      getCustomRadius,
      isShowFireworks,
      switchMenuLayouts,
      setMenuOpenWidth,
      setGlopTheme,
      switchMenuStyles,
      setElementTheme,
      setBorderMode,
      setContainerWidth,
      setUniqueOpened,
      setButton,
      setFastEnter,
      setAutoClose,
      setShowRefreshButton,
      setCrumbs,
      setWorkTab,
      setLanguage,
      setNprogress,
      setColorWeak,
      hideSettingGuide,
      openSettingGuide,
      setPageTransition,
      setTabStyle,
      setMenuOpen,
      reload,
      setWatermarkVisible,
      setCustomRadius,
      setholidayFireworksLoaded,
      setShowFestivalText,
      setFestivalDate,
      setDualMenuShowText
    }
  },
  {
    persist: {
      key: 'setting',
      storage: localStorage
    }
  }
)
