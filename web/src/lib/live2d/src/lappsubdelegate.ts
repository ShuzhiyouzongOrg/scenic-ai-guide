// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 单画布子委托。
 * @description 聚合画布、WebGL、纹理、视图、模型和指针交互的初始化与逐帧更新流程。
 */

import * as LAppDefine from './lappdefine';
import { LAppGlManager } from './lappglmanager';
import { LAppLive2DManager } from './lapplive2dmanager';
import { LAppPal } from './lapppal';
import { LAppTextureManager } from './lapptexturemanager';
import { LAppView } from './lappview';
import { ResourceModel } from '../resource';

/**
 * @class
 * @description 管理一个 Live2D 画布及其渲染和交互依赖。
 * @example
 * const subdelegate = new LAppSubdelegate();
 */
export class LAppSubdelegate {
  /**
   * @description 创建尚未绑定画布的 WebGL、纹理、模型和视图管理对象。
   */
  public constructor() {
    this._canvas = null;
    this._glManager = new LAppGlManager();
    this._textureManager = new LAppTextureManager();
    this._live2dManager = new LAppLive2DManager();
    this._view = new LAppView();
    this._frameBuffer = null;
    this._captured = false;
  }

  /**
   * @description 断开尺寸观察器并依次释放模型、视图、纹理和 WebGL 管理器。
   * @returns {void} 无返回值。
   */
  public release(): void {
    this._resizeObserver.unobserve(this._canvas);
    this._resizeObserver.disconnect();
    this._resizeObserver = null;

    this._live2dManager.release();
    this._live2dManager = null;

    this._view.release();
    this._view = null;

    this._textureManager.release();
    this._textureManager = null;

    this._glManager.release();
    this._glManager = null;
  }

  /**
   * @description 初始化画布尺寸、WebGL 状态、纹理管理器、视图、模型和尺寸观察器。
   * @param {HTMLCanvasElement} canvas Live2D 渲染画布。
   * @returns {boolean} WebGL 与应用依赖初始化成功时返回 `true`。
   * @example
   * const initialized = subdelegate.initialize(canvas);
   */
  public initialize(canvas: HTMLCanvasElement): boolean {
    if (!this._glManager.initialize(canvas)) {
      return false;
    }

    this._canvas = canvas;

    if (LAppDefine.CanvasSize === 'auto') {
      this.resizeCanvas();
    } else {
      canvas.width = LAppDefine.CanvasSize.width;
      canvas.height = LAppDefine.CanvasSize.height;
    }

    this._textureManager.setGlManager(this._glManager);

    const gl = this._glManager.getGl();

    if (!this._frameBuffer) {
      this._frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    }

    // 透過設定
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // AppViewの初期化
    this._view.initialize(this);
    this._view.initializeSprite();

    this._live2dManager.initialize(this);

    this._resizeObserver = new ResizeObserver(
      (entries: ResizeObserverEntry[], observer: ResizeObserver) =>
        this.resizeObserverCallback.call(this, entries, observer)
    );
    this._resizeObserver.observe(this._canvas);

    return true;
  }

  /**
   * @description 按容器尺寸重设画布，并重新初始化视图和精灵资源。
   * @returns {void} 无返回值。
   */
  public onResize(): void {
    this.resizeCanvas();
    this._view.initialize(this);
    this._view.initializeSprite();
  }

  /**
   * @description 在自动画布模式下把尺寸变化记录为待处理状态。
   * @param {ResizeObserverEntry[]} entries 尺寸变化条目。
   * @param {ResizeObserver} observer 触发回调的观察器。
   * @returns {void} 无返回值。
   * @private
   */
  private resizeObserverCallback(
    entries: ResizeObserverEntry[],
    observer: ResizeObserver
  ): void {
    if (LAppDefine.CanvasSize === 'auto') {
      this._needResize = true;
    }
  }

