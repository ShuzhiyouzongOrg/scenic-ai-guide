import AvatarPlatform, {
  PlayerEvents,
  SDKEvents
} from "./sdk/index.js";
import { XRTCPlayer } from "./sdk/xrtc-player-BDn4MFE-.js";

// Preload the player module. The vendor SDK loads the same module dynamically
// after the avatar session starts; keeping an explicit reference also makes
// WebView module loading failures visible during the initial page load.
void XRTCPlayer;

const runtimeQuery = new URLSearchParams(window.location.search);
const embedMode = runtimeQuery.get("embed") === "1";
const autoStart = embedMode && runtimeQuery.get("autostart") === "1";
const sessionToken = runtimeQuery.get("session") || "";
const MAX_AUTO_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 900;
const STABLE_CONNECTION_MS = 30_000;
const UNI_WEBVIEW_BRIDGE_URL = "https://js.cdn.aliyun.dcloud.net.cn/dev/uni-app/uni.webview.1.5.6.js";
if (embedMode) document.body.classList.add("embed-mode");

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

let bootstrap = null;
let platform = null;
let ready = false;
let starting = false;
let bootstrapLoading = false;
let disposed = false;
let retryCount = 0;
let retryTimer = null;
let stableConnectionTimer = null;
let speechCompletionTimer = null;
let recoveryExhausted = false;
let speechSequence = 0;
let speechWriteInFlight = false;
let pendingExternalSpeech = [];
let activeSpeech = null;
let welcomeQueued = false;
let runtimeState = "loading";
let hostBridgeLoading = false;
const pendingHostMessages = [];

// The controlled page is served by our API rather than bundled in the app, so
// load the official uni web-view bridge only in embedded mode. Messages stay in
// memory until the bridge becomes available; parent.postMessage is also sent as
// a browser/H5 fallback.
if (embedMode) {
  ensureHostBridge();
  notifyHost("page-loaded", { ready: false });
}

// Controlled bridge used by uni-app x WebViewContext.evalJS. The bridge never
// exposes the platform instance or credentials and accepts only bounded text.
// WebView load is not treated as SDK readiness: accepted text is always queued,
// because the host cannot observe evalJS's return value on every target.
window.scenicAvatarSpeak = (value) => {
  const text = normalizeExternalSpeech(value);
  if (!text) return false;
  queueSpeech(text);
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

window.scenicAvatarInterrupt = () => {
  pendingExternalSpeech.length = 0;
  activeSpeech = null;
  clearSpeechCompletionTimer();
  if (!platform) return false;
  void platform.interrupt().finally(() => {
    setRuntimeState("ready");
    setStatus("播报已停止");
    notifyHost("idle", { reason: "interrupted" });
  });
  return true;
};

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

async function fetchBootstrap() {
  const response = await fetch(
    `/api/digital-human/web/bootstrap?session=${encodeURIComponent(sessionToken)}`,
    { cache: "no-store", credentials: "same-origin" }
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload?.error?.message || "数字人会话初始化失败");
  }
  return payload.data;
}

function applyBootstrap(options) {
  elements.guideName.textContent = options.digitalHuman.name || "灵山 AI 导游";
  elements.welcome.textContent = options.digitalHuman.welcomeText
    || "点击启动后，可以询问景点、路线和服务信息。";
}

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

