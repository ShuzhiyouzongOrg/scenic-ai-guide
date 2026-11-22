/**
 * @fileoverview 讯飞 Web 数字人页面控制器，负责短期会话启动、问答、播报队列、自动重连和宿主通信。
 * @description 负责短期会话启动、智能问答、播报队列、错误恢复、自动重连和宿主通信。
 */

/**
 * @typedef {object} QueuedSpeech
 * @description 等待发送给讯飞 SDK 的单条播报任务。
 * @property {number} id 递增播报序号。
 * @property {string} text 待播报文本。
 */

/**
 * @typedef {object} AvatarBootstrap
 * @description 后端签发的数字人启动配置和问答端点。
 * @property {{visitorSessionId: string}} session 游客会话信息。
 * @property {{name?: string, welcomeText?: string}} digitalHuman 数字人展示信息。
 * @property {object} apiInfo 讯飞 SDK 鉴权与服务参数。
 * @property {object} globalParams 讯飞 SDK 全局启动参数。
 * @property {{ask: string}} endpoints 受控问答接口地址。
 */

/**
 * @typedef {Record<string, *>} HostPacket
 * @description 页面向宿主 WebView 发送的状态消息。
 * @property {string} source 固定消息来源标识。
 * @property {number} version 消息协议版本。
 * @property {string} type 事件类型。
 * @property {string} state 当前运行状态。
 * @property {number} timestamp 事件 Unix 毫秒时间戳。
 */
import AvatarPlatform, {
  PlayerEvents,
  SDKEvents
} from "./sdk/index.js";
import { XRTCPlayer } from "./sdk/xrtc-player-BDn4MFE-.js";

/**
 * @description 预加载播放器模块。供应商 SDK 在会话启动后也会动态加载它；显式引用可让 WebView 模块错误在首屏暴露。
 * @type {typeof XRTCPlayer}
 */
void XRTCPlayer;

/**
 * @description 当前页面查询参数。
 * @type {URLSearchParams}
 */
const { text: t, locale } = window.scenicStage;
const runtimeQuery = new URLSearchParams(window.location.search);
/**
 * @description 页面是否运行在应用 WebView 中。
 * @type {boolean}
 */
const embedMode = runtimeQuery.get("embed") === "1";
/**
 * @description 嵌入页面是否应自动启动数字人。
 * @type {boolean}
 */
const autoStart = embedMode && runtimeQuery.get("autostart") === "1";
/**
 * @description 嵌入宿主替换 WebView 时可关闭自动欢迎语，避免新会话在旧会话销毁期间同时播报。
 * @type {boolean}
 */
const playWelcome = runtimeQuery.get("welcome") !== "0";
/**
 * @description 后端签发的短期 Web 数字人会话令牌。
 * @type {string}
 */
const sessionToken = runtimeQuery.get("session") || "";
/**
 * @description 自动重连最大次数。
 * @type {number}
 */
const MAX_AUTO_RETRIES = 3;
/**
 * @description 指数退避的基础延迟毫秒数。
 * @type {number}
 */
const RETRY_BASE_DELAY_MS = 900;
/**
 * @description 连接保持稳定后重置重试计数的毫秒数。
 * @type {number}
 */
const STABLE_CONNECTION_MS = 30_000;
/**
 * @description 官方 uni-app WebView 消息桥脚本地址。
 * @type {string}
 */
const UNI_WEBVIEW_BRIDGE_URL = "https://js.cdn.aliyun.dcloud.net.cn/dev/uni-app/uni.webview.1.5.6.js";
if (embedMode) document.body.classList.add("embed-mode");

/**
 * @description 页面交互和状态展示元素。
 * @type {Record<string, HTMLElement>}
 */
const elements = {
  stage: document.querySelector("#avatar-stage"),
  placeholder: document.querySelector("#stage-placeholder"),
  guideName: document.querySelector("#guide-name"),
  status: document.querySelector("#status-text"),
  welcome: document.querySelector("#welcome-text"),
  start: document.querySelector("#start-button"),
  audio: document.querySelector("#audio-button"),
  interrupt: document.querySelector("#interrupt-button"),
  form: document.querySelector("#question-form"),
  input: document.querySelector("#question-input"),
  ask: document.querySelector("#ask-button"),
  answer: document.querySelector("#answer-text")
};

