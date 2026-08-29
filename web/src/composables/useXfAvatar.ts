/**
 * @fileoverview 封装讯飞云端交互式数字人的连接与播报能力。
 * @description 负责凭证解析、WebRTC 会话、字幕同步、外部音频及可恢复暂停流程。
 */

/**
 * @description 讯飞交互式虚拟人（数字人）SDK 封装
 *
 * 负责实例化 AvatarPlatform、设置账号与全局参数、启动 WebRTC 流、
 * 通过 writeText 驱动数字人说话（云端完成 TTS + 口型 + 表情），
 * 并对外暴露响应式状态与方法。账号凭证来自环境变量，形象与音色由后台配置下发。
 */
import { ref, shallowRef } from 'vue'
// SDK 以预编译 ESM 形式提供，附带 index.d.ts 类型声明
import AvatarPlatform, {
  SDKEvents,
  PlayerEvents
} from '@/vm-sdk/avatar-sdk-web_3.1.1.1011/index.js'
import {
  hasAvatarCredentials,
  resolveAvatarCredentials
} from '@/utils/digital-human/avatar-credentials'
import { advanceSpeechOffset, getRemainingSpeech } from '@/utils/digital-human/speech-resume'

/**
 * @description 表示讯飞云端数字人的连接与播报状态。
 * @typedef {'idle' | 'connecting' | 'ready' | 'speaking' | 'error'} AvatarStatus
 */
export type AvatarStatus = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'

/**
 * @description 定义启动讯飞云端数字人所需的角色、音色和容器参数。
 * @interface AvatarStartOptions
 * @property {string} [avatarId] 讯飞交互平台中的形象资源标识。
 * @property {string} [vcn] 讯飞 TTS 音色标识。
 * @property {HTMLElement} wrapper 承载云端视频播放器的页面容器。
 */
export interface AvatarStartOptions {
  /**
   * @description 形象资源 id（来自后台数字人配置）
   */
  avatarId?: string
  /**
   * @description 音色 vcn（来自后台数字人配置）
   */
  vcn?: string
  /**
   * @description 数字人渲染容器
   */
  wrapper: HTMLElement
}

/**
 * @description 情感风格 -> 讯飞超拟人音色情感系数（仅超拟人音色支持）
 */
const EMOTION_CODE: Record<string, number> = {
  friendly: 10,
  solemn: 13,
  enthusiastic: 14,
  storytelling: 10,
  neutral: 10, // 亲切温柔（导游默认）
  warm: 10,
  gentle: 10,
  happy: 14, // 积极正向
  sorry: 10,
  serious: 13
}

/**
 * @description 将业务情感名称转换为讯飞超拟人音色支持的情感系数。
 * @param {string} [emotion] 业务情感名称。
 * @returns {number} 对应的讯飞情感系数；未匹配时返回亲切风格系数 10。
 */
function emotionCode(emotion?: string): number {
  return (emotion && EMOTION_CODE[emotion]) || 10
}

/**
 * @description 创建讯飞云端数字人的连接、播报、字幕和可恢复暂停控制接口。
 * @returns {ReturnType<typeof useXfAvatar>} 包含响应式状态、凭证状态、字幕，以及启动、播报、暂停、恢复、打断和销毁方法的对象。
 * @example
 * const avatar = useXfAvatar()
 * const ready = await avatar.start({ wrapper, avatarId: 'AVATAR_ID', vcn: 'VOICE_ID' })
 * if (ready) await avatar.speak('欢迎使用数智游踪')
 */
