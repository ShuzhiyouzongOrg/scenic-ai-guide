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
exports.LAppLive2DManager = exports.s_instance = void 0;
const cubismmatrix44_1 = require("../framework/math/cubismmatrix44");
const csmvector_1 = require("../framework/type/csmvector");
const LAppDefine = __importStar(require("./lappdefine"));
const lappdelegate_1 = require("./lappdelegate");
const lappmodel_1 = require("./lappmodel");
const lapppal_1 = require("./lapppal");
exports.s_instance = null;
/**
 * サンプルアプリケーションにおいてCubismModelを管理するクラス
 * モデル生成と破棄、タップイベントの処理、モデル切り替えを行う。
 */
class LAppLive2DManager {
    /**
     * クラスのインスタンス（シングルトン）を返す。
     * インスタンスが生成されていない場合は内部でインスタンスを生成する。
     *
     * @return クラスのインスタンス
     */
    static getInstance() {
        if (exports.s_instance == null) {
            exports.s_instance = new LAppLive2DManager();
        }
        return exports.s_instance;
    }
    /**
     * クラスのインスタンス（シングルトン）を解放する。
     */
    static releaseInstance() {
        if (exports.s_instance != null) {
            exports.s_instance.releaseAllModel();
        }
        exports.s_instance = null;
    }
    /**
     * 現在のシーンで保持しているモデルを返す。
     *
     * @param no モデルリストのインデックス値
     * @return モデルのインスタンスを返す。インデックス値が範囲外の場合はNULLを返す。
     */
    getModel(no) {
        if (no < this._models.getSize()) {
            return this._models.at(no);
        }
        return null;
    }
    /**
     * 現在のシーンで保持しているすべてのモデルを解放する
     */
    releaseAllModel() {
        for (let i = 0; i < this._models.getSize(); i++) {
            this._models.at(i).release();
            this._models.set(i, null);
        }
        this._models.clear();
    }
    /**
     * 画面をドラッグした時の処理
     *
     * @param x 画面のX座標
     * @param y 画面のY座標
     */
    onDrag(x, y) {
        for (let i = 0; i < this._models.getSize(); i++) {
            const model = this.getModel(i);
            if (model) {
                model.setDragging(x, y);
            }
        }
    }
    motioneexpression(motione, expression, Finished) {
        // console.log(this._models.at(0))
        this._models.at(0).setExpression(expression);
        this._models
            .at(0)
            .startMotion(LAppDefine.MotionGroupTapBody, motione, LAppDefine.PriorityNormal, Finished);
    }
    lip1(no) {
        // this._models
        //   .at(0)
        //   .text3(no)
    }
    drag(x, y) {
        this._models.at(0).drag(x, y);
    }
    motion1(motione, priority, Finished) {
        this._models
            .at(0)
            .startMotion(LAppDefine.MotionGroupTapBody, motione, priority, Finished);
    }
    expression1(expression) {
        this._models.at(0).setExpression1(expression);
    }
    expression2(expression) {
        this._models.at(0).setExpression(expression);
    }
    getmodel1() {
        let model = { expression: this._models.at(0)._expressions._keyValues, motion: this._models.at(0)._motions._keyValues };
        return model;
    }
    /**
     * 画面をタップした時の処理
     *
     * @param x 画面のX座標
     * @param y 画面のY座標
     */
    onTap(x, y) {
        return;
        if (LAppDefine.DebugLogEnable) {
            lapppal_1.LAppPal.printMessage(`[APP]tap point: {x: ${x.toFixed(2)} y: ${y.toFixed(2)}}`);
        }
        for (let i = 0; i < this._models.getSize(); i++) {
            if (this._models.at(i).hitTest(LAppDefine.HitAreaNameHead, x, y)) {
                if (LAppDefine.DebugLogEnable) {
                    lapppal_1.LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameHead}]`);
                }
                this._models.at(i).setRandomExpression();
            }
            else if (this._models.at(i).hitTest(LAppDefine.HitAreaNameBody, x, y)) {
                if (LAppDefine.DebugLogEnable) {
                    lapppal_1.LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameBody}]`);
                }
                this._models
                    .at(i)
                    .startRandomMotion(LAppDefine.MotionGroupTapBody, LAppDefine.PriorityNormal, this._finishedMotion);
            }
        }
    }
    /**
     * 画面を更新するときの処理
     * モデルの更新処理及び描画処理を行う
     */
    onUpdate() {
        const { width, height } = lappdelegate_1.canvas;
        const modelCount = this._models.getSize();
        for (let i = 0; i < modelCount; ++i) {
            const projection = new cubismmatrix44_1.CubismMatrix44();
            const model = this.getModel(i);
            if (model.getModel()) {
                // if (model.getModel().getCanvasWidth() > 1.0 && width < height) {
                //   // 横に長いモデルを縦長ウィンドウに表示する際モデルの横サイズでscaleを算出する
                //   model.getModelMatrix().setWidth(2.0);
                //   projection.scale(1.0, width / height);
                // } else {
                //   projection.scale(height*2 / width, 2.0);
                //   projection.translate(-0.2,-1)
                // }
                projection.scale((height * LAppDefine.scale1) / width, LAppDefine.scale1);
                projection.translate(LAppDefine.translate1.x, LAppDefine.translate1.y);
                // 必要があればここで乗算
                if (this._viewMatrix != null) {
                    projection.multiplyByMatrix(this._viewMatrix);
                }
            }
            model.update();
            model.draw(projection); // 参照渡しなのでprojectionは変質する。
        }
    }
    /**
     * 次のシーンに切りかえる
     * サンプルアプリケーションではモデルセットの切り替えを行う。
     */
    nextScene() {
        const no = (this._sceneIndex + 1) % LAppDefine.ModelDirSize;
        this.changeScene(no);
    }
    /**
     * シーンを切り替える
     * サンプルアプリケーションではモデルセットの切り替えを行う。
     */
    changeScene(index) {
        this._sceneIndex = index;
        if (LAppDefine.DebugLogEnable) {
            lapppal_1.LAppPal.printMessage(`[APP]model index: ${this._sceneIndex}`);
        }
        // ModelDir[]に保持したディレクトリ名から
        // model3.jsonのパスを決定する。
        // ディレクトリ名とmodel3.jsonの名前を一致させておくこと。
        const model = LAppDefine.ModelDir[index];
        const modelPath = LAppDefine.ResourcesPath + model + "/";
        let modelJsonName = LAppDefine.ModelDir[index];
        modelJsonName += ".model3.json";
        this.releaseAllModel();
        this._models.pushBack(new lappmodel_1.LAppModel());
        this._models.at(0).loadAssets(modelPath, modelJsonName);
    }
    setViewMatrix(m) {
        for (let i = 0; i < 16; i++) {
            this._viewMatrix.getArray()[i] = m.getArray()[i];
        }
    }
    /**
     * コンストラクタ
     */
    constructor() {
        // モーション再生終了のコールバック関数
        this._finishedMotion = (self) => {
        };
        this._viewMatrix = new cubismmatrix44_1.CubismMatrix44();
        this._models = new csmvector_1.csmVector();
        this._sceneIndex = 0;
        this.changeScene(this._sceneIndex);
    }
}
exports.LAppLive2DManager = LAppLive2DManager;
