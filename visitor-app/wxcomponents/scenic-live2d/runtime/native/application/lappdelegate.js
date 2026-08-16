"use strict";
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAppDelegate = exports.frameBuffer = exports.gl = exports.s_instance = exports.canvas = void 0;
const live2dcubismframework_1 = require("../framework/live2dcubismframework");
const LAppDefine = __importStar(require("./lappdefine"));
const lapplive2dmanager_1 = require("./lapplive2dmanager");
const lapppal_1 = require("./lapppal");
const lapptexturemanager_1 = require("./lapptexturemanager");
const lappview_1 = require("./lappview");
/**
 * アプリケーションクラス。
 * Cubism SDKの管理を行う。
 */
class LAppDelegate {
    /**
     * クラスのインスタンス（シングルトン）を返す。
     * インスタンスが生成されていない場合は内部でインスタンスを生成する。
     *
     * @return クラスのインスタンス
     */
    static getInstance() {
        if (exports.s_instance == null) {
            exports.s_instance = new LAppDelegate();
        }
        return exports.s_instance;
    }
    /**
     * クラスのインスタンス（シングルトン）を解放する。
     */
    static releaseInstance() {
        if (exports.s_instance != null) {
            exports.s_instance.release();
        }
        exports.s_instance = null;
    }
    /**
     * APPに必要な物を初期化する。
     */
    initialize(canvasNode, width, height) {
        if (!canvasNode) {
            return false;
        }
        exports.canvas = canvasNode;
        const pixelRatio = Math.max(1, Number(wx.getWindowInfo().pixelRatio || 1));
        exports.canvas.width = Math.max(1, Math.round(Number(width || 1) * pixelRatio));
        exports.canvas.height = Math.max(1, Math.round(Number(height || 1) * pixelRatio));
        exports.gl = exports.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true
        });
        if (!exports.gl) {
            return false;
        }
        exports.gl.enable(exports.gl.BLEND);
        exports.gl.blendFunc(exports.gl.SRC_ALPHA, exports.gl.ONE_MINUS_SRC_ALPHA);
        exports.gl.viewport(0, 0, exports.canvas.width, exports.canvas.height);
        this._view.initialize();
        if (!this.initializeCubism()) {
            live2dcubismframework_1.CubismFramework.cleanUp();
            exports.gl = null;
            exports.canvas = null;
            return false;
        }
        this._initialized = true;
        return true;
    }
    /**
     * Resize canvas and re-initialize view.
     */
    onResize() {
        this._resizeCanvas();
        this._view.initialize();
        // キャンバスサイズを渡す
        const viewport = [0, 0, exports.canvas.width, exports.canvas.height];
        exports.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    }
    /**
     * 解放する。
     */
    release() {
        if (!this._initialized) {
            return;
        }
        lapplive2dmanager_1.LAppLive2DManager.releaseInstance();
        if (this._textureManager) {
            this._textureManager.release();
        }
        if (this._view) {
            this._view.release();
        }
        if (live2dcubismframework_1.CubismFramework.isInitialized()) {
            live2dcubismframework_1.CubismFramework.dispose();
        }
        live2dcubismframework_1.CubismFramework.cleanUp();
        this._initialized = false;
        exports.frameBuffer = null;
        exports.gl = null;
        exports.canvas = null;
    }
    /**
     * 実行処理。
     */
    run() {
        if (exports.s_instance == null || !this._initialized || !exports.gl) {
            return;
        }
        // 時間更新
        lapppal_1.LAppPal.updateTime();
        // 画面の初期化
        exports.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        // 深度テストを有効化
        exports.gl.enable(exports.gl.DEPTH_TEST);
        // 近くにある物体は、遠くにある物体を覆い隠す
        exports.gl.depthFunc(exports.gl.LEQUAL);
        // カラーバッファや深度バッファをクリアする
        exports.gl.clear(exports.gl.COLOR_BUFFER_BIT | exports.gl.DEPTH_BUFFER_BIT);
        exports.gl.clearDepth(1.0);
        // 透過設定
        exports.gl.enable(exports.gl.BLEND);
        exports.gl.blendFunc(exports.gl.SRC_ALPHA, exports.gl.ONE_MINUS_SRC_ALPHA);
        // 描画更新
        this._view.render();
    }
    /**
     * シェーダーを登録する。
     */
    createShader() {
        // バーテックスシェーダーのコンパイル
        const vertexShaderId = exports.gl.createShader(exports.gl.VERTEX_SHADER);
        if (vertexShaderId == null) {
            lapppal_1.LAppPal.printMessage('failed to create vertexShader');
            return null;
        }
        const vertexShader = 'precision mediump float;' +
            'attribute vec3 position;' +
            'attribute vec2 uv;' +
            'varying vec2 vuv;' +
            'void main(void)' +
            '{' +
            '   gl_Position = vec4(position, 1.0);' +
            '   vuv = uv;' +
            '}';
        exports.gl.shaderSource(vertexShaderId, vertexShader);
        exports.gl.compileShader(vertexShaderId);
        // フラグメントシェーダのコンパイル
        const fragmentShaderId = exports.gl.createShader(exports.gl.FRAGMENT_SHADER);
        if (fragmentShaderId == null) {
            lapppal_1.LAppPal.printMessage('failed to create fragmentShader');
            return null;
        }
        const fragmentShader = 'precision mediump float;' +
            'varying vec2 vuv;' +
            'uniform sampler2D texture;' +
            'void main(void)' +
            '{' +
            '   gl_FragColor = texture2D(texture, vuv);' +
            '}';
        exports.gl.shaderSource(fragmentShaderId, fragmentShader);
        exports.gl.compileShader(fragmentShaderId);
        // プログラムオブジェクトの作成
        const programId = exports.gl.createProgram();
        exports.gl.attachShader(programId, vertexShaderId);
        exports.gl.attachShader(programId, fragmentShaderId);
        exports.gl.deleteShader(vertexShaderId);
        exports.gl.deleteShader(fragmentShaderId);
        // リンク
        exports.gl.linkProgram(programId);
        exports.gl.useProgram(programId);
        return programId;
    }
    /**
     * View情報を取得する。
     */
    getView() {
        return this._view;
    }
    getTextureManager() {
        return this._textureManager;
    }
    /**
     * コンストラクタ
     */
    constructor() {
        this._captured = false;
        this._mouseX = 0.0;
        this._mouseY = 0.0;
        this._isEnd = false;
        this._initialized = false;
        this._cubismOption = new live2dcubismframework_1.Option();
        this._view = new lappview_1.LAppView();
        this._textureManager = new lapptexturemanager_1.LAppTextureManager();
    }
    /**
     * Cubism SDKの初期化
     */
    initializeCubism() {
        // setup cubism
        this._cubismOption.logFunction = lapppal_1.LAppPal.printMessage;
        this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
        live2dcubismframework_1.CubismFramework.startUp(this._cubismOption);
        // // initialize cubism
        live2dcubismframework_1.CubismFramework.initialize();
        if (!live2dcubismframework_1.CubismFramework.isInitialized() ||
            live2dcubismframework_1.CubismFramework.getIdManager() == null) {
            lapppal_1.LAppPal.printMessage('CubismFramework failed to initialize the ID manager.');
            return false;
        }
        // // load model
        lapplive2dmanager_1.LAppLive2DManager.getInstance();
        lapppal_1.LAppPal.updateTime();
        this._view.initializeSprite();
        return true;
    }
    /**
     * Resize the canvas to fill the screen.
     */
    _resizeCanvas() {
    }
}
exports.LAppDelegate = LAppDelegate;
