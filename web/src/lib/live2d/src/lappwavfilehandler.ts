// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview Live2D WAV PCM 解析与振幅计算工具。
 * @description 解析线性 PCM WAV 数据，按播放时间计算 RMS，并提供字节级小端序读取能力。
 */

/**
 * @description 保存已弃用的 WAV 处理器单例。
 * @type {LAppWavFileHandler|null}
 * @deprecated 单例访问方式已弃用，请直接创建 `LAppWavFileHandler`。
 */
export let s_instance: LAppWavFileHandler = null;

/**
 * @class
 * @description 读取 WAV 文件、维护多声道 PCM，并按时间推进计算当前 RMS。
 * @example
 * const handler = new LAppWavFileHandler();
 * await handler.loadWavFile(wavBuffer);
 */
export class LAppWavFileHandler {
  /**
   * @description 获取 WAV 处理器单例，尚未创建时自动实例化。
   * @returns {LAppWavFileHandler} WAV 处理器单例。
   * @deprecated 单例访问方式已弃用，请直接创建 `LAppWavFileHandler`。
   */
  public static getInstance(): LAppWavFileHandler {
    if (s_instance == null) {
      s_instance = new LAppWavFileHandler();
    }

    return s_instance;
  }

  /**
   * @description 清除已弃用的 WAV 处理器单例引用。
   * @returns {void} 无返回值。
   * @deprecated 请释放调用方直接创建的实例，不再使用单例生命周期。
   */
  public static releaseInstance(): void {
    if (s_instance != null) {
      s_instance = void 0;
    }

    s_instance = null;
  }

  /**
   * @description 按经过时间推进 PCM 样本位置，并计算新增样本区间的多声道 RMS。
   * @param {number} deltaTimeSeconds 自上次更新以来经过的秒数。
   * @returns {boolean} 成功推进并计算 RMS 时返回 `true`；无数据或播放结束时返回 `false`。
   */
  public update(deltaTimeSeconds: number) {
    let goalOffset: number;
    let rms: number;

    // データロード前/ファイル末尾に達した場合は更新しない
    if (
      this._pcmData == null ||
      this._sampleOffset >= this._wavFileInfo._samplesPerChannel
    ) {
      this._lastRms = 0.0;
      return false;
    }

    // 経過時間後の状態を保持
    this._userTimeSeconds += deltaTimeSeconds;
    goalOffset = Math.floor(
      this._userTimeSeconds * this._wavFileInfo._samplingRate
    );
    if (goalOffset > this._wavFileInfo._samplesPerChannel) {
      goalOffset = this._wavFileInfo._samplesPerChannel;
    }

    // RMS計測
    rms = 0.0;
    for (
      let channelCount = 0;
      channelCount < this._wavFileInfo._numberOfChannels;
      channelCount++
    ) {
      for (
        let sampleCount = this._sampleOffset;
        sampleCount < goalOffset;
        sampleCount++
      ) {
        const pcm = this._pcmData[channelCount][sampleCount];
        rms += pcm * pcm;
      }
    }
    rms = Math.sqrt(
      rms /
        (this._wavFileInfo._numberOfChannels *
          (goalOffset - this._sampleOffset))
    );

    this._lastRms = rms;
    this._sampleOffset = goalOffset;
    return true;
  }

  /**
   * @description 重置播放进度和 RMS，并开始异步加载指定 WAV 数据。
   * @param {string|ArrayBuffer} data WAV 文件地址或已读取的二进制数据。
   * @returns {void} 无返回值。
   */
  public start(data: string | ArrayBuffer): void {
    // サンプル位参照位置を初期化
    this._sampleOffset = 0;
    this._userTimeSeconds = 0.0;

    // RMS値をリセット
    this._lastRms = 0.0;

    this.loadWavFile(data);
  }

  /**
   * @description 获取最近一次时间更新计算得到的音频 RMS。
   * @returns {number} 当前 RMS 振幅。
   */
  public getRms(): number {
    return this._lastRms;
  }

