// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 视图与坐标转换控制器。
 * @description 管理视图矩阵、设备坐标转换、着色器初始化、模型绘制和触摸交互。
 */

import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismViewMatrix } from '@framework/math/cubismviewmatrix';

import * as LAppDefine from './lappdefine';
import { LAppDelegate } from './lappdelegate';
import { LAppPal } from './lapppal';
import { LAppSprite } from './lappsprite';
import { TextureInfo } from './lapptexturemanager';
import { TouchManager } from './touchmanager';
import { LAppSubdelegate } from './lappsubdelegate';

/**
 * @class
 * @description 协调画布视图矩阵、触摸状态和当前 Live2D 模型绘制。
 * @example
 * const view = new LAppView();
 */
export class LAppView {
  /**
   * @description 创建触摸管理器、设备到屏幕矩阵和默认视图矩阵。
   */
  public constructor() {
    this._programId = null;
    // this._back = null;
    // this._gear = null;

    // タッチ関係のイベント管理
    this._touchManager = new TouchManager();

    // デバイス座標からスクリーン座標に変換するための
    this._deviceToScreen = new CubismMatrix44();

    // 画面の表示の拡大縮小や移動の変換を行う行列
    this._viewMatrix = new CubismViewMatrix();
  }

  /**
   * @description 根据画布宽高建立逻辑屏幕范围、缩放限制和设备坐标转换矩阵。
   * @param {LAppSubdelegate} subdelegate 当前视图所属的画布子委托。
   * @returns {void} 无返回值。
   */
  public initialize(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
    const { width, height } = subdelegate.getCanvas();

    const ratio: number = width / height;
    const left: number = -ratio;
    const right: number = ratio;
    const bottom: number = LAppDefine.ViewLogicalLeft;
    const top: number = LAppDefine.ViewLogicalRight;

    this._viewMatrix.setScreenRect(left, right, bottom, top); // デバイスに対応する画面の範囲。 Xの左端、Xの右端、Yの下端、Yの上端
    this._viewMatrix.scale(LAppDefine.ViewScale, LAppDefine.ViewScale);

    this._deviceToScreen.loadIdentity();
    if (width > height) {
      const screenW: number = Math.abs(right - left);
      this._deviceToScreen.scaleRelative(screenW / width, -screenW / width);
    } else {
      const screenH: number = Math.abs(top - bottom);
      this._deviceToScreen.scaleRelative(screenH / height, -screenH / height);
    }
    this._deviceToScreen.translateRelative(-width * 0.5, -height * 0.5);

    // 表示範囲の設定
    this._viewMatrix.setMaxScale(LAppDefine.ViewMaxScale); // 限界拡張率
    this._viewMatrix.setMinScale(LAppDefine.ViewMinScale); // 限界縮小率

    // 表示できる最大範囲
    this._viewMatrix.setMaxScreenRect(
      LAppDefine.ViewLogicalMaxLeft,
      LAppDefine.ViewLogicalMaxRight,
      LAppDefine.ViewLogicalMaxBottom,
      LAppDefine.ViewLogicalMaxTop
    );
  }

  /**
   * @description 清空矩阵与触摸状态，并删除视图使用的 WebGL 着色器程序。
   * @returns {void} 无返回值。
   */
  public release(): void {
    this._viewMatrix = null;
    this._touchManager = null;
    this._deviceToScreen = null;

    // this._gear.release();
    // this._gear = null;

    // this._back.release();
    // this._back = null;

    this._subdelegate.getGlManager().getGl().deleteProgram(this._programId);
    this._programId = null;
  }

  /**
   * @description 激活精灵着色器、刷新 WebGL 命令并更新绘制当前 Live2D 模型。
   * @returns {void} 无返回值。
   */
  public render(): void {
    this._subdelegate.getGlManager().getGl().useProgram(this._programId);

    // if (this._back) {
    //   this._back.render(this._programId);
    // }
    // if (this._gear) {
    //   this._gear.render(this._programId);
    // }

    this._subdelegate.getGlManager().getGl().flush();

    const lapplive2dmanager = this._subdelegate.getLive2DManager();
    if (lapplive2dmanager != null) {
      lapplive2dmanager.setViewMatrix(this._viewMatrix);

      lapplive2dmanager.onUpdate();
    }
  }

  /**
   * @description 初始化视图精灵资源，并按需创建二维纹理着色器程序。
   * @returns {void} 无返回值。
   */
  public initializeSprite(): void {
    const width: number = this._subdelegate.getCanvas().width;
    const height: number = this._subdelegate.getCanvas().height;
    const textureManager = this._subdelegate.getTextureManager();
    // const resourcesPath = LAppDefine.ResourcesPath;

    // let imageName = '';

    // 背景画像初期化
    // imageName = LAppDefine.BackImageName;

    // 非同期なのでコールバック関数を作成
    // const initBackGroundTexture = (textureInfo: TextureInfo): void => {
    //   const x: number = width * 0.5;
    //   const y: number = height * 0.5;

    //   const fwidth = textureInfo.width * 2.0;
    //   const fheight = height * 0.95;
    //   this._back = new LAppSprite(x, y, fwidth, fheight, textureInfo.id);
    //   this._back.setSubdelegate(this._subdelegate);
    // };

    // textureManager.createTextureFromPngFile(
    //   resourcesPath + imageName,
    //   false,
    //   initBackGroundTexture
    // );

    // 歯車画像初期化
    // imageName = LAppDefine.GearImageName;
    // const initGearTexture = (textureInfo: TextureInfo): void => {
    //   const x = width - textureInfo.width * 0.5;
    //   const y = height - textureInfo.height * 0.5;
    //   const fwidth = textureInfo.width;
    //   const fheight = textureInfo.height;
    //   this._gear = new LAppSprite(x, y, fwidth, fheight, textureInfo.id);
    //   this._gear.setSubdelegate(this._subdelegate);
    // };

    // textureManager.createTextureFromPngFile(
    //   resourcesPath + imageName,
    //   false,
    //   initGearTexture
    // );

    // シェーダーを作成
    if (this._programId == null) {
      this._programId = this._subdelegate.createShader();
    }
  }