/**
 * @description 当前后端启动配置。
 * @type {AvatarBootstrap|null}
 */
let bootstrap = null;
/**
 * @description 当前讯飞 SDK 实例。
 * @type {AvatarPlatform|null}
 */
let platform = null;
/**
 * @description SDK 是否可接受播报。
 * @type {boolean}
 */
let ready = false;
/**
 * @description SDK 是否正在启动。
 * @type {boolean}
 */
let starting = false;
/**
 * @description 启动配置是否正在加载。
 * @type {boolean}
 */
let bootstrapLoading = false;
/**
 * @description 页面资源是否已销毁。
 * @type {boolean}
 */
let disposed = false;
/**
 * @description 当前恢复周期已执行的重连次数。
 * @type {number}
 */
let retryCount = 0;
/**
 * @description 自动重连定时器 ID。
 * @type {number|null}
 */
let retryTimer = null;
/**
 * @description 稳定连接判定定时器 ID。
 * @type {number|null}
 */
let stableConnectionTimer = null;
/**
 * @description 播报完成兜底定时器 ID。
 * @type {number|null}
 */
let speechCompletionTimer = null;
/**
 * @description 当前恢复周期是否已耗尽自动重连。
 * @type {boolean}
 */
let recoveryExhausted = false;
/**
 * @description 播报项递增序号。
 * @type {number}
 */
let speechSequence = 0;
/**
 * @description 是否正在向 SDK 写入播报文本。
 * @type {boolean}
 */
let speechWriteInFlight = false;
/**
 * @description 等待发送给 SDK 的播报队列。
 * @type {QueuedSpeech[]}
 */
let pendingExternalSpeech = [];
/**
 * @description 已发给 SDK 且尚未完成的播报。
 * @type {QueuedSpeech|null}
 */
let activeSpeech = null;
let interruptPending = null;
/**
 * @description 欢迎语是否已入队，防止重连重复播报。
 * @type {boolean}
 */
let welcomeQueued = false;
/**
 * @description 向宿主报告的运行时状态。
 * @type {string}
 */
let runtimeState = "loading";
/**
 * @description uni-app WebView 桥脚本是否正在加载。
 * @type {boolean}
 */
let hostBridgeLoading = false;
/**
 * @description 等待 uni-app 桥就绪后发送的宿主消息。
 * @type {HostPacket[]}
 */
const pendingHostMessages = [];

// The controlled page is served by our API rather than bundled in the app, so
// load the official uni web-view bridge only in embedded mode. Messages stay in
// memory until the bridge becomes available; parent.postMessage is also sent as
// a browser/H5 fallback.
if (embedMode) {
  ensureHostBridge();
  notifyHost("page-loaded", { ready: false });
}

/**
 * @description 接收 uni-app x `WebViewContext.evalJS` 传入的有限长度文本，并可靠加入播报队列。
 * 不暴露平台实例或凭据；返回 `true` 仅表示已接收，不表示已经播报。
 * @param {*} value 宿主传入的播报文本。
 * @returns {boolean} 文本合法并已接收时为 `true`。
 * @example
 * window.scenicAvatarSpeak("欢迎来到灵山胜境");
 */
window.scenicAvatarSpeak = (value, requestId = 0) => {
  const text = normalizeExternalSpeech(value);
  if (!text) return false;
  queueSpeech(text, { requestId });
  if (!ready || !platform) {
    elements.answer.textContent = text;
    setStatus("回答已收到，数字人就绪后将自动播报");
    ensureRecoveryForQueuedSpeech();
  } else {
    void flushPendingSpeech();
  }
  // true means the bounded text was accepted by the child page, not that the
  // SDK has already spoken it. The queue is the delivery acknowledgement.
  return true;
};

/**
 * @description 清空待播报内容并尽力中断当前播放器和讯飞会话播报。
 * @returns {boolean} 存在活动平台且已发起中断时为 `true`。
 * @example
 * window.scenicAvatarInterrupt();
 */
