// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D WebGL 上下文管理器。
 * @description 为应用适配层创建、保存和提供 WebGL2 渲染上下文。
 */

/**
 * @class
 * @description 管理单个 Live2D 画布对应的 WebGL 渲染上下文。
 * @example
 * const glManager = new LAppGlManager();
 */
export class LAppGlManager {
  /**
   * @description 创建尚未绑定画布的 WebGL 管理器。
   */
  public constructor() {
    this._gl = null;
  }

  /**
   * @description 从目标画布获取 WebGL2 上下文并保存。
   * @param {HTMLCanvasElement} canvas Live2D 渲染画布。
   * @returns {boolean} 成功取得上下文时返回 `true`。
   * @example
   * const initialized = glManager.initialize(canvas);
   */
  public initialize(canvas: HTMLCanvasElement): boolean {
    // glコンテキストを初期化
    this._gl = canvas.getContext('webgl2');

    if (!this._gl) {
      // gl初期化失敗
      alert('Cannot initialize WebGL. This browser does not support.');
      this._gl = null;
      // document.body.innerHTML =
      //   'This browser does not support the <code>&lt;canvas&gt;</code> element.';
      return false;
    }
    return true;
  }

  /**
   * @description 执行 WebGL 管理器的释放钩子；上下文生命周期由浏览器管理。
   * @returns {void} 无返回值。
   */
  public release(): void {}

  /**
   * @description 获取已初始化的 WebGL 渲染上下文。
   * @returns {WebGLRenderingContext|WebGL2RenderingContext} 当前渲染上下文。
   */
  public getGl(): WebGLRenderingContext | WebGL2RenderingContext {
    return this._gl;
  }

  private _gl: WebGLRenderingContext | WebGL2RenderingContext = null;
}
