"use strict";
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
exports.Live2DCubismFramework = exports.LogLevel = exports.Option = exports.CubismFramework = exports.Constant = void 0;
exports.strtod = strtod;
exports.csmDelete = csmDelete;
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
const live2dcubismcore_1 = require("./Core/live2dcubismcore");
const cubismidmanager_1 = require("./id/cubismidmanager");
const cubismrenderer_1 = require("./rendering/cubismrenderer");
const cubismdebug_1 = require("./utils/cubismdebug");
const cubismjson_1 = require("./utils/cubismjson");
function strtod(s, endPtr) {
    let index = 0;
    for (let i = 1;; i++) {
        const testC = s.slice(i - 1, i);
        // 指数・マイナスの可能性があるのでスキップする
        if (testC == 'e' || testC == '-' || testC == 'E') {
            continue;
        } // 文字列の範囲を広げていく
        const test = s.substring(0, i);
        const number = Number(test);
        if (isNaN(number)) {
            // 数値として認識できなくなったので終了
            break;
        } // 最後に数値としてできたindexを格納しておく
        index = i;
    }
    let d = parseFloat(s); // パースした数値
    if (isNaN(d)) {
        // 数値として認識できなくなったので終了
        d = NaN;
    }
    endPtr[0] = s.slice(index); // 後続の文字列
    return d;
}
// ファイルスコープの変数を初期化
let s_isStarted = false;
let s_isInitialized = false;
let s_option = null;
let s_cubismIdManager = null;
/**
 * Framework内で使う定数の宣言
 */
exports.Constant = Object.freeze({
    vertexOffset: 0, // メッシュ頂点のオフセット値
    vertexStep: 2, // メッシュ頂点のステップ値
});
function csmDelete(address) {
    if (!address) {
        return;
    }
    address = void 0;
}
/**
 * Live2D Cubism SDK Original Workflow SDKのエントリポイント
 * 利用開始時はCubismFramework.initialize()を呼び、CubismFramework.dispose()で終了する。
 */