window.scenicAvatarInterrupt = () => {
  const requestId = activeSpeech?.requestId ?? 0;
  pendingExternalSpeech.length = 0;
  activeSpeech = null;
  clearSpeechCompletionTimer();
  const activePlatform = platform;
  if (!activePlatform) return false;
  try {
    activePlatform.player?.stop?.();
    activePlatform.stop?.();
  } catch {
    // The SDK may have already closed the player; still send the interrupt.
  }
  let interruptPromise;
  try {
    interruptPromise = activePlatform.interrupt();
  } catch {
    interruptPromise = Promise.resolve();
  }
  const gate = Promise.resolve(interruptPromise).catch(() => {});
  interruptPending = gate;
  void gate.finally(() => {
    if (gate !== interruptPending) return;
    interruptPending = null;
    setRuntimeState("ready");
    setStatus("播报已停止");
    notifyHost("idle", { reason: "interrupted", requestId });
    void flushPendingSpeech();
  });
  return true;
};

/**
 * @description 在宿主移除页面前同步停用状态并尽力释放播放器、会话和定时器。
 * 同时调用异步中断、播放器停止与销毁，避免新旧云端会话同时播报。
 * @returns {boolean} 首次销毁为 `true`，重复调用为 `false`。
 * @example
 * window.scenicAvatarDispose();
 */
window.scenicAvatarDispose = () => {
  if (disposed) return false;
  disposed = true;
  cancelRetryTimer();
  clearStableConnectionTimer();
  clearSpeechCompletionTimer();
  pendingExternalSpeech.length = 0;
  activeSpeech = null;
  speechWriteInFlight = false;
  ready = false;
  starting = false;
  const activePlatform = platform;
  platform = null;
  try {
    const interruptResult = activePlatform?.interrupt?.();
    Promise.resolve(interruptResult).catch(() => {});
  } catch {
    // Best-effort interruption; destroy below still tears down the stream.
  }
  try {
    activePlatform?.player?.stop?.();
    activePlatform?.stop?.();
  } catch {
    // The player may already have been closed by the SDK.
  }
  try {
    activePlatform?.destroy?.();
  } catch {
    // The WebView is going away; there is no recovery action to take here.
  }
  document.body.classList.remove("avatar-stream-ready");
  setRuntimeState("disposed");
  notifyHost("disposed", { reason: "host-dispose" });
  return true;
};

/**
 * @description 向宿主报告当前运行状态、启动状态和排队数量。
 * @returns {string} 当前运行时状态。
 * @example
 * const state = window.scenicAvatarPing();
 */
window.scenicAvatarPing = () => {
  notifyHost("runtime-state", {
    state: runtimeState,
    ready,
    starting,
    queuedSpeech: pendingExternalSpeech.length
  });
  return runtimeState;
};

void loadBootstrap();

elements.start.addEventListener("click", () => {
  if (ready || starting || bootstrapLoading) return;
  beginRecoveryCycle();
  void restartAvatar();
});

elements.audio.addEventListener("click", () => {
  const player = platform?.player;
  if (!player) return;
  try {
    player.muted = false;
    player.volume = 1;
    void player.resume?.().then(() => {
      elements.audio.hidden = true;
      setStatus("声音已启用，可以开始提问");
    });
  } catch {
    setStatus("请再次点击启用声音");
  }
});

elements.interrupt.addEventListener("click", () => {
  window.scenicAvatarInterrupt();
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = String(elements.input.value || "").trim();
  if (!ready || !question) return;
  void askGuide(question);
});

/**
 * @description 使用页面会话令牌加载启动数据、清理地址栏并按配置自动启动。
 * 错误会在页面内展示或进入自动恢复流程。
 * @returns {Promise<void>}
 */
