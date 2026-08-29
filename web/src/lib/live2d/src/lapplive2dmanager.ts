// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 模型集合与交互管理器。
 * @description 管理当前角色模型的创建、销毁、拖拽、点击、更新、投影和角色切换。
 */

import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { ACubismMotion } from '@framework/motion/acubismmotion';
import { csmVector } from '@framework/type/csmvector';

import * as LAppDefine from './lappdefine';
import { LAppModel } from './lappmodel';
import { LAppPal } from './lapppal';
import { LAppSubdelegate } from './lappsubdelegate';
import { ResourceModel } from '../resource';

/**
 * @class
 * @description 管理单个画布中的 Live2D 模型实例及其交互和绘制流程。
 * @example
 * const manager = new LAppLive2DManager();
 */
export class LAppLive2DManager {
  /**
   * @description 释放当前场景持有的全部模型并清空模型向量。
   * @returns {void} 无返回值。
   * @private
   */
  private releaseAllModel(): void {
    for (let index = 0; index < this._models.getSize(); index++) {
      this._models.at(index)?.release();
    }
    this._models.clear();
  }

  /**
   * @description 将视图拖拽坐标传递给当前模型以驱动视线和姿态。
   * @param {number} x 视图坐标系中的横坐标。
   * @param {number} y 视图坐标系中的纵坐标。
   * @returns {void} 无返回值。
   */
  public onDrag(x: number, y: number): void {
    const model: LAppModel = this._models.at(0);
    if (model) {
      model.setDragging(x, y);
    }
  }

  /**
   * @description 处理视图点击并在启用调试时输出点击坐标。
   * @param {number} x 视图坐标系中的横坐标。
   * @param {number} y 视图坐标系中的纵坐标。
   * @returns {void} 无返回值。
   */
  public onTap(x: number, y: number): void {
    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(
        `[APP]tap point: {x: ${x.toFixed(2)} y: ${y.toFixed(2)}}`
      );
    }