  /**
   * @description 加载并解析 RIFF/WAVE 线性 PCM 数据，生成按声道存储的归一化样本。
   * @param {string|ArrayBuffer} fileData WAV 文件地址或二进制数据。
   * @returns {Promise<boolean>} 文件结构和 PCM 数据解析成功时兑现为 `true`。
   * @example
   * const loaded = await handler.loadWavFile(wavBuffer);
   */
  public loadWavFile(fileData: string | ArrayBuffer): Promise<boolean> {
    return new Promise(resolveValue => {
      let ret = false;

      if (this._pcmData != null) {
        this.releasePcmData();
      }

      // ファイルロード
      const asyncFileLoad = async () => {
        if (fileData instanceof ArrayBuffer) {
          return fileData;
        } else {
          let data = await fetch(fileData);
          return data.arrayBuffer();
        }
      };

      const asyncWavFileManager = (async () => {
        this._byteReader._fileByte = await asyncFileLoad();
        this._byteReader._fileDataView = new DataView(
          this._byteReader._fileByte
        );
        this._byteReader._fileSize = this._byteReader._fileByte.byteLength;
        this._byteReader._readOffset = 0;

        // ファイルロードに失敗しているか、先頭のシグネチャ"RIFF"を入れるサイズもない場合は失敗
        if (
          this._byteReader._fileByte == null ||
          this._byteReader._fileSize < 4
        ) {
          resolveValue(false);
          return;
        }

        // ファイル名
        this._wavFileInfo._fileName = (fileData instanceof ArrayBuffer) ? "" : fileData;

        try {
          // シグネチャ "RIFF"
          if (!this._byteReader.getCheckSignature('RIFF')) {
            ret = false;
            throw new Error('Cannot find Signeture "RIFF".');
          }
          // ファイルサイズ-8（読み飛ばし）
          this._byteReader.get32LittleEndian();
          // シグネチャ "WAVE"
          if (!this._byteReader.getCheckSignature('WAVE')) {
            ret = false;
            throw new Error('Cannot find Signeture "WAVE".');
          }
          // シグネチャ "fmt "
          if (!this._byteReader.getCheckSignature('fmt ')) {
            ret = false;
            throw new Error('Cannot find Signeture "fmt".');
          }
          // fmtチャンクサイズ
          const fmtChunkSize = this._byteReader.get32LittleEndian();
          // フォーマットIDは1（リニアPCM）以外受け付けない
          if (this._byteReader.get16LittleEndian() != 1) {
            ret = false;
            throw new Error('File is not linear PCM.');
          }
          // チャンネル数
          this._wavFileInfo._numberOfChannels =
            this._byteReader.get16LittleEndian();
          // サンプリングレート
          this._wavFileInfo._samplingRate =
            this._byteReader.get32LittleEndian();
          // データ速度[byte/sec]（読み飛ばし）
          this._byteReader.get32LittleEndian();
          // ブロックサイズ（読み飛ばし）
          this._byteReader.get16LittleEndian();
          // 量子化ビット数
          this._wavFileInfo._bitsPerSample =
            this._byteReader.get16LittleEndian();
          // fmtチャンクの拡張部分の読み飛ばし
          if (fmtChunkSize > 16) {
            this._byteReader._readOffset += fmtChunkSize - 16;
          }
          // "data"チャンクが出現するまで読み飛ばし
          while (
            !this._byteReader.getCheckSignature('data') &&
            this._byteReader._readOffset < this._byteReader._fileSize
          ) {
            this._byteReader._readOffset +=
              this._byteReader.get32LittleEndian() + 4;
          }
          // ファイル内に"data"チャンクが出現しなかった
          if (this._byteReader._readOffset >= this._byteReader._fileSize) {
            ret = false;
            throw new Error('Cannot find "data" Chunk.');
          }
          // サンプル数
          {
            const dataChunkSize = this._byteReader.get32LittleEndian();
            this._wavFileInfo._samplesPerChannel =
              (dataChunkSize * 8) /
              (this._wavFileInfo._bitsPerSample *
                this._wavFileInfo._numberOfChannels);
          }
          // 領域確保
          this._pcmData = new Array(this._wavFileInfo._numberOfChannels);
          for (
            let channelCount = 0;
            channelCount < this._wavFileInfo._numberOfChannels;
            channelCount++
          ) {
            this._pcmData[channelCount] = new Float32Array(
              this._wavFileInfo._samplesPerChannel
            );
          }
          // 波形データ取得
          for (
            let sampleCount = 0;
            sampleCount < this._wavFileInfo._samplesPerChannel;
            sampleCount++
          ) {
            for (
              let channelCount = 0;
              channelCount < this._wavFileInfo._numberOfChannels;
              channelCount++
            ) {
              this._pcmData[channelCount][sampleCount] = this.getPcmSample();
            }
          }

          ret = true;

          resolveValue(ret);
        } catch (e) {
          console.log(e);
        }
      })().then(() => {
        resolveValue(ret);
      });
    });
  }

