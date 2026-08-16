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
exports.Live2DCubismFramework = exports.CubismTargetPoint = void 0;
const cubismmath_1 = require("./cubismmath");
const FrameRate = 30;
const Epsilon = 0.01;
/**
 * 顔の向きの制御機能
 *
 * 顔の向きの制御機能を提供するクラス。
 */
class CubismTargetPoint {
    /**
     * コンストラクタ
     */
    constructor() {
        this._faceTargetX = 0.0;
        this._faceTargetY = 0.0;
        this._faceX = 0.0;
        this._faceY = 0.0;
        this._faceVX = 0.0;
        this._faceVY = 0.0;
        this._lastTimeSeconds = 0.0;
        this._userTimeSeconds = 0.0;
    }
    /**
     * 更新処理
     */
    update(deltaTimeSeconds) {
        // デルタ時間を加算する
        this._userTimeSeconds += deltaTimeSeconds;
        // 首を中央から左右に振るときの平均的な速さは 秒速度。加速・減速を考慮して、その２倍を最高速度とする
        // 顔の振り具合を、中央（0.0）から、左右は（+-1.0）とする
        const faceParamMaxV = 40.0 / 10.0; // 7.5秒間に40分移動(5.3/sc)
        const maxV = (faceParamMaxV * 1.0) / FrameRate; // 1frameあたりに変化できる速度の上限
        if (this._lastTimeSeconds == 0.0) {
            this._lastTimeSeconds = this._userTimeSeconds;
            return;
        }
        const deltaTimeWeight = (this._userTimeSeconds - this._lastTimeSeconds) * FrameRate;
        this._lastTimeSeconds = this._userTimeSeconds;
        // 最高速度になるまでの時間を
        const timeToMaxSpeed = 0.15;
        const frameToMaxSpeed = timeToMaxSpeed * FrameRate; // sec * frame/sec
        const maxA = (deltaTimeWeight * maxV) / frameToMaxSpeed; // 1frameあたりの加速度
        // 目指す向きは、（dx, dy）方向のベクトルとなる
        const dx = this._faceTargetX - this._faceX;
        const dy = this._faceTargetY - this._faceY;
        if (cubismmath_1.CubismMath.abs(dx) <= Epsilon && cubismmath_1.CubismMath.abs(dy) <= Epsilon) {
            return; // 変化なし
        }
        // 速度の最大よりも大きい場合は、速度を落とす
        const d = cubismmath_1.CubismMath.sqrt(dx * dx + dy * dy);
        // 進行方向の最大速度ベクトル
        const vx = (maxV * dx) / d;
        const vy = (maxV * dy) / d;
        // 現在の速度から、新規速度への変化（加速度）を求める
        let ax = vx - this._faceVX;
        let ay = vy - this._faceVY;
        const a = cubismmath_1.CubismMath.sqrt(ax * ax + ay * ay);
        // 加速のとき
        if (a < -maxA || a > maxA) {
            ax *= maxA / a;
            ay *= maxA / a;
        }
        // 加速度を元の速度に足して、新速度とする
        this._faceVX += ax;
        this._faceVY += ay;
        // 目的の方向に近づいたとき、滑らかに減速するための処理
        // 設定された加速度で止まる事の出来る距離と速度の関係から
        // 現在とりうる最高速度を計算し、それ以上の時は速度を落とす
        // ※本来、人間は筋力で力（加速度）を調整できるため、より自由度が高いが、簡単な処理で済ませている
        {
            // 加速度、速度、距離の関係式。
            //            2  6           2               3
            //      sqrt(a  t  + 16 a h t  - 8 a h) - a t
            // v = --------------------------------------
            //                    2
            //                 4 t  - 2
            // (t=1)
            // 	時刻tは、あらかじめ加速度、速度を1/60(フレームレート、単位なし)で
            // 	考えているので、t＝１として消してよい（※未検証）
            const maxV = 0.5 *
                (cubismmath_1.CubismMath.sqrt(maxA * maxA + 16.0 * maxA * d - 8.0 * maxA * d) -
                    maxA);
            const curV = cubismmath_1.CubismMath.sqrt(this._faceVX * this._faceVX + this._faceVY * this._faceVY);
            if (curV > maxV) {
                // 現在の速度 > 最高速度のとき、最高速度まで減速
                this._faceVX *= maxV / curV;
                this._faceVY *= maxV / curV;
            }
        }
        this._faceX += this._faceVX;
        this._faceY += this._faceVY;
    }
    /**
     * X軸の顔の向きの値を取得
     *
     * @return X軸の顔の向きの値（-1.0 ~ 1.0）
     */
    getX() {
        return this._faceX;
    }
    /**
     * Y軸の顔の向きの値を取得
     *
     * @return Y軸の顔の向きの値（-1.0 ~ 1.0）
     */
    getY() {
        return this._faceY;
    }
    /**
     * 顔の向きの目標値を設定
     *
     * @param x X軸の顔の向きの値（-1.0 ~ 1.0）
     * @param y Y軸の顔の向きの値（-1.0 ~ 1.0）
     */
    set(x, y) {
        this._faceTargetX = x;
        this._faceTargetY = y;
    }
}
exports.CubismTargetPoint = CubismTargetPoint;
// Namespace definition for compatibility.
const $ = __importStar(require("./cubismtargetpoint"));
// eslint-disable-next-line @typescript-eslint/no-namespace
var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.CubismTargetPoint = $.CubismTargetPoint;
})(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