    // const model: LAppModel = this._models.at(0);
    // if (!model) return;
    // if (model.hitTest(LAppDefine.HitAreaNameHead, x, y)) {
    //   if (LAppDefine.DebugLogEnable) {
    //     LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameHead}]`);
    //   }
    //   model.setRandomExpression();
    // } else if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
    //   if (LAppDefine.DebugLogEnable) {
    //     LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameBody}]`);
    //   }
    //   model.startRandomMotion(
    //     LAppDefine.MotionGroupTapBody,
    //     LAppDefine.PriorityNormal,
    //     this.finishedMotion,
    //     this.beganMotion
    //   );
    // }
  }

  /**
   * @description 根据画布宽高、视图矩阵和角色取景参数更新并绘制当前模型。
   * @returns {void} 无返回值。
   */
  public onUpdate(): void {
    const { width, height } = this._subdelegate.getCanvas();

    const projection: CubismMatrix44 = new CubismMatrix44();
    const model: LAppModel = this._models.at(0);
    if (!model) return;
    if (model.getModel()) {
      if (model.getModel().getCanvasWidth() > 1.0 && width < height) {
        // 横に長いモデルを縦長ウィンドウに表示する際モデルの横サイズでscaleを算出する
        model.getModelMatrix().setWidth(2.0);
        projection.scale(1.0, width / height);
      } else {
        projection.scale(height / width, 1.0);
      }

      // 必要があればここで乗算
      if (this._viewMatrix != null) {
        projection.multiplyByMatrix(this._viewMatrix);
      }

      const viewTransform = this._character?.viewTransform;
      if (viewTransform) {
        projection.scaleRelative(viewTransform.scale, viewTransform.scale);
        projection.translateRelative(
          viewTransform.offsetX,
          viewTransform.offsetY
        );
      }
    }

    model.update();
    model.draw(projection); // 参照渡しなのでprojectionは変質する。
  }

  /**
   * @description 保留的示例场景切换说明；当前应用通过角色资源直接切换模型。
   */
  // public nextScene(): void {
  //   const no: number = (this._sceneIndex + 1) % LAppDefine.ModelDirSize;
  //   this.changeScene(no);
  // }

  /**
   * @description 保留的示例场景索引切换说明；当前应用未启用该实现。
   * @param {number} index 示例模型目录索引。
   */
  // private changeScene(index: number): void {
  //   this._sceneIndex = index;

  //   if (LAppDefine.DebugLogEnable) {
  //     LAppPal.printMessage(`[APP]model index: ${this._sceneIndex}`);
  //   }

  //   // ModelDir[]に保持したディレクトリ名から
  //   // model3.jsonのパスを決定する。
  //   // ディレクトリ名とmodel3.jsonの名前を一致させておくこと。
  //   const model: string = LAppDefine.ModelDir[index];
  //   const modelPath: string = LAppDefine.ResourcesPath + model + '/';
  //   let modelJsonName: string = LAppDefine.ModelDir[index];
  //   modelJsonName += '.model3.json';

  //   this.releaseAllModel();
  //   const instance = new LAppModel();
  //   instance.setSubdelegate(this._subdelegate);
  //   instance.loadAssets(modelPath, modelJsonName);
  //   this._models.pushBack(instance);
  // }

  /**
   * @description 复制外部视图矩阵，用于后续模型投影计算。
   * @param {CubismMatrix44} m 待复制的四阶视图矩阵。
   * @returns {void} 无返回值。
   */
  public setViewMatrix(m: CubismMatrix44) {
    for (let i = 0; i < 16; i++) {
      this._viewMatrix.getArray()[i] = m.getArray()[i];
    }
  }

  /**
   * @description 保留的示例模型添加说明；当前应用未启用该实现。
   */
  // public addModel(sceneIndex: number = 0): void {
  //   this._sceneIndex = sceneIndex;
  //   this.changeScene(this._sceneIndex);
  // }

  /**
   * @description 创建空模型集合、默认视图矩阵和未绑定的子委托状态。
   * @example
   * const manager = new LAppLive2DManager();
   */
  public constructor() {
    this._subdelegate = null;
    this._viewMatrix = new CubismMatrix44();
    this._models = new csmVector<LAppModel>();
    this._character = null;
    // this._sceneIndex = 0;
  }

  /**
   * @description 释放全部模型并清除当前角色引用。
   * @returns {void} 无返回值。
   */
  public release(): void {
    this.releaseAllModel();
    this._character = null;
  }

  /**
   * @description 绑定所属画布子委托，并按当前角色状态同步模型。
   * @param {LAppSubdelegate} subdelegate 所属画布子委托。
   * @returns {void} 无返回值。
   */
  public initialize(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
    this.changeCharacter(this._character);
  }

  /**
   * @description 释放旧模型，并根据角色入口地址和名称加载新模型。
   * @param {ResourceModel|null} character 新角色资源；传入 `null` 时仅卸载当前模型。
   * @returns {void} 无返回值。
   * @throws {Error} 创建模型时当前环境缺少 Web Audio API 则抛出异常。
   * @example
   * manager.changeCharacter(character);
   */
  public changeCharacter(character: ResourceModel | null) {
    if (character == null) {
      this.releaseAllModel();
      return;
    }
    // 原项目用 node 的 path.dirname 推导目录；移植到浏览器端后改用纯字符串处理，
    // 去掉依赖。character.link 形如 /live2d/characters/Haru/Haru.model3.json。
    const dir = character.link.slice(0, character.link.lastIndexOf('/') + 1);
    const modelJsonName = `${character.name}.model3.json`;
    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(`[APP]model json: ${modelJsonName}`);
    }

    this.releaseAllModel();
    const instance = new LAppModel();
    instance.setSubdelegate(this._subdelegate);
    instance.loadAssets(dir, modelJsonName);
    this._models.pushBack(instance);
    this._character = character;
  }

  /**
   * @description 保存该模型管理器所属的画布子委托。
   * @type {LAppSubdelegate|null}
   * @private
   */
  private _subdelegate: LAppSubdelegate;

  _viewMatrix: CubismMatrix44; // モデル描画に用いるview行列
  _models: csmVector<LAppModel>; // モデルインスタンスのコンテナ
  // private _sceneIndex: number; // 表示するシーンのインデックス値
  private _character: ResourceModel | null;

  /**
   * @description 在模型动作开始时输出调试消息。
   * @param {ACubismMotion} self 已开始播放的动作实例。
   * @returns {void} 无返回值。
   * @type {(self: ACubismMotion) => void}
   */
  beganMotion = (self: ACubismMotion): void => {
    LAppPal.printMessage('Motion Began');
  };
  /**
   * @description 在模型动作结束时输出调试消息。
   * @param {ACubismMotion} self 已结束播放的动作实例。
   * @returns {void} 无返回值。
   * @type {(self: ACubismMotion) => void}
   */
  finishedMotion = (self: ACubismMotion): void => {
    LAppPal.printMessage('Motion Finished');
  };
}