class CubismFramework {
    /**
     * Cubism FrameworkのAPIを使用可能にする。
     *  APIを実行する前に必ずこの関数を実行すること。
     *  一度準備が完了して以降は、再び実行しても内部処理がスキップされます。
     *
     * @param    option      Optionクラスのインスタンス
     *
     * @return   準備処理が完了したらtrueが返ります。
     */
    static startUp(option = null) {
        if (s_isStarted) {
            (0, cubismdebug_1.CubismLogInfo)('CubismFramework.startUp() is already done.');
            return s_isStarted;
        }
        s_option = option;
        if (s_option != null) {
            live2dcubismcore_1.Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
        }
        s_isStarted = true;
        // Live2D Cubism Coreバージョン情報を表示
        if (s_isStarted) {
            const version = live2dcubismcore_1.Live2DCubismCore.Version.csmGetVersion();
            const major = (version & 0xff000000) >> 24;
            const minor = (version & 0x00ff0000) >> 16;
            const patch = version & 0x0000ffff;
            const versionNumber = version;
            (0, cubismdebug_1.CubismLogInfo)(`Live2D Cubism Core version: {0}.{1}.{2} ({3})`, ('00' + major).slice(-2), ('00' + minor).slice(-2), ('0000' + patch).slice(-4), versionNumber);
        }
        (0, cubismdebug_1.CubismLogInfo)('CubismFramework.startUp() is complete.');
        return s_isStarted;
    }
    /**
     * StartUp()で初期化したCubismFrameworkの各パラメータをクリアします。
     * Dispose()したCubismFrameworkを再利用する際に利用してください。
     */
    static cleanUp() {
        s_isStarted = false;
        s_isInitialized = false;
        s_option = null;
        s_cubismIdManager = null;
    }
    /**
     * Cubism Framework内のリソースを初期化してモデルを表示可能な状態にします。<br>
     *     再度Initialize()するには先にDispose()を実行する必要があります。
     */
    static initialize() {
        (0, cubismdebug_1.CSM_ASSERT)(s_isStarted);
        if (!s_isStarted) {
            (0, cubismdebug_1.CubismLogWarning)('CubismFramework is not started.');
            return;
        }
        // --- s_isInitializedによる連続初期化ガード ---
        // 連続してリソース確保が行われないようにする。
        // 再度Initialize()するには先にDispose()を実行する必要がある。
        if (s_isInitialized) {
            (0, cubismdebug_1.CubismLogWarning)('CubismFramework.initialize() skipped, already initialized.');
            return;
        }
        //---- static 初期化 ----
        cubismjson_1.Value.staticInitializeNotForClientCall();
        s_cubismIdManager = new cubismidmanager_1.CubismIdManager();
        s_isInitialized = true;
        (0, cubismdebug_1.CubismLogInfo)('CubismFramework.initialize() is complete.');
    }
    /**
     * Cubism Framework内の全てのリソースを解放します。
     *      ただし、外部で確保されたリソースについては解放しません。
     *      外部で適切に破棄する必要があります。
     */
    static dispose() {
        (0, cubismdebug_1.CSM_ASSERT)(s_isStarted);
        if (!s_isStarted) {
            (0, cubismdebug_1.CubismLogWarning)('CubismFramework is not started.');
            return;
        }
        // --- s_isInitializedによる未初期化解放ガード ---
        // dispose()するには先にinitialize()を実行する必要がある。
        if (!s_isInitialized) {
            // false...リソース未確保の場合
            (0, cubismdebug_1.CubismLogWarning)('CubismFramework.dispose() skipped, not initialized.');
            return;
        }
        cubismjson_1.Value.staticReleaseNotForClientCall();
        s_cubismIdManager.release();
        s_cubismIdManager = null;
        // レンダラの静的リソース（シェーダプログラム他）を解放する
        cubismrenderer_1.CubismRenderer.staticRelease();
        s_isInitialized = false;
        (0, cubismdebug_1.CubismLogInfo)('CubismFramework.dispose() is complete.');
    }
    /**
     * Cubism FrameworkのAPIを使用する準備が完了したかどうか
     * @return APIを使用する準備が完了していればtrueが返ります。
     */
    static isStarted() {
        return s_isStarted;
    }
    /**
     * Cubism Frameworkのリソース初期化がすでに行われているかどうか
     * @return リソース確保が完了していればtrueが返ります
     */
    static isInitialized() {
        return s_isInitialized;
    }
    /**
     * Core APIにバインドしたログ関数を実行する
     *
     * @praram message ログメッセージ
     */
    static coreLogFunction(message) {
        // Return if logging not possible.
        if (!live2dcubismcore_1.Live2DCubismCore.Logging.csmGetLogFunction()) {
            return;
        }
        live2dcubismcore_1.Live2DCubismCore.Logging.csmGetLogFunction()(message);
    }
    /**
     * 現在のログ出力レベル設定の値を返す。
     *
     * @return  現在のログ出力レベル設定の値
     */
    static getLoggingLevel() {
        if (s_option != null) {
            return s_option.loggingLevel;
        }
        return LogLevel.LogLevel_Off;
    }
    /**
     * IDマネージャのインスタンスを取得する
     * @return CubismManagerクラスのインスタンス
     */
    static getIdManager() {
        return s_cubismIdManager;
    }
    /**
     * 静的クラスとして使用する
     * インスタンス化させない
     */
    constructor() { }
}
exports.CubismFramework = CubismFramework;
class Option {
}
exports.Option = Option;
/**
 * ログ出力のレベル
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["LogLevel_Verbose"] = 0] = "LogLevel_Verbose";
    LogLevel[LogLevel["LogLevel_Debug"] = 1] = "LogLevel_Debug";
    LogLevel[LogLevel["LogLevel_Info"] = 2] = "LogLevel_Info";
    LogLevel[LogLevel["LogLevel_Warning"] = 3] = "LogLevel_Warning";
    LogLevel[LogLevel["LogLevel_Error"] = 4] = "LogLevel_Error";
    LogLevel[LogLevel["LogLevel_Off"] = 5] = "LogLevel_Off";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// Namespace definition for compatibility.
const $ = __importStar(require("./live2dcubismframework"));
// eslint-disable-next-line @typescript-eslint/no-namespace
var Live2DCubismFramework;
(function (Live2DCubismFramework) {
    Live2DCubismFramework.Constant = $.Constant;
    Live2DCubismFramework.csmDelete = $.csmDelete;
    Live2DCubismFramework.CubismFramework = $.CubismFramework;
})(Live2DCubismFramework || (exports.Live2DCubismFramework = Live2DCubismFramework = {}));
