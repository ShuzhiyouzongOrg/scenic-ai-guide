/**
 * @fileoverview 路由组件加载器。
 * @description 根据菜单组件路径加载 Vue 页面、布局和 iframe 页面，并提供缺失组件回退。
 */

import { h } from 'vue'

/**
 * @description 根据路由组件路径延迟加载 Vue 页面，并提供布局、iframe 和缺失组件回退。
 * @class
 * @example
 * const instance = new ComponentLoader()
 */
export class ComponentLoader {
  private modules: Record<string, () => Promise<any>>

  /**
   * @description 创建组件加载器并收集 views 目录下的 Vue 模块。
   */
  constructor() {
    // 动态导入 views 目录下所有 .vue 组件
    this.modules = import.meta.glob('../../views/**/*.vue')
  }

  /**
   * @description 按业务组件路径返回延迟加载函数或错误占位组件。
   * @param {string} componentPath 相对于 `views` 目录、通常以斜杠开头的业务组件路径。
   * @returns {() => Promise<any>} 页面异步加载函数；路径为空或未命中时返回对应占位组件加载函数。
   */
  load(componentPath: string): () => Promise<any> {
    if (!componentPath) {
      return this.createEmptyComponent()
    }

    // 构建可能的路径
    const fullPath = `../../views${componentPath}.vue`
    const fullPathWithIndex = `../../views${componentPath}/index.vue`

    // 先尝试直接路径，再尝试添加/index的路径
    const module = this.modules[fullPath] || this.modules[fullPathWithIndex]

    if (!module) {
      console.error(
        `[ComponentLoader] 未找到组件: ${componentPath}，尝试过的路径: ${fullPath} 和 ${fullPathWithIndex}`
      )
      return this.createErrorComponent(componentPath)
    }

    return module
  }

  /**
   * @description 返回应用布局组件的延迟加载函数。
   * @returns {() => Promise<any>} 用于异步导入应用布局组件的函数。
   */
  loadLayout(): () => Promise<any> {
    return () => import('@/views/index/index.vue')
  }

  /**
   * @description 返回 iframe 容器组件的延迟加载函数。
   * @returns {() => Promise<any>} 用于异步导入 iframe 容器组件的函数。
   */
  loadIframe(): () => Promise<any> {
    return () => import('@/views/outside/Iframe.vue')
  }

  /**
   * @description 创建用于空路由配置的异步占位组件加载函数。
   * @returns {() => Promise<any>} 解析为空白 Vue 渲染组件的异步加载函数。
   */
  private createEmptyComponent(): () => Promise<any> {
    return () =>
      Promise.resolve({
        render() {
          return h('div', {})
        }
      })
  }

  /**
   * @description 创建用于提示路由组件缺失的异步占位组件加载函数。
   * @param {string} componentPath 未能解析的业务组件路径。
   * @returns {() => Promise<any>} 解析为组件缺失提示页面的异步加载函数。
   */
  private createErrorComponent(componentPath: string): () => Promise<any> {
    return () =>
      Promise.resolve({
        render() {
          return h('div', { class: 'route-error' }, `组件未找到: ${componentPath}`)
        }
      })
  }
}
