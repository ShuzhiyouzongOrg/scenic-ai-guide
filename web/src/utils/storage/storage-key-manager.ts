/**
 * @fileoverview 版本化存储键选择与数据迁移管理器。
 * @description 优先选择当前版本键，并在必要时将同一 Store 的旧版本数据迁移到新键。
 *
 * 提供智能的版本化存储键管理和数据迁移功能
 *
 * ## 主要功能
 *
 * - 自动生成当前版本的存储键名
 * - 检测当前版本数据是否存在
 * - 查找其他版本的同名存储数据
 * - 自动将旧版本数据迁移到当前版本
 * - 数据迁移日志记录
 * - 迁移失败的错误处理
 *
 * ## 使用场景
 *
 * - Pinia Store 持久化插件中获取存储键
 * - 应用版本升级时自动迁移用户数据
 * - 避免版本升级导致的数据丢失
 * - 实现平滑的版本过渡
 *
 * ## 工作流程
 *
 * 1. 优先使用当前版本的存储键
 * 2. 如果当前版本无数据，查找其他版本的同名数据
 * 3. 找到旧版本数据后自动迁移到当前版本
 * 4. 返回当前版本的存储键供使用
 *
 * @module utils/storage/storage-key-manager
 */
import { StorageConfig } from '@/utils/storage'

/**
 * @class
 * @description 负责生成当前版本存储键，并透明迁移可复用的旧版本数据。
 * @example
 * const manager = new StorageKeyManager()
 * const key = manager.getStorageKey('user')
 */
export class StorageKeyManager {
  /**
   * @description 获取指定 Store 在当前版本下的存储键。
   * @param {string} storeId Store 标识。
   * @returns {string} 当前版本存储键。
   */
  private getCurrentVersionKey(storeId: string): string {
    return StorageConfig.generateStorageKey(storeId)
  }

  /**
   * @description 检查指定存储键是否已有数据。
   * @param {string} key 待检查的存储键。
   * @returns {boolean} 本地存储中存在该键时返回 true。
   */
  private hasCurrentVersionData(key: string): boolean {
    return localStorage.getItem(key) !== null
  }

  /**
   * @description 查找其他版本中属于同一 Store 且包含数据的存储键。
   * @param {string} storeId Store 标识。
   * @returns {string | null} 首个匹配键；未找到时返回 null。
   */
  private findExistingKey(storeId: string): string | null {
    const storageKeys = Object.keys(localStorage)
    const pattern = StorageConfig.createKeyPattern(storeId)

    return storageKeys.find((key) => pattern.test(key) && localStorage.getItem(key)) || null
  }

  /**
   * @description 将旧键中的字符串数据复制到当前版本键；浏览器存储异常会被记录而不向外抛出。
   * @param {string} fromKey 旧版本存储键。
   * @param {string} toKey 当前版本存储键。
   * @returns {void} 无返回值。
   */
  private migrateData(fromKey: string, toKey: string): void {
    try {
      const existingData = localStorage.getItem(fromKey)
      if (existingData) {
        localStorage.setItem(toKey, existingData)
        console.info(`[Storage] 已迁移数据: ${fromKey} → ${toKey}`)
      }
    } catch (error) {
      console.warn(`[Storage] 数据迁移失败: ${fromKey}`, error)
    }
  }

  /**
   * @description 获取指定 Store 的当前版本键，并在当前键无数据时尝试迁移旧版本数据。
   * @param {string} storeId Store 标识。
   * @returns {string} 可供持久化插件使用的当前版本存储键。
   * @example
   * manager.getStorageKey('setting')
   */
  getStorageKey(storeId: string): string {
    const currentKey = this.getCurrentVersionKey(storeId)

    // 优先使用当前版本的数据
    if (this.hasCurrentVersionData(currentKey)) {
      return currentKey
    }

    // 查找并迁移其他版本的数据
    const existingKey = this.findExistingKey(storeId)
    if (existingKey) {
      this.migrateData(existingKey, currentKey)
    }

    return currentKey
  }
}
