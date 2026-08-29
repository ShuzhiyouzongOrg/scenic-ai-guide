// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 触摸手势状态管理器。
 * @description 维护 Live2D 画布的触摸起点、位移、缩放和轻扫状态，并提供距离计算能力。
 */

/**
 * @class
 * @description 管理单点触摸状态并计算拖动距离与同向位移。
 *
 * @example
 * const touch = new TouchManager()
 * touch.touchesBegan(120, 80)
 */
export class TouchManager {
  /**
   * @constructor
   * @description 创建触摸管理器，并将坐标、位移和缩放状态初始化为默认值。
   */
  constructor() {
    this._startX = 0.0;
    this._startY = 0.0;
    this._lastX = 0.0;
    this._lastY = 0.0;
    this._lastX1 = 0.0;
    this._lastY1 = 0.0;
    this._lastX2 = 0.0;
    this._lastY2 = 0.0;
    this._lastTouchDistance = 0.0;
    this._deltaX = 0.0;
    this._deltaY = 0.0;
    this._scale = 1.0;
    this._touchSingle = false;
    this._flipAvailable = false;
  }

  /**
   * @description 返回当前触摸中心的横坐标。
   *
   * @returns {number} 当前触摸中心的横坐标。
   */
  public getCenterX(): number {
    return this._lastX;
  }

  /**
   * @description 返回当前触摸中心的纵坐标。
   *
   * @returns {number} 当前触摸中心的纵坐标。
   */
  public getCenterY(): number {
    return this._lastY;
  }

  /**
   * @description 返回相对上一帧的横向位移。
   *
   * @returns {number} 横向位移量。
   */
  public getDeltaX(): number {
    return this._deltaX;
  }

  /**
   * @description 返回相对上一帧的纵向位移。
   *
   * @returns {number} 纵向位移量。
   */
  public getDeltaY(): number {
    return this._deltaY;
  }

  /**
   * @description 返回本轮触摸开始时的横坐标。
   *
   * @returns {number} 触摸起点横坐标。
   */
  public getStartX(): number {
    return this._startX;
  }

  /**
   * @description 返回本轮触摸开始时的纵坐标。
   *
   * @returns {number} 触摸起点纵坐标。
   */
  public getStartY(): number {
    return this._startY;
  }

  /**
   * @description 返回当前帧应应用的缩放倍率。
   *
   * @returns {number} 当前缩放倍率。
   */
  public getScale(): number {
    return this._scale;
  }

  /**
   * @description 返回最近一次单点触摸的横坐标。
   *
   * @returns {number} 最近触摸横坐标。
   */
  public getX(): number {
    return this._lastX;
  }

  /**
   * @description 返回最近一次单点触摸的纵坐标。
   *
   * @returns {number} 最近触摸纵坐标。
   */
  public getY(): number {
    return this._lastY;
  }

  /**
   * @description 返回双点触摸中第一个触点的横坐标。
   *
   * @returns {number} 第一个触点横坐标。
   */
  public getX1(): number {
    return this._lastX1;
  }

  /**
   * @description 返回双点触摸中第一个触点的纵坐标。
   *
   * @returns {number} 第一个触点纵坐标。
   */
  public getY1(): number {
    return this._lastY1;
  }

  /**
   * @description 返回双点触摸中第二个触点的横坐标。
   *
   * @returns {number} 第二个触点横坐标。
   */
  public getX2(): number {
    return this._lastX2;
  }

  /**
   * @description 返回双点触摸中第二个触点的纵坐标。
   *
   * @returns {number} 第二个触点纵坐标。
   */
  public getY2(): number {
    return this._lastY2;
  }

  /**
   * @description 判断当前手势是否为单点触摸。
   *
   * @returns {boolean} 单点触摸时返回 `true`。
   */
  public isSingleTouch(): boolean {
    return this._touchSingle;
  }