async function loadBootstrap() {
  if (!sessionToken) {
    showFatal("安全会话不存在，请返回应用重新打开数字人。");
    return;
  }
  bootstrapLoading = true;
  try {
    bootstrap = await fetchBootstrap();
    history.replaceState(null, "", "/digital-human/");
    applyBootstrap(bootstrap);
    elements.start.disabled = false;
    setRuntimeState(autoStart ? "starting" : "waiting");
    setStatus(autoStart ? "安全会话已就绪，正在自动启动" : "安全会话已就绪，请点击启动");
    if (autoStart || pendingExternalSpeech.length > 0) await startAvatar(bootstrap);
  } catch (error) {
    if (autoStart || pendingExternalSpeech.length > 0) handleRuntimeFailure(error);
    else showFatal(normalizeError(error));
  } finally {
    bootstrapLoading = false;
  }
}

/**
 * @description 从同源后端读取当前短期会话的数字人启动数据。
 * @returns {Promise<AvatarBootstrap>} 启动配置。
 * @throws {Error} HTTP 或业务响应失败时抛出带后端说明的异常。
 */
async function fetchBootstrap() {
  const response = await fetch(
    `/api/digital-human/web/bootstrap?session=${encodeURIComponent(sessionToken)}`,
    { cache: "no-store", credentials: "same-origin" }
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const code = payload?.error?.code;
    if (code === "DIGITAL_HUMAN_SESSION_INVALID" || code === "DIGITAL_HUMAN_SESSION_EXPIRED") {
      throw new Error(t("会话已失效，请从应用重新打开导游。"));
    }
    throw new Error(t("此导游暂时无法连接，请返回应用重试。"));
  }
  return payload.data;
}

/**
 * @description 将启动配置中的导游名称和欢迎语写入页面。
 * @param {AvatarBootstrap} options 启动配置。
 * @returns {void}
 */
function applyBootstrap(options) {
  elements.guideName.textContent = options.digitalHuman.name || t("灵山 AI 导游");
  elements.welcome.textContent = options.digitalHuman.welcomeText
    || t("点击启动后，可以询问景点、路线和服务信息。");
}

/**
 * @description 获取新的短期讯飞签名并重新启动数字人。
 * 失败时进入统一恢复流程。
 * @returns {Promise<void>}
 */
async function restartAvatar() {
  if (disposed || starting || bootstrapLoading) return;
  cancelRetryTimer();
  bootstrapLoading = true;
  try {
    // A new bootstrap produces a fresh short-lived signed WebSocket URL while
    // keeping the original opaque web-session token only in this child page.
    bootstrap = await fetchBootstrap();
    applyBootstrap(bootstrap);
    await startAvatar(bootstrap);
  } catch (error) {
    handleRuntimeFailure(error);
  } finally {
    bootstrapLoading = false;
  }
}

/**
 * @description 创建讯飞 SDK 实例、绑定生命周期事件、连接动态形象并处理自动欢迎语。
 * @param {AvatarBootstrap} options 启动配置。
 * @returns {Promise<void>}
 */