async function startAvatar(options) {
  if (disposed || starting || ready) return;
  starting = true;
  setRuntimeState("starting");
  notifyHost("starting");
  elements.start.disabled = true;
  elements.start.textContent = "正在连接讯飞数字人…";
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
    if (platform !== instance) return;
    setRuntimeState("speaking");
    setStatus("数字人正在回答");
    notifyHost("speaking", { speechId: activeSpeech?.id || 0 });
  });
  instance.on(SDKEvents.frame_stop, () => {
    if (platform !== instance) return;
    activeSpeech = null;
    clearSpeechCompletionTimer();
    setRuntimeState("ready");
    setStatus("数字人在线，随时为你服务");
    notifyHost("idle");
    if (!speechWriteInFlight) void flushPendingSpeech();
  });
  instance.on(SDKEvents.subtitle_info, (payload) => {
    if (platform !== instance) return;
    const text = payload?.text || payload?.content || payload?.data?.text || payload?.data?.content;
    if (text) elements.answer.textContent = text;
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
    else if (!welcomeQueued) {
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

async function askGuide(question) {
  elements.ask.disabled = true;
  elements.input.disabled = true;
  elements.answer.textContent = "AI 导游正在查找景区知识…";
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
        locale: "zh-CN"
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload?.error?.message || "AI 导游回答失败");
    }
    const answer = String(payload?.data?.answer || "暂时没有找到合适的回答。").trim();
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

function queueSpeech(text, { front = false } = {}) {
  const speech = { id: ++speechSequence, text };
  if (front) pendingExternalSpeech.unshift(speech);
  else pendingExternalSpeech.push(speech);
  elements.answer.textContent = text;
  notifyHost("speech-accepted", { speechId: speech.id });
  return speech;
}

async function flushPendingSpeech() {
  if (!ready || !platform || speechWriteInFlight || activeSpeech || pendingExternalSpeech.length === 0) {
    return false;
  }
  const instance = platform;
  const speech = pendingExternalSpeech.shift();
  activeSpeech = speech;
  speechWriteInFlight = true;
  setRuntimeState("speaking");
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
    notifyHost("speech-dispatched", { speechId: speech.id });
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

function normalizeExternalSpeech(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1200);
}

function setControls(enabled) {
  elements.input.disabled = !enabled;
  elements.ask.disabled = !enabled;
  elements.interrupt.disabled = !enabled;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function showFatal(message) {
  cancelRetryTimer();
  setRuntimeState("fatal");
  setStatus(message);
  elements.start.disabled = true;
  elements.answer.textContent = message;
  notifyHost("fatal", { message });
}

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

function scheduleAutoRetry(message) {
  if (disposed || retryTimer) return;
  if (!sessionToken || retryCount >= MAX_AUTO_RETRIES) {
    recoveryExhausted = true;
    elements.start.disabled = false;
    elements.start.textContent = "重新启动动态数字人";
    setStatus(`${message}，自动重连已暂停，请点击重新启动`);
    notifyHost("error", { message, retrying: false, exhausted: true });
    return;
  }
  const attempt = ++retryCount;
  const delay = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
  elements.start.disabled = true;
  elements.start.textContent = `自动重连 ${attempt}/${MAX_AUTO_RETRIES}`;
  setStatus(`${message}，${Math.ceil(delay / 1000)} 秒后自动重连（${attempt}/${MAX_AUTO_RETRIES}）`);
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

function ensureRecoveryForQueuedSpeech() {
  if (disposed || ready || starting || bootstrapLoading || retryTimer) return;
  if (recoveryExhausted) beginRecoveryCycle();
  if (sessionToken) void restartAvatar();
}

function beginRecoveryCycle() {
  cancelRetryTimer();
  clearStableConnectionTimer();
  retryCount = 0;
  recoveryExhausted = false;
}

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

function scheduleSpeechCompletionFallback(instance, speech) {
  clearSpeechCompletionTimer();
  const delay = Math.min(120_000, Math.max(15_000, speech.text.length * 360));
  speechCompletionTimer = window.setTimeout(() => {
    speechCompletionTimer = null;
    if (platform !== instance || activeSpeech?.id !== speech.id) return;
    activeSpeech = null;
    setRuntimeState("ready");
    setStatus("数字人在线，随时为你服务");
    notifyHost("idle", { reason: "completion-timeout" });
    if (!speechWriteInFlight) void flushPendingSpeech();
  }, delay);
}

function cancelRetryTimer() {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
}

function clearStableConnectionTimer() {
  if (stableConnectionTimer !== null) window.clearTimeout(stableConnectionTimer);
  stableConnectionTimer = null;
}

function clearSpeechCompletionTimer() {
  if (speechCompletionTimer !== null) window.clearTimeout(speechCompletionTimer);
  speechCompletionTimer = null;
}

function normalizeError(error) {
  if (typeof error === "string") return error;
  return error?.message || (error?.code ? `数字人服务错误（${error.code}）` : "数字人服务暂不可用");
}

function setRuntimeState(value) {
  runtimeState = value;
}

function notifyHost(type, details = {}) {
  if (!embedMode) return;
  const packet = {
    source: "scenic-digital-human",
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
  disposed = true;
  cancelRetryTimer();
  clearStableConnectionTimer();
  clearSpeechCompletionTimer();
  const activePlatform = platform;
  platform = null;
  try {
    activePlatform?.destroy();
  } catch {
    // WebView teardown is best-effort.
  }
  ready = false;
  setRuntimeState("disposed");
  notifyHost("disposed");
});