  /**
   * @description 处理待执行的尺寸调整，清理 WebGL 缓冲并绘制当前视图。
   * @returns {void} 无返回值。
   */
  public update(): void {
    if (this._glManager.getGl().isContextLost()) {
      return;
    }

    // キャンバスのサイズが変わっている場合はリサイズに必要な処理をする。
    if (this._needResize) {
      this.onResize();
      this._needResize = false;
    }

    const gl = this._glManager.getGl();

    // 画面的初始化.默认就是白色(rgb: 1.0, 1.0, 1.0)且不透明(alpha: 1.0)
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // 启用深度测试
    gl.enable(gl.DEPTH_TEST);

    // 附近的物体会掩盖远处的物体(也就是说如果近的点已经被渲染了,一个新的像素更远就不用渲染了)
    gl.depthFunc(gl.LEQUAL);

    // 清除颜色缓冲区和深度缓冲区,每次渲染的时候都做清除处理
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 设置深度缓冲区的初始值1.0, 也就是大家都是最远的初始化值
    gl.clearDepth(1.0);

    // 透明设置
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 描画更新
    this._view.render();
  }

  /**
   * @description 编译并链接用于二维纹理精灵的顶点和片元着色器。
   * @returns {WebGLProgram|null} 可用的着色器程序；着色器创建失败时返回 `null`。
   * @example
   * const program = subdelegate.createShader();
   */
  public createShader(): WebGLProgram {
    const gl = this._glManager.getGl();

    // バーテックスシェーダーのコンパイル
    const vertexShaderId = gl.createShader(gl.VERTEX_SHADER);

    if (vertexShaderId == null) {
      LAppPal.printMessage('failed to create vertexShader');
      return null;
    }

    const vertexShader: string =
      'precision mediump float;' +
      'attribute vec3 position;' +
      'attribute vec2 uv;' +
      'varying vec2 vuv;' +
      'void main(void)' +
      '{' +
      '   gl_Position = vec4(position, 1.0);' +
      '   vuv = uv;' +
      '}';

    gl.shaderSource(vertexShaderId, vertexShader);
    gl.compileShader(vertexShaderId);

    // フラグメントシェーダのコンパイル
    const fragmentShaderId = gl.createShader(gl.FRAGMENT_SHADER);

    if (fragmentShaderId == null) {
      LAppPal.printMessage('failed to create fragmentShader');
      return null;
    }

    const fragmentShader: string =
      'precision mediump float;' +
      'varying vec2 vuv;' +
      'uniform sampler2D texture;' +
      'void main(void)' +
      '{' +
      '   gl_FragColor = texture2D(texture, vuv);' +
      '}';

    gl.shaderSource(fragmentShaderId, fragmentShader);
    gl.compileShader(fragmentShaderId);

    // プログラムオブジェクトの作成
    const programId = gl.createProgram();
    gl.attachShader(programId, vertexShaderId);
    gl.attachShader(programId, fragmentShaderId);

    gl.deleteShader(vertexShaderId);
    gl.deleteShader(fragmentShaderId);

    // リンク
    gl.linkProgram(programId);
    gl.useProgram(programId);

    return programId;
  }

  /**
   * @description 获取当前画布使用的纹理管理器。
   * @returns {LAppTextureManager} 纹理管理器实例。
   */
  public getTextureManager(): LAppTextureManager {
    return this._textureManager;
  }

  /**
   * @description 获取初始化时保存的 WebGL 帧缓冲对象。
   * @returns {WebGLFramebuffer|null} 当前帧缓冲；默认帧缓冲可能为 `null`。
   */
  public getFrameBuffer(): WebGLFramebuffer {
    return this._frameBuffer;
  }

  /**
   * @description 获取当前子委托绑定的渲染画布。
   * @returns {HTMLCanvasElement} Live2D 渲染画布。
   */
  public getCanvas(): HTMLCanvasElement {
    return this._canvas;
  }

  /**
   * @description 获取当前画布的 WebGL 上下文管理器。
   * @returns {LAppGlManager} WebGL 管理器实例。
   */
  public getGlManager(): LAppGlManager {
    return this._glManager;
  }

  /**
   * @description 获取当前画布的 Live2D 模型管理器。
   * @returns {LAppLive2DManager} 模型管理器实例。
   */
  public getLive2DManager(): LAppLive2DManager {
    return this._live2dManager;
  }

