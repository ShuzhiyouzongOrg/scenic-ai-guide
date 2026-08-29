// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 模型加载、更新与绘制实现。
 * @description 负责解析模型资源、组装 Cubism 组件、驱动动作与口型并提交 WebGL 绘制。
 */

import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import {
  BreathParameterData,
  CubismBreath
} from '@framework/effect/cubismbreath';
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismIdHandle } from '@framework/id/cubismid';
import { CubismFramework } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import {
  ACubismMotion,
  BeganMotionCallback,
  FinishedMotionCallback
} from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue
} from '@framework/motion/cubismmotionqueuemanager';
import { csmMap } from '@framework/type/csmmap';
import { csmRect } from '@framework/type/csmrectf';
import { csmString } from '@framework/type/csmstring';
import { csmVector } from '@framework/type/csmvector';
import {
  CSM_ASSERT,
  CubismLogError,
  CubismLogInfo
} from '@framework/utils/cubismdebug';

import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { TextureInfo } from './lapptexturemanager';
import { LAppWavFileHandler } from './lappwavfilehandler';
import { CubismMoc } from '@framework/model/cubismmoc';
import { Live2dManager } from '../live2dManager';
import { LAppSubdelegate } from './lappsubdelegate';
import {
  createMotionSyncModelSetting,
  createOfficialMotionSync,
  getMotionSyncFileName,
  isOfficialMotionSyncInitialized,
  type MotionSyncInstance
} from '../motionSyncRuntime';

enum LoadStep {
  LoadAssets,
  LoadModel,
  WaitLoadModel,
  LoadExpression,
  WaitLoadExpression,
  LoadPhysics,
  WaitLoadPhysics,
  LoadPose,
  WaitLoadPose,
  SetupEyeBlink,
  SetupBreath,
  LoadUserData,
  WaitLoadUserData,
  SetupEyeBlinkIds,
  SetupLipSyncIds,
  SetupLayout,
  LoadMotionSync,
  WaitLoadMotionSync,
  LoadMotion,
  WaitLoadMotion,
  CompleteInitialize,
  CompleteSetupModel,
  LoadTexture,
  WaitLoadTexture,
  CompleteSetup
}

/**
 * @class
 * @description 实现应用实际使用的 Live2D 模型加载、组件初始化、帧更新和渲染流程。
 * @example
 * const model = new LAppModel();
 * model.setSubdelegate(subdelegate);
 */
