// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
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

export let s_instance: LAppDelegate = null;

/**
 * アプリケーションクラス。
 * Cubism SDKの管理を行う。
 */
export class LAppDelegate {
  /**
   * クラスのインスタンス（シングルトン）を返す。
   * インスタンスが生成されていない場合は内部でインスタンスを生成する。
   *
   * @return クラスのインスタンス
   */
  public static getInstance(): LAppDelegate {
    if (s_instance == null) {
      s_instance = new LAppDelegate();
    }

    return s_instance;
  }

  /**
   * クラスのインスタンス（シングルトン）を解放する。
   */
  public static releaseInstance(): void {
    const instance = s_instance;
    // Detach the singleton first so re-entrant work can never receive an
    // object whose vectors are being released.
    s_instance = null;
    instance?.release();
  }

  /**
   * Resize canvas and re-initialize view.
   */
  public onResize(): void {
    if (this._subdelegates == null) return;
    for (let i = 0; i < this._subdelegates.getSize(); i++) {
      this._subdelegates.at(i).onResize();
    }
  }

  /**
   * 実行処理。
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
   * 解放する。
   */
  private release(): void {
    if (this._animationFrameId != null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this.releaseEventListener();
    this.releaseSubdelegates();

    // Release MotionSync models before the shared CRI engine and Cubism SDK.
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
   * イベントリスナーを解除する。
   */
  private releaseEventListener(): void {
    document.removeEventListener('pointerdown', onPointerBegan);
    document.removeEventListener('pointermove', onPointerMoved);
    document.removeEventListener('pointerup', onPointerEnded);
    document.removeEventListener('pointercancel', onPointerCancel);
  }

  /**
   * Subdelegate を解放する
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
   * APPに必要な物を初期化する。
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
   * イベントリスナーを設定する。
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
   * Cubism SDKの初期化
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
   * Canvasを生成配置、Subdelegateを初期化する
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

  public changeCharacter(character: ResourceModel | null) {
    // _subdelegates中只有一个画布, 所以设置第一个即可
    this._subdelegates.at(0).changeCharacter(character);
  }

  public getSubdelegate(): csmVector<LAppSubdelegate> {
    return this._subdelegates;
  }

  /**
   * Privateなコンストラクタ
   */
  private constructor() {
    this._cubismOption = new Option();
    this._subdelegates = new csmVector<LAppSubdelegate>();
    this._canvases = new csmVector<HTMLCanvasElement>();
    this._animationFrameId = null;
    this._initialized = false;
  }

  /**
   * Cubism SDK Option
   */
  private _cubismOption: Option;
  private _motionSyncInitialized = false;

  /**
   * 操作対象のcanvas要素
   */
  private _canvases: csmVector<HTMLCanvasElement>;

  /**
   * Subdelegate
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
