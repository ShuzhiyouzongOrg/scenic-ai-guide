/**
 * @fileoverview 全局组件配置模块。
 * @description 声明可全局注册的组件元数据，并提供启用组件筛选和按键查询能力。
 */

import { defineAsyncComponent } from 'vue'

/**
 * @description 可参与全局注册的 Vue 组件配置列表。
 * @type {GlobalComponentConfig[]}
 */
export const globalComponentsConfig: GlobalComponentConfig[] = [
  {
    name: '设置面板',
    key: 'settings-panel',
    component: defineAsyncComponent(
      () => import('@/components/core/layouts/art-settings-panel/index.vue')
    ),
    enabled: true
  },
  {
    name: '全局搜索',
    key: 'global-search',
    component: defineAsyncComponent(
      () => import('@/components/core/layouts/art-global-search/index.vue')
    ),
    enabled: true
  },
  {
    name: '锁屏',
    key: 'screen-lock',
    component: defineAsyncComponent(
      () => import('@/components/core/layouts/art-screen-lock/index.vue')
    ),
    enabled: true
  },
  {
    name: '礼花效果',
    key: 'fireworks-effect',
    component: defineAsyncComponent(
      () => import('@/components/core/layouts/art-fireworks-effect/index.vue')
    ),
    enabled: true
  },
  {
    name: '水印效果',
    key: 'watermark',
    component: defineAsyncComponent(
      () => import('@/components/core/others/art-watermark/index.vue')
    ),
    enabled: true
  }
]

/**
 * @description 描述一个全局 Vue 组件的名称、键、实现、启用状态和说明。
 * @typedef {object} GlobalComponentConfig
 * @property {string} name 名称。
 * @property {string} key 配置键。
 * @property {any} component Vue 组件实现。
 * @property {boolean} [enabled] 是否启用。
 * @property {string} [description] 说明文本。
 */
export interface GlobalComponentConfig {
  /**
   * @description 组件名称
   */
  name: string
  /**
   * @description 组件标识
   */
  key: string
  /**
   * @description 组件
   */
  component: any
  /**
   * @description 是否启用
   */
  enabled?: boolean
  /**
   * @description 组件描述
   */
  description?: string
}

/**
 * @description 筛选已启用的全局组件配置。
 * @returns {GlobalComponentConfig[]} 未显式禁用、可参与全局注册的组件配置列表。
 * @example
 * const result = getEnabledGlobalComponents()
 */
export const getEnabledGlobalComponents = () => {
  return globalComponentsConfig.filter((config) => config.enabled !== false)
}

/**
 * @description 按配置键查找全局组件。
 * @param {string} key 配置键。
 * @returns {GlobalComponentConfig | undefined} 匹配的全局组件配置；不存在对应键时返回 `undefined`。
 */
export const getGlobalComponentByKey = (key: string) => {
  return globalComponentsConfig.find((config) => config.key === key)
}