  /**
   * @description 按 WAV 位深读取一个样本，并归一化到 -1 至 1 范围。
   * @returns {number} 归一化后的单个 PCM 样本。
   * @throws {RangeError} 字节读取位置超出 WAV 数据范围时抛出异常。
   */
  public getPcmSample(): number {
    let pcm32;

    // 32ビット幅に拡張してから-1～1の範囲に丸める
    switch (this._wavFileInfo._bitsPerSample) {
      case 8:
        pcm32 = this._byteReader.get8() - 128;
        pcm32 <<= 24;
        break;
      case 16:
        pcm32 = this._byteReader.get16LittleEndian() << 16;
        break;
      case 24:
        pcm32 = this._byteReader.get24LittleEndian() << 8;
        break;
      default:
        // 対応していないビット幅
        pcm32 = 0;
        break;
    }

    return pcm32 / 2147483647; //Number.MAX_VALUE;
  }

  /**
   * @description 复制并返回指定声道的全部 PCM 样本。
   * @param {number} usechannel 从零开始的声道索引。
   * @returns {Float32Array|null} 声道 PCM 副本；数据未加载或索引越界时返回 `null`。
   */
  public getPcmDataChannel(usechannel: number): Float32Array {
    // 指定したチャンネル数がデータ用配列の長さより多いならnullを返す。
    if (!this._pcmData || !(usechannel < this._pcmData.length)) {
      return null;
    }

    // _pcmDataから新規に指定したチャンネルのFloat32Arrayを作成する。
    return Float32Array.from(this._pcmData[usechannel]);
  }

  /**
   * @description 获取当前 WAV 文件声明的采样率。
   * @returns {number|null} 采样率；文件未加载或采样率无效时返回 `null`。
   */
  public getWavSamplingRate(): number {
    if (!this._wavFileInfo || this._wavFileInfo._samplingRate < 1) {
      return null;
    }

    return this._wavFileInfo._samplingRate;
  }

  /**
   * @description 清空所有声道 PCM 数组并释放顶层数据引用。
   * @returns {void} 无返回值。
   */
  public releasePcmData(): void {
    for (
      let channelCount = 0;
      channelCount < this._wavFileInfo._numberOfChannels;
      channelCount++
    ) {
      this._pcmData[channelCount] = null;
    }
    delete this._pcmData;
    this._pcmData = null;
  }

  /**
   * @description 创建空 PCM 状态、WAV 元数据和字节读取器。
   */
  constructor() {
    this._pcmData = null;
    this._userTimeSeconds = 0.0;
    this._lastRms = 0.0;
    this._sampleOffset = 0.0;
    this._wavFileInfo = new WavFileInfo();
    this._byteReader = new ByteReader();
  }

  _pcmData: Array<Float32Array>;
  _userTimeSeconds: number;
  _lastRms: number;
  _sampleOffset: number;
  _wavFileInfo: WavFileInfo;
  _byteReader: ByteReader;
  /**
   * @description 将外部二进制数据直接写入内部字节读取器。
   * @param {ArrayBuffer} arrayBuffer 文件二进制数据。
   * @param {number} length 有效文件长度。
   * @returns {void} 无返回值。
   * @type {(arrayBuffer: ArrayBuffer, length: number) => void}
   */
  loadFiletoBytes = (arrayBuffer: ArrayBuffer, length: number): void => {
    this._byteReader._fileByte = arrayBuffer;
    this._byteReader._fileDataView = new DataView(this._byteReader._fileByte);
    this._byteReader._fileSize = length;
  };
}

/**
 * @class
 * @typedef {object} WavFileInfo
 * @description 保存解析后的 WAV 文件格式与样本数量信息。
 * @property {string} _fileName 文件名或来源地址。
 * @property {number} _numberOfChannels 声道数量。
 * @property {number} _bitsPerSample 单个样本的位数。
 * @property {number} _samplingRate 采样率，单位为赫兹。
 * @property {number} _samplesPerChannel 每个声道的样本总数。
 */