async function startAvatar(options) {
  if (disposed || starting || ready) return;
  starting = true;
  setRuntimeState("starting");
  notifyHost("starting");
  elements.start.disabled = true;
  elements.start.textContent = t("正在连接讯飞数字人…");
  setStatus("正在建立云端动态形象连接…");

  // Use the SDK's inline XRTC path. The explicit player import above preloads
  // the vendor module before the avatar session starts, which is required by
  // constrained WebView module loaders.
  const instance = new AvatarPlatform({ useInlinePlayer: true });
  platform = instance;
  instance.setApiInfo(options.apiInfo);
  instance.setGlobalParams(options.globalParams);

  instance.on(SDKEvents.connected, () => {
    if (platform !== instance) return;
    setRuntimeState("connected");
    notifyHost("connected");
    setStatus("数字人已连接，正在加载动态画面…");
  });
  instance.on(SDKEvents.stream_start, () => {
    if (platform !== instance) return;
    document.body.classList.add("avatar-stream-ready");
    setRuntimeState("ready");
    elements.placeholder.classList.add("is-hidden");
    setStatus("动态形象已上线");
    notifyHost("ready", { streamReady: true });
  });
  instance.on(SDKEvents.frame_start, () => {
    if (platform !== instance || interruptPending || !activeSpeech) return;
    activeSpeech.started = true;
    setRuntimeState("speaking");
    setStatus("数字人正在回答");
    notifyHost("speaking", { speechId: activeSpeech.id, requestId: activeSpeech.requestId });
  });
  instance.on(SDKEvents.frame_stop, () => {
    if (platform !== instance || interruptPending || !activeSpeech?.started) return;
    const requestId = activeSpeech.requestId;
    activeSpeech = null;
    clearSpeechCompletionTimer();
    setRuntimeState("ready");
    setStatus("数字人在线，随时为你服务");
    notifyHost("idle", { requestId });
    if (!speechWriteInFlight) void flushPendingSpeech();
  });
  instance.on(SDKEvents.subtitle_info, (payload) => {
    if (platform !== instance) return;
    const text = payload?.text || payload?.content || payload?.data?.text || payload?.data?.content;
    if (typeof text !== "string" || !text) return;
    elements.answer.textContent = text;
    if (!activeSpeech || interruptPending) return;
    const start = activeSpeech.text.indexOf(text);
    if (start >= 0) notifyHost("subtitle", { requestId: activeSpeech.requestId, start, length: text.length });
  });
  instance.on(SDKEvents.error, (error) => handleRuntimeFailure(error, instance));
  instance.on(SDKEvents.disconnected, (error) => {
    handleRuntimeFailure(error || new Error("数字人连接已中断"), instance);
  });

  try {
    await instance.start({ wrapper: elements.stage });
    if (disposed || platform !== instance) return;
    ready = true;
    starting = false;
    recoveryExhausted = false;
    setRuntimeState("ready");
    setControls(true);
    elements.start.hidden = true;
    // SDK readiness and first decoded stream frame are separate milestones.
    // This early ready signal lets the host safely enqueue speech; stream_start
    // will emit another ready event once the visible avatar is online.
    notifyHost("ready", { streamReady: false });
    scheduleStableConnectionReset(instance);
    const player = instance.player;
    if (player) {
      player.on?.(PlayerEvents.playNotAllowed, () => {
        elements.audio.hidden = false;
        setStatus("请点击“启用声音”完成浏览器授权");
      });
      try {
        player.muted = false;
        player.volume = 1;
        await player.resume?.();
      } catch {
        elements.audio.hidden = false;
      }
    }
    if (pendingExternalSpeech.length > 0) void flushPendingSpeech();
    else if (playWelcome && !welcomeQueued) {
      const welcome = String(options.digitalHuman.welcomeText || "").trim();
      welcomeQueued = true;
      if (welcome) {
        queueSpeech(welcome);
        void flushPendingSpeech();
      }
    }
  } catch (error) {
    handleRuntimeFailure(error, instance);
  }
}

/**
 * @description 调用后端问答端点，并将成功回答加入数字人播报队列。
 * 失败时在页面内显示错误，不向调用方抛出。
 * @param {string} question 用户问题。
 * @returns {Promise<void>}
 */
async function askGuide(question) {
  elements.ask.disabled = true;
  elements.input.disabled = true;
  elements.answer.textContent = t("AI 导游正在查找景区知识…");
  setStatus("正在思考你的问题…");
  try {
    const response = await fetch(bootstrap.endpoints.ask, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        question,
        sessionId: bootstrap.session.visitorSessionId,
        mode: "hybrid",
        locale
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload?.error?.message || t("AI 导游回答失败"));
    }
    const answer = String(payload?.data?.answer || t("暂时没有找到合适的回答。")).trim();
    speakAvatarText(answer);
    elements.input.value = "";
  } catch (error) {
    elements.answer.textContent = normalizeError(error);
    setStatus("回答失败，请稍后重试");
  } finally {
    setControls(ready);
    if (ready) elements.input.focus();
  }
}

/**
 * @description 规范化并排队播报文本；数字人未就绪时触发恢复。
 * @param {*} text 回答文本。
 * @returns {boolean} 已就绪并开始冲刷队列时为 `true`；仅排队或文本无效时为 `false`。
 */
function speakAvatarText(text) {
  const normalized = normalizeExternalSpeech(text);
  if (!normalized) return false;
  queueSpeech(normalized);
  if (!ready || !platform) {
    ensureRecoveryForQueuedSpeech();
    return false;
  }
  void flushPendingSpeech();
  return true;
}