export function useXfAvatar() {
  const status = ref<AvatarStatus>('idle')
  const errorMessage = ref('')
  // 浏览器自动播放策略会拦截未经用户手势的音频：audioReady 为 false 时需用户手势解锁
  const audioReady = ref(false)
  const subtitle = ref('')
  const platform = shallowRef<InstanceType<typeof AvatarPlatform> | null>(null)
  let activeSpeech: { text: string; emotion?: string } | null = null
  let pausedSpeech: { text: string; emotion?: string } | null = null
  let spokenOffset = 0
  let playbackPaused = false
  let activeRequestId = ''
  let interruptedRequestId = ''
  let speechGeneration = 0
  let activeFrameStarted = false
  let playbackTransition: Promise<void> = Promise.resolve()

  const env = import.meta.env
  const apiInfo: Record<string, string> = {
    appId: env.VITE_XF_AVATAR_APPID || env.XFYUN_APP_ID,
    apiKey: env.VITE_XF_AVATAR_APIKEY || env.XFYUN_API_KEY,
    apiSecret: env.VITE_XF_AVATAR_APISECRET || env.XFYUN_API_SECRET,
    serverUrl: env.VITE_XF_AVATAR_SERVERURL || 'wss://avatar.cn-huadong-1.xf-yun.com/v1/interact'
  }

  const credentialsAvailable = ref(hasAvatarCredentials(apiInfo))
  let desktopCredentialsPromise: Promise<boolean> | null = null

  /**
   * @description 优先复用环境凭证，否则通过桌面桥接解析并缓存讯飞账号凭证。
   * @returns {Promise<boolean>} 当前已取得完整凭证时返回 true。
   */
  async function resolveCredentials(): Promise<boolean> {
    if (credentialsAvailable.value) return true
    if (desktopCredentialsPromise) return desktopCredentialsPromise

    desktopCredentialsPromise = (async () => {
      const credentials = await resolveAvatarCredentials(
        apiInfo,
        window.shuzhiyouzongDesktop?.getAvatarCredentials
      )
      if (credentials) Object.assign(apiInfo, credentials)
      credentialsAvailable.value = hasAvatarCredentials(apiInfo)
      return credentialsAvailable.value
    })()
    return desktopCredentialsPromise
  }

  /**
   * @description 合并角色、音色与环境配置，生成讯飞数字人 SDK 的全局启动参数。
   * @param {string} avatarId 后台数字人配置中的形象资源标识。
   * @param {string} vcn 后台数字人配置中的 TTS 音色标识。
   * @returns {Record<string, unknown>} 可传递给讯飞 SDK 的流、角色、语音和字幕参数。
   */
  function buildGlobalParams(avatarId: string, vcn: string) {
    const params: Record<string, unknown> = {
      stream: { protocol: 'xrtc', fps: 25, bitrate: 1000000, alpha: 0 },
      avatar: {
        avatar_id:
          avatarId || env.VITE_XF_AVATAR_ID || env.DEFAULT_AVATAR_ID || 'cnr5dg8n2000000003',
        width: 1080,
        height: 960,
        mask_region: '[0,0,1080,1080]',
        scale: 1,
        move_h: 0,
        move_v: 0,
        audio_format: 1
      },
      tts: {
        vcn: vcn || env.VITE_XF_AVATAR_VCN || env.DEFAULT_AVATAR_VCN || 'x5_lingxiaoyue_flow',
        speed: 50,
        pitch: 50,
        volume: 100,
        emotion: 10
      },
      avatar_dispatch: { interactive_mode: 1 },
      subtitle: { subtitle: 1 }
    }
    // 可选背景（交互平台素材管理中的 res_key）
    if (env.VITE_XF_AVATAR_RESKEY) {
      params.enable = true
      params.background = { type: 'res_key', data: env.VITE_XF_AVATAR_RESKEY }
    }
    return params
  }

  /**
   * @description 解析桌面端或环境变量凭证，配置讯飞 SDK 事件并启动 WebRTC 数字人会话。
   * @param {AvatarStartOptions} options 数字人角色、音色和渲染容器配置。
   * @returns {Promise<boolean>} 会话成功进入就绪状态时返回 true；凭证缺失或 SDK 启动失败时返回 false。
   */
  async function start(options: AvatarStartOptions): Promise<boolean> {
    if (!(await resolveCredentials())) {
      status.value = 'error'
      errorMessage.value = '未配置数字人账号凭证，已切换为纯文本模式。'
      return false
    }
    try {
      status.value = 'connecting'
      errorMessage.value = ''
      const ap = new AvatarPlatform()
      platform.value = ap

      const info: Record<string, string> = { ...apiInfo }
      if (env.VITE_XF_AVATAR_SCENEID) info.sceneId = env.VITE_XF_AVATAR_SCENEID
      ap.setApiInfo(info as never)
      ap.setGlobalParams(buildGlobalParams(options.avatarId || '', options.vcn || '') as never)

      ap.on(SDKEvents.frame_start, (payload: unknown) => {
        const requestId = getRequestId(payload)
        if (requestId && activeRequestId && requestId !== activeRequestId) return
        if (!activeSpeech) return
        activeFrameStarted = true
        status.value = 'speaking'
      })
      ap.on(SDKEvents.frame_stop, (payload: unknown) => {
        const requestId = getRequestId(payload)
        if (interruptedRequestId && (!requestId || requestId === interruptedRequestId)) {
          interruptedRequestId = ''
          return
        }
        if (requestId && activeRequestId && requestId !== activeRequestId) return
        if (activeSpeech && !activeFrameStarted && !requestId) return
        if (status.value === 'speaking') status.value = 'ready'
        activeSpeech = null
        activeRequestId = ''
        spokenOffset = 0
        activeFrameStarted = false
      })
      ap.on(SDKEvents.subtitle_info, (payload: unknown) => {
        const value = payload as {
          request_id?: string
          requestId?: string
          text?: string
          content?: string
          data?: { request_id?: string; requestId?: string; text?: string; content?: string }
        }
        const requestId = getRequestId(value)
        if (requestId && activeRequestId && requestId !== activeRequestId) return
        if (playbackPaused || !activeSpeech || !activeFrameStarted) return
        const nextSubtitle =
          value.text || value.content || value.data?.text || value.data?.content || ''
        if (nextSubtitle) {
          subtitle.value = nextSubtitle
          if (activeSpeech) {
            spokenOffset = advanceSpeechOffset(activeSpeech.text, nextSubtitle, spokenOffset)
          }
        }
      })
      ap.on(SDKEvents.error, (err: unknown) => {
        status.value = 'error'
        errorMessage.value = normalizeError(err)
      })
      ap.on(SDKEvents.disconnected, () => {
        if (status.value !== 'error') status.value = 'idle'
      })

      await ap.start({ wrapper: options.wrapper as HTMLDivElement })
      status.value = 'ready'

      // 监听播放器：音频被自动播放策略拦截时标记，需用户手势解锁
      const player = ap.player
      if (player) {
        player.on?.(PlayerEvents.playing, () => {
          if (!player.muted) audioReady.value = true
        })
        player.on?.(PlayerEvents.playNotAllowed, () => {
          audioReady.value = false
        })
        // 尽力先解除静音（首帧前调用通常可生效，失败则等待用户手势）
        try {
          player.muted = false
          player.volume = 1
        } catch {
          /* ignore */
        }
      }
      return true
    } catch (err) {
      status.value = 'error'
      errorMessage.value = normalizeError(err)
      return false
    }
  }

  /**
   * @description 向讯飞 SDK 下发文本和情感参数，并跟踪当前请求的字幕进度。
   * @param {string} text 待播报文本；空白文本不会下发。
   * @param {{ emotion?: string }} [opts={}] 播报情感配置。
   * @returns {Promise<boolean>} 文本成功下发时返回 true；会话不可用或下发失败时返回 false。
   */
  async function speak(text: string, opts: { emotion?: string } = {}): Promise<boolean> {
    const ap = platform.value
    const content = String(text || '').trim()
    if (!ap || !content || status.value === 'error' || status.value === 'idle') {
      return false
    }
    try {
      const generation = ++speechGeneration
      playbackPaused = false
      pausedSpeech = null
      activeSpeech = { text: content, emotion: opts.emotion }
      spokenOffset = 0
      activeFrameStarted = false
      subtitle.value = ''
      status.value = 'speaking'
      const requestId = await ap.writeText(content, {
        nlp: false,
        tts: { emotion: emotionCode(opts.emotion), volume: 100 }
      } as never)
      if (generation !== speechGeneration || playbackPaused) return true
      activeRequestId = requestId
      return true
    } catch (err) {
      activeSpeech = null
      activeRequestId = ''
      spokenOffset = 0
      activeFrameStarted = false
      errorMessage.value = normalizeError(err)
      if (status.value === 'speaking') status.value = 'ready'
      return false
    }
  }

  /**
   * @description 下载音频并重采样为讯飞外部音频接口要求的单声道 16 kHz PCM16 数据。
   * @param {string} url 可访问的音频资源地址。
   * @returns {Promise<ArrayBuffer>} PCM16 字节缓冲区。
   * @throws {Error | DOMException} 音频请求失败、解码失败或离线重采样失败时抛出异常。
   */
  async function decodeAudioToPcm16(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Official audio failed to load (${response.status})`)
    const sourceBuffer = await response.arrayBuffer()
    const audioContext = new AudioContext()
    try {
      const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0))
      const sampleRate = 16000
      const frameCount = Math.ceil(decoded.duration * sampleRate)
      const offline = new OfflineAudioContext(1, frameCount, sampleRate)
      const source = offline.createBufferSource()
      source.buffer = decoded
      source.connect(offline.destination)
      source.start()
      const rendered = await offline.startRendering()
      const samples = rendered.getChannelData(0)
      const pcm = new ArrayBuffer(samples.length * 2)
      const view = new DataView(pcm)
      for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[index]))
        view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      }
      return pcm
    } finally {
      await audioContext.close()
    }
  }

  /**
   * @description 将外部音频转换为 16 kHz PCM 分片写入讯飞 SDK，以驱动数字人口型。
   * @param {string} url 可访问的音频资源地址。
   * @returns {Promise<boolean>} 外部音频完整下发时返回 true；会话不可用或处理失败时返回 false。
   */
  async function speakAudio(url: string): Promise<boolean> {
    const ap = platform.value
    if (!ap || !url || status.value === 'error' || status.value === 'idle') return false
    try {
      resetSpeechPlayback()
      const pcm = await decodeAudioToPcm16(url)
      status.value = 'speaking'
      const chunkBytes = 6400
      const extend = {
        nlp: false,
        audio: { encoding: 'raw', channels: 1, bit_depth: 16, sample_rate: 16000 },
        avatar_dispatch: { audio_mode: 0 }
      }
      for (let offset = 0; offset < pcm.byteLength; offset += chunkBytes) {
        const chunk = pcm.slice(offset, Math.min(offset + chunkBytes, pcm.byteLength))
        await ap.writeAudio(chunk, offset === 0 ? (0 as never) : (1 as never), extend as never)
      }
      await ap.writeAudio(new ArrayBuffer(0), 2 as never, extend as never)
      return true
    } catch (err) {
      errorMessage.value = normalizeError(err)
      if (status.value === 'speaking') status.value = 'ready'
      return false
    }
  }

  /**
   * @description 在用户手势中解除播放器静音并尝试恢复音频播放。
   * @returns {Promise<void>} 解锁尝试完成后的 Promise。
   */
  async function enableAudio(): Promise<void> {
    if (playbackPaused) return
    const player = platform.value?.player
    if (!player) return
    try {
      player.muted = false
      player.volume = 1
      await player.resume?.()
      audioReady.value = true
    } catch {
      /* 仍被拦截，等待下一次用户手势 */
    }
  }

  /**
   * @description 中断云端文本驱动并记录剩余文本，实现可恢复的真正暂停。
   * @returns {Promise<void>} 暂停状态转换完成后的 Promise。
   */
  function pause(): Promise<void> {
    return queuePlaybackTransition(async () => {
      const ap = platform.value
      if (!ap || playbackPaused) return
      speechGeneration += 1
      playbackPaused = true
      const player = ap.player
      if (player) player.muted = true

      if (!activeSpeech || status.value !== 'speaking') return
      const remainingText = getRemainingSpeech(activeSpeech.text, spokenOffset)
      pausedSpeech = remainingText ? { text: remainingText, emotion: activeSpeech.emotion } : null
      interruptedRequestId = activeRequestId
      try {
        await ap.interrupt()
      } catch {
        /* 保持暂停态，恢复时重新下发剩余文本 */
      }
      status.value = 'ready'
      activeFrameStarted = false
    })
  }

  /**
   * @description 恢复播放器并从暂停时记录的剩余文本继续云端播报。
   * @returns {Promise<boolean>} 成功恢复播放器及剩余文本时返回 true；当前未暂停或恢复失败时返回 false。
   */
  function resume(): Promise<boolean> {
    return queuePlaybackTransition(async () => {
      const ap = platform.value
      if (!ap || !playbackPaused) return false
      const speechToResume = pausedSpeech
      const player = ap.player
      try {
        if (player) {
          player.muted = false
          player.volume = 1
          await player.resume()
          audioReady.value = true
        }
      } catch {
        if (player) player.muted = true
        audioReady.value = false
        return false
      }

      if (!speechToResume?.text) {
        playbackPaused = false
        pausedSpeech = null
        activeSpeech = null
        activeRequestId = ''
        spokenOffset = 0
        activeFrameStarted = false
        status.value = 'ready'
        return true
      }

      playbackPaused = false
      activeSpeech = null
      activeRequestId = ''
      spokenOffset = 0
      activeFrameStarted = false
      const resumed = await speak(speechToResume.text, { emotion: speechToResume.emotion })
      if (resumed) return true

      playbackPaused = true
      pausedSpeech = speechToResume
      if (player) {
        player.muted = true
      }
      status.value = 'ready'
      return false
    })
  }

  /**
   * @description 串行调度暂停与恢复操作，避免连续点击造成播放器状态交叉覆盖。
   * @template T
   * @param {() => Promise<T>} operation 待排队执行的播放状态转换操作。
   * @returns {Promise<T>} 当前状态转换操作的结果 Promise。
   * @throws {unknown} 状态转换操作拒绝时透传原始异常。
   */
  function queuePlaybackTransition<T>(operation: () => Promise<T>): Promise<T> {
    const next = playbackTransition.then(operation, operation)
    playbackTransition = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  /**
   * @description 清空可恢复播报状态，并请求讯飞 SDK 打断当前任务。
   * @returns {Promise<void>} 打断操作完成后的 Promise；SDK 的打断异常会在内部忽略。
   */
  async function interrupt(): Promise<void> {
    resetSpeechPlayback()
    try {
      await platform.value?.interrupt?.()
    } catch {
      // 忽略打断异常
    }
    if (status.value === 'speaking') status.value = 'ready'
  }

  /**
   * @description 销毁讯飞 SDK 实例并清空字幕进度、暂停状态和请求标识。
   * @returns {void} 无返回值。
   */
  function destroy(): void {
    try {
      platform.value?.destroy?.()
    } catch {
      // 忽略销毁异常
    }
    platform.value = null
    resetSpeechPlayback()
    status.value = 'idle'
  }

  return {
    status,
    errorMessage,
    audioReady,
    subtitle,
    hasCredentials: credentialsAvailable,
    start,
    speak,
    speakAudio,
    enableAudio,
    pause,
    resume,
    interrupt,
    destroy
  }

  /**
   * @description 清空当前文本、字幕进度、暂停状态和请求标识，并使旧播报批次失效。
   * @returns {void} 无返回值。
   */
  function resetSpeechPlayback(): void {
    speechGeneration += 1
    activeSpeech = null
    pausedSpeech = null
    spokenOffset = 0
    playbackPaused = false
    activeRequestId = ''
    interruptedRequestId = ''
    activeFrameStarted = false
  }
}

/**
 * @description 从讯飞事件的顶层或嵌套数据中提取统一的请求标识。
 * @param {unknown} payload 讯飞 SDK 事件载荷。
 * @returns {string} 解析到的请求标识；载荷未包含标识时返回空字符串。
 */
function getRequestId(payload: unknown): string {
  const value = payload as {
    request_id?: string
    requestId?: string
    data?: { request_id?: string; requestId?: string }
  }
  return (
    value?.request_id || value?.requestId || value?.data?.request_id || value?.data?.requestId || ''
  )
}

/**
 * @description 将讯飞 SDK 返回的未知异常规范化为可直接展示的错误文本。
 * @param {unknown} err 原始异常值。
 * @returns {string} 解析后的消息、错误码提示或默认服务异常文本。
 */
function normalizeError(err: unknown): string {
  if (!err) return '数字人服务异常'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string; code?: string | number }
  return anyErr.message || (anyErr.code ? `数字人错误(${anyErr.code})` : '数字人服务异常')
}
