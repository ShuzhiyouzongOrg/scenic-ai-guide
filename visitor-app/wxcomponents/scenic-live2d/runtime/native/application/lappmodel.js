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
exports.LAppModel = void 0;
const cubismdefaultparameterid_1 = require("../framework/cubismdefaultparameterid");
const cubismmodelsettingjson_1 = require("../framework/cubismmodelsettingjson");
const cubismbreath_1 = require("../framework/effect/cubismbreath");
const cubismeyeblink_1 = require("../framework/effect/cubismeyeblink");
const live2dcubismframework_1 = require("../framework/live2dcubismframework");
const cubismusermodel_1 = require("../framework/model/cubismusermodel");
const acubismmotion_1 = require("../framework/motion/acubismmotion");
const cubismmotionqueuemanager_1 = require("../framework/motion/cubismmotionqueuemanager");
const csmmap_1 = require("../framework/type/csmmap");
const csmvector_1 = require("../framework/type/csmvector");
const cubismdebug_1 = require("../framework/utils/cubismdebug");
const LAppDefine = __importStar(require("./lappdefine"));
const lappdelegate_1 = require("./lappdelegate");
const lapppal_1 = require("./lapppal");
const lappwavfilehandler_1 = require("./lappwavfilehandler");
var LoadStep;
(function (LoadStep) {
    LoadStep[LoadStep["LoadAssets"] = 0] = "LoadAssets";
    LoadStep[LoadStep["LoadModel"] = 1] = "LoadModel";
    LoadStep[LoadStep["WaitLoadModel"] = 2] = "WaitLoadModel";
    LoadStep[LoadStep["LoadExpression"] = 3] = "LoadExpression";
    LoadStep[LoadStep["WaitLoadExpression"] = 4] = "WaitLoadExpression";
    LoadStep[LoadStep["LoadPhysics"] = 5] = "LoadPhysics";
    LoadStep[LoadStep["WaitLoadPhysics"] = 6] = "WaitLoadPhysics";
    LoadStep[LoadStep["LoadPose"] = 7] = "LoadPose";
    LoadStep[LoadStep["WaitLoadPose"] = 8] = "WaitLoadPose";
    LoadStep[LoadStep["SetupEyeBlink"] = 9] = "SetupEyeBlink";
    LoadStep[LoadStep["SetupBreath"] = 10] = "SetupBreath";
    LoadStep[LoadStep["LoadUserData"] = 11] = "LoadUserData";
    LoadStep[LoadStep["WaitLoadUserData"] = 12] = "WaitLoadUserData";
    LoadStep[LoadStep["SetupEyeBlinkIds"] = 13] = "SetupEyeBlinkIds";
    LoadStep[LoadStep["SetupLipSyncIds"] = 14] = "SetupLipSyncIds";
    LoadStep[LoadStep["SetupLayout"] = 15] = "SetupLayout";
    LoadStep[LoadStep["LoadMotion"] = 16] = "LoadMotion";
    LoadStep[LoadStep["WaitLoadMotion"] = 17] = "WaitLoadMotion";
    LoadStep[LoadStep["CompleteInitialize"] = 18] = "CompleteInitialize";
    LoadStep[LoadStep["CompleteSetupModel"] = 19] = "CompleteSetupModel";
    LoadStep[LoadStep["LoadTexture"] = 20] = "LoadTexture";
    LoadStep[LoadStep["WaitLoadTexture"] = 21] = "WaitLoadTexture";
    LoadStep[LoadStep["CompleteSetup"] = 22] = "CompleteSetup";
})(LoadStep || (LoadStep = {}));
/**
 * ユーザーが実際に使用するモデルの実装クラス<br>
 * モデル生成、機能コンポーネント生成、更新処理とレンダリングの呼び出しを行う。
 */
