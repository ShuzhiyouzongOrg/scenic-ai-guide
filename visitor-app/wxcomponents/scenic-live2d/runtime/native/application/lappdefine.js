"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderTargetHeight = exports.RenderTargetWidth = exports.CubismLoggingLevel = exports.DebugTouchLogEnable = exports.DebugLogEnable = exports.PriorityForce = exports.PriorityNormal = exports.PriorityIdle = exports.PriorityNone = exports.HitAreaNameBody = exports.HitAreaNameHead = exports.MotionGroupTapBody = exports.MotionGroupIdle = exports.PowerImageName = exports.GearImageName = exports.BackImageName = exports.ResourcesPath = exports.ViewLogicalMaxTop = exports.ViewLogicalMaxBottom = exports.ViewLogicalMaxRight = exports.ViewLogicalMaxLeft = exports.ViewLogicalTop = exports.ViewLogicalBottom = exports.ViewLogicalRight = exports.ViewLogicalLeft = exports.ViewMinScale = exports.ViewMaxScale = exports.ViewScale = exports.CanvasSize = exports.ModelDirSize = exports.translate1 = exports.scale1 = exports.ModelDir = void 0;
const live2dcubismframework_1 = require("../framework/live2dcubismframework");
//  export const ModelDir: string[] = ['Haru'];// 旧模型
//  export const scale1:number=2;
//  export const translate1:{x:number,y:number}={x:-0.2,y:-1};
exports.ModelDir = ['Haru']; // 新模型
exports.scale1 = 1;
exports.translate1 = { x: -0.0, y: 0 };
exports.ModelDirSize = exports.ModelDir.length;
/**
 * Sample Appで使用する定数
 */
const windowInfo = wx.getWindowInfo();
// Canvas width and height pixel values, or dynamic screen size ('auto').
exports.CanvasSize = {
    width: windowInfo.screenWidth,
    height: windowInfo.screenHeight,
};
// 画面
exports.ViewScale = 1.0;
exports.ViewMaxScale = 2.0;
exports.ViewMinScale = 0.8;
exports.ViewLogicalLeft = -1.0;
exports.ViewLogicalRight = 1.0;
exports.ViewLogicalBottom = -1.0;
exports.ViewLogicalTop = 1.0;
exports.ViewLogicalMaxLeft = -2.0;
exports.ViewLogicalMaxRight = 2.0;
exports.ViewLogicalMaxBottom = -2.0;
exports.ViewLogicalMaxTop = 2.0;
// 相対パス
exports.ResourcesPath = 'https://txcj.oss-cn-beijing.aliyuncs.com/live2d/';
// モデルの後ろにある背景の画像ファイル
exports.BackImageName = '';
// 歯車
exports.GearImageName = 'icon_gear.png';
// 終了ボタン
exports.PowerImageName = 'CloseNormal.png';
// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと
// 外部定義ファイル（json）と合わせる
exports.MotionGroupIdle = 'Idle'; // アイドリング
exports.MotionGroupTapBody = 'TapBody'; // 体をタップしたとき
// 外部定義ファイル（json）と合わせる
exports.HitAreaNameHead = 'Head';
exports.HitAreaNameBody = 'Body';
// モーションの優先度定数
exports.PriorityNone = 0;
exports.PriorityIdle = 1;
exports.PriorityNormal = 2;
exports.PriorityForce = 3;
// デバッグ用ログの表示オプション
exports.DebugLogEnable = false;
exports.DebugTouchLogEnable = false;
// Frameworkから出力するログのレベル設定
exports.CubismLoggingLevel = live2dcubismframework_1.LogLevel.LogLevel_Warning;
// デフォルトのレンダーターゲットサイズ
exports.RenderTargetWidth = 1900;
exports.RenderTargetHeight = 1000;