  /**
   * @description 按 CSS 尺寸和设备像素比调整画布，并同步 WebGL 视口。
   * @returns {void} 无返回值。
   * @private
   */
  private resizeCanvas(): void {
    this._canvas.width = this._canvas.clientWidth * window.devicePixelRatio;
    this._canvas.height = this._canvas.clientHeight * window.devicePixelRatio;

    const gl = this._glManager.getGl();

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  /**
   * @description 将页面指针按下坐标转换为画布局部坐标并开始触摸跟踪。
   * @param {number} pageX 页面横坐标。
   * @param {number} pageY 页面纵坐标。
   * @returns {void} 无返回值。
   */
  public onPointBegan(pageX: number, pageY: number): void {
    if (!this._view) {
      LAppPal.printMessage('view notfound');
      return;
    }
    this._captured = true;

    const localX: number = pageX - this._canvas.offsetLeft;
    const localY: number = pageY - this._canvas.offsetTop;

    this._view.onTouchesBegan(localX, localY);
  }

  /**
   * @description 在指针已捕获时转发画布局部移动坐标。
   * @param {number} pageX 页面横坐标。
   * @param {number} pageY 页面纵坐标。
   * @returns {void} 无返回值。
   */
  public onPointMoved(pageX: number, pageY: number): void {
    if (!this._captured) {
      return;
    }

    const localX: number = pageX - this._canvas.offsetLeft;
    const localY: number = pageY - this._canvas.offsetTop;

    this._view.onTouchesMoved(localX, localY);
  }

  /**
   * @description 结束指针捕获并转发画布局部抬起坐标。
   * @param {number} pageX 页面横坐标。
   * @param {number} pageY 页面纵坐标。
   * @returns {void} 无返回值。
   */
  public onPointEnded(pageX: number, pageY: number): void {
    this._captured = false;

    if (!this._view) {
      LAppPal.printMessage('view notfound');
      return;
    }

    const localX: number = pageX - this._canvas.offsetLeft;
    const localY: number = pageY - this._canvas.offsetTop;

    this._view.onTouchesEnded(localX, localY);
  }

  /**
   * @description 取消指针捕获，并以结束事件通知当前视图。
   * @param {number} pageX 页面横坐标。
   * @param {number} pageY 页面纵坐标。
   * @returns {void} 无返回值。
   */
  public onTouchCancel(pageX: number, pageY: number): void {
    this._captured = false;

    if (!this._view) {
      LAppPal.printMessage('view notfound');
      return;
    }

    const localX: number = pageX - this._canvas.offsetLeft;
    const localY: number = pageY - this._canvas.offsetTop;

    this._view.onTouchesEnded(localX, localY);
  }

  /**
   * @description 判断当前 WebGL 上下文是否已经丢失。
   * @returns {boolean} 上下文丢失时返回 `true`。
   */
  public isContextLost(): boolean {
    return this._glManager.getGl().isContextLost();
  }

  /**
   * @description 将角色切换请求交给当前画布的模型管理器。
   * @param {ResourceModel|null} character 新角色资源；传入 `null` 表示卸载。
   * @returns {void} 无返回值。
   */
  public changeCharacter(character: ResourceModel | null) {
    // _subdelegates中只有一个画布, 所以设置第一个即可
    this._live2dManager.changeCharacter(character);
  }

  private _canvas: HTMLCanvasElement;

  /**
   * @description 保存当前画布的视图控制器。
   * @type {LAppView|null}
   * @private
   */
  private _view: LAppView;

  /**
   * @description 保存当前画布的纹理管理器。
   * @type {LAppTextureManager|null}
   * @private
   */
  private _textureManager: LAppTextureManager;
  private _frameBuffer: WebGLFramebuffer;
  private _glManager: LAppGlManager;
  private _live2dManager: LAppLive2DManager;

  /**
   * @description 观察画布容器尺寸变化。
   * @type {ResizeObserver|null}
   * @private
   */
  private _resizeObserver: ResizeObserver;

  /**
   * @description 表示当前是否已捕获指针交互。
   * @type {boolean}
   * @private
   */
  private _captured: boolean;

  private _needResize: boolean;
}
