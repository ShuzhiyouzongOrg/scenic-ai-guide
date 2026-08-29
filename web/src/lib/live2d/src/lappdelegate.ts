// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 应用生命周期委托器。
 * @description 以单例方式初始化 Cubism、MotionSync、画布子委托和全局指针事件。
 */

import { csmVector } from '@framework/type/csmvector';
import { CubismFramework, Option } from '@framework/live2dcubismframework';
import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { LAppSubdelegate } from './lappsubdelegate';
import { CubismLogError } from '@framework/utils/cubismdebug';
import {
  disposeOfficialMotionSync,
  startOfficialMotionSync
} from '../motionSyncRuntime';
import { ResourceModel } from '../resource';

/**
 * @description 保存当前 Live2D 应用委托器单例。
 * @type {LAppDelegate|null}
 */
export let s_instance: LAppDelegate = null;

/**
 * @class
 * @description 管理 Cubism SDK、MotionSync 和各画布子委托的应用级生命周期。
 * @example
 * const delegate = LAppDelegate.getInstance();
 */
export class LAppDelegate {
  /**
   * @description 获取应用委托器单例，尚未创建时自动实例化。
   * @returns {LAppDelegate} 当前应用委托器单例。
   * @example
   * const delegate = LAppDelegate.getInstance();
   */
  public static getInstance(): LAppDelegate {
    if (s_instance == null) {
      s_instance = new LAppDelegate();
    }

    return s_instance;
  }

  /**
   * @description 解除单例引用并释放渲染循环、事件监听器和 Cubism 资源。
   * @returns {void} 无返回值。
   * @example
   * LAppDelegate.releaseInstance();
   */
  public static releaseInstance(): void {
    const instance = s_instance;
    // 先解除单例引用，避免重入逻辑拿到正在释放向量资源的对象。
    s_instance = null;
    instance?.release();
  }

  /**
   * @description 通知全部子委托重新计算画布尺寸并初始化视图。
   * @returns {void} 无返回值。
   */
  public onResize(): void {
    if (this._subdelegates == null) return;
    for (let i = 0; i < this._subdelegates.getSize(); i++) {
      this._subdelegates.at(i).onResize();
    }
  }