class LAppModel extends cubismusermodel_1.CubismUserModel {
    /**
     * model3.jsonが置かれたディレクトリとファイルパスからモデルを生成する
     * @param dir
     * @param fileName
     */
    loadAssets(dir, fileName) {
        this._modelHomeDir = dir;
        let that = this;
        wx.downloadFile({
            url: `${this._modelHomeDir}${fileName}`,
            success(res) {
                if (res.statusCode === 200) {
                    const fs = wx.getFileSystemManager();
                    const arrayBuffer = fs.readFileSync(res.tempFilePath);
                    const setting = new cubismmodelsettingjson_1.CubismModelSettingJson(arrayBuffer, arrayBuffer.byteLength);
                    that._state = LoadStep.LoadModel;
                    that.setupModel(setting);
                }
            }
        });
    }
    /**
     * model3.jsonからモデルを生成する。
     * model3.jsonの記述に従ってモデル生成、モーション、物理演算などのコンポーネント生成を行う。
     *
     * @param setting ICubismModelSettingのインスタンス
     */
    setupModel(setting) {
        this._updating = true;
        this._initialized = false;
        this._modelSetting = setting;
        // CubismModel
        if (this._modelSetting.getModelFileName() != '') {
            const modelFileName = this._modelSetting.getModelFileName();
            let that = this;
            wx.downloadFile({
                url: `${this._modelHomeDir}${modelFileName}`,
                success(res) {
                    if (res.statusCode === 200) {
                        const fs = wx.getFileSystemManager();
                        const arrayBuffer = fs.readFileSync(res.tempFilePath);
                        that.loadModel(arrayBuffer);
                        that._state = LoadStep.LoadExpression;
                        loadCubismExpression();
                    }
                }
            });
            this._state = LoadStep.WaitLoadModel;
        }
        else {
            lapppal_1.LAppPal.printMessage('Model data does not exist.');
        }
        // Expression
        const loadCubismExpression = () => {
            if (this._modelSetting.getExpressionCount() > 0) {
                const count = this._modelSetting.getExpressionCount();
                for (let i = 0; i < count; i++) {
                    const expressionName = this._modelSetting.getExpressionName(i);
                    const expressionFileName = this._modelSetting.getExpressionFileName(i);
                    let that = this;
                    wx.downloadFile({
                        url: `${this._modelHomeDir}${expressionFileName}`,
                        success(res) {
                            if (res.statusCode === 200) {
                                const fs = wx.getFileSystemManager();
                                const arrayBuffer = fs.readFileSync(res.tempFilePath);
                                const motion = that.loadExpression(arrayBuffer, arrayBuffer.byteLength, expressionName);
                                if (that._expressions.getValue(expressionName) != null) {
                                    acubismmotion_1.ACubismMotion.delete(that._expressions.getValue(expressionName));
                                    that._expressions.setValue(expressionName, null);
                                }
                                that._expressions.setValue(expressionName, motion);
                                that._expressionCount++;
                                if (that._expressionCount >= count) {
                                    that._state = LoadStep.LoadPhysics;
                                    // callback
                                    loadCubismPhysics();
                                }
                            }
                        }
                    });
                }
                this._state = LoadStep.WaitLoadExpression;
            }
            else {
                this._state = LoadStep.LoadPhysics;
                // callback
                loadCubismPhysics();
            }
        };
        // Physics
        const loadCubismPhysics = () => {
            if (this._modelSetting.getPhysicsFileName() != '') {
                const physicsFileName = this._modelSetting.getPhysicsFileName();
                let that = this;
                wx.downloadFile({
                    url: `${this._modelHomeDir}${physicsFileName}`,
                    success(res) {
                        if (res.statusCode === 200) {
                            const fs = wx.getFileSystemManager();
                            const arrayBuffer = fs.readFileSync(res.tempFilePath);
                            that.loadPhysics(arrayBuffer, arrayBuffer.byteLength);
                            that._state = LoadStep.LoadPose;
                            // callback
                            loadCubismPose();
                        }
                    }
                });
                this._state = LoadStep.WaitLoadPhysics;
            }
            else {
                this._state = LoadStep.LoadPose;
                // callback
                loadCubismPose();
            }
        };
        // Pose
        const loadCubismPose = () => {
            if (this._modelSetting.getPoseFileName() != '') {
                const poseFileName = this._modelSetting.getPoseFileName();
                let that = this;
                wx.downloadFile({
                    url: `${this._modelHomeDir}${poseFileName}`,
                    success(res) {
                        if (res.statusCode === 200) {
                            const fs = wx.getFileSystemManager();
                            const arrayBuffer = fs.readFileSync(res.tempFilePath);
                            that.loadPose(arrayBuffer, arrayBuffer.byteLength);
                            that._state = LoadStep.SetupEyeBlink;
                            // callback
                            setupEyeBlink();
                        }
                    }
                });
                this._state = LoadStep.WaitLoadPose;
            }
            else {
                this._state = LoadStep.SetupEyeBlink;
                // callback
                setupEyeBlink();
            }
        };
        // EyeBlink
        const setupEyeBlink = () => {
            if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
                this._eyeBlink = cubismeyeblink_1.CubismEyeBlink.create(this._modelSetting);
                this._state = LoadStep.SetupBreath;
            }
            // callback
            setupBreath();
        };
        // Breath
        const setupBreath = () => {
            this._breath = cubismbreath_1.CubismBreath.create();
            const breathParameters = new csmvector_1.csmVector();
            breathParameters.pushBack(new cubismbreath_1.BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5));
            breathParameters.pushBack(new cubismbreath_1.BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5));
            breathParameters.pushBack(new cubismbreath_1.BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5));
            breathParameters.pushBack(new cubismbreath_1.BreathParameterData(this._idParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5));
            breathParameters.pushBack(new cubismbreath_1.BreathParameterData(live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamBreath), 0.5, 0.5, 3.2345, 1));
            this._breath.setParameters(breathParameters);
            this._state = LoadStep.LoadUserData;
            // callback
            loadUserData();
        };
        // UserData
        const loadUserData = () => {
            if (this._modelSetting.getUserDataFile() != '') {
                const userDataFile = this._modelSetting.getUserDataFile();
                let that = this;
                wx.downloadFile({
                    url: `${this._modelHomeDir}${userDataFile}`,
                    success(res) {
                        if (res.statusCode === 200) {
                            const fs = wx.getFileSystemManager();
                            const arrayBuffer = fs.readFileSync(res.tempFilePath);
                            that.loadUserData(arrayBuffer, arrayBuffer.byteLength);
                            that._state = LoadStep.SetupEyeBlinkIds;
                            // callback
                            setupEyeBlinkIds();
                        }
                    }
                });
                this._state = LoadStep.WaitLoadUserData;
            }
            else {
                this._state = LoadStep.SetupEyeBlinkIds;
                // callback
                setupEyeBlinkIds();
            }
        };
        // EyeBlinkIds
        const setupEyeBlinkIds = () => {
            const eyeBlinkIdCount = this._modelSetting.getEyeBlinkParameterCount();
            for (let i = 0; i < eyeBlinkIdCount; ++i) {
                this._eyeBlinkIds.pushBack(this._modelSetting.getEyeBlinkParameterId(i));
            }
            this._state = LoadStep.SetupLipSyncIds;
            // callback
            setupLipSyncIds();
        };
        // LipSyncIds
        const setupLipSyncIds = () => {
            const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();
            for (let i = 0; i < lipSyncIdCount; ++i) {
                this._lipSyncIds.pushBack(this._modelSetting.getLipSyncParameterId(i));
            }
            this._state = LoadStep.SetupLayout;
            // callback
            setupLayout();
        };
        // Layout
        const setupLayout = () => {
            const layout = new csmmap_1.csmMap();
            this._modelSetting.getLayoutMap(layout);
            this._modelMatrix.setupFromLayout(layout);
            this._state = LoadStep.LoadMotion;
            // callback
            loadCubismMotion();
        };
        // Motion
        const loadCubismMotion = () => {
            this._state = LoadStep.WaitLoadMotion;
            this._model.saveParameters();
            this._allMotionCount = 0;
            this._motionCount = 0;
            const group = [];
            const motionGroupCount = this._modelSetting.getMotionGroupCount();
            // モーションの総数を求める
            for (let i = 0; i < motionGroupCount; i++) {
                group[i] = this._modelSetting.getMotionGroupName(i);
                this._allMotionCount += this._modelSetting.getMotionCount(group[i]);
            }
            // モーションの読み込み
            for (let i = 0; i < motionGroupCount; i++) {
                this.preLoadMotionGroup(group[i]);
            }
            // モーションがない場合
            if (motionGroupCount == 0) {
                this._state = LoadStep.LoadTexture;
                // 全てのモーションを停止する
                this._motionManager.stopAllMotions();
                this._updating = false;
                this._initialized = true;
                this.createRenderer();
                this.setupTextures();
                this.getRenderer().startUp(lappdelegate_1.gl);
            }
        };
    }
    /**
     * テクスチャユニットにテクスチャをロードする
     */
    setupTextures() {
        // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用
        const usePremultiply = true;
        if (this._state == LoadStep.LoadTexture) {
            // テクスチャ読み込み用
            const textureCount = this._modelSetting.getTextureCount();
            for (let modelTextureNumber = 0; modelTextureNumber < textureCount; modelTextureNumber++) {
                // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
                if (this._modelSetting.getTextureFileName(modelTextureNumber) == '') {
                    console.log('getTextureFileName null');
                    continue;
                }
                // WebGLのテクスチャユニットにテクスチャをロードする
                let texturePath = this._modelSetting.getTextureFileName(modelTextureNumber);
                texturePath = this._modelHomeDir + texturePath;
                // ロード完了時に呼び出すコールバック関数
                const onLoad = (textureInfo) => {
                    this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);
                    this._textureCount++;
                    if (this._textureCount >= textureCount) {
                        // ロード完了
                        this._state = LoadStep.CompleteSetup;
                    }
                };
                // 読み込み
                lappdelegate_1.LAppDelegate.getInstance()
                    .getTextureManager()
                    .createTextureFromPngFile(texturePath, usePremultiply, onLoad);
                this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
            }
            this._state = LoadStep.WaitLoadTexture;
        }
    }
    /**
     * レンダラを再構築する
     */
    reloadRenderer() {
        this.deleteRenderer();
        this.createRenderer();
        this.setupTextures();
    }
    /**
     * 更新
     */
    drag(x, y) {
        this._dragX = x;
        this._dragY = y;
        console.log(this._dragX);
    }
    update() {
        if (this._state != LoadStep.CompleteSetup)
            return;
        const deltaTimeSeconds = lapppal_1.LAppPal.getDeltaTime();
        this._userTimeSeconds += deltaTimeSeconds;
        this._dragManager.update(deltaTimeSeconds);
        this._dragX = this._dragManager.getX();
        this._dragY = this._dragManager.getY();
        // モーションによるパラメータ更新の有無
        let motionUpdated = false;
        //--------------------------------------------------------------------------
        this._model.loadParameters(); // 前回セーブされた状態をロード
        if (this._motionManager.isFinished()) {
            // モーションの再生がない場合、待機モーションの中からランダムで再生する
            this.startRandomMotion(LAppDefine.MotionGroupIdle, LAppDefine.PriorityIdle);
        }
        else {
            motionUpdated = this._motionManager.updateMotion(this._model, deltaTimeSeconds); // モーションを更新
        }
        this._model.saveParameters(); // 状態を保存
        //--------------------------------------------------------------------------
        // まばたき
        if (!motionUpdated) {
            if (this._eyeBlink != null) {
                // メインモーションの更新がないとき
                this._eyeBlink.updateParameters(this._model, deltaTimeSeconds); // 目パチ
            }
        }
        if (this._expressionManager != null) {
            this._expressionManager.updateMotion(this._model, deltaTimeSeconds); // 表情でパラメータ更新（相対変化）
        }
        // ドラッグによる変化
        // ドラッグによる顔の向きの調整
        this._model.addParameterValueById(this._idParamAngleX, this._dragX * 30); // -30から30の値を加える
        this._model.addParameterValueById(this._idParamAngleY, this._dragY * 30);
        this._model.addParameterValueById(this._idParamAngleZ, this._dragX * this._dragY * -30);
        // ドラッグによる体の向きの調整
        this._model.addParameterValueById(this._idParamBodyAngleX, this._dragX * 10); // -10から10の値を加える
        // ドラッグによる目の向きの調整
        this._model.addParameterValueById(this._idParamEyeBallX, this._dragX); // -1から1の値を加える
        this._model.addParameterValueById(this._idParamEyeBallY, this._dragY);
        // 呼吸など
        if (this._breath != null) {
            this._breath.updateParameters(this._model, deltaTimeSeconds);
        }
        // 物理演算の設定
        if (this._physics != null) {
            this._physics.evaluate(this._model, deltaTimeSeconds);
        }
        // リップシンクの設定
        if (this._lipsync) {
            const value = this._externalLipSyncValue || 0.0;
            for (let i = 0; i < this._lipSyncIds.getSize(); ++i) {
                this._model.addParameterValueById(this._lipSyncIds.at(i), value, 0.8);
            }
        }
        // ポーズの設定
        if (this._pose != null) {
            this._pose.updateParameters(this._model, deltaTimeSeconds);
        }
        this._model.update();
    }
    /**
     * 引数で指定したモーションの再生を開始する
     * @param group モーショングループ名
     * @param no グループ内の番号
     * @param priority 優先度
     * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
     * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
     */
    startMotion(group, no, priority, onFinishedMotionHandler) {
        if (priority == LAppDefine.PriorityForce) {
            this._motionManager.setReservePriority(priority);
        }
        else if (!this._motionManager.reserveMotion(priority)) {
            if (this._debugMode) {
                lapppal_1.LAppPal.printMessage("[APP]can't start motion.");
            }
            return cubismmotionqueuemanager_1.InvalidMotionQueueEntryHandleValue;
        }
        const motionFileName = this._modelSetting.getMotionFileName(group, no);
        // ex) idle_0
        const name = `${group}_${no}`;
        let motion = this._motions.getValue(name);
        let autoDelete = false;
        if (motion == null) {
            let that = this;
            wx.downloadFile({
                url: `${this._modelHomeDir}${motionFileName}`,
                success(res) {
                    if (res.statusCode === 200) {
                        const fs = wx.getFileSystemManager();
                        const arrayBuffer = fs.readFileSync(res.tempFilePath);
                        motion = that.loadMotion(arrayBuffer, arrayBuffer.byteLength, null, onFinishedMotionHandler);
                        let fadeTime = that._modelSetting.getMotionFadeInTimeValue(group, no);
                        if (fadeTime >= 0.0) {
                            motion.setFadeInTime(fadeTime);
                        }
                        fadeTime = that._modelSetting.getMotionFadeOutTimeValue(group, no);
                        if (fadeTime >= 0.0) {
                            motion.setFadeOutTime(fadeTime);
                        }
                        motion.setEffectIds(that._eyeBlinkIds, that._lipSyncIds);
                        autoDelete = true; // 終了時にメモリから削除
                    }
                }
            });
        }
        else {
            motion.setFinishedMotionHandler(onFinishedMotionHandler);
        }
        //voice
        const voice = this._modelSetting.getMotionSoundFileName(group, no);
        if (voice.localeCompare('') != 0) {
            let path = voice;
            path = this._modelHomeDir + path;
            this._wavFileHandler.start(path);
        }
        if (this._debugMode) {
            lapppal_1.LAppPal.printMessage(`[APP]start motion: [${group}_${no}`);
        }
        return this._motionManager.startMotionPriority(motion, autoDelete, priority);
    }
    /**
     * ランダムに選ばれたモーションの再生を開始する。
     * @param group モーショングループ名
     * @param priority 優先度
     * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
     * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
     */
    startRandomMotion(group, priority, onFinishedMotionHandler) {
        if (this._modelSetting.getMotionCount(group) == 0) {
            return cubismmotionqueuemanager_1.InvalidMotionQueueEntryHandleValue;
        }
        const no = Math.floor(Math.random() * this._modelSetting.getMotionCount(group));
        return this.startMotion(group, no, priority, onFinishedMotionHandler);
    }
    /**
     * 引数で指定した表情モーションをセットする
     *
     * @param expressionId 表情モーションのID
     */
    setExpression(expressionId) {
        const motion = this._expressions.getValue(expressionId);
        if (this._debugMode) {
            lapppal_1.LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
        }
        if (motion != null) {
            this._expressionManager.startMotionPriority(motion, false, LAppDefine.PriorityForce);
        }
        else {
            if (this._debugMode) {
                lapppal_1.LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
            }
        }
    }
    //  usercode
    setExpression1(no) {
        const name = this._expressions._keyValues[no].first;
        console.log(name);
        this.setExpression(name);
    }
    /**
     * ランダムに選ばれた表情モーションをセットする
     */
    setRandomExpression() {
        if (this._expressions.getSize() == 0) {
            return;
        }
        const no = Math.floor(Math.random() * this._expressions.getSize());
        for (let i = 0; i < this._expressions.getSize(); i++) {
            if (i == no) {
                const name = this._expressions._keyValues[i].first;
                this.setExpression(name);
                return;
            }
        }
    }
    /**
     * イベントの発火を受け取る
     */
    motionEventFired(eventValue) {
        (0, cubismdebug_1.CubismLogInfo)('{0} is fired on LAppModel!!', eventValue.s);
    }
    /**
     * 当たり判定テスト
     * 指定ＩＤの頂点リストから矩形を計算し、座標をが矩形範囲内か判定する。
     *
     * @param hitArenaName  当たり判定をテストする対象のID
     * @param x             判定を行うX座標
     * @param y             判定を行うY座標
     */
    hitTest(hitArenaName, x, y) {
        // 透明時は当たり判定無し。
        if (this._opacity < 1) {
            return false;
        }
        const count = this._modelSetting.getHitAreasCount();
        for (let i = 0; i < count; i++) {
            if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
                const drawId = this._modelSetting.getHitAreaId(i);
                return this.isHit(drawId, x, y);
            }
        }
        return false;
    }
    /**
     * モーションデータをグループ名から一括でロードする。
     * モーションデータの名前は内部でModelSettingから取得する。
     *
     * @param group モーションデータのグループ名
     */
    preLoadMotionGroup(group) {
        for (let i = 0; i < this._modelSetting.getMotionCount(group); i++) {
            const motionFileName = this._modelSetting.getMotionFileName(group, i);
            // ex) idle_0
            const name = `${group}_${i}`;
            if (this._debugMode) {
                lapppal_1.LAppPal.printMessage(`[APP]load motion: ${motionFileName} => [${name}]`);
            }
            let that = this;
            wx.downloadFile({
                url: `${this._modelHomeDir}${motionFileName}`,
                success(res) {
                    if (res.statusCode === 200) {
                        const fs = wx.getFileSystemManager();
                        const arrayBuffer = fs.readFileSync(res.tempFilePath);
                        const tmpMotion = that.loadMotion(arrayBuffer, arrayBuffer.byteLength, name);
                        let fadeTime = that._modelSetting.getMotionFadeInTimeValue(group, i);
                        if (fadeTime >= 0.0) {
                            tmpMotion.setFadeInTime(fadeTime);
                        }
                        fadeTime = that._modelSetting.getMotionFadeOutTimeValue(group, i);
                        if (fadeTime >= 0.0) {
                            tmpMotion.setFadeOutTime(fadeTime);
                        }
                        tmpMotion.setEffectIds(that._eyeBlinkIds, that._lipSyncIds);
                        if (that._motions.getValue(name) != null) {
                            acubismmotion_1.ACubismMotion.delete(that._motions.getValue(name));
                        }
                        that._motions.setValue(name, tmpMotion);
                        that._motionCount++;
                        if (that._motionCount >= that._allMotionCount) {
                            that._state = LoadStep.LoadTexture;
                            // 全てのモーションを停止する
                            that._motionManager.stopAllMotions();
                            that._updating = false;
                            that._initialized = true;
                            that.createRenderer();
                            that.setupTextures();
                            that.getRenderer().startUp(lappdelegate_1.gl);
                        }
                    }
                }
            });
        }
    }
    /**
     * すべてのモーションデータを解放する。
     */
    releaseMotions() {
        this._motions.clear();
    }
    /**
     * 全ての表情データを解放する。
     */
    releaseExpressions() {
        this._expressions.clear();
    }
    /**
     * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
     */
    doDraw() {
        if (this._model == null)
            return;
        // キャンバスサイズを渡す
        const viewport = [0, 0, lappdelegate_1.canvas.width, lappdelegate_1.canvas.height];
        this.getRenderer().setRenderState(lappdelegate_1.frameBuffer, viewport);
        this.getRenderer().drawModel();
    }
    /**
     * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
     */
    draw(matrix) {
        if (this._model == null) {
            return;
        }
        // 各読み込み終了後
        if (this._state == LoadStep.CompleteSetup) {
            matrix.multiplyByMatrix(this._modelMatrix);
            this.getRenderer().setMvpMatrix(matrix);
            this.doDraw();
        }
    }
    /**
     * コンストラクタ
     */
    constructor() {
        super();
        this._modelSetting = null;
        this._modelHomeDir = null;
        this._userTimeSeconds = 0.0;
        this._eyeBlinkIds = new csmvector_1.csmVector();
        this._lipSyncIds = new csmvector_1.csmVector();
        this._motions = new csmmap_1.csmMap();
        this._expressions = new csmmap_1.csmMap();
        this._hitArea = new csmvector_1.csmVector();
        this._userArea = new csmvector_1.csmVector();
        this._idParamAngleX = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleX);
        this._idParamAngleY = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleY);
        this._idParamAngleZ = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamAngleZ);
        this._idParamEyeBallX = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamEyeBallX);
        this._idParamEyeBallY = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamEyeBallY);
        this._idParamBodyAngleX = live2dcubismframework_1.CubismFramework.getIdManager().getId(cubismdefaultparameterid_1.CubismDefaultParameterId.ParamBodyAngleX);
        this._state = LoadStep.LoadAssets;
        this._expressionCount = 0;
        this._textureCount = 0;
        this._motionCount = 0;
        this._allMotionCount = 0;
        this._wavFileHandler = new lappwavfilehandler_1.LAppWavFileHandler();
        this._externalLipSyncValue = 0;
    }

    setExternalLipSyncValue(value) {
        this._externalLipSyncValue = Math.max(0, Math.min(1, Number(value || 0)));
    }

    isCompleteSetup() {
        return this._state === LoadStep.CompleteSetup;
    }
}
exports.LAppModel = LAppModel;
