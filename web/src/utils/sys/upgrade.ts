/**
 * @fileoverview 前端版本升级检测、通知与旧存储清理工具。
 * @description 对比本地和当前版本，展示更新日志，并按升级配置清理旧数据或要求重新登录。
 *
 * 提供完整的应用版本升级检测和处理功能
 *
 * ## 主要功能
 *
 * - 版本号比较和升级检测
 * - 首次访问识别和处理
 * - 旧版本数据自动清理
 * - 升级日志展示和通知
 * - 强制重新登录控制（根据升级日志配置）
 * - 版本号规范化处理
 * - 旧存储结构迁移和清理
 * - 升级流程延迟执行（确保应用完全加载）
 *
 * ## 使用场景
 *
 * - 应用启动时自动检测版本升级
 * - 版本更新后清理旧数据
 * - 向用户展示版本更新内容
 * - 重大更新时要求用户重新登录
 * - 防止旧版本数据污染新版本
 *
 * ## 工作流程
 *
 * 1. 检查本地存储的版本号
 * 2. 与当前应用版本对比
 * 3. 查找并清理旧版本数据
 * 4. 展示升级通知（包含更新日志）
 * 5. 根据配置决定是否强制重新登录
 * 6. 更新本地版本号
 *
 * @module utils/sys/upgrade
 */
import type { ProjectChangeLog } from '@/mock/upgrade/changeLog'
import { ElNotification } from 'element-plus'
import { useUserStore } from '@/store/modules/user'
import { StorageConfig } from '@/utils/storage/storage-config'

/**
 * @description 封装版本比较、旧存储识别、升级通知和重新登录流程。
 */
class VersionManager {
  /**
   * @description 将版本值转换为字符串并移除可选的 v 前缀。
   * @param {string} version 原始版本号。
   * @returns {string} 可用于比较的规范化版本号。
   */
  private normalizeVersion(version: string): string {
    return String(version ?? '').replace(/^v/, '')
  }

  /**
   * @description 读取本地存储中的应用版本号。
   * @returns {string | null} 已记录版本；不存在时返回 null。
   */
  private getStoredVersion(): string | null {
    return localStorage.getItem(StorageConfig.VERSION_KEY)
  }

  /**
   * @description 将指定应用版本写入本地存储。
   * @param {string} version 待保存的版本号。
   * @returns {void} 无返回值。
   */
  private setStoredVersion(version: string): void {
    localStorage.setItem(StorageConfig.VERSION_KEY, String(version))
  }

  /**
   * @description 判断当前构建是否为配置中无需执行升级流程的版本。
   * @returns {boolean} 应跳过升级处理时返回 true。
   */
  private shouldSkipUpgrade(): boolean {
    return StorageConfig.CURRENT_VERSION === StorageConfig.SKIP_UPGRADE_VERSION
  }

  /**
   * @description 根据本地版本是否缺失判断当前访问是否为首次访问。
   * @param {string | null} storedVersion 本地保存的版本号。
   * @returns {boolean} 未保存版本号时返回 true。
   */
  private isFirstVisit(storedVersion: string | null): boolean {
    return !storedVersion
  }

  /**
   * @description 判断本地版本是否与当前应用版本完全一致。
   * @param {string} storedVersion 本地保存的版本号。
   * @returns {boolean} 两个版本一致时返回 true。
   */
  private isSameVersion(storedVersion: string): boolean {
    return storedVersion === String(StorageConfig.CURRENT_VERSION)
  }

  /**
   * @description 扫描本地存储，查找旧版单键结构和历史版本的分离 Store 键。
   * @returns {{oldSysKey: string | null, oldVersionKeys: string[]}} 待迁移或清理的旧键集合。
   */
  private findLegacyStorage(): { oldSysKey: string | null; oldVersionKeys: string[] } {
    const storageKeys = Object.keys(localStorage)
    const currentVersionPrefix = StorageConfig.generateStorageKey('').slice(0, -1) // 移除末尾的 '-'

    // 查找旧的单一存储结构
    const oldSysKey =
      storageKeys.find(
        (key) =>
          StorageConfig.isVersionedKey(key) && key !== currentVersionPrefix && !key.includes('-')
      ) || null

    // 查找旧版本的分离存储键
    const oldVersionKeys = storageKeys.filter(
      (key) =>
        StorageConfig.isVersionedKey(key) &&
        !StorageConfig.isCurrentVersionKey(key) &&
        key.includes('-')
    )

    return { oldSysKey, oldVersionKeys }
  }

  /**
   * @description 判断本地版本到当前版本之间是否包含要求重新登录的更新记录。
   * @param {string} storedVersion 本地保存的版本号。
   * @param {ProjectChangeLog[]} projectChangeLog 项目更新日志。
   * @returns {boolean} 升级后需要重新登录时返回 true。
   */
  private shouldRequireReLogin(
    storedVersion: string,
    projectChangeLog: ProjectChangeLog[]
  ): boolean {
    const normalizedCurrent = this.normalizeVersion(StorageConfig.CURRENT_VERSION)
    const normalizedStored = this.normalizeVersion(storedVersion)

    return projectChangeLog.some((item) => {
      const itemVersion = this.normalizeVersion(item.version)
      return (
        item.requireReLogin && itemVersion > normalizedStored && itemVersion <= normalizedCurrent
      )
    })
  }