  /**
   * @description 按设备像素比换算触摸起点并交给触摸管理器记录。
   * @param {number} pointX CSS 像素下的屏幕横坐标。
   * @param {number} pointY CSS 像素下的屏幕纵坐标。
   * @returns {void} 无返回值。
   */
  public onTouchesBegan(pointX: number, pointY: number): void {
    this._touchManager.touchesBegan(
      pointX * window.devicePixelRatio,
      pointY * window.devicePixelRatio
    );
  }

  /**
   * @description 更新触摸位置并把转换后的视图坐标传给模型拖拽控制。
   * @param {number} pointX CSS 像素下的屏幕横坐标。
   * @param {number} pointY CSS 像素下的屏幕纵坐标。
   * @returns {void} 无返回值。
   */
  public onTouchesMoved(pointX: number, pointY: number): void {
    const posX = pointX * window.devicePixelRatio;
    const posY = pointY * window.devicePixelRatio;

    const lapplive2dmanager = this._subdelegate.getLive2DManager();

    const viewX: number = this.transformViewX(this._touchManager.getX());
    const viewY: number = this.transformViewY(this._touchManager.getY());

    this._touchManager.touchesMoved(posX, posY);

    lapplive2dmanager.onDrag(viewX, viewY);
  }

  /**
   * @description 结束模型拖拽，将触摸终点转换为视图坐标并触发点击处理。
   * @param {number} pointX CSS 像素下的屏幕横坐标。
   * @param {number} pointY CSS 像素下的屏幕纵坐标。
   * @returns {void} 无返回值。
   */
  public onTouchesEnded(pointX: number, pointY: number): void {
    const posX = pointX * window.devicePixelRatio;
    const posY = pointY * window.devicePixelRatio;

    const lapplive2dmanager = this._subdelegate.getLive2DManager();

    // タッチ終了
    lapplive2dmanager.onDrag(0.0, 0.0);

    // シングルタップ
    const x: number = this.transformViewX(posX);
    const y: number = this.transformViewY(posY);

    if (LAppDefine.DebugTouchLogEnable) {
      LAppPal.printMessage(`[APP]touchesEnded x: ${x} y: ${y}`);
    }
    lapplive2dmanager.onTap(x, y);

    // 歯車にタップしたか
    // if (this._gear.isHit(posX, posY)) {
    //   lapplive2dmanager.nextScene();
    // }
  }

  /**
   * @description 将设备横坐标转换为缩放和平移后的视图横坐标。
   * @param {number} deviceX 设备像素横坐标。
   * @returns {number} Live2D 视图横坐标。
   */
  public transformViewX(deviceX: number): number {
    const screenX: number = this._deviceToScreen.transformX(deviceX); // 論理座標変換した座標を取得。
    return this._viewMatrix.invertTransformX(screenX); // 拡大、縮小、移動後の値。
  }

  /**
   * @description 将设备纵坐标转换为缩放和平移后的视图纵坐标。
   * @param {number} deviceY 设备像素纵坐标。
   * @returns {number} Live2D 视图纵坐标。
   */
  public transformViewY(deviceY: number): number {
    const screenY: number = this._deviceToScreen.transformY(deviceY); // 論理座標変換した座標を取得。
    return this._viewMatrix.invertTransformY(screenY);
  }

  /**
   * @description 将设备横坐标转换为逻辑屏幕横坐标。
   * @param {number} deviceX 设备像素横坐标。
   * @returns {number} 逻辑屏幕横坐标。
   */
  public transformScreenX(deviceX: number): number {
    return this._deviceToScreen.transformX(deviceX);
  }

  /**
   * @description 将设备纵坐标转换为逻辑屏幕纵坐标。
   * @param {number} deviceY 设备像素纵坐标。
   * @returns {number} 逻辑屏幕纵坐标。
   */
  public transformScreenY(deviceY: number): number {
    return this._deviceToScreen.transformY(deviceY);
  }

  _touchManager: TouchManager; // タッチマネージャー
  _deviceToScreen: CubismMatrix44; // デバイスからスクリーンへの行列
  _viewMatrix: CubismViewMatrix; // viewMatrix
  _programId: WebGLProgram | null; // シェーダID
  // _back: LAppSprite; // 背景画像
  // _gear: LAppSprite; // ギア画像
  _changeModel: boolean; // モデル切り替えフラグ
  _isClick: boolean; // クリック中
  private _subdelegate: LAppSubdelegate;
}