/**
 * @description 将播报插入队首或队尾，并对当前及等待中的相同文本去重。
 * @param {string} text 已规范化播报文本。
 * @param {{front?: boolean}} [options={}] 入队选项。
 * @returns {QueuedSpeech} 新建或已存在的播报项。
 */
function queueSpeech(text, { front = false, requestId = 0 } = {}) {
  // A host may deliver the same evalJS call twice while a WebView is being
  // replaced. Do not enqueue an identical utterance when it is already active
  // or waiting; this is also safe for repeated welcome retries.
  const duplicate = pendingExternalSpeech.find((item) => item.text === text && item.requestId === requestId) ||
    (activeSpeech?.text === text && activeSpeech.requestId === requestId ? activeSpeech : null);
  if (duplicate) {
    elements.answer.textContent = text;
    return duplicate;
  }
  const speech = { id: ++speechSequence, text, requestId, started: false };
  if (front) pendingExternalSpeech.unshift(speech);
  else pendingExternalSpeech.push(speech);
  elements.answer.textContent = text;
  notifyHost("speech-accepted", { speechId: speech.id, requestId });
  return speech;
}

/**
 * @description 将队首文本写入讯飞 SDK；同一时间仅允许一个写入和一个活动播报。
 * @returns {Promise<boolean>} 成功派发时为 `true`，条件不满足或调用失败时为 `false`。
 */
async function flushPendingSpeech() {
  if (!ready || !platform || speechWriteInFlight || interruptPending || activeSpeech || pendingExternalSpeech.length === 0) {
    return false;
  }
  const instance = platform;
  const speech = pendingExternalSpeech.shift();
  activeSpeech = speech;
  speechWriteInFlight = true;
  setRuntimeState("ready");
  elements.answer.textContent = speech.text;
  setStatus("数字人正在为你讲解");
  try {
    await instance.writeText(speech.text, {
      nlp: false,
      tts: { volume: 100 },
      avatar_dispatch: { interactive_mode: 1 }
    });
    if (platform === instance && activeSpeech?.id === speech.id) {
      scheduleSpeechCompletionFallback(instance, speech);
    }
    notifyHost("speech-dispatched", { speechId: speech.id, requestId: speech.requestId });
    return true;
  } catch (error) {
    if (platform === instance) handleRuntimeFailure(error, instance);
    return false;
  } finally {
    if (platform === instance) {
      speechWriteInFlight = false;
      if (!activeSpeech) void flushPendingSpeech();
    }
  }
}

/**
 * @description 只接受字符串，移除控制字符并限制为 1200 字符。
 * @param {*} value 外部播报输入。
 * @returns {string} 安全播报文本；类型不符时为空字符串。
 */
function normalizeExternalSpeech(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1200);
}

/**
 * @description 统一启用或禁用问题输入、提问和中断控件。
 * @param {boolean} enabled 是否启用。
 * @returns {void}
 */
function setControls(enabled) {
  elements.input.disabled = !enabled;
  elements.ask.disabled = !enabled;
  elements.interrupt.disabled = !enabled;
}

/**
 * @description 更新页面状态文本。
 * @param {string} message 状态说明。
 * @returns {void}
 */
function setStatus(message) {
  elements.status.textContent = t(message);
}

/**
 * @description 切换到不可自动恢复的致命状态并通知宿主。
 * @param {string} message 错误说明。
 * @returns {void}
 */
function showFatal(message) {
  cancelRetryTimer();
  setRuntimeState("fatal");
  setStatus(message);
  elements.start.disabled = true;
  elements.answer.textContent = t(message);
  notifyHost("fatal", { message });
}

/**
 * @description 处理 SDK 启动或运行故障，回收失效实例、保留未完成播报并安排重连。
 * @param {*} error 原始错误。
 * @param {AvatarPlatform|null} [failedInstance=null] 触发故障的实例；过期实例错误会被忽略。
 * @returns {void}
 */
