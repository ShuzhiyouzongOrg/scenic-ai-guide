/**
 * @fileoverview 地图页面资源释放器。
 * @description 统一登记事件、图层和异步资源的清理回调，并按后进先出顺序执行一次性释放。
 */

/**
 * @class
 * @description 管理一组只执行一次的同步或异步清理回调。
 * @example
 * const disposer = new ResourceDisposer()
 * disposer.add(() => map.remove())
 * await disposer.dispose()
 */
export class ResourceDisposer {
  private readonly cleanups = new Set<() => void | Promise<void>>()
  private disposed = false

  /**
   * @description 登记清理回调；资源已释放时立即调用该回调，否则返回用于取消登记的函数。
   * @param {() => void | Promise<void>} cleanup 释放事件监听、地图实例或异步资源的回调。
   * @returns {() => void} 取消当前清理回调登记的函数。
   * @throws {Error} 当资源已释放且传入的清理回调同步抛出异常时向调用方传播。
   * @example
   * const removeCleanup = disposer.add(() => marker.remove())
   */
  add(cleanup: () => void | Promise<void>): () => void {
    if (this.disposed) {
      void cleanup()
      return () => undefined
    }
    this.cleanups.add(cleanup)
    return () => this.cleanups.delete(cleanup)
  }

  /**
   * @description 按登记的逆序执行全部清理回调，等待所有异步结果落定，并确保后续调用不重复释放。
   * @returns {Promise<void>} 全部清理任务均成功、失败或拒绝后兑现的 Promise。
   * @throws {Error} 当构造清理任务时有回调同步抛出异常，返回的 Promise 会拒绝。
   * @example
   * await disposer.dispose()
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const pending = [...this.cleanups].reverse().map((cleanup) => Promise.resolve(cleanup()))
    this.cleanups.clear()
    await Promise.allSettled(pending)
  }
}