  /**
   * @description 启动唯一的动画帧循环，并逐帧更新时间和各画布视图。
   * @returns {void} 无返回值。
   * @example
   * delegate.run();
   */
  public run(): void {
    if (this._animationFrameId != null) {
      return;
    }
    // メインループ
    const loop = (): void => {
      this._animationFrameId = null;
      // インスタンスの有無の確認
      if (s_instance !== this || this._subdelegates == null) {
        return;
      }

      // 時間更新
      LAppPal.updateTime();

      for (let i = 0; i < this._subdelegates.getSize(); i++) {
        this._subdelegates.at(i).update();
      }

      // ループのために再帰呼び出し
      this._animationFrameId = requestAnimationFrame(loop);
    };
    this._animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * @description 释放应用委托器持有的循环、监听器、子委托、MotionSync 和 Cubism 资源。
   * @returns {void} 无返回值。
   * @private
   */
  private release(): void {
    if (this._animationFrameId != null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this.releaseEventListener();
    this.releaseSubdelegates();

    // 先释放 MotionSync 模型，再释放共享 CRI 引擎和 Cubism SDK。
    if (this._motionSyncInitialized) {
      disposeOfficialMotionSync();
      this._motionSyncInitialized = false;
    }

    // Cubism SDKの解放
    if (CubismFramework.isInitialized()) {
      CubismFramework.dispose();
    }

    this._cubismOption = null;
    this._initialized = false;
  }

  /**
   * @description 移除文档级指针事件监听器。
   * @returns {void} 无返回值。
   * @private
   */
  private releaseEventListener(): void {
    document.removeEventListener('pointerdown', onPointerBegan);
    document.removeEventListener('pointermove', onPointerMoved);
    document.removeEventListener('pointerup', onPointerEnded);
    document.removeEventListener('pointercancel', onPointerCancel);
  }

  /**
   * @description 释放全部画布子委托并清空画布与子委托向量。
   * @returns {void} 无返回值。
   * @private
   */
  private releaseSubdelegates(): void {
    if (this._subdelegates == null) {
      this._canvases?.clear();
      this._canvases = null;
      return;
    }
    for (
      let ite = this._subdelegates.begin();
      ite.notEqual(this._subdelegates.end());
      ite.preIncrement()
    ) {
      ite.ptr().release();
    }

    this._subdelegates.clear();
    this._subdelegates = null;
    this._canvases?.clear();
    this._canvases = null;
  }

  /**
   * @description 初始化 Cubism、画布子委托和指针事件监听器；重复调用直接复用现有状态。
   * @param {HTMLCanvasElement} [canvas] 指定的 Live2D 画布；省略时查找默认元素。
   * @returns {boolean} 初始化流程完成时返回 `true`。
   * @throws {Error} 画布数量配置不受支持或找不到可用画布时抛出异常。
   * @example
   * delegate.initialize(canvas);
   */
  public initialize(canvas?: HTMLCanvasElement): boolean {
    if (this._initialized) return true;

    // Cubism SDKの初期化
    this.initializeCubism();

    this.initializeSubdelegates(canvas);
    this.initializeEventListener();
    this._initialized = true;

    return true;
  }

  /**
   * @description 注册文档级指针开始、移动、结束和取消事件监听器。
   * @returns {void} 无返回值。
   * @private
   */
  private initializeEventListener(): void {
    document.addEventListener('pointerdown', onPointerBegan, { passive: true });
    document.addEventListener('pointermove', onPointerMoved, { passive: true });
    document.addEventListener('pointerup', onPointerEnded, { passive: true });
    document.addEventListener('pointercancel', onPointerCancel, {
      passive: true
    });
  }

  /**
   * @description 配置日志并初始化 Cubism SDK；授权 Core 存在时同时启动 MotionSync。
   * @returns {void} 无返回值。
   * @private
   */
  private initializeCubism(): void {
    LAppPal.updateTime();

    // setup cubism
    this._cubismOption ??= new Option();
    this._cubismOption.logFunction = LAppPal.printMessage;
    this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
    CubismFramework.startUp(this._cubismOption);

    const motionSyncCoreAvailable = Boolean(
      globalThis.Live2DCubismMotionSyncCore
    );
    // initialize cubism
    CubismFramework.initialize();
    if (motionSyncCoreAvailable) {
      this._motionSyncInitialized = startOfficialMotionSync(
        LAppPal.printMessage,
        LAppDefine.CubismLoggingLevel
      );
    }
  }

  /**
   * @description 建立画布和子委托向量，并为每个画布初始化 WebGL 渲染上下文。
   * @param {HTMLCanvasElement} [targetCanvas] 调用方提供的目标画布。
   * @returns {void} 无返回值。
   * @throws {Error} 配置多个画布、缺少画布元素或子委托初始化失败时抛出异常。
   * @private
   */
  private initializeSubdelegates(targetCanvas?: HTMLCanvasElement): void {
    // 只支持一个画布
    if (LAppDefine.CanvasNum > 1) {
      throw new Error('CanvasNum > 1');
    }
    this._canvases ??= new csmVector<HTMLCanvasElement>();
    this._subdelegates ??= new csmVector<LAppSubdelegate>();
    this._canvases.prepareCapacity(LAppDefine.CanvasNum);
    this._subdelegates.prepareCapacity(LAppDefine.CanvasNum);
    for (let i = 0; i < LAppDefine.CanvasNum; i++) {
      const canvas =
        targetCanvas ||
        (document.getElementById('live2dCanvas') as HTMLCanvasElement);
      if (!canvas) {
        throw new Error('Live2D canvas is unavailable.');
      }
      this._canvases.pushBack(canvas);
      // キャンバスを DOM に追加
      // document.body.appendChild(canvas);
    }

    for (let i = 0; i < this._canvases.getSize(); i++) {
      const subdelegate = new LAppSubdelegate();
      subdelegate.initialize(this._canvases.at(i));
      this._subdelegates.pushBack(subdelegate);
    }

    for (let i = 0; i < LAppDefine.CanvasNum; i++) {
      if (this._subdelegates.at(i).isContextLost()) {
        CubismLogError(
          `The context for Canvas at index ${i} was lost, possibly because the acquisition limit for WebGLRenderingContext was reached.`
        );
      }
    }
  }

  /**
   * @description 将新角色资源交给首个画布子委托进行加载或卸载。
   * @param {ResourceModel|null} character 新角色资源；传入 `null` 表示卸载。
   * @returns {void} 无返回值。
   * @example
   * delegate.changeCharacter(character);
   */
  public changeCharacter(character: ResourceModel | null) {
    // _subdelegates中只有一个画布, 所以设置第一个即可
    this._subdelegates.at(0).changeCharacter(character);
  }

  /**
   * @description 获取当前应用维护的画布子委托向量。
   * @returns {csmVector<LAppSubdelegate>} 子委托向量。
   */
  public getSubdelegate(): csmVector<LAppSubdelegate> {
    return this._subdelegates;
  }

  /**
   * @description 创建内部向量和 Cubism 选项，供单例获取方法首次调用。
   * @private
   */
  private constructor() {
    this._cubismOption = new Option();
    this._subdelegates = new csmVector<LAppSubdelegate>();
    this._canvases = new csmVector<HTMLCanvasElement>();
    this._animationFrameId = null;
    this._initialized = false;
  }

  /**
   * @description 保存 Cubism SDK 启动选项。
   * @type {Option|null}
   * @private
   */
  private _cubismOption: Option;
  private _motionSyncInitialized = false;

  /**
   * @description 保存当前操作的画布元素向量。
   * @type {csmVector<HTMLCanvasElement>|null}
   * @private
   */
  private _canvases: csmVector<HTMLCanvasElement>;

  /**
   * @description 保存与画布一一对应的子委托向量。
   * @type {csmVector<LAppSubdelegate>|null}
   * @private
   */
  private _subdelegates: csmVector<LAppSubdelegate>;

  private _animationFrameId: number | null;
  private _initialized: boolean;
}

function onPointerBegan(e: PointerEvent): void {
  for (
    let ite = LAppDelegate.getInstance().getSubdelegate().begin();
    ite.notEqual(LAppDelegate.getInstance().getSubdelegate().end());
    ite.preIncrement()
  ) {
    ite.ptr().onPointBegan(e.pageX, e.pageY);
  }
}

function onPointerMoved(e: PointerEvent): void {
  for (
    let ite = LAppDelegate.getInstance().getSubdelegate().begin();
    ite.notEqual(LAppDelegate.getInstance().getSubdelegate().end());
    ite.preIncrement()
  ) {
    ite.ptr().onPointMoved(e.pageX, e.pageY);
  }
}

function onPointerEnded(e: PointerEvent): void {
  for (
    let ite = LAppDelegate.getInstance().getSubdelegate().begin();
    ite.notEqual(LAppDelegate.getInstance().getSubdelegate().end());
    ite.preIncrement()
  ) {
    ite.ptr().onPointEnded(e.pageX, e.pageY);
  }
}

function onPointerCancel(e: PointerEvent): void {
  for (
    let ite = LAppDelegate.getInstance().getSubdelegate().begin();
    ite.notEqual(LAppDelegate.getInstance().getSubdelegate().end());
    ite.preIncrement()
  ) {
    ite.ptr().onTouchCancel(e.pageX, e.pageY);
  }
}
