/**
 * @fileoverview 创建并导出 Web 应用的 vue-i18n 实例。
 * @description 合并框架与业务文案、恢复持久化语言偏好并提供全局翻译函数。
 */

/**
 * @description 国际化配置
 *
 * 基于 vue-i18n 实现的多语言国际化解决方案。
 * 支持简体中文、英文、韩文、繁体中文、日文和泰文切换，自动从本地存储恢复用户的语言偏好。
 *
 * ## 主要功能
 *
 * - 多语言支持 - 支持六种界面语言
 * - 语言切换 - 运行时动态切换语言，无需刷新页面
 * - 持久化存储 - 自动保存和恢复用户的语言偏好
 * - 全局注入 - 在任何组件中都可以使用 $t 函数进行翻译
 * - 类型安全 - 提供 TypeScript 类型支持
 *
 * ## 支持的语言
 *
 * - zh: 简体中文
 * - en: English
 * - ko: 한국어
 * - zh-TW: 繁體中文
 * - ja: 日本語
 * - th: ภาษาไทย
 *
 * @module locales
 *
 */

import { createI18n } from 'vue-i18n'
import type { I18n, I18nOptions } from 'vue-i18n'
import { LanguageEnum } from '@/enums/appEnum'
import { getSystemStorage } from '@/utils/storage'
import { StorageKeyManager } from '@/utils/storage/storage-key-manager'
import { appMessages } from './app-messages'
import { frameworkMessages } from './framework-messages'

// 同步导入语言文件
import enMessages from './langs/en.json'
import zhMessages from './langs/zh.json'
import thMessages from './langs/th.json'

/**
 * @description 存储键管理器实例
 */
const storageKeyManager = new StorageKeyManager()

/**
 * @description 语言消息对象
 */
function mergeMessages(
  base: Record<string, any>,
  override: Record<string, any>
): Record<string, any> {
  const merged = { ...base }
  Object.entries(override).forEach(([key, value]) => {
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? mergeMessages((base[key] as Record<string, any>) || {}, value as Record<string, any>)
        : value
  })
  return merged
}

const messages = {
  [LanguageEnum.EN]: { ...enMessages, app: appMessages[LanguageEnum.EN] },
  [LanguageEnum.ZH]: { ...zhMessages, app: appMessages[LanguageEnum.ZH] },
  [LanguageEnum.KO]: mergeMessages(enMessages, {
    ...frameworkMessages[LanguageEnum.KO],
    app: appMessages[LanguageEnum.KO]
  }),
  [LanguageEnum.ZH_TW]: mergeMessages(zhMessages, {
    ...frameworkMessages[LanguageEnum.ZH_TW],
    app: appMessages[LanguageEnum.ZH_TW]
  }),
  [LanguageEnum.JA]: mergeMessages(enMessages, {
    ...frameworkMessages[LanguageEnum.JA],
    app: appMessages[LanguageEnum.JA]
  }),
  [LanguageEnum.TH]: { ...thMessages, app: appMessages[LanguageEnum.TH] }
}

/**
 * @description 语言切换控件使用的语言代码与本地化名称列表。
 * @type {Array<{value: LanguageEnum, label: string}>}
 */
export const languageOptions = [
  { value: LanguageEnum.ZH, label: '简体中文' },
  { value: LanguageEnum.EN, label: 'English' },
  { value: LanguageEnum.KO, label: '한국어' },
  { value: LanguageEnum.ZH_TW, label: '繁體中文' },
  { value: LanguageEnum.JA, label: '日本語' },
  { value: LanguageEnum.TH, label: 'ภาษาไทย' }
]

/**
 * @description 从存储中获取语言设置
 * @returns {LanguageEnum} 已保存且有效的语言设置；读取失败时返回默认语言。
 */
const getDefaultLanguage = (): LanguageEnum => {
  // 尝试从版本化的存储中获取语言设置
  try {
    const storageKey = storageKeyManager.getStorageKey('user')
    const userStore = localStorage.getItem(storageKey)

    if (userStore) {
      const { language } = JSON.parse(userStore)
      if (language && Object.values(LanguageEnum).includes(language)) {
        return language
      }
    }
  } catch (error) {
    console.warn('[i18n] 从版本化存储获取语言设置失败:', error)
  }

  // 尝试从系统存储中获取语言设置
  try {
    const sys = getSystemStorage()
    if (sys) {
      const { user } = JSON.parse(sys)
      if (user?.language && Object.values(LanguageEnum).includes(user.language)) {
        return user.language
      }
    }
  } catch (error) {
    console.warn('[i18n] 从系统存储获取语言设置失败:', error)
  }

  // 返回默认语言
  console.debug('[i18n] 使用默认语言:', LanguageEnum.ZH)
  return LanguageEnum.ZH
}

/**
 * @description i18n 配置选项
 */
const i18nOptions: I18nOptions = {
  locale: getDefaultLanguage(),
  legacy: false,
  globalInjection: true,
  fallbackLocale: LanguageEnum.EN,
  messages
}

/**
 * @description i18n 实例
 * @type {I18n}
 */
const i18n: I18n = createI18n(i18nOptions)

/**
 * @description 翻译函数类型
 */
interface Translation {
  (key: string): string
}

/**
 * @description 无需组件上下文即可调用的全局翻译函数。
 * @type {Translation}
 * @param {string} key vue-i18n 消息键。
 * @returns {string} 当前语言对应的翻译文本。
 * @example
 * const title = $t('app.navGuide')
 */
export const $t = i18n.global.t as Translation

/**
 * @description 导出已合并业务与框架消息并恢复用户语言偏好的 vue-i18n 实例。
 * @type {I18n}
 */
export default i18n