  /**
   * @description 判断当前触摸序列是否仍可识别为轻扫手势。
   *
   * @returns {boolean} 可继续识别轻扫时返回 `true`。
   */
  public isFlickAvailable(): boolean {
    return this._flipAvailable;
  }

  /**
   * @description 禁用当前触摸序列的轻扫识别。
   *
   * @returns {void} 无返回值。
   */
  public disableFlick(): void {
    this._flipAvailable = false;
  }

  /**
   * @description 记录触摸起点，并重置距离和轻扫判定状态。
   *
   * @param {number} deviceX 触摸点在设备画布中的横坐标。
   * @param {number} deviceY 触摸点在设备画布中的纵坐标。
   * @returns {void} 无返回值。
   */
  public touchesBegan(deviceX: number, deviceY: number): void {
    this._lastX = deviceX;
    this._lastY = deviceY;
    this._startX = deviceX;
    this._startY = deviceY;
    this._lastTouchDistance = -1.0;
    this._flipAvailable = true;
    this._touchSingle = true;
  }

  /**
   * @description 更新拖动过程中的最近触摸坐标，并保持单点触摸状态。
   *
   * @param {number} deviceX 当前触摸点在设备画布中的横坐标。
   * @param {number} deviceY 当前触摸点在设备画布中的纵坐标。
   * @returns {void} 无返回值。
   */
  public touchesMoved(deviceX: number, deviceY: number): void {
    this._lastX = deviceX;
    this._lastY = deviceY;
    this._lastTouchDistance = -1.0;
    this._touchSingle = true;
  }

  /**
   * @description 计算触摸起点到最近触摸点之间的轻扫距离。
   *
   * @returns {number} 轻扫路径的直线距离。
   */
  public getFlickDistance(): number {
    return this.calculateDistance(
      this._startX,
      this._startY,
      this._lastX,
      this._lastY
    );
  }

  /**
   * @description 使用欧氏距离计算两个画布坐标点之间的距离。
   *
   * @param {number} x1 第一个点的横坐标。
   * @param {number} y1 第一个点的纵坐标。
   * @param {number} x2 第二个点的横坐标。
   * @param {number} y2 第二个点的纵坐标。
   * @returns {number} 两点之间的直线距离。
   */
  public calculateDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
  }

  /**
   * @description 合并两个方向位移；方向相反时返回零，同向时保留绝对值较小的位移。
   *
   * @param {number} v1 第一个方向位移。
   * @param {number} v2 第二个方向位移。
   * @returns {number} 合并后的同向最小位移，方向相反时为零。
   */
  public calculateMovingAmount(v1: number, v2: number): number {
    if (v1 > 0.0 != v2 > 0.0) {
      return 0.0;
    }

    const sign: number = v1 > 0.0 ? 1.0 : -1.0;
    const absoluteValue1 = Math.abs(v1);
    const absoluteValue2 = Math.abs(v2);
    return (
      sign * (absoluteValue1 < absoluteValue2 ? absoluteValue1 : absoluteValue2)
    );
  }

  _startY: number; // 触摸开始时的纵坐标。
  _startX: number; // 触摸开始时的横坐标。
  _lastX: number; // 单点触摸的最近横坐标。
  _lastY: number; // 单点触摸的最近纵坐标。
  _lastX1: number; // 双点触摸中第一个触点的横坐标。
  _lastY1: number; // 双点触摸中第一个触点的纵坐标。
  _lastX2: number; // 双点触摸中第二个触点的横坐标。
  _lastY2: number; // 双点触摸中第二个触点的纵坐标。
  _lastTouchDistance: number; // 两个以上触点之间的最近距离。
  _deltaX: number; // 当前帧相对上一帧的横向位移。
  _deltaY: number; // 当前帧相对上一帧的纵向位移。
  _scale: number; // 当前帧缩放倍率，未缩放时为 1。
  _touchSingle: boolean; // 当前手势是否为单点触摸。
  _flipAvailable: boolean; // 当前触摸序列是否允许识别轻扫。
}