function handleRuntimeFailure(error, failedInstance = null) {
  if (disposed || (failedInstance && platform !== failedInstance)) return;
  if (activeSpeech) {
    pendingExternalSpeech.unshift(activeSpeech);
    activeSpeech = null;
  }
  clearSpeechCompletionTimer();
  ready = false;
  starting = false;
  speechWriteInFlight = false;
  setRuntimeState("disconnected");
  setControls(false);
  const failedPlatform = platform;
  platform = null;
  try {
    failedPlatform?.destroy();
  } catch {
    // Runtime recovery is best-effort; the retry control must remain usable.
  }
  document.body.classList.remove("avatar-stream-ready");
  elements.placeholder.classList.remove("is-hidden");
  elements.audio.hidden = true;
  elements.start.hidden = false;
  elements.start.disabled = true;
  const message = normalizeError(error);
  elements.answer.textContent = pendingExternalSpeech[0]?.text || message;
  scheduleAutoRetry(message);
}

/**
 * @description 以指数退避安排最多三次自动重连，耗尽后开放人工重启按钮。
 * @param {string} message 故障说明。
 * @returns {void}
 */
function scheduleAutoRetry(message) {
  if (disposed || retryTimer) return;
  if (!sessionToken || retryCount >= MAX_AUTO_RETRIES) {
    recoveryExhausted = true;
    elements.start.disabled = false;
    elements.start.textContent = t("重新启动动态数字人");
    setStatus(message + " · " + t("自动重连已暂停，请点击重新启动"));
    notifyHost("error", { message, retrying: false, exhausted: true });
    return;
  }
  const attempt = ++retryCount;
  const delay = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
  elements.start.disabled = true;
  elements.start.textContent = `${t("自动重连")} ${attempt}/${MAX_AUTO_RETRIES}`;
  setStatus(message + " · " + t("{seconds} 秒后自动重连").replace("{seconds}", String(Math.ceil(delay / 1000))) + ` (${attempt}/${MAX_AUTO_RETRIES})`);
  notifyHost("disconnected", {
    message,
    retrying: true,
    attempt,
    maxAttempts: MAX_AUTO_RETRIES,
    retryDelay: delay
  });
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void restartAvatar();
  }, delay);
}

/**
 * @description 当存在待播报内容且运行时空闲时启动或重启数字人。
 * @returns {void}
 */
function ensureRecoveryForQueuedSpeech() {
  if (disposed || ready || starting || bootstrapLoading || retryTimer) return;
  if (recoveryExhausted) beginRecoveryCycle();
  if (sessionToken) void restartAvatar();
}

/**
 * @description 重置重试计数和恢复耗尽状态，开始新的人工或自动恢复周期。
 * @returns {void}
 */
function beginRecoveryCycle() {
  cancelRetryTimer();
  clearStableConnectionTimer();
  retryCount = 0;
  recoveryExhausted = false;
}

/**
 * @description 连接稳定 30 秒后清零恢复计数；实例被替换时不执行。
 * @param {AvatarPlatform} instance 当前 SDK 实例。
 * @returns {void}
 */
function scheduleStableConnectionReset(instance) {
  clearStableConnectionTimer();
  stableConnectionTimer = window.setTimeout(() => {
    stableConnectionTimer = null;
    if (platform === instance && ready) {
      retryCount = 0;
      recoveryExhausted = false;
    }
  }, STABLE_CONNECTION_MS);
}

/**
 * @description 为未收到 SDK `frame_stop` 的播报设置按文本长度计算的完成兜底。
 * @param {AvatarPlatform} instance 派发播报的 SDK 实例。
 * @param {QueuedSpeech} speech 活动播报。
 * @returns {void}
 */
function scheduleSpeechCompletionFallback(instance, speech) {
  clearSpeechCompletionTimer();
  const delay = Math.min(120_000, Math.max(15_000, speech.text.length * 360));
  speechCompletionTimer = window.setTimeout(() => {
    speechCompletionTimer = null;
    if (platform !== instance || activeSpeech?.id !== speech.id) return;
    activeSpeech = null;
    setRuntimeState("ready");
    setStatus("数字人在线，随时为你服务");
    notifyHost("speech-timeout", { requestId: speech.requestId });
    if (!speechWriteInFlight) void flushPendingSpeech();
  }, delay);
}

