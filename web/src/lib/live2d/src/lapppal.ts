// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 浏览器平台抽象层。
 * @description 封装 Cubism 应用适配代码使用的文件读取、帧时间计算和日志输出能力。
 */

/**
 * @class
 * @description 提供依赖浏览器平台的资源读取、时间更新和消息输出静态方法。
 */
export class LAppPal {
  /**
   * @description 通过 Fetch 读取文件二进制，并把缓冲区和字节长度交给回调。
   * @param {string} filePath 待读取文件的可访问地址。
   * @param {(arrayBuffer: ArrayBuffer, size: number) => void} callback 文件读取完成后的回调。
   * @returns {void} 无返回值。
   * @example
   * LAppPal.loadFileAsBytes(url, (buffer, size) => consume(buffer, size));
   */
  public static loadFileAsBytes(
    filePath: string,
    callback: (arrayBuffer: ArrayBuffer, size: number) => void
  ): void {
    fetch(filePath)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => callback(arrayBuffer, arrayBuffer.byteLength));
  }

  /**
   * @description 获取最近两次时间更新之间的帧间隔。
   * @returns {number} 帧间隔，单位为秒。
   */
  public static getDeltaTime(): number {
    return this.deltaTime;
  }

  /**
   * @description 读取当前时间并更新上一帧、当前帧及帧间隔字段。
   * @returns {void} 无返回值。
   * @example
   * LAppPal.updateTime();
   */
  public static updateTime(): void {
    this.currentFrame = Date.now();
    this.deltaTime = (this.currentFrame - this.lastFrame) / 1000;
    this.lastFrame = this.currentFrame;
  }

  /**
   * @description 将 Cubism 或应用调试消息输出到浏览器控制台。
   * @param {string} message 待输出的消息文本。
   * @returns {void} 无返回值。
   */
  public static printMessage(message: string): void {
    console.log(message);
  }

  /**
   * @description 记录平台抽象层创建时的时间戳。
   * @type {number}
   */
  static lastUpdate = Date.now();

  /**
   * @description 保存当前帧时间戳。
   * @type {number}
   */
  static currentFrame = 0.0;
  /**
   * @description 保存上一帧时间戳。
   * @type {number}
   */
  static lastFrame = 0.0;
  /**
   * @description 保存最近帧间隔，单位为秒。
   * @type {number}
   */
  static deltaTime = 0.0;
}
