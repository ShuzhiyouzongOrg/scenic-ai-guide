"use strict";
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextureInfo = exports.LAppTextureManager = void 0;
const csmvector_1 = require("../framework/type/csmvector");
const lappdelegate_1 = require("./lappdelegate");
/**
 * テクスチャ管理クラス
 * 画像読み込み、管理を行うクラス。
 */
class LAppTextureManager {
    /**
     * コンストラクタ
     */
    constructor() {
        this._textures = new csmvector_1.csmVector();
    }
    /**
     * 解放する。
     */
    release() {
        for (let ite = this._textures.begin(); ite.notEqual(this._textures.end()); ite.preIncrement()) {
            lappdelegate_1.gl.deleteTexture(ite.ptr().id);
        }
        this._textures = null;
    }
    /**
     * 画像読み込み
     *
     * @param fileName 読み込む画像ファイルパス名
     * @param usePremultiply Premult処理を有効にするか
     * @return 画像情報、読み込み失敗時はnullを返す
     */
    createTextureFromPngFile(fileName, usePremultiply, callback) {
        // search loaded texture already
        for (let ite = this._textures.begin(); ite.notEqual(this._textures.end()); ite.preIncrement()) {
            if (ite.ptr().fileName == fileName &&
                ite.ptr().usePremultply == usePremultiply) {
                callback(ite.ptr());
                return;
            }
        }
        const canvas = lappdelegate_1.canvas;
        if (!canvas) {
            throw new Error('Live2D canvas is unavailable.');
        }
        const img = canvas.createImage();
        let downloadAttempt = 0;
        const loadTexture = () => {
            downloadAttempt++;
            wx.downloadFile({
                url: fileName,
                success: (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
                        img.src = res.tempFilePath;
                        return;
                    }
                    retryTextureLoad(`HTTP ${res.statusCode}`);
                },
                fail: (error) => {
                    retryTextureLoad(error && error.errMsg ? error.errMsg : 'download failed');
                }
            });
        };
        const retryTextureLoad = (reason) => {
            if (downloadAttempt < 3) {
                setTimeout(loadTexture, downloadAttempt * 300);
                return;
            }
            console.error('[scenic-live2d] texture load failed', fileName, reason);
        };
        img.onload = () => {
                // テクスチャオブジェクトの作成
                const tex = lappdelegate_1.gl.createTexture();
                // テクスチャを選択
                lappdelegate_1.gl.bindTexture(lappdelegate_1.gl.TEXTURE_2D, tex);
                // テクスチャにピクセルを書き込む
                lappdelegate_1.gl.texParameteri(lappdelegate_1.gl.TEXTURE_2D, lappdelegate_1.gl.TEXTURE_MIN_FILTER, lappdelegate_1.gl.LINEAR_MIPMAP_LINEAR);
                lappdelegate_1.gl.texParameteri(lappdelegate_1.gl.TEXTURE_2D, lappdelegate_1.gl.TEXTURE_MAG_FILTER, lappdelegate_1.gl.LINEAR);
                // Premult処理を行わせる
                if (usePremultiply) {
                    lappdelegate_1.gl.pixelStorei(lappdelegate_1.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
                }
                // テクスチャにピクセルを書き込む
                lappdelegate_1.gl.texImage2D(lappdelegate_1.gl.TEXTURE_2D, 0, lappdelegate_1.gl.RGBA, lappdelegate_1.gl.RGBA, lappdelegate_1.gl.UNSIGNED_BYTE, img);
                // ミップマップを生成
                lappdelegate_1.gl.generateMipmap(lappdelegate_1.gl.TEXTURE_2D);
                // テクスチャをバインド
                lappdelegate_1.gl.bindTexture(lappdelegate_1.gl.TEXTURE_2D, null);
                const textureInfo = new TextureInfo();
                if (textureInfo != null) {
                    textureInfo.fileName = fileName;
                    textureInfo.width = img.width;
                    textureInfo.height = img.height;
                    textureInfo.id = tex;
                    textureInfo.img = img;
                    textureInfo.usePremultply = usePremultiply;
                    this._textures.pushBack(textureInfo);
                }
                callback(textureInfo);
        };
        img.onerror = () => {
            retryTextureLoad('canvas image decode failed');
        };
        loadTexture();
    }
    /**
     * 画像の解放
     *
     * 配列に存在する画像全てを解放する。
     */
    releaseTextures() {
        for (let i = 0; i < this._textures.getSize(); i++) {
            this._textures.set(i, null);
        }
        this._textures.clear();
    }
    /**
     * 画像の解放
     *
     * 指定したテクスチャの画像を解放する。
     * @param texture 解放するテクスチャ
     */
    releaseTextureByTexture(texture) {
        for (let i = 0; i < this._textures.getSize(); i++) {
            if (this._textures.at(i).id != texture) {
                continue;
            }
            this._textures.set(i, null);
            this._textures.remove(i);
            break;
        }
    }
    /**
     * 画像の解放
     *
     * 指定した名前の画像を解放する。
     * @param fileName 解放する画像ファイルパス名
     */
    releaseTextureByFilePath(fileName) {
        for (let i = 0; i < this._textures.getSize(); i++) {
            if (this._textures.at(i).fileName == fileName) {
                this._textures.set(i, null);
                this._textures.remove(i);
                break;
            }
        }
    }
}
exports.LAppTextureManager = LAppTextureManager;
/**
 * 画像情報構造体
 */
class TextureInfo {
    constructor() {
        this.id = null; // テクスチャ
        this.width = 0; // 横幅
        this.height = 0; // 高さ
    }
}
exports.TextureInfo = TextureInfo;