/**
 * @description 清除自动重连定时器。
 * @returns {void}
 */
function cancelRetryTimer() {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
}

/**
 * @description 清除稳定连接判定定时器。
 * @returns {void}
 */
function clearStableConnectionTimer() {
  if (stableConnectionTimer !== null) window.clearTimeout(stableConnectionTimer);
  stableConnectionTimer = null;
}

/**
 * @description 清除播报完成兜底定时器。
 * @returns {void}
 */
function clearSpeechCompletionTimer() {
  if (speechCompletionTimer !== null) window.clearTimeout(speechCompletionTimer);
  speechCompletionTimer = null;
}

/**
 * @description 将字符串、Error 或 SDK 错误对象转换为中文展示文本。
 * @param {*} error 原始错误。
 * @returns {string} 用户可读错误说明。
 */
function normalizeError(error) {
  if (typeof error === "string") return t(error);
  return error?.message ? t(error.message) : error?.code ? t("数字人服务错误") + " (" + error.code + ")" : t("数字人服务暂不可用");
}

/**
 * @description 更新向宿主报告的运行时状态。
 * @param {string} value 新状态。
 * @returns {void}
 */
function setRuntimeState(value) {
  runtimeState = value;
}

/**
 * @description 通过 uni-app 桥和浏览器 `postMessage` 向嵌入宿主报告无敏感信息的状态事件。
 * @param {string} type 事件类型。
 * @param {Record<string, *>} [details={}] 附加状态字段。
 * @returns {void}
 */
function notifyHost(type, details = {}) {
  if (!embedMode) return;
  const packet = {
    source: "scenic-digital-human",
    speechProtocol: 2,
    version: 1,
    type,
    state: runtimeState,
    timestamp: Date.now(),
    ...details
  };
  if (!postViaUniBridge(packet)) {
    pendingHostMessages.push(packet);
    ensureHostBridge();
  }
  try {
    if (window.parent && window.parent !== window) {
      // The visitor H5 host may use a different first-party subdomain from the
      // API page. The packet contains state only (never tokens or credentials).
      window.parent.postMessage(packet, "*");
    }
  } catch {
    // The official uni bridge above remains the primary channel.
  }
}

/**
 * @description 尝试通过已就绪的 uni-app WebView 桥发送消息。
 * @param {HostPacket} packet 宿主消息。
 * @returns {boolean} 已成功调用桥时为 `true`。
 */
function postViaUniBridge(packet) {
  try {
    if (window.uni && typeof window.uni.postMessage === "function") {
      window.uni.postMessage({ data: packet });
      return true;
    }
  } catch {
    // Queue and retry after UniAppJSBridgeReady.
  }
  return false;
}

/**
 * @description 按顺序发送桥就绪前积压的宿主消息；首次失败后停止并保留队首。
 * @returns {void}
 */
function flushHostMessages() {
  if (!window.uni || typeof window.uni.postMessage !== "function") return;
  while (pendingHostMessages.length > 0) {
    const packet = pendingHostMessages.shift();
    if (!postViaUniBridge(packet)) {
      pendingHostMessages.unshift(packet);
      break;
    }
  }
}

/**
 * @description 在嵌入模式按需加载官方 uni-app WebView 桥并在就绪后冲刷消息。
 * @returns {void}
 */
function ensureHostBridge() {
  if (!embedMode || hostBridgeLoading || (window.uni && typeof window.uni.postMessage === "function")) {
    flushHostMessages();
    return;
  }
  hostBridgeLoading = true;
  const script = document.createElement("script");
  script.src = UNI_WEBVIEW_BRIDGE_URL;
  script.async = true;
  script.onload = () => {
    hostBridgeLoading = false;
    flushHostMessages();
  };
  script.onerror = () => {
    hostBridgeLoading = false;
  };
  document.head.appendChild(script);
}

document.addEventListener("UniAppJSBridgeReady", flushHostMessages, false);

window.addEventListener("pagehide", () => {
  window.scenicAvatarDispose();
});