export class WavFileInfo {
  /**
   * @description 创建数值均为零的空 WAV 元数据。
   */
  constructor() {
    this._fileName = '';
    this._numberOfChannels = 0;
    this._bitsPerSample = 0;
    this._samplingRate = 0;
    this._samplesPerChannel = 0;
  }

  _fileName: string; ///< ファイル名
  _numberOfChannels: number; ///< チャンネル数
  _bitsPerSample: number; ///< サンプルあたりビット数
  _samplingRate: number; ///< サンプリングレート
  _samplesPerChannel: number; ///< 1チャンネルあたり総サンプル数
}

/**
 * @class
 * @typedef {object} ByteReader
 * @description 从 ArrayBuffer 中按顺序读取 WAV 小端序字段和四字节签名。
 * @property {ArrayBuffer|null} _fileByte 原始文件二进制。
 * @property {DataView|null} _fileDataView 文件数据视图。
 * @property {number} _fileSize 文件字节数。
 * @property {number} _readOffset 当前读取偏移量。
 */
export class ByteReader {
  /**
   * @description 创建尚未绑定文件数据的字节读取器。
   */
  constructor() {
    this._fileByte = null;
    this._fileDataView = null;
    this._fileSize = 0;
    this._readOffset = 0;
  }

  /**
   * @description 从当前偏移读取一个无符号 8 位整数并推进一字节。
   * @returns {number} 读取到的 8 位数值。
   * @throws {RangeError} 当前偏移超出数据范围时抛出异常。
   */
  public get8(): number {
    const ret = this._fileDataView.getUint8(this._readOffset);
    this._readOffset++;
    return ret;
  }

  /**
   * @description 按小端序读取无符号 16 位整数并推进两字节。
   * @returns {number} 读取到的 16 位数值。
   * @throws {RangeError} 剩余数据不足两字节时抛出异常。
   */
  public get16LittleEndian(): number {
    const ret =
      (this._fileDataView.getUint8(this._readOffset + 1) << 8) |
      this._fileDataView.getUint8(this._readOffset);
    this._readOffset += 2;
    return ret;
  }

  /**
   * @description 按小端序读取无符号 24 位整数并推进三字节。
   * @returns {number} 低 24 位保存读取结果的数值。
   * @throws {RangeError} 剩余数据不足三字节时抛出异常。
   */
  public get24LittleEndian(): number {
    const ret =
      (this._fileDataView.getUint8(this._readOffset + 2) << 16) |
      (this._fileDataView.getUint8(this._readOffset + 1) << 8) |
      this._fileDataView.getUint8(this._readOffset);
    this._readOffset += 3;
    return ret;
  }

  /**
   * @description 按小端序读取 32 位整数并推进四字节。
   * @returns {number} 读取到的 32 位数值。
   * @throws {RangeError} 剩余数据不足四字节时抛出异常。
   */
  public get32LittleEndian(): number {
    const ret =
      (this._fileDataView.getUint8(this._readOffset + 3) << 24) |
      (this._fileDataView.getUint8(this._readOffset + 2) << 16) |
      (this._fileDataView.getUint8(this._readOffset + 1) << 8) |
      this._fileDataView.getUint8(this._readOffset);
    this._readOffset += 4;
    return ret;
  }

  /**
   * @description 读取四字节签名并与给定 ASCII 文本逐字节比较。
   * @param {string} reference 长度必须为四的参考签名。
   * @returns {boolean} 签名完全一致时返回 `true`。
   * @throws {RangeError} 剩余数据不足四字节时抛出异常。
   */
  public getCheckSignature(reference: string): boolean {
    const getSignature: Uint8Array = new Uint8Array(4);
    const referenceString: Uint8Array = new TextEncoder().encode(reference);
    if (reference.length != 4) {
      return false;
    }
    for (let signatureOffset = 0; signatureOffset < 4; signatureOffset++) {
      getSignature[signatureOffset] = this.get8();
    }
    return (
      getSignature[0] == referenceString[0] &&
      getSignature[1] == referenceString[1] &&
      getSignature[2] == referenceString[2] &&
      getSignature[3] == referenceString[3]
    );
  }

  _fileByte: ArrayBuffer; ///< ロードしたファイルのバイト列
  _fileDataView: DataView;
  _fileSize: number; ///< ファイルサイズ
  _readOffset: number; ///< ファイル参照位置
}
