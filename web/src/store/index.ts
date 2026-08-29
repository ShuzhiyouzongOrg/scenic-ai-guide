/**
 * @fileoverview Pinia 状态管理入口。
 * @description 创建支持持久化的 Pinia 实例，并向 Vue 应用安装状态管理。
 */
import type { App } from 'vue'
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { StorageKeyManager } from '@/utils/storage/storage-key-manager'

/**
 * @description 启用持久化插件的 Pinia 实例。
 * @type {object}
 */
export const store = createPinia()

// 创建存储键管理器实例
const storageKeyManager = new StorageKeyManager()

// 配置持久化插件
store.use(
  createPersistedState({
    key: (storeId: string) => storageKeyManager.getStorageKey(storeId),
    storage: localStorage,
    serializer: {
      serialize: JSON.stringify,
      deserialize: JSON.parse
    }
  })
)

/**
 * @description 将已配置持久化插件的 Pinia 实例安装到 Vue 应用。
 * @param {App<Element>} app 待安装状态管理插件的 Vue 应用实例。
 * @returns {void} 状态管理实例安装完成后不返回值。
 */
export function initStore(app: App<Element>): void {
  app.use(store)
}
