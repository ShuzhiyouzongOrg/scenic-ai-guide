// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D WebGL 纹理管理器。
 * @description 负责图片异步加载、纹理缓存、预乘透明度配置和纹理资源释放。
 */

import { csmVector, iterator } from '@framework/type/csmvector';
import { LAppGlManager } from './lappglmanager';

/**
 * @class
 * @description 管理当前 WebGL 上下文中的 Live2D 图片和纹理缓存。
 * @example
 * const textureManager = new LAppTextureManager();
 */
export class LAppTextureManager {
  /**
   * @description 创建空的纹理信息向量。
   */
  public constructor() {
    this._textures = new csmVector<TextureInfo>();
  }

  /**
   * @description 删除全部 WebGL 纹理并释放纹理信息向量。
   * @returns {void} 无返回值。
   */
  public release(): void {
    for (
      let ite: iterator<TextureInfo> = this._textures.begin();
      ite.notEqual(this._textures.end());
      ite.preIncrement()
    ) {
      this._glManager.getGl().deleteTexture(ite.ptr().id);
    }
    this._textures = null;
  }

  /**
   * @description 异步加载 PNG 等浏览器图片，复用同路径缓存并创建 WebGL 纹理与 mipmap。
   * @param {string} fileName 待加载图片的可访问地址。
   * @param {boolean} usePremultiply 是否启用预乘透明度处理。
   * @param {(textureInfo: TextureInfo) => void} callback 加载成功后的纹理回调。
   * @param {(error: Error) => void} [onError] 图片加载失败回调。
   * @returns {void} 无返回值。
   * @example
   * textureManager.createTextureFromPngFile(url, true, handleTexture, handleError);
   */
  public createTextureFromPngFile(
    fileName: string,
    usePremultiply: boolean,
    callback: (textureInfo: TextureInfo) => void,
    onError?: (error: Error) => void
  ): void {
    // search loaded texture already
    for (
      let ite: iterator<TextureInfo> = this._textures.begin();
      ite.notEqual(this._textures.end());
      ite.preIncrement()
    ) {
      if (
        ite.ptr().fileName == fileName &&
        ite.ptr().usePremultply == usePremultiply
      ) {
        // 2回目以降はキャッシュが使用される(待ち時間なし)
        // WebKitでは同じImageのonloadを再度呼ぶには再インスタンスが必要
        // 詳細：https://stackoverflow.com/a/5024181
        ite.ptr().img = new Image();
        ite
          .ptr()
          .img.addEventListener('load', (): void => callback(ite.ptr()), {
            once: true,
            passive: true
          });
        ite.ptr().img.addEventListener(
          'error',
          (): void => onError?.(new Error(`Failed to load Live2D texture: ${fileName}`)),
          { once: true, passive: true }
        );
        ite.ptr().img.src = fileName;
        return;
      }
    }

    // データのオンロードをトリガーにする
    const img = new Image();
    img.addEventListener(
      'load',
      (): void => {
        // テクスチャオブジェクトの作成
        const tex: WebGLTexture = this._glManager.getGl().createTexture();

        // テクスチャを選択
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, tex);

        // テクスチャにピクセルを書き込む
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MIN_FILTER,
            this._glManager.getGl().LINEAR_MIPMAP_LINEAR
          );
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MAG_FILTER,
            this._glManager.getGl().LINEAR
          );

        // Premult処理を行わせる
        if (usePremultiply) {
          this._glManager
            .getGl()
            .pixelStorei(
              this._glManager.getGl().UNPACK_PREMULTIPLY_ALPHA_WEBGL,
              1
            );
        }

        // テクスチャにピクセルを書き込む
        this._glManager
          .getGl()
          .texImage2D(
            this._glManager.getGl().TEXTURE_2D,
            0,
            this._glManager.getGl().RGBA,
            this._glManager.getGl().RGBA,
            this._glManager.getGl().UNSIGNED_BYTE,
            img
          );

        // ミップマップを生成
        this._glManager
          .getGl()
          .generateMipmap(this._glManager.getGl().TEXTURE_2D);

        // テクスチャをバインド
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, null);

        const textureInfo: TextureInfo = new TextureInfo();
        if (textureInfo != null) {
          textureInfo.fileName = fileName;
          textureInfo.width = img.width;
          textureInfo.height = img.height;
          textureInfo.id = tex;
          textureInfo.img = img;
          textureInfo.usePremultply = usePremultiply;
          if (this._textures != null) {
            this._textures.pushBack(textureInfo);
          }
        }

        callback(textureInfo);
      },
      { once: true, passive: true }
    );
    img.addEventListener(
      'error',
      (): void => onError?.(new Error(`Failed to load Live2D texture: ${fileName}`)),
      { once: true, passive: true }
    );
    img.crossOrigin = 'anonymous';
    img.src = fileName;
  }

  /**
   * @description 删除并清空纹理向量中的全部 WebGL 纹理。
   * @returns {void} 无返回值。
   */
  public releaseTextures(): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      this._glManager.getGl().deleteTexture(this._textures.at(i).id);
      this._textures.set(i, null);
    }

    this._textures.clear();
  }

  /**
   * @description 按 WebGL 纹理对象删除对应纹理和缓存记录。
   * @param {WebGLTexture} texture 待释放的 WebGL 纹理。
   * @returns {void} 无返回值。
   */
  public releaseTextureByTexture(texture: WebGLTexture): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      if (this._textures.at(i).id != texture) {
        continue;
      }

      this._glManager.getGl().deleteTexture(this._textures.at(i).id);
      this._textures.set(i, null);
      this._textures.remove(i);
      break;
    }
  }

  /**
   * @description 按原始文件地址删除对应纹理和缓存记录。
   * @param {string} fileName 待释放纹理的图片地址。
   * @returns {void} 无返回值。
   */
  public releaseTextureByFilePath(fileName: string): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      if (this._textures.at(i).fileName == fileName) {
        this._glManager.getGl().deleteTexture(this._textures.at(i).id);
        this._textures.set(i, null);
        this._textures.remove(i);
        break;
      }
    }
  }

  /**
   * @description 绑定创建和销毁纹理所需的 WebGL 管理器。
   * @param {LAppGlManager} glManager 当前画布的 WebGL 管理器。
   * @returns {void} 无返回值。
   */
  public setGlManager(glManager: LAppGlManager): void {
    this._glManager = glManager;
  }

  _textures: csmVector<TextureInfo>;
  private _glManager: LAppGlManager;
}

/**
 * @class
 * @typedef {object} TextureInfo
 * @description 保存已加载图片及其 WebGL 纹理元数据。
 * @property {HTMLImageElement} img 浏览器图片元素。
 * @property {WebGLTexture|null} id WebGL 纹理对象。
 * @property {number} width 图片宽度，单位为像素。
 * @property {number} height 图片高度，单位为像素。
 * @property {boolean} usePremultply 是否使用预乘透明度。
 * @property {string} fileName 原始图片地址。
 */
export class TextureInfo {
  img: HTMLImageElement; // 画像
  id: WebGLTexture = null; // テクスチャ
  width = 0; // 横幅
  height = 0; // 高さ
  usePremultply: boolean; // Premult処理を有効にするか
  fileName: string; // ファイル名
}