  /**
   * @description 使用最新更新日志和重新登录要求构建升级通知 HTML。
   * @param {boolean} requireReLogin 是否要求升级后重新登录。
   * @param {ProjectChangeLog[]} projectChangeLog 项目更新日志。
   * @returns {string} 可供 Element Plus 通知展示的 HTML 字符串。
   */
  private buildUpgradeMessage(
    requireReLogin: boolean,
    projectChangeLog: ProjectChangeLog[]
  ): string {
    const { title: content } = projectChangeLog[0]

    const messageParts = [
      `<p style="color: var(--art-gray-800) !important; padding-bottom: 5px;">`,
      `系统已升级到 ${StorageConfig.CURRENT_VERSION} 版本，此次更新带来了以下改进：`,
      `</p>`,
      content
    ]

    if (requireReLogin) {
      messageParts.push(
        `<p style="color: var(--theme-color); padding-top: 5px;">升级完成，请重新登录后继续使用。</p>`
      )
    }

    return messageParts.join('')
  }

  /**
   * @description 显示不会自动关闭的系统升级通知。
   * @param {string} message 升级通知 HTML 内容。
   * @returns {void} 无返回值。
   */
  private showUpgradeNotification(message: string): void {
    ElNotification({
      title: '系统升级公告',
      message,
      duration: 0,
      type: 'success',
      dangerouslyUseHTMLString: true
    })
  }

  /**
   * @description 删除旧版单键结构和历史版本 Store 键。
   * @param {string | null} oldSysKey 旧版单一系统存储键。
   * @param {string[]} oldVersionKeys 历史版本的分离存储键列表。
   * @returns {void} 无返回值。
   */
  private cleanupLegacyData(oldSysKey: string | null, oldVersionKeys: string[]): void {
    // 清理旧的单一存储结构
    if (oldSysKey) {
      localStorage.removeItem(oldSysKey)
      console.info(`[Upgrade] 已清理旧存储: ${oldSysKey}`)
    }

    // 清理旧版本的分离存储
    oldVersionKeys.forEach((key) => {
      localStorage.removeItem(key)
      console.info(`[Upgrade] 已清理旧存储: ${key}`)
    })
  }

  /**
   * @description 执行升级后的用户登出，并在失败时记录错误。
   * @returns {void} 无返回值。
   */
  private performLogout(): void {
    try {
      useUserStore().logOut()
      console.info('[Upgrade] 已执行升级后登出')
    } catch (error) {
      console.error('[Upgrade] 升级后登出失败:', error)
    }
  }

  /**
   * @description 加载更新日志、展示通知、更新版本、清理旧数据并按需登出。
   * @param {string} storedVersion 升级前的本地版本号。
   * @param {ReturnType<VersionManager['findLegacyStorage']>} legacyStorage 待处理的旧存储键。
   * @returns {Promise<void>} 升级处理完成后的 Promise。
   */
  private async executeUpgrade(
    storedVersion: string,
    legacyStorage: ReturnType<typeof this.findLegacyStorage>
  ): Promise<void> {
    try {
      const { projectChangeLog } = await import('@/mock/upgrade/changeLog')

      if (!projectChangeLog.length) {
        console.warn('[Upgrade] 升级日志列表为空')
        return
      }

      const requireReLogin = this.shouldRequireReLogin(storedVersion, projectChangeLog)
      const message = this.buildUpgradeMessage(requireReLogin, projectChangeLog)

      // 显示升级通知
      this.showUpgradeNotification(message)

      // 更新版本号
      this.setStoredVersion(StorageConfig.CURRENT_VERSION)

      // 清理旧数据
      this.cleanupLegacyData(legacyStorage.oldSysKey, legacyStorage.oldVersionKeys)

      // 执行登出（如果需要）
      if (requireReLogin) {
        this.performLogout()
      }

      console.info(`[Upgrade] 升级完成: ${storedVersion} → ${StorageConfig.CURRENT_VERSION}`)
    } catch (error) {
      console.error('[Upgrade] 系统升级处理失败:', error)
    }
  }

  /**
   * @description 判断是否需要升级，并在应用加载后调度实际升级流程。
   * @returns {Promise<void>} 升级检查完成后的 Promise；实际清理可能由延迟任务继续执行。
   */
  async processUpgrade(): Promise<void> {
    // 跳过特定版本
    if (this.shouldSkipUpgrade()) {
      console.debug('[Upgrade] 跳过版本升级检查')
      return
    }

    const storedVersion = this.getStoredVersion()

    // 首次访问处理
    if (this.isFirstVisit(storedVersion)) {
      this.setStoredVersion(StorageConfig.CURRENT_VERSION)
      // console.info('[Upgrade] 首次访问，已设置当前版本')
      return
    }

    // 版本相同，无需升级
    if (this.isSameVersion(storedVersion!)) {
      // console.debug('[Upgrade] 版本相同，无需升级')
      return
    }

    // 检查是否有需要升级的旧数据
    const legacyStorage = this.findLegacyStorage()
    if (!legacyStorage.oldSysKey && legacyStorage.oldVersionKeys.length === 0) {
      this.setStoredVersion(StorageConfig.CURRENT_VERSION)
      console.info('[Upgrade] 无旧数据，已更新版本号')
      return
    }

    // 延迟执行升级流程，确保应用已完全加载
    setTimeout(() => {
      this.executeUpgrade(storedVersion!, legacyStorage)
    }, StorageConfig.UPGRADE_DELAY)
  }
}

/**
 * @description 模块级版本管理器单例。
 * @type {VersionManager}
 */
const versionManager = new VersionManager()

/**
 * @description 执行应用启动阶段的版本升级检查。
 * @returns {Promise<void>} 升级检查完成后的 Promise。
 * @example
 * await systemUpgrade()
 */
export async function systemUpgrade(): Promise<void> {
  await versionManager.processUpgrade()
}
