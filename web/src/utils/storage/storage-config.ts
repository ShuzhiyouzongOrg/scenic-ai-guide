/**
 * @fileoverview 版本化本地存储的配置与键名解析工具。
 * @description 定义存储前缀、应用版本和迁移延迟，并提供键名生成、匹配与字段提取方法。
 *
 * 提供统一的本地存储配置和工具方法
 *
 * ## 主要功能
 *
 * - 版本化存储键管理，支持多版本数据隔离
 * - 存储键名生成和解析（带版本前缀）
 * - 版本号提取和验证
 * - 存储键匹配的正则表达式生成
 * - 旧版本存储键兼容处理
 * - 升级和登出延迟配置
 * - 主题存储键配置
 *
 * ## 使用场景
 *
 * - Pinia Store 持久化存储
 * - 应用版本升级时的数据迁移
 * - 多版本数据清理
 * - 存储键的统一管理和规范
 *
 * 存储键格式：sys-v{version}-{storeId}
 * 例如：sys-v1.0.0-user, sys-v1.0.0-setting
 *
 * @module utils/storage/storage-config
 */
/**
 * @class
 * @description 集中管理版本化本地存储的常量、键名规则和解析方法。
 * @example
 * const userKey = StorageConfig.generateStorageKey('user')
 */
export class StorageConfig {
  /**
   * @description 当前应用构建版本。
   * @type {string}
   */
  static readonly CURRENT_VERSION = __APP_VERSION__

  /**
   * @description 所有版本化存储键共享的前缀。
   * @type {string}
   */
  static readonly STORAGE_PREFIX = 'sys-v'

  /**
   * @description 记录当前系统版本的独立存储键。
   * @type {string}
   */
  static readonly VERSION_KEY = 'sys-version'

  /**
   * @description 主题设置存储键；修改时需同步更新 index.html。
   * @type {string}
   */
  static readonly THEME_KEY = 'sys-theme'

  /**
   * @description 上次登录用户 ID 的存储键，用于识别账号切换。
   * @type {string}
   */
  static readonly LAST_USER_ID_KEY = 'sys-last-user-id'

  /**
   * @description 响应式布局切换期间保存桌面端菜单类型的存储键。
   * @type {string}
   */
  static readonly RESPONSIVE_MENU_TYPE_KEY = 'sys-responsive-menu-type'

  /**
   * @description 无需执行升级提示和迁移检查的基准版本。
   * @type {string}
   */
  static readonly SKIP_UPGRADE_VERSION = '1.0.0'

  /**
   * @description 启动后执行升级处理的延迟毫秒数。
   * @type {number}
   */
  static readonly UPGRADE_DELAY = 1000

  /**
   * @description 存储异常后执行登出的延迟毫秒数。
   * @type {number}
   */
  static readonly LOGOUT_DELAY = 1000

  /**
   * @description 生成包含版本号和 Store 标识的存储键。
   * @param {string} storeId Pinia Store 或业务存储标识。
   * @param {string} [version=CURRENT_VERSION] 目标应用版本。
   * @returns {string} 格式为 sys-v{version}-{storeId} 的存储键。
   * @example
   * StorageConfig.generateStorageKey('user', '3.0.0')
   */
  static generateStorageKey(storeId: string, version: string = this.CURRENT_VERSION): string {
    return `${this.STORAGE_PREFIX}${version}-${storeId}`
  }

  /**
   * @description 生成不包含 Store 标识的旧版存储键。
   * @param {string} [version=CURRENT_VERSION] 目标应用版本。
   * @returns {string} 旧版存储键。
   */
  static generateLegacyKey(version: string = this.CURRENT_VERSION): string {
    return `${this.STORAGE_PREFIX}${version}`
  }

  /**
   * @description 创建用于匹配任意版本指定 Store 存储键的正则表达式。
   * @param {string} storeId Store 标识。
   * @returns {RegExp} 存储键匹配表达式。
   */
  static createKeyPattern(storeId: string): RegExp {
    return new RegExp(`^${this.STORAGE_PREFIX}[^-]+-${storeId}$`)
  }

  /**
   * @description 创建用于匹配当前版本所有 Store 存储键的正则表达式。
   * @returns {RegExp} 当前版本键匹配表达式。
   */
  static createCurrentVersionPattern(): RegExp {
    return new RegExp(`^${this.STORAGE_PREFIX}${this.CURRENT_VERSION}-`)
  }

  /**
   * @description 创建用于匹配全部版本化存储键的正则表达式。
   * @returns {RegExp} 版本化存储键匹配表达式。
   */
  static createVersionPattern(): RegExp {
    return new RegExp(`^${this.STORAGE_PREFIX}`)
  }

  /**
   * @description 判断键名是否属于当前应用版本。
   * @param {string} key 待检查的存储键。
   * @returns {boolean} 键名包含当前版本前缀时返回 true。
   */
  static isCurrentVersionKey(key: string): boolean {
    return key.startsWith(`${this.STORAGE_PREFIX}${this.CURRENT_VERSION}`)
  }

  /**
   * @description 判断键名是否采用系统版本化存储格式。
   * @param {string} key 待检查的存储键。
   * @returns {boolean} 键名以版本化前缀开头时返回 true。
   */
  static isVersionedKey(key: string): boolean {
    return key.startsWith(this.STORAGE_PREFIX)
  }

  /**
   * @description 从版本化存储键中解析版本号。
   * @param {string} key 待解析的存储键。
   * @returns {string | null} 解析到的版本号；格式不匹配时返回 null。
   */
  static extractVersionFromKey(key: string): string | null {
    const match = key.match(new RegExp(`^${this.STORAGE_PREFIX}([^-]+)`))
    return match ? match[1] : null
  }

  /**
   * @description 从版本化存储键中解析 Store 标识。
   * @param {string} key 待解析的存储键。
   * @returns {string | null} 解析到的 Store 标识；格式不匹配时返回 null。
   */
  static extractStoreIdFromKey(key: string): string | null {
    const match = key.match(new RegExp(`^${this.STORAGE_PREFIX}[^-]+-(.+)$`))
    return match ? match[1] : null
  }
}
