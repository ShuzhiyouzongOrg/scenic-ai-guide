// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D 应用适配层常量配置。
 * @description 定义画布、视图边界、模型目录、动作优先级、日志和渲染目标参数。
 */

import { LogLevel } from '@framework/live2dcubismframework';

/**
 * @description 定义画布固定尺寸；值为 `auto` 时跟随宿主容器动态调整。
 * @type {{width: number, height: number}|'auto'}
 * @example
 * const canvasSize = CanvasSize;
 */
export const CanvasSize: { width: number; height: number } | 'auto' = 'auto';

// キャンバスの数
/**
 * @description 定义应用层同时管理的画布数量。
 * @type {number}
 */
export const CanvasNum = 1;

// 画面
/**
 * @description 定义视图初始缩放倍率。
 * @type {number}
 */
export const ViewScale = 1.0;
/**
 * @description 定义视图允许的最大缩放倍率。
 * @type {number}
 */
export const ViewMaxScale = 2.0;
/**
 * @description 定义视图允许的最小缩放倍率。
 * @type {number}
 */
export const ViewMinScale = 0.8;

/**
 * @description 定义初始视图逻辑坐标的左边界。
 * @type {number}
 */
export const ViewLogicalLeft = -1.0;
/**
 * @description 定义初始视图逻辑坐标的右边界。
 * @type {number}
 */
export const ViewLogicalRight = 1.0;
/**
 * @description 定义初始视图逻辑坐标的下边界。
 * @type {number}
 */
export const ViewLogicalBottom = -1.0;
/**
 * @description 定义初始视图逻辑坐标的上边界。
 * @type {number}
 */
export const ViewLogicalTop = 1.0;

/**
 * @description 定义视图可移动范围的最左逻辑坐标。
 * @type {number}
 */
export const ViewLogicalMaxLeft = -2.0;
/**
 * @description 定义视图可移动范围的最右逻辑坐标。
 * @type {number}
 */
export const ViewLogicalMaxRight = 2.0;
/**
 * @description 定义视图可移动范围的最下逻辑坐标。
 * @type {number}
 */
export const ViewLogicalMaxBottom = -2.0;
/**
 * @description 定义视图可移动范围的最上逻辑坐标。
 * @type {number}
 */
export const ViewLogicalMaxTop = 2.0;

// 相対パス
// export const ResourcesPath = '/sentio/characters/';

// モデルの後ろにある背景の画像ファイル
// export const BackImageName = 'back_class_normal.png';

// 歯車
// export const GearImageName = 'icon_gear.png';

// 終了ボタン
// export const PowerImageName = 'CloseNormal.png';

// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと
/**
 * @description 列出应用适配层可按目录名加载的 Live2D 示例模型。
 * @type {string[]}
 * @example
 * const firstModelDirectory = ModelDir[0];
 */
export const ModelDir: string[] = [
  'Haru',
  'Hiyori',
  'Mark',
  'Natori',
  'Rice',
  'Mao',
  'Wanko'
];
/**
 * @description 表示模型目录清单中的模型数量。
 * @type {number}
 */
export const ModelDirSize: number = ModelDir.length;

// 外部定義ファイル（json）と合わせる
/**
 * @description 定义模型配置中空闲动作组的名称。
 * @type {string}
 */
export const MotionGroupIdle = 'Idle'; // アイドリング
/**
 * @description 定义点击模型身体时使用的动作组名称。
 * @type {string}
 */
export const MotionGroupTapBody = 'TapBody'; // 体をタップしたとき

// 外部定義ファイル（json）と合わせる
/**
 * @description 定义模型头部命中区域名称。
 * @type {string}
 */
export const HitAreaNameHead = 'Head';
/**
 * @description 定义模型身体命中区域名称。
 * @type {string}
 */
export const HitAreaNameBody = 'Body';

// モーションの優先度定数
/**
 * @description 表示没有动作优先级请求。
 * @type {number}
 */
export const PriorityNone = 0;
/**
 * @description 表示空闲动作的播放优先级。
 * @type {number}
 */
export const PriorityIdle = 1;
/**
 * @description 表示普通交互动作的播放优先级。
 * @type {number}
 */
export const PriorityNormal = 2;
/**
 * @description 表示强制替换当前动作的最高优先级。
 * @type {number}
 */
export const PriorityForce = 3;

// MOC3の一貫性検証オプション
/**
 * @description 控制模型加载时是否执行 MOC3 一致性校验。
 * @type {boolean}
 */
export const MOCConsistencyValidationEnable = true;

// デバッグ用ログの表示オプション
/**
 * @description 控制是否输出 Live2D 应用调试日志。
 * @type {boolean}
 */
export const DebugLogEnable = false;
/**
 * @description 控制是否输出触摸坐标调试日志。
 * @type {boolean}
 */
export const DebugTouchLogEnable = false;

// Frameworkから出力するログのレベル設定
/**
 * @description 定义 Cubism Framework 输出日志时使用的级别。
 * @type {LogLevel}
 */
export const CubismLoggingLevel: LogLevel = LogLevel.LogLevel_Verbose;

// デフォルトのレンダーターゲットサイズ
/**
 * @description 定义默认渲染目标宽度，单位为像素。
 * @type {number}
 */
export const RenderTargetWidth = 1900;
/**
 * @description 定义默认渲染目标高度，单位为像素。
 * @type {number}
 */
export const RenderTargetHeight = 1000;
