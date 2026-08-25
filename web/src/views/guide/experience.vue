<!--
  游客导览主页面：数字人 + 智能问答 + 语音交互 + 景点讲解 + 路线推荐 + 满意度反馈。
  数字人由后端回答文本驱动播报，并根据情绪标签变化表情。
-->
<template>
  <div class="guide-page">
    <!-- 左：数字人展示区 -->
    <section class="dh-column">
      <div
        class="dh-box"
        :class="{ 'is-active': asking, 'is-avatar-fixed': avatarEngine === 'xfyun' }"
      >
        <DigitalHumanAvatar ref="avatarRef" @ready="onAvatarReady" @error="onAvatarError" />
      </div>
      <div class="dh-caption">
        <ElTag v-if="lastLabel" size="small" effect="dark" round>{{ lastLabel }}</ElTag>
        <span class="dh-tip">{{ statusTip }}</span>
      </div>
    </section>

    <!-- 右：交互区 -->
    <section class="panel-column">
      <ElTabs v-model="activeTab" class="guide-tabs">
        <!-- 对话 -->
        <ElTabPane :label="$t('app.guideTabChat')" name="chat">
          <div class="chat-wrap">
            <ElScrollbar ref="scrollRef" class="chat-body">
              <div v-if="!messages.length" class="chat-empty">
                <ElEmpty :description="$t('app.guideEmptyChat')" />
              </div>
              <TransitionGroup name="msg" tag="div">
                <div v-for="(m, i) in messages" :key="i" class="msg-row" :class="m.role">
                  <div class="bubble">
                    <p class="bubble-text">{{ displayMessage(m) }}</p>
                    <div v-if="m.role === 'assistant' && m.meta" class="bubble-meta">
                      <ElTag v-if="m.meta.label" size="small" type="info" effect="plain">{{
                        m.meta.label
                      }}</ElTag>
                      <span v-if="m.meta.latency" class="latency">
                        {{ $t('app.guideResponse', { latency: m.meta.latency }) }}
                      </span>
                      <span v-if="m.meta.sources?.length" class="sources">
                        {{ $t('app.guideSources', { sources: formatSources(m.meta.sources) }) }}
                      </span>
                    </div>
                  </div>
                </div>
              </TransitionGroup>
              <!-- 生成中：三点呼吸指示，比纯文字更有"正在思考"的临场感 -->
              <Transition name="msg">
                <div v-if="asking" class="msg-row assistant">
                  <div class="bubble thinking">
                    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                  </div>
                </div>
              </Transition>
            </ElScrollbar>

            <!-- 快捷问题 -->
            <div class="quick-row">
              <ElButton
                v-for="q in quickQuestions"
                :key="q"
                size="small"
                round
                :disabled="asking"
                @click="ask(q)"
              >
                {{ q }}
              </ElButton>
            </div>

            <!-- 输入区 -->
            <div class="input-row">
              <ElInput
                v-model="input"
                :placeholder="$t('app.guideInputPlaceholder')"
                :disabled="asking"
                @keyup.enter="ask()"
              >
                <template #append>
                  <ElButton :loading="asking" @click="ask()">{{ $t('app.guideSend') }}</ElButton>
                </template>
              </ElInput>
              <ElButton
                class="voice-btn"
                :type="recording ? 'danger' : 'primary'"
                :disabled="asking || !voiceSupported"
                circle
                @click="toggleVoice"
              >
                <ElIcon><Microphone /></ElIcon>
              </ElButton>
              <ElButton
                class="playback-btn"
                :type="playbackPaused ? 'success' : 'warning'"
                circle
                :disabled="clearingHistory || playbackTransitioning"
                :aria-label="playbackButtonText"
                :aria-pressed="playbackPaused"
                :title="playbackButtonText"
                @click="togglePlayback"
              >
                <ElIcon>
                  <VideoPlay v-if="playbackPaused" />
                  <VideoPause v-else />
                </ElIcon>
              </ElButton>
            </div>

            <!-- 仅在产生有效回答后出现，右边缘与发送按钮对齐。 -->
            <Transition name="feedback">
              <div
                v-if="showFeedback"
                class="feedback-row"
                :class="{
                  'is-animating': ratingAnimating,
                  'is-submitted': feedbackSubmitted
                }"
                aria-live="polite"
              >
                <span class="fb-label">{{ $t('app.guideFeedbackPrompt') }}</span>
                <ElRate
                  v-model="rating"
                  size="small"
                  :disabled="feedbackSubmitting || feedbackSubmitted"
                  :aria-label="$t('app.guideFeedbackPrompt')"
                  @change="onRate"
                />
                <span v-if="feedbackSubmitted" class="feedback-done">
                  <ElIcon><CircleCheck /></ElIcon>
                  {{ $t('app.guideRatingSubmitted') }}
                </span>
              </div>
            </Transition>
          </div>
        </ElTabPane>

        <!-- 景点 -->
        <ElTabPane :label="$t('app.guideTabSpots')" name="spots">
          <ElScrollbar class="spots-body" v-loading="spotsLoading">
            <div class="spot-grid stagger-in">
              <ElCard
                v-for="spot in spots"
                :key="spot.id"
                class="spot-card"
                shadow="hover"
                @click="narrate(spot)"
              >
                <p class="spot-name">{{ spot.name }}</p>
                <p class="spot-loc">{{ spot.locationText }}</p>
                <p class="spot-hl">{{ spot.highlights }}</p>
                <ElButton size="small" type="primary" text>{{ $t('app.guideNarrate') }}</ElButton>
              </ElCard>
            </div>
          </ElScrollbar>
        </ElTabPane>

        <!-- 路线 -->
        <ElTabPane :label="$t('app.guideTabRoutes')" name="routes">
          <div class="routes-body">
            <ElForm inline class="route-form">
              <ElFormItem :label="$t('app.guideDuration')">
                <ElSelect v-model="pref.durationMinutes" style="width: 180px">
                  <ElOption :label="$t('app.guideDuration30')" :value="30" />
                  <ElOption :label="$t('app.guideDuration60')" :value="60" />
                  <ElOption :label="$t('app.guideDuration90')" :value="90" />
                  <ElOption :label="$t('app.guideDuration150')" :value="150" />
                  <ElOption :label="$t('app.guideDuration240')" :value="240" />
                  <ElOption :label="$t('app.guideDuration360')" :value="360" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="$t('app.guideInterest')">
                <ElSelect v-model="pref.interests" multiple collapse-tags style="width: 220px">
                  <ElOption :label="$t('app.guideInterestHistory')" value="history" />
                  <ElOption :label="$t('app.guideInterestBuddhist')" value="buddhist" />
                  <ElOption :label="$t('app.guideInterestFamily')" value="parentChild" />
                  <ElOption :label="$t('app.guideInterestPhoto')" value="photo" />
                  <ElOption :label="$t('app.guideInterestShow')" value="show" />
                </ElSelect>
              </ElFormItem>
              <ElButton type="primary" :loading="routeLoading" @click="recommend">
                {{ $t('app.guideGenerateRoute') }}
              </ElButton>
            </ElForm>

            <div v-if="route" class="route-result">
              <h4>
                {{ route.recommendation.name }}（{{
                  $t('app.guideRouteMinutes', { minutes: route.recommendation.durationMinutes })
                }}）
              </h4>
              <p class="route-reason">{{ route.recommendation.explanation }}</p>
              <ElTimeline>
                <ElTimelineItem
                  v-for="node in route.recommendation.nodes"
                  :key="node.id"
                  :timestamp="$t('app.guideRouteMinutes', { minutes: node.minutes })"
                  placement="top"
                >
                  <span class="node-name">{{ node.name }}</span>
                  <ElButton
                    v-if="node.spotId"
                    size="small"
                    text
                    type="primary"
                    @click="narrateNode(node)"
                  >
                    {{ $t('app.guideNarration') }}
                  </ElButton>
                </ElTimelineItem>
              </ElTimeline>
            </div>
          </div>
        </ElTabPane>
      </ElTabs>
      <ElButton
        class="clear-chat-button"
        type="danger"
        text
        :icon="Delete"
        :loading="clearingHistory"
        :disabled="asking || clearingHistory || !messages.length"
        :aria-label="$t('app.guideClearChat')"
        @click="handleClearChatHistory"
      >
        {{ $t('app.guideClearChat') }}
      </ElButton>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { CircleCheck, Delete, Microphone, VideoPause, VideoPlay } from '@element-plus/icons-vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import DigitalHumanAvatar from '@/components/digital-human/DigitalHumanAvatar.vue'
  import { mittBus } from '@/utils/sys'
  import { formatGuideAnswer } from '@/utils/guide-answer'
  import { getDisplayedGuideLatency } from '@/utils/guide-latency'
  import {
    askQuestion,
    clearChatHistory,
    createVisitorSession,
    fetchHistory,
    fetchScenicSpots,
    narrateRouteNode,
    narrateSpot,
    recommendRoute,
    submitFeedback,
    type ChatSource,
    type RouteNode,
    type RouteRecommendResult,
    type ScenicSpot
  } from '@/api/guide'

  defineOptions({ name: 'GuideExperience' })

  const { t, locale } = useI18n()

  interface UiMessage {
    role: 'user' | 'assistant'
    content: string
    meta?: { label?: string; latency?: number; sources?: ChatSource[]; emotion?: string }
  }

  interface SpeechPayload {
    text: string
    emotion: string
  }

  const SESSION_KEY = 'scenic_visitor_session'
  const MASK_LONG_LATENCY = import.meta.env.VITE_MASK_GUIDE_LATENCY === 'true'

  const avatarRef = ref<InstanceType<typeof DigitalHumanAvatar> | null>(null)
  const scrollRef = ref<{ setScrollTop: (n: number) => void; wrapRef?: HTMLElement } | null>(null)

  const sessionId = ref('')
  const activeTab = ref('chat')
  const messages = ref<UiMessage[]>([])
  const input = ref('')
  const asking = ref(false)
  const clearingHistory = ref(false)
  const playbackPaused = ref(false)
  const playbackTransitioning = ref(false)
  const pendingSpeech = ref<SpeechPayload | null>(null)
  const statusTip = ref(t('app.guideConnecting'))
  const lastLabel = ref('')
  // 当前渲染引擎：讯飞（xfyun）云端流按 1080:960 输出，需让展区同比以消除上下墨绿边；
  // Live2D 自适应填充，保持原样。默认按后台主用的 xfyun 处理，避免首次加载时布局跳动。
  const avatarEngine = ref<string>('xfyun')
  const rating = ref(0)
  const feedbackAvailable = ref(false)
  const feedbackSubmitting = ref(false)
  const feedbackSubmitted = ref(false)
  const ratingAnimating = ref(false)
  let ratingAnimationTimer: number | undefined
  let pausedActivePlayback = false

  const showFeedback = computed(() => feedbackAvailable.value && !asking.value)
  const playbackButtonText = computed(() =>
    playbackPaused.value ? t('app.mapGuideResume') : t('app.mapGuidePause')
  )

  const quickQuestions = computed(() => [
    t('app.guideQuickHeight'),
    t('app.guideQuickBath'),
    t('app.guideQuickPalace'),
    t('app.guideQuickHours'),
    t('app.guideQuickRoute')
  ])

  const sourceSeparator = computed(() => (locale.value === 'en' ? ', ' : '、'))

  function formatSources(sources: ChatSource[]) {
    return sources
      .map((source) => source.sectionTitle || source.documentName)
      .filter(Boolean)
      .join(sourceSeparator.value)
  }

  function displayMessage(message: UiMessage) {
    return message.role === 'assistant' ? formatGuideAnswer(message.content) : message.content
  }

  const spots = ref<ScenicSpot[]>([])
  const spotsLoading = ref(false)

  const pref = reactive<{ durationMinutes: number; interests: string[] }>({
    durationMinutes: 150,
    interests: ['history']
  })
  const route = ref<RouteRecommendResult | null>(null)
  const routeLoading = ref(false)

  // ---- 会话初始化 ----
  async function initSession() {
    sessionId.value = localStorage.getItem(SESSION_KEY) || ''
    if (!sessionId.value) {
      try {
        const s = await createVisitorSession()
        sessionId.value = s.id
        localStorage.setItem(SESSION_KEY, s.id)
      } catch {
        sessionId.value = `local_${Date.now()}`
      }
    } else {
      // 恢复历史
      try {
        const history = await fetchHistory(sessionId.value)
        messages.value = (history || []).map((m) => ({ role: m.role, content: m.content }))
        feedbackAvailable.value = messages.value.some((message) => message.role === 'assistant')
        scrollToBottom()
      } catch {
        /* ignore */
      }
    }
  }

  async function handleClearChatHistory() {
    if (!messages.value.length || asking.value || clearingHistory.value) return

    try {
      await ElMessageBox.confirm(t('app.guideClearChatConfirm'), t('app.guideClearChat'), {
        type: 'warning',
        confirmButtonText: t('app.guideClearChat'),
        cancelButtonText: t('app.cancel')
      })
    } catch {
      return
    }

    clearingHistory.value = true
    try {
      await clearChatHistory(sessionId.value)
      await avatarRef.value?.interrupt()
      resetPlaybackState()
      messages.value = []
      input.value = ''
      lastLabel.value = ''
      rating.value = 0
      feedbackAvailable.value = false
      feedbackSubmitted.value = false
      statusTip.value = t('app.guideReady')
      ElMessage.success(t('app.guideClearChatDone'))
    } catch {
      ElMessage.error(t('app.guideClearChatFailed'))
    } finally {
      clearingHistory.value = false
    }
  }

  // ---- 数字人事件 ----
  function onAvatarReady(config: { engine?: string } | null) {
    if (config?.engine) avatarEngine.value = config.engine
    statusTip.value = playbackPaused.value ? t('app.mapGuidePause') : t('app.guideReady')
  }
  function onAvatarError(msg: string) {
    statusTip.value = msg || t('app.guideUnavailable')
  }

  async function playSpeech(text: string, emotion = 'neutral') {
    const payload = { text: formatGuideAnswer(text), emotion }
    if (playbackPaused.value) {
      if (pausedActivePlayback) {
        await avatarRef.value?.interrupt()
        pausedActivePlayback = false
      }
      pendingSpeech.value = payload
      statusTip.value = t('app.mapGuidePause')
      return
    }

    pendingSpeech.value = null
    const started = await avatarRef.value?.speak(payload.text, payload.emotion)
    if (playbackPaused.value) {
      statusTip.value = t('app.mapGuidePause')
      return
    }
    statusTip.value = started ? t('app.guideSpeaking') : t('app.guideReady')
  }

  async function togglePlayback() {
    if (playbackTransitioning.value) return
    playbackTransitioning.value = true
    try {
      if (!playbackPaused.value) {
        playbackPaused.value = true
        pausedActivePlayback = avatarRef.value?.getStatus() === 'speaking'
        if (pausedActivePlayback) await avatarRef.value?.pause()
        statusTip.value = t('app.mapGuidePause')
        return
      }

      playbackPaused.value = false
      const queued = pendingSpeech.value
      pendingSpeech.value = null
      if (queued) {
        pausedActivePlayback = false
        await playSpeech(queued.text, queued.emotion)
        return
      }
      if (pausedActivePlayback) {
        const resumed = (await avatarRef.value?.resume()) as boolean | void
        if (resumed === false) {
          playbackPaused.value = true
          statusTip.value = t('app.mapGuidePause')
          return
        }
        pausedActivePlayback = false
        statusTip.value =
          avatarRef.value?.getStatus() === 'speaking' ? t('app.guideSpeaking') : t('app.guideReady')
        return
      }
      statusTip.value = t('app.guideReady')
    } finally {
      playbackTransitioning.value = false
    }
  }

  function resetPlaybackState() {
    playbackPaused.value = false
    pendingSpeech.value = null
    pausedActivePlayback = false
  }

  // ---- 问答 ----
  async function ask(preset?: string) {
    const question = (preset ?? input.value).trim()
    if (!question || asking.value) return
    // 在用户手势中解锁数字人音频（规避浏览器自动播放限制）
    avatarRef.value?.enableAudio()
    input.value = ''
    rating.value = 0
    feedbackAvailable.value = false
    feedbackSubmitted.value = false
    messages.value.push({ role: 'user', content: question })
    scrollToBottom()
    asking.value = true
    statusTip.value = t('app.guideThinking')
    try {
      const answer = await askQuestion({
        question,
        sessionId: sessionId.value,
        locale: locale.value
      })
      messages.value.push({
        role: 'assistant',
        content: answer.answer,
        meta: {
          label: answer.label,
          latency: getDisplayedGuideLatency(answer.latency?.totalMs, MASK_LONG_LATENCY),
          sources: answer.sources,
          emotion: answer.digitalHuman?.ttsEmotion
        }
      })
      lastLabel.value = answer.label || ''
      feedbackAvailable.value = true
      await playSpeech(answer.answer, answer.digitalHuman?.ttsEmotion || 'neutral')
    } catch {
      messages.value.push({ role: 'assistant', content: t('app.guideServiceError') })
      ElMessage.error(t('app.guideRequestFailed'))
    } finally {
      asking.value = false
      scrollToBottom()
    }
  }

  // ---- 景点讲解 ----
  async function loadSpots() {
    if (spots.value.length) return
    spotsLoading.value = true
    try {
      spots.value = await fetchScenicSpots()
    } catch {
      ElMessage.error(t('app.guideSpotsLoadFailed'))
    } finally {
      spotsLoading.value = false
    }
  }

  async function narrate(spot: ScenicSpot) {
    avatarRef.value?.enableAudio()
    activeTab.value = 'chat'
    messages.value.push({ role: 'user', content: `请讲解 ${spot.name}` })
    scrollToBottom()
    statusTip.value = t('app.guideNarrationPreparing')
    try {
      const res = await narrateSpot({ spotId: spot.id, spotName: spot.name })
      messages.value.push({
        role: 'assistant',
        content: res.narration,
        meta: { label: t('app.guideSpotNarration') }
      })
      rating.value = 0
      feedbackSubmitted.value = false
      feedbackAvailable.value = true
      await playSpeech(res.narration, 'warm')
    } catch {
      ElMessage.error(t('app.guideNarrationFailed'))
    } finally {
      scrollToBottom()
    }
  }

  // ---- 路线 ----
  async function recommend() {
    routeLoading.value = true
    try {
      route.value = await recommendRoute({ ...pref })
    } catch {
      ElMessage.error(t('app.guideRouteFailed'))
    } finally {
      routeLoading.value = false
    }
  }

  async function narrateNode(node: RouteNode) {
    avatarRef.value?.enableAudio()
    activeTab.value = 'chat'
    statusTip.value = t('app.guideNodeSpeaking')
    try {
      const res = await narrateRouteNode({
        nodeId: node.id,
        spotId: node.spotId || undefined,
        spotName: node.name
      })
      messages.value.push({
        role: 'assistant',
        content: res.narration,
        meta: { label: t('app.guideRouteNarration') }
      })
      rating.value = 0
      feedbackSubmitted.value = false
      feedbackAvailable.value = true
      await playSpeech(res.narration, 'warm')
      scrollToBottom()
    } catch {
      ElMessage.error(t('app.guideNodeFailed'))
    }
  }

  // ---- 反馈 ----
  async function onRate(value: number) {
    if (!value || feedbackSubmitting.value || feedbackSubmitted.value) return
    ratingAnimating.value = true
    if (value >= 3) mittBus.emit('triggerFireworks')
    if (ratingAnimationTimer) window.clearTimeout(ratingAnimationTimer)
    ratingAnimationTimer = window.setTimeout(() => {
      ratingAnimating.value = false
      ratingAnimationTimer = undefined
    }, 320)

    feedbackSubmitting.value = true
    try {
      await submitFeedback({
        sessionId: sessionId.value,
        rating: value,
        vote: value >= 4 ? 'up' : value <= 2 ? 'down' : undefined,
        emotion: value >= 4 ? '开心' : value <= 2 ? '失望' : '平静'
      })
      feedbackSubmitted.value = true
      ElMessage.success(t('app.guideRatingSubmitted'))
    } catch {
      rating.value = 0
      ElMessage.warning(t('app.guideFeedbackFailed'))
    } finally {
      feedbackSubmitting.value = false
    }
  }

  // ---- 语音输入（浏览器 Web Speech API）----
  const recording = ref(false)
  const voiceSupported = ref(false)
  let recognition: any = null

  function setupVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    voiceSupported.value = true
    recognition = new SR()
    recognition.lang = speechRecognitionLanguages[locale.value] || 'zh-CN'
    recognition.interimResults = false
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript
      if (transcript) ask(transcript)
    }
    recognition.onend = () => (recording.value = false)
    recognition.onerror = () => {
      recording.value = false
      ElMessage.warning(t('app.guideVoiceFailed'))
    }
  }
  function toggleVoice() {
    if (!recognition) return
    if (recording.value) {
      recognition.stop()
      recording.value = false
    } else {
      try {
        recognition.start()
        recording.value = true
      } catch {
        recording.value = false
      }
    }
  }

  function scrollToBottom() {
    nextTick(() => {
      const wrap = scrollRef.value?.wrapRef
      if (wrap) scrollRef.value?.setScrollTop(wrap.scrollHeight)
    })
  }

  const speechRecognitionLanguages: Record<string, string> = {
    zh: 'zh-CN',
    en: 'en-US',
    ko: 'ko-KR',
    'zh-TW': 'zh-TW',
    ja: 'ja-JP',
    th: 'th-TH'
  }

  watch(locale, (language) => {
    statusTip.value = playbackPaused.value ? t('app.mapGuidePause') : t('app.guideReady')
    if (recognition) recognition.lang = speechRecognitionLanguages[language] || 'zh-CN'
  })

  // ---- tab 懒加载 ----
  watch(activeTab, (tab) => {
    if (tab === 'spots') loadSpots()
  })

  onMounted(() => {
    initSession()
    setupVoice()
  })

  onBeforeUnmount(() => {
    if (ratingAnimationTimer) window.clearTimeout(ratingAnimationTimer)
    void avatarRef.value?.interrupt()
    resetPlaybackState()
  })