export class LAppModel extends CubismUserModel {
  /**
   * @description 从模型目录和入口文件异步加载 model3 配置，并启动模型组装流程。
   * @param {string} dir 模型资源目录地址，末尾应包含路径分隔符。
   * @param {string} fileName model3 配置文件名。
   * @returns {void} 无返回值。
   * @example
   * model.loadAssets('/live2d/characters/Haru/', 'Haru.model3.json');
   */
  public loadAssets(dir: string, fileName: string): void {
    this._released = false;
    this._modelHomeDir = dir;
    this._live2dManager.beginModelLoad(this);
    fetch(`${this._modelHomeDir}${fileName}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Live2D model manifest request failed (${response.status}): ${fileName}`
          );
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        if (!this._live2dManager.isModelLoadCurrent(this)) {
          return;
        }
        const setting = createMotionSyncModelSetting(
          arrayBuffer,
          arrayBuffer.byteLength
        );

        // ステートを更新
        this._state = LoadStep.LoadModel;

        // 結果を保存
        this.setupModel(setting);
      })
      .catch(error => {
        // model3.json読み込みでエラーが発生した時点で描画は不可能なので、setupせずエラーをcatchして何もしない
        const message =
          error instanceof Error
            ? error.message
            : `Failed to load Live2D model manifest: ${fileName}`;
        this._live2dManager.setModelLoadError(message, this);
        CubismLogError(`Failed to load file ${this._modelHomeDir}${fileName}`);
      });
  }

  /**
   * @description 按 model3 设置依次加载模型、表情、物理、姿态、动作、纹理和 MotionSync 组件。
   * @param {ICubismModelSetting} setting 已解析的 Cubism 模型设置。
   * @returns {void} 无返回值。
   * @private
   */
  private setupModel(setting: ICubismModelSetting): void {
    this._updating = true;
    this._initialized = false;

    this._modelSetting = setting;

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      fetch(`${this._modelHomeDir}${modelFileName}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(
              `Live2D model request failed (${response.status}): ${modelFileName}`
            );
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          if (!this._live2dManager.isModelLoadCurrent(this)) return;
          if (!arrayBuffer.byteLength) {
            throw new Error(`Live2D model is empty: ${modelFileName}`);
          }
          this.loadModel(arrayBuffer, this._mocConsistency);
          this._state = LoadStep.LoadExpression;

          // callback
          loadCubismExpression();
        })
        .catch(error => {
          const message =
            error instanceof Error
              ? error.message
              : `Failed to load Live2D model: ${modelFileName}`;
          this._live2dManager.setModelLoadError(message, this);
          CubismLogError(`Failed to load file ${this._modelHomeDir}${modelFileName}`);
        });

      this._state = LoadStep.WaitLoadModel;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }

    // Expression
    const loadCubismExpression = (): void => {
      if (this._modelSetting.getExpressionCount() > 0) {
        const count: number = this._modelSetting.getExpressionCount();

        for (let i = 0; i < count; i++) {
          const expressionName = this._modelSetting.getExpressionName(i);
          const expressionFileName =
            this._modelSetting.getExpressionFileName(i);

          fetch(`${this._modelHomeDir}${expressionFileName}`)
            .then(response => {
              if (response.ok) {
                return response.arrayBuffer();
              } else if (response.status >= 400) {
                CubismLogError(
                  `Failed to load file ${this._modelHomeDir}${expressionFileName}`
                );
                // ファイルが存在しなくてもresponseはnullを返却しないため、空のArrayBufferで対応する
                return new ArrayBuffer(0);
              }
            })
            .then(arrayBuffer => {
              if (!this.isLoadActive()) return;
              const motion: ACubismMotion = this.loadExpression(
                arrayBuffer,
                arrayBuffer.byteLength,
                expressionName
              );

              if (this._expressions.getValue(expressionName) != null) {
                ACubismMotion.delete(
                  this._expressions.getValue(expressionName)
                );
                this._expressions.setValue(expressionName, null);
              }

              this._expressions.setValue(expressionName, motion);

              this._expressionCount++;

              if (this._expressionCount >= count) {
                this._state = LoadStep.LoadPhysics;

                // callback
                loadCubismPhysics();
              }
            });
        }
        this._state = LoadStep.WaitLoadExpression;
      } else {
        this._state = LoadStep.LoadPhysics;

        // callback
        loadCubismPhysics();
      }
    };

    // Physics
    const loadCubismPhysics = (): void => {
      if (this._modelSetting.getPhysicsFileName() != '') {
        const physicsFileName = this._modelSetting.getPhysicsFileName();

        fetch(`${this._modelHomeDir}${physicsFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${physicsFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            if (!this.isLoadActive()) return;
            this.loadPhysics(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.LoadPose;

            // callback
            loadCubismPose();
          });
        this._state = LoadStep.WaitLoadPhysics;
      } else {
        this._state = LoadStep.LoadPose;

        // callback
        loadCubismPose();
      }
    };

    // Pose
    const loadCubismPose = (): void => {
      if (this._modelSetting.getPoseFileName() != '') {
        const poseFileName = this._modelSetting.getPoseFileName();

        fetch(`${this._modelHomeDir}${poseFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${poseFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            if (!this.isLoadActive()) return;
            this.loadPose(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlink;

            // callback
            setupEyeBlink();
          });
        this._state = LoadStep.WaitLoadPose;
      } else {
        this._state = LoadStep.SetupEyeBlink;

        // callback
        setupEyeBlink();
      }
    };

    // EyeBlink
    const setupEyeBlink = (): void => {
      if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
        this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
        this._state = LoadStep.SetupBreath;
      }

      // callback
      setupBreath();
    };

    // Breath
    const setupBreath = (): void => {
      this._breath = CubismBreath.create();

      const breathParameters: csmVector<BreathParameterData> = new csmVector();
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(
          CubismFramework.getIdManager().getId(
            CubismDefaultParameterId.ParamBreath
          ),
          0.5,
          0.5,
          3.2345,
          1
        )
      );

      this._breath.setParameters(breathParameters);
      this._state = LoadStep.LoadUserData;

      // callback
      loadUserData();
    };

    // UserData
    const loadUserData = (): void => {
      if (this._modelSetting.getUserDataFile() != '') {
        const userDataFile = this._modelSetting.getUserDataFile();

        fetch(`${this._modelHomeDir}${userDataFile}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${userDataFile}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            if (!this.isLoadActive()) return;
            this.loadUserData(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlinkIds;

            // callback
            setupEyeBlinkIds();
          });

        this._state = LoadStep.WaitLoadUserData;
      } else {
        this._state = LoadStep.SetupEyeBlinkIds;

        // callback
        setupEyeBlinkIds();
      }
    };

    // EyeBlinkIds
    const setupEyeBlinkIds = (): void => {
      const eyeBlinkIdCount: number =
        this._modelSetting.getEyeBlinkParameterCount();

      for (let i = 0; i < eyeBlinkIdCount; ++i) {
        this._eyeBlinkIds.pushBack(
          this._modelSetting.getEyeBlinkParameterId(i)
        );
      }

      this._state = LoadStep.SetupLipSyncIds;

      // callback
      setupLipSyncIds();
    };

    // LipSyncIds
    const setupLipSyncIds = (): void => {
      const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();

      for (let i = 0; i < lipSyncIdCount; ++i) {
        this._lipSyncIds.pushBack(this._modelSetting.getLipSyncParameterId(i));
      }
      this._state = LoadStep.SetupLayout;

      // callback
      setupLayout();
    };

    // Layout
    const setupLayout = (): void => {
      const layout: csmMap<string, number> = new csmMap<string, number>();

      if (this._modelSetting == null || this._modelMatrix == null) {
        CubismLogError('Failed to setupLayout().');
        return;
      }

      this._modelSetting.getLayoutMap(layout);
      this._modelMatrix.setupFromLayout(layout);
      this._state = LoadStep.LoadMotionSync;

      // callback
      loadCubismMotionSync();
    };

    // Official CRI phoneme recognition. Failure is non-fatal because the
    // existing audio-feature analyzer remains available during rendering.
    const loadCubismMotionSync = (): void => {
      const motionSyncFileName = getMotionSyncFileName(this._modelSetting);
      if (!motionSyncFileName || !isOfficialMotionSyncInitialized()) {
        loadCubismMotion();
        return;
      }

      this._state = LoadStep.WaitLoadMotionSync;
      fetch(`${this._modelHomeDir}${motionSyncFileName}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(
              `MotionSync profile request failed (${response.status}): ${motionSyncFileName}`
            );
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          if (!this._live2dManager.isModelLoadCurrent(this)) return;
          this._motionSync = createOfficialMotionSync(
            this._model,
            arrayBuffer,
            arrayBuffer.byteLength,
            this._live2dManager.getAudioSampleRate()
          );
          if (!this._motionSync) {
            throw new Error(`MotionSync could not initialize: ${motionSyncFileName}`);
          }
          this._motionSyncBuffer.clear();
        })
        .catch(error => {
          this.releaseMotionSync();
          CubismLogError(
            error instanceof Error ? error.message : 'MotionSync profile failed to load.'
          );
        })
        .finally(() => {
          if (this._live2dManager.isModelLoadCurrent(this)) loadCubismMotion();
        });
    };

    // Motion
    const loadCubismMotion = (): void => {
      this._state = LoadStep.WaitLoadMotion;
      this._model.saveParameters();
      this._allMotionCount = 0;
      this._motionCount = 0;
      const group: string[] = [];

      const motionGroupCount: number = this._modelSetting.getMotionGroupCount();

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
        this.getRenderer().startUp(this._subdelegate.getGlManager().getGl());
      }
    };
  }

  /**
   * @description 加载模型纹理并绑定到 Cubism WebGL 渲染器的纹理单元。
   * @returns {void} 无返回值。
   * @private
   */
  private setupTextures(): void {
    // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用
    const usePremultiply = true;

    if (this._state == LoadStep.LoadTexture) {
      // テクスチャ読み込み用
      const textureCount: number = this._modelSetting.getTextureCount();
      let loadableTextureCount = 0;

      for (let index = 0; index < textureCount; index++) {
        if (this._modelSetting.getTextureFileName(index) != '') {
          loadableTextureCount++;
        }
      }

      for (
        let modelTextureNumber = 0;
        modelTextureNumber < textureCount;
        modelTextureNumber++
      ) {
        // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
        if (this._modelSetting.getTextureFileName(modelTextureNumber) == '') {
          continue;
        }

        // WebGLのテクスチャユニットにテクスチャをロードする
        let texturePath =
          this._modelSetting.getTextureFileName(modelTextureNumber);
        texturePath = this._modelHomeDir + texturePath;

        // ロード完了時に呼び出すコールバック関数
        const onLoad = (textureInfo: TextureInfo): void => {
          if (!this._live2dManager.isModelLoadCurrent(this)) {
            return;
          }
          this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);

          this._textureCount++;

          if (this._textureCount >= loadableTextureCount) {
            // ロード完了
            this._state = LoadStep.CompleteSetup;
            this._live2dManager.setReady(true, this);
          }
        };

        // 読み込み
        this._subdelegate
          .getTextureManager()
          .createTextureFromPngFile(
            texturePath,
            usePremultiply,
            onLoad,
            error => this._live2dManager.setModelLoadError(error.message, this)
          );
        this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      }

      if (loadableTextureCount === 0) {
        this._state = LoadStep.CompleteSetup;
        this._live2dManager.setReady(true, this);
      } else {
        this._state = LoadStep.WaitLoadTexture;
      }
    }
  }

  /**
   * @description 删除并重新创建 Cubism 渲染器，然后重新绑定全部纹理。
   * @returns {void} 无返回值。
   */
  public reloadRenderer(): void {
    this.deleteRenderer();
    this.createRenderer();
    this.setupTextures();
  }

  /**
   * @description 按帧更新动作、表情、拖拽、呼吸、物理、姿态和音频口型参数。
   * @returns {void} 无返回值。
   */
  public update(): void {
    if (this._state != LoadStep.CompleteSetup) return;

    const deltaTimeSeconds: number = LAppPal.getDeltaTime();
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
      this.startRandomMotion(
        LAppDefine.MotionGroupIdle,
        LAppDefine.PriorityIdle
      );
    } else {
      motionUpdated = this._motionManager.updateMotion(
        this._model,
        deltaTimeSeconds
      ); // モーションを更新
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
    this._model.addParameterValueById(
      this._idParamAngleZ,
      this._dragX * this._dragY * -30
    );

    // ドラッグによる体の向きの調整
    this._model.addParameterValueById(
      this._idParamBodyAngleX,
      this._dragX * 10
    ); // -10から10の値を加える

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

    // ポーズの設定
    if (this._pose != null) {
      this._pose.updateParameters(this._model, deltaTimeSeconds);
    }

    // Lip sync is applied after motion/expression/breath/physics/pose and before
    // model.update(), matching the official MotionSync sample update order.
    if (this._lipsync) {
      const manager = this._live2dManager;
      manager.playAudio();
      if (!this.updateOfficialMotionSync(deltaTimeSeconds)) {
        const lipSyncFrame = manager.getLipSyncFrame(deltaTimeSeconds);
        const mouthOpen = lipSyncFrame.mouthOpen * manager.getLipFactor();
        const influence = manager.isAudioPlaying() || mouthOpen > 0.005 ? 0.9 : 0;
        if (influence > 0) {
          for (let i = 0; i < this._lipSyncIds.getSize(); ++i) {
            this._model.setParameterValueById(
              this._lipSyncIds.at(i),
              mouthOpen,
              influence
            );
          }

          this._model.setParameterValueById(
            this._idParamMouthForm,
            lipSyncFrame.mouthForm,
            influence * 0.68
          );
          this._model.setParameterValueById(this._idParamVowelA, lipSyncFrame.vowels.a, influence * 0.82);
          this._model.setParameterValueById(this._idParamVowelI, lipSyncFrame.vowels.i, influence * 0.82);
          this._model.setParameterValueById(this._idParamVowelU, lipSyncFrame.vowels.u, influence * 0.82);
          this._model.setParameterValueById(this._idParamVowelE, lipSyncFrame.vowels.e, influence * 0.82);
          this._model.setParameterValueById(this._idParamVowelO, lipSyncFrame.vowels.o, influence * 0.82);
        }
      }
    }

    this._model.update();
  }

  /**
   * @description 将已播放 PCM 提交给官方 MotionSync，并把分析结果应用到模型参数。
   * @param {number} deltaTimeSeconds 与上一帧的时间间隔，单位为秒。
   * @returns {boolean} 官方 MotionSync 成功处理本帧时返回 `true`。
   * @private
   */
  private updateOfficialMotionSync(deltaTimeSeconds: number): boolean {
    if (
      !this._motionSync ||
      !this._live2dManager.isAudioPlaying() ||
      !this._live2dManager.isAudioReady()
    ) {
      return false;
    }

    try {
      const playbackToken = this._live2dManager.getPlaybackToken();
      if (playbackToken !== this._motionSyncPlaybackToken) {
        this._motionSyncBuffer.clear();
        this._motionSyncPlaybackToken = playbackToken;
      }
      const pcm = this._live2dManager.readMotionSyncPcm();
      for (let index = 0; index < pcm.length; index++) {
        this._motionSyncBuffer.pushBack(pcm[index]);
      }
      this._motionSync.setSoundBuffer(0, this._motionSyncBuffer, 0);
      this._motionSync.updateParameters(this._model, deltaTimeSeconds);

      const processed = Math.min(
        this._motionSync.getLastTotalProcessedCount(0),
        this._motionSyncBuffer.getSize()
      );
      if (processed > 0) {
        this._motionSyncBuffer._ptr.splice(0, processed);
        this._motionSyncBuffer._size -= processed;
      }
      return true;
    } catch (error) {
      CubismLogError(
        error instanceof Error ? error.message : 'MotionSync processing failed.'
      );
      this.releaseMotionSync();
      return false;
    }
  }

  /**
   * @description 释放当前模型的 MotionSync 实例并清空待处理 PCM。
   * @returns {void} 无返回值。
   * @private
   */
  private releaseMotionSync(): void {
    this._motionSync?.release();
    this._motionSync = null;
    this._motionSyncBuffer.clear();
  }

  /**
   * @description 按组名、索引和优先级加载并开始播放指定模型动作。
   * @param {string} group 动作组名称。
   * @param {number} no 动作在组内的索引。
   * @param {number} priority 动作播放优先级。
   * @param {FinishedMotionCallback} [onFinishedMotionHandler] 动作播放结束回调。
   * @param {BeganMotionCallback} [onBeganMotionHandler] 动作开始播放回调。
   * @returns {CubismMotionQueueEntryHandle} 动作队列句柄；无法开始时返回无效句柄。
   * @example
   * model.startMotion('Idle', 0, PriorityNormal);
   */
  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (priority == LAppDefine.PriorityForce) {
      this._motionManager.setReservePriority(priority);
    } else if (!this._motionManager.reserveMotion(priority)) {
      if (this._debugMode) {
        LAppPal.printMessage("[APP]can't start motion.");
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const motionFileName = this._modelSetting.getMotionFileName(group, no);

    // ex) idle_0
    const name = `${group}_${no}`;
    let motion: CubismMotion = this._motions.getValue(name) as CubismMotion;
    let autoDelete = false;

    if (motion == null) {
      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          if (!this.isLoadActive()) return;
          motion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            null,
            onFinishedMotionHandler,
            onBeganMotionHandler,
            this._modelSetting,
            group,
            no
          );

          if (motion == null) {
            return;
          }

          motion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);
          autoDelete = true; // 終了時にメモリから削除
        });
    } else {
      motion.setBeganMotionHandler(onBeganMotionHandler);
      motion.setFinishedMotionHandler(onFinishedMotionHandler);
    }

    //voice
    // const voice = this._modelSetting.getMotionSoundFileName(group, no);
    // if (voice.localeCompare('') != 0) {
    //   let path = voice;
    //   path = this._modelHomeDir + path;
    //   this._wavFileHandler.start(path);
    // }

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]start motion: [${group}_${no}`);
    }
    return this._motionManager.startMotionPriority(
      motion,
      autoDelete,
      priority
    );
  }

  /**
   * @description 从指定动作组中随机选择一个动作并开始播放。
   * @param {string} group 动作组名称。
   * @param {number} priority 动作播放优先级。
   * @param {FinishedMotionCallback} [onFinishedMotionHandler] 动作播放结束回调。
   * @param {BeganMotionCallback} [onBeganMotionHandler] 动作开始播放回调。
   * @returns {CubismMotionQueueEntryHandle} 动作队列句柄；组内无动作时返回无效句柄。
   * @example
   * model.startRandomMotion('Idle', PriorityIdle);
   */
  public startRandomMotion(
    group: string,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (this._modelSetting.getMotionCount(group) == 0) {
      return InvalidMotionQueueEntryHandleValue;
    }

    const no: number = Math.floor(
      Math.random() * this._modelSetting.getMotionCount(group)
    );

    return this.startMotion(
      group,
      no,
      priority,
      onFinishedMotionHandler,
      onBeganMotionHandler
    );
  }

  /**
   * @description 设置并播放指定标识的表情动作。
   * @param {string} expressionId 表情动作标识。
   * @returns {void} 无返回值。
   */
  public setExpression(expressionId: string): void {
    const motion: ACubismMotion = this._expressions.getValue(expressionId);

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
    }

    if (motion != null) {
      this._expressionManager.startMotion(motion, false);
    } else {
      if (this._debugMode) {
        LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
      }
    }
  }

  /**
   * @description 从已加载的表情集合中随机选择并播放一个表情。
   * @returns {void} 无返回值。
   */
  public setRandomExpression(): void {
    if (this._expressions.getSize() == 0) {
      return;
    }

    const no: number = Math.floor(Math.random() * this._expressions.getSize());

    for (let i = 0; i < this._expressions.getSize(); i++) {
      if (i == no) {
        const name: string = this._expressions._keyValues[i].first;
        this.setExpression(name);
        return;
      }
    }
  }

  /**
   * @description 接收动作时间线事件并写入 Cubism 调试日志。
   * @param {csmString} eventValue 动作事件值。
   * @returns {void} 无返回值。
   */
  public motionEventFired(eventValue: csmString): void {
    CubismLogInfo('{0} is fired on LAppModel!!', eventValue.s);
  }

  /**
   * @description 根据指定命中区域的顶点边界判断模型坐标是否落在区域内。
   * @param {string} hitArenaName 待检测的命中区域名称。
   * @param {number} x 待检测的模型横坐标。
   * @param {number} y 待检测的模型纵坐标。
   * @returns {boolean} 模型不透明且坐标命中指定区域时返回 `true`。
   */
  public hitTest(hitArenaName: string, x: number, y: number): boolean {
    // 透明時は当たり判定無し。
    if (this._opacity < 1) {
      return false;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
        const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
        return this.isHit(drawId, x, y);
      }
    }

    return false;
  }

  /**
   * @description 按动作组批量预加载模型设置中声明的全部动作数据。
   * @param {string} group 待预加载的动作组名称。
   * @returns {void} 无返回值。
   */
  public preLoadMotionGroup(group: string): void {
    for (let i = 0; i < this._modelSetting.getMotionCount(group); i++) {
      const motionFileName = this._modelSetting.getMotionFileName(group, i);

      // ex) idle_0
      const name = `${group}_${i}`;
      if (this._debugMode) {
        LAppPal.printMessage(
          `[APP]load motion: ${motionFileName} => [${name}]`
        );
      }

      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          if (!this.isLoadActive()) return;
          const tmpMotion: CubismMotion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            name,
            null,
            null,
            this._modelSetting,
            group,
            i
          );

          if (tmpMotion != null) {
            tmpMotion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);

            if (this._motions.getValue(name) != null) {
              ACubismMotion.delete(this._motions.getValue(name));
            }

            this._motions.setValue(name, tmpMotion);

            this._motionCount++;
            if (this._motionCount >= this._allMotionCount) {
              this._state = LoadStep.LoadTexture;

              // 全てのモーションを停止する
              this._motionManager.stopAllMotions();

              this._updating = false;
              this._initialized = true;

              this.createRenderer();
              this.setupTextures();
              this.getRenderer().startUp(
                this._subdelegate.getGlManager().getGl()
              );
            }
          } else {
            // loadMotionできなかった場合はモーションの総数がずれるので1つ減らす
            this._allMotionCount--;
          }
        });
    }
  }

  /**
   * @description 清空全部已加载的模型动作数据。
   * @returns {void} 无返回值。
   */
  public releaseMotions(): void {
    this._motions.clear();
  }

  /**
   * @description 清空全部已加载的表情动作数据。
   * @returns {void} 无返回值。
   */
  public releaseExpressions(): void {
    this._expressions.clear();
  }

  /**
   * @description 根据所属画布设置渲染状态并绘制当前 Cubism 模型。
   * @returns {void} 无返回值。
   */
  public doDraw(): void {
    if (this._model == null) return;

    // キャンバスサイズを渡す
    const canvas = this._subdelegate.getCanvas();
    const viewport: number[] = [0, 0, canvas.width, canvas.height];

    this.getRenderer().setRenderState(
      this._subdelegate.getFrameBuffer(),
      viewport
    );
    this.getRenderer().drawModel();
  }

  /**
   * @description 将模型矩阵合入视图投影矩阵，并在模型完成加载后提交绘制。
   * @param {CubismMatrix44} matrix 当前视图投影矩阵；调用后会被原地更新。
   * @returns {void} 无返回值。
   */
  public draw(matrix: CubismMatrix44): void {
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
   * @description 重新读取 MOC3 文件并执行 Cubism 一致性校验。
   * @returns {Promise<boolean|undefined>} 校验结果；模型文件未配置时返回 `undefined`。
   * @throws {Error} 模型请求、二进制读取或底层一致性校验失败时以 Promise 拒绝。
   * @example
   * const consistent = await model.hasMocConsistencyFromFile();
   */
  public async hasMocConsistencyFromFile() {
    CSM_ASSERT(this._modelSetting.getModelFileName().localeCompare(``));

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      const response = await fetch(`${this._modelHomeDir}${modelFileName}`);
      const arrayBuffer = await response.arrayBuffer();
      if (!this.isLoadActive()) return false;

      this._consistency = CubismMoc.hasMocConsistency(arrayBuffer);

      if (!this._consistency) {
        CubismLogInfo('Inconsistent MOC3.');
      } else {
        CubismLogInfo('Consistent MOC3.');
      }

      return this._consistency;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }
  }

  /**
   * @description 绑定负责提供画布、WebGL 和纹理管理器的子委托。
   * @param {LAppSubdelegate} subdelegate 当前模型所属的画布子委托。
   * @returns {void} 无返回值。
   */
  public setSubdelegate(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
  }

  /**
   * @description 标记模型加载任务失效，释放 MotionSync 并调用基类释放模型资源。
   * @returns {void} 无返回值。
   */
  public release(): void {
    this._released = true;
    this.releaseMotionSync();
    super.release();
  }

  /**
   * @description 判断当前模型尚未释放且仍是最新加载请求的所有者。
   * @returns {boolean} 异步加载结果仍可应用时返回 `true`。
   * @private
   */
  private isLoadActive(): boolean {
    return !this._released && this._live2dManager.isModelLoadCurrent(this);
  }

  /**
   * @description 初始化模型状态、动作集合、参数标识和音频口型同步依赖。
   * @throws {Error} 当前环境缺少 Web Audio API 且首次创建 Live2D 管理器时抛出异常。
   * @example
   * const model = new LAppModel();
   */
  public constructor() {
    super();

    this._live2dManager = Live2dManager.getInstance();
    this._motionSync = null;
    this._motionSyncBuffer = new csmVector<number>();
    this._motionSyncPlaybackToken = -1;

    this._modelSetting = null;
    this._modelHomeDir = null;
    this._userTimeSeconds = 0.0;

    this._eyeBlinkIds = new csmVector<CubismIdHandle>();
    this._lipSyncIds = new csmVector<CubismIdHandle>();

    this._motions = new csmMap<string, ACubismMotion>();
    this._expressions = new csmMap<string, ACubismMotion>();

    this._hitArea = new csmVector<csmRect>();
    this._userArea = new csmVector<csmRect>();

    this._idParamAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleX
    );
    this._idParamAngleY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleY
    );
    this._idParamAngleZ = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleZ
    );
    this._idParamEyeBallX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeBallX
    );
    this._idParamEyeBallY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeBallY
    );
    this._idParamBodyAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBodyAngleX
    );
    this._idParamMouthForm = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamMouthForm
    );
    this._idParamVowelA = CubismFramework.getIdManager().getId('ParamA');
    this._idParamVowelI = CubismFramework.getIdManager().getId('ParamI');
    this._idParamVowelU = CubismFramework.getIdManager().getId('ParamU');
    this._idParamVowelE = CubismFramework.getIdManager().getId('ParamE');
    this._idParamVowelO = CubismFramework.getIdManager().getId('ParamO');

    if (LAppDefine.MOCConsistencyValidationEnable) {
      this._mocConsistency = true;
    }

    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._wavFileHandler = new LAppWavFileHandler();
    this._consistency = false;
    this._released = false;
  }

  private _subdelegate: LAppSubdelegate;
  private _live2dManager: Live2dManager;
  private _motionSync: MotionSyncInstance;
  private _motionSyncBuffer: csmVector<number>;
  private _motionSyncPlaybackToken: number;

  _modelSetting: ICubismModelSetting; // モデルセッティング情報
  _modelHomeDir: string; // モデルセッティングが置かれたディレクトリ
  _userTimeSeconds: number; // デルタ時間の積算値[秒]

  _eyeBlinkIds: csmVector<CubismIdHandle>; // モデルに設定された瞬き機能用パラメータID
  _lipSyncIds: csmVector<CubismIdHandle>; // モデルに設定されたリップシンク機能用パラメータID

  _motions: csmMap<string, ACubismMotion>; // 読み込まれているモーションのリスト
  _expressions: csmMap<string, ACubismMotion>; // 読み込まれている表情のリスト

  _hitArea: csmVector<csmRect>;
  _userArea: csmVector<csmRect>;

  _idParamAngleX: CubismIdHandle; // パラメータID: ParamAngleX
  _idParamAngleY: CubismIdHandle; // パラメータID: ParamAngleY
  _idParamAngleZ: CubismIdHandle; // パラメータID: ParamAngleZ
  _idParamEyeBallX: CubismIdHandle; // パラメータID: ParamEyeBallX
  _idParamEyeBallY: CubismIdHandle; // パラメータID: ParamEyeBAllY
  _idParamBodyAngleX: CubismIdHandle; // パラメータID: ParamBodyAngleX
  _idParamMouthForm: CubismIdHandle;
  _idParamVowelA: CubismIdHandle;
  _idParamVowelI: CubismIdHandle;
  _idParamVowelU: CubismIdHandle;
  _idParamVowelE: CubismIdHandle;
  _idParamVowelO: CubismIdHandle;

  _state: LoadStep; // 現在のステータス管理用
  _expressionCount: number; // 表情データカウント
  _textureCount: number; // テクスチャカウント
  _motionCount: number; // モーションデータカウント
  _allMotionCount: number; // モーション総数
  _wavFileHandler: LAppWavFileHandler; //wavファイルハンドラ
  _consistency: boolean; // MOC3一貫性チェック管理用
  private _released: boolean;
}
