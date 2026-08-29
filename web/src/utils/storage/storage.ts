/**
 * @fileoverview 本地存储兼容性检查与异常恢复工具。
 * @description 识别当前、历史及旧格式数据，验证登录所需存储并在异常时触发恢复流程。
 *
 * 提供完整的本地存储兼容性检查和数据验证功能
 *
 * 主要功能
 *
 * - 多版本存储数据检测和验证
 * - 新旧存储格式兼容处理
 * - 存储数据完整性校验
 * - 存储异常自动恢复（清理+登出）
 * - 登录状态验证
 * - 存储为空检测
 * - 版本号管理
 *
 * ## 使用场景
 *
 * - 应用启动时检查存储数据有效性
 * - 路由守卫中验证登录状态
 * - 版本升级时的数据兼容性检查
 * - 存储异常时的自动恢复
 * - 防止因存储数据损坏导致的系统异常
 *
 * ## 工作流程
 *
 * 1. 优先检查当前版本的存储数据
 * 2. 检查其他版本的存储数据
 * 3. 兼容旧格式的存储数据
 * 4. 验证数据完整性
 * 5. 异常时提示用户并执行登出
 *
 * @module utils/storage/storage
 */
import { router } from '@/router'
import { useUserStore } from '@/store/modules/user'
import { StorageConfig } from '@/utils/storage/storage-config'

/**
 * @description 处理不同版本本地存储的识别、完整性验证和异常登出恢复。
 */
class StorageCompatibilityManager {
  /**
   * @description 读取本地记录的系统版本号。
   * @returns {string | null} 已记录的版本号；不存在时返回 null。
   */
  getSystemVersion(): string | null {
    return localStorage.getItem(StorageConfig.VERSION_KEY)
  }

  /**
   * @description 读取并解析不含 Store 标识的旧格式系统存储数据。
   * @returns {any} 解析后的旧格式数据；键不存在时返回 null。
   * @throws {SyntaxError} 存储内容不是有效 JSON 时抛出。
   */
  getSystemStorage(): any {
    const version = this.getSystemVersion() || StorageConfig.CURRENT_VERSION
    const legacyKey = StorageConfig.generateLegacyKey(version)
    const data = localStorage.getItem(legacyKey)
    return data ? JSON.parse(data) : null
  }

  /**
   * @description 检查当前版本是否至少存在一项非空 Store 数据。
   * @returns {boolean} 存在当前版本数据时返回 true。
   */
  private hasCurrentVersionStorage(): boolean {
    const storageKeys = Object.keys(localStorage)
    const currentVersionPattern = StorageConfig.createCurrentVersionPattern()

    return storageKeys.some(
      (key) => currentVersionPattern.test(key) && localStorage.getItem(key) !== null
    )
  }

  /**
   * @description 检查本地是否存在任意版本的非空系统存储数据。
   * @returns {boolean} 存在版本化数据时返回 true。
   */
  private hasAnyVersionStorage(): boolean {
    const storageKeys = Object.keys(localStorage)
    const versionPattern = StorageConfig.createVersionPattern()

    return storageKeys.some((key) => versionPattern.test(key) && localStorage.getItem(key) !== null)
  }

  /**
   * @description 安全读取旧格式数据，解析失败时记录警告并返回空对象。
   * @returns {Record<string, any>} 旧格式数据或空对象。
   */
  private getLegacyStorageData(): Record<string, any> {
    try {
      const systemStorage = this.getSystemStorage()
      return systemStorage || {}
    } catch (error) {
      console.warn('[Storage] 解析旧格式存储数据失败:', error)
      return {}
    }
  }

  /**
   * @description 显示本地数据异常并需要重新登录的消息。
   * @returns {void} 无返回值。
   */
  private showStorageError(): void {
    ElMessage({
      type: 'error',
      offset: 40,
      duration: 5000,
      message: '系统检测到本地数据异常，请重新登录系统恢复使用！'
    })
  }

  /**
   * @description 延迟清空本地存储、退出用户状态并跳转登录页。
   * @returns {void} 无返回值。
   */
  private performSystemLogout(): void {
    setTimeout(() => {
      try {
        localStorage.clear()
        useUserStore().logOut()
        router.push({ name: 'Login' })
        console.info('[Storage] 已执行系统登出')
      } catch (error) {
        console.error('[Storage] 系统登出失败:', error)
      }
    }, StorageConfig.LOGOUT_DELAY)
  }

