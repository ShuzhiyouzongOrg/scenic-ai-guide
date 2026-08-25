/**
 * 讯飞交互式虚拟人（数字人）SDK 封装
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

export type AvatarStatus = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error'

export interface AvatarStartOptions {
  /** 形象资源 id（来自后台数字人配置） */
  avatarId?: string
  /** 音色 vcn（来自后台数字人配置） */
  vcn?: string
  /** 数字人渲染容器 */
  wrapper: HTMLElement
}

/** 情感风格 -> 讯飞超拟人音色情感系数（仅超拟人音色支持） */
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

function emotionCode(emotion?: string): number {
  return (emotion && EMOTION_CODE[emotion]) || 10
}

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

  /** 驱动数字人说话；返回是否成功下发 */
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

  /** 在用户手势中调用以解锁音频（解除静音并恢复播放） */
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

  /** Stream licensed external audio as 16 kHz PCM so the SDK can drive lip movement. */
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

  /** 中断云端文本驱动并记录剩余文本，实现可恢复的真正暂停。 */
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

  /** 恢复播放器并从暂停时记录的剩余文本继续云端播报。 */
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

  function queuePlaybackTransition<T>(operation: () => Promise<T>): Promise<T> {
    const next = playbackTransition.then(operation, operation)
    playbackTransition = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  /** 打断当前播报 */
  async function interrupt(): Promise<void> {
    resetSpeechPlayback()
    try {
      await platform.value?.interrupt?.()
    } catch {
      // 忽略打断异常
    }
    if (status.value === 'speaking') status.value = 'ready'
  }

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

function normalizeError(err: unknown): string {
  if (!err) return '数字人服务异常'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string; code?: string | number }
  return anyErr.message || (anyErr.code ? `数字人错误(${anyErr.code})` : '数字人服务异常')
}