</script>

<style scoped lang="scss">
  .guide-page {
    display: flex;
    gap: 16px;
    height: calc(100vh - 130px);
    padding: 12px;
  }

  .dh-column {
    display: flex;
    flex: 0 0 42%;
    flex-direction: column;
    justify-content: center;
    max-width: 520px;
  }

  .dh-box {
    position: relative;
    flex: 1;
    min-height: 0;
    border-radius: 12px;
    transition: box-shadow 0.4s ease;
  }

  // 讯飞数字人云端按 1080:960 输出，展区同比即可让画面铺满、消除上下墨绿边；
  // 竖向留白交给列的 justify-content: center 垂直居中。
  .dh-box.is-avatar-fixed {
    flex: 0 0 auto;
    width: 100%;
    aspect-ratio: 1080 / 960;
  }

  // 生成回答时，数字人展区透出柔和的金色呼吸光晕，暗示"正在准备讲解"
  @media (prefers-reduced-motion: no-preference) {
    .dh-box.is-active {
      animation: dh-breathe 1.8s ease-in-out infinite;
    }

    @keyframes dh-breathe {
      0%,
      100% {
        box-shadow: 0 0 0 0 rgb(212 175 55 / 0%);
      }

      50% {
        box-shadow: 0 0 22px 2px rgb(212 175 55 / 35%);
      }
    }
  }

  .dh-caption {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 4px 0;
  }

  .dh-tip {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .panel-column {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .guide-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;

    :deep(.el-tabs__nav-wrap) {
      margin-right: 148px;
    }

    :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
    }

    :deep(.el-tab-pane) {
      height: 100%;
    }
  }

  .clear-chat-button {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    height: 40px;
  }

  .chat-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-body {
    flex: 1;
    min-height: 0;
    padding: 8px;
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
  }

  .chat-empty {
    padding-top: 40px;
  }

  .msg-row {
    display: flex;
    margin-bottom: 12px;

    &.user {
      justify-content: flex-end;
    }
  }

  .bubble {
    max-width: 78%;
    padding: 9px 12px;
    background: var(--el-bg-color);
    border-radius: 10px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
  }

  .msg-row.user .bubble {
    color: #fff;
    background: var(--el-color-primary);
  }

  .bubble-text {
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .bubble-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .quick-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 0 6px;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: center;

    :deep(.el-input) {
      flex: 1;
      min-width: 0;
    }
  }

  .playback-btn {
    flex: 0 0 auto;
  }

  .feedback-row {
    display: flex;
    gap: 6px;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    min-height: 28px;
    margin: 6px 48px 0 auto;
    padding: 3px 8px;
    border: 1px solid rgb(122 103 70 / 14%);
    border-radius: 999px;
    background: rgb(255 255 255 / 88%);
    box-shadow: 0 2px 8px rgb(63 52 34 / 7%);
    backdrop-filter: blur(4px);
    font-size: 12px;

    :deep(.el-rate) {
      height: 20px;
    }

    :deep(.el-rate__item) {
      transition: transform 150ms ease-out;
    }

    :deep(.el-rate__item:hover) {
      transform: translateY(-1px) scale(1.08);
    }

    &.is-animating :deep(.el-rate__icon.is-active) {
      animation: rating-pop 300ms ease-out;
    }
  }

  .fb-label {
    color: var(--el-text-color-regular);
    font-weight: 500;
    white-space: nowrap;
  }

  .feedback-done {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    color: var(--el-color-success);
    white-space: nowrap;
  }

  .feedback-enter-active,
  .feedback-leave-active {
    transition:
      opacity 180ms ease-out,
      transform 180ms ease-out;
  }

  .feedback-enter-from,
  .feedback-leave-to {
    opacity: 0;
    transform: translateY(6px);
  }

  @keyframes rating-pop {
    0% {
      transform: scale(0.92);
    }

    60% {
      transform: scale(1.16);
    }

    100% {
      transform: scale(1);
    }
  }

  .spots-body,
  .routes-body {
    height: 100%;
  }

  .spot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    padding: 4px;
  }

  .spot-card {
    cursor: pointer;
  }

  .spot-name {
    font-size: 15px;
    font-weight: 600;
  }

  .spot-loc,
  .spot-hl {
    margin-top: 4px;
    overflow: hidden;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .route-result {
    padding: 12px 4px;
  }

  .route-reason {
    margin: 8px 0 14px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }

  .node-name {
    margin-right: 8px;
    font-weight: 500;
  }

  // —— 消息气泡进场：用户消息从右侧、AI 消息从左侧轻推浮现 ——
  @media (prefers-reduced-motion: no-preference) {
    .msg-enter-active {
      transition:
        opacity 0.32s ease,
        transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .msg-enter-from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }

    .msg-row.user.msg-enter-from {
      transform: translateY(6px) translateX(12px);
    }

    .msg-row.assistant.msg-enter-from {
      transform: translateY(6px) translateX(-12px);
    }

    // 气泡悬停轻微抬起，暗示可交互/可读性
    .bubble {
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }

    .msg-row:hover .bubble {
      box-shadow: 0 3px 10px rgb(0 0 0 / 10%);
    }
  }

  // —— "正在思考"三点动画 ——
  .bubble.thinking {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    padding: 12px 14px;
  }

  .bubble.thinking .dot {
    width: 7px;
    height: 7px;
    background: var(--el-color-primary);
    border-radius: 50%;
    opacity: 0.5;
    animation: think-bounce 1.2s infinite ease-in-out;
  }

  .bubble.thinking .dot:nth-child(2) {
    animation-delay: 0.16s;
  }

  .bubble.thinking .dot:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes think-bounce {
    0%,
    80%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }

    40% {
      opacity: 1;
      transform: translateY(-5px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble.thinking .dot {
      animation: none;
    }
  }

  // —— 景点卡片：悬停时左侧透出金色文化色条，呼应灵山主题 ——
  .spot-card {
    position: relative;
    overflow: hidden;

    &::before {
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: linear-gradient(180deg, #d4af37, #1c6b6b);
      content: '';
      opacity: 0;
      transition: opacity 0.25s ease;
    }

    &:hover::before {
      opacity: 1;
    }
  }

  // 快捷问题按钮：悬停时描边点亮
  .quick-row .el-button {
    transition:
      transform 0.18s ease,
      border-color 0.2s ease,
      color 0.2s ease;
  }

  @media (max-width: 900px) {
    .guide-page {
      flex-direction: column;
      height: auto;
    }

    .dh-column {
      flex: none;
      max-width: none;
      height: 46vh;
    }

    .feedback-row {
      margin-right: 48px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .feedback-enter-active,
    .feedback-leave-active,
    .feedback-row :deep(.el-rate__item) {
      transition: none;
    }

    .feedback-row.is-animating :deep(.el-rate__icon.is-active) {
      animation: none;
    }
  }
</style>