  /**
   * @description 组合执行异常提示和系统登出恢复流程。
   * @returns {void} 无返回值。
   */
  private handleStorageError(): void {
    this.showStorageError()
    this.performSystemLogout()
  }

  /**
   * @description 按当前版本、其他版本和旧格式的顺序验证本地存储是否可用。
   * @param {boolean} [requireAuth=false] 是否在无有效数据或异常时执行登出。
   * @returns {boolean} 当前场景可继续使用应用时返回 true。
   */
  validateStorageData(requireAuth: boolean = false): boolean {
    try {
      // 优先检查新版本存储结构
      if (this.hasCurrentVersionStorage()) {
        // console.debug('[Storage] 发现当前版本存储数据')
        return true
      }

      // 检查是否有任何版本的存储数据
      if (this.hasAnyVersionStorage()) {
        // console.debug('[Storage] 发现其他版本存储数据，可能需要迁移')
        return true
      }

      // 检查旧版本存储结构
      const legacyData = this.getLegacyStorageData()
      if (Object.keys(legacyData).length === 0) {
        // 只有在需要验证登录状态时才执行登出操作
        if (requireAuth) {
          console.warn('[Storage] 未发现任何存储数据，需要重新登录')
          this.performSystemLogout()
          return false
        }
        // 首次访问或访问静态路由，不需要登出
        // console.debug('[Storage] 未发现存储数据，首次访问或访问静态路由')
        return true
      }

      console.debug('[Storage] 发现旧版本存储数据')
      return true
    } catch (error) {
      console.error('[Storage] 存储数据验证失败:', error)
      // 只有在需要验证登录状态时才处理错误
      if (requireAuth) {
        this.handleStorageError()
        return false
      }
      return true
    }
  }

  /**
   * @description 判断当前、历史和旧格式存储是否均无业务数据。
   * @returns {boolean} 所有受支持格式均为空时返回 true。
   */
  isStorageEmpty(): boolean {
    // 检查新版本存储结构
    if (this.hasCurrentVersionStorage()) {
      return false
    }

    // 检查是否有任何版本的存储数据
    if (this.hasAnyVersionStorage()) {
      return false
    }

    // 检查旧版本存储结构
    const legacyData = this.getLegacyStorageData()
    return Object.keys(legacyData).length === 0
  }

  /**
   * @description 综合数据有效性与空存储状态判断当前环境是否兼容。
   * @param {boolean} [requireAuth=false] 是否要求存在有效登录存储。
   * @returns {boolean} 验证通过或允许空存储时返回 true。
   */
  checkCompatibility(requireAuth: boolean = false): boolean {
    try {
      const isValid = this.validateStorageData(requireAuth)
      const isEmpty = this.isStorageEmpty()

      if (isValid || isEmpty) {
        // console.debug('[Storage] 存储兼容性检查通过')
        return true
      }

      console.warn('[Storage] 存储兼容性检查失败')
      return false
    } catch (error) {
      console.error('[Storage] 兼容性检查异常:', error)
      return false
    }
  }
}

/**
 * @description 模块级存储兼容性管理器单例。
 * @type {StorageCompatibilityManager}
 */
const storageManager = new StorageCompatibilityManager()

/**
 * @description 获取并解析旧格式系统存储数据。
 * @returns {any} 解析后的数据；对应键不存在时返回 null。
 * @throws {SyntaxError} 存储内容不是有效 JSON 时抛出。
 * @example
 * const legacyStorage = getSystemStorage()
 */
export function getSystemStorage(): any {
  return storageManager.getSystemStorage()
}

/**
 * @description 获取本地记录的系统版本号。
 * @returns {string | null} 已记录的版本号；不存在时返回 null。
 * @example
 * const version = getSysVersion()
 */
export function getSysVersion(): string | null {
  return storageManager.getSystemVersion()
}

/**
 * @description 验证本地存储是否满足当前访问场景要求。
 * @param {boolean} [requireAuth=false] 是否要求有效登录存储。
 * @returns {boolean} 存储可用时返回 true。
 * @example
 * validateStorageData(true)
 */
export function validateStorageData(requireAuth: boolean = false): boolean {
  return storageManager.validateStorageData(requireAuth)
}

/**
 * @description 检查当前本地存储结构是否可被应用兼容使用。
 * @param {boolean} [requireAuth=false] 是否要求有效登录存储。
 * @returns {boolean} 存储兼容或允许为空时返回 true。
 * @example
 * checkStorageCompatibility(false)
 */
export function checkStorageCompatibility(requireAuth: boolean = false): boolean {
  return storageManager.checkCompatibility(requireAuth)
}
