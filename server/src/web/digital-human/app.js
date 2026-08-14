import AvatarPlatform, {
  PlayerEvents,
  SDKEvents
} from "./sdk/index.js";
import { XRTCPlayer } from "./sdk/xrtc-player-BDn4MFE-.js";

// Preload the player module. The vendor SDK loads the same module dynamically
// after the avatar session starts; keeping an explicit reference also makes
// WebView module loading failures visible during the initial page load.
void XRTCPlayer;

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

void loadBootstrap();

elements.start.addEventListener("click", () => {
  if (bootstrap && !ready) void startAvatar(bootstrap);
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
  if (!platform) return;
  void platform.interrupt().finally(() => setStatus("播报已停止"));
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = String(elements.input.value || "").trim();
  if (!ready || !question) return;
  void askGuide(question);
});

async function loadBootstrap() {
  const token = new URLSearchParams(window.location.search).get("session") || "";
  if (!token) {
    showFatal("安全会话不存在，请返回应用重新打开数字人。");
    return;
  }
  try {
    const response = await fetch(
      `/api/digital-human/web/bootstrap?session=${encodeURIComponent(token)}`,
      { cache: "no-store", credentials: "same-origin" }
    );
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload?.error?.message || "数字人会话初始化失败");
    }
    bootstrap = payload.data;
    history.replaceState(null, "", "/digital-human/");
    elements.guideName.textContent = bootstrap.digitalHuman.name || "灵山 AI 导游";
    elements.welcome.textContent = bootstrap.digitalHuman.welcomeText
      || "点击启动后，可以询问景点、路线和服务信息。";
    elements.start.disabled = false;
    setStatus("安全会话已就绪，请点击启动");
  } catch (error) {
    showFatal(normalizeError(error));
  }
}

async function startAvatar(options) {
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

  instance.on(SDKEvents.connected, () => setStatus("数字人已连接"));
  instance.on(SDKEvents.stream_start, () => {
    elements.placeholder.classList.add("is-hidden");
    setStatus("动态形象已上线");
  });
  instance.on(SDKEvents.frame_start, () => setStatus("数字人正在回答"));
  instance.on(SDKEvents.frame_stop, () => setStatus("数字人在线，随时为你服务"));
  instance.on(SDKEvents.subtitle_info, (payload) => {
    const text = payload?.text || payload?.content || payload?.data?.text || payload?.data?.content;
    if (text) elements.answer.textContent = text;
  });
  instance.on(SDKEvents.error, (error) => showRuntimeError(error));
  instance.on(SDKEvents.disconnected, () => {
    ready = false;
    setControls(false);
    setStatus("数字人连接已结束，请返回应用重新打开");
  });

  try {
    await instance.start({ wrapper: elements.stage });
    ready = true;
    setControls(true);
    elements.start.hidden = true;
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
    const welcome = String(options.digitalHuman.welcomeText || "").trim();
    if (welcome) {
      elements.answer.textContent = welcome;
      await instance.writeText(welcome, { nlp: false });
    }
  } catch (error) {
    showRuntimeError(error);
    try {
      instance.destroy();
    } catch {
      // Connection cleanup is best-effort.
    }
    platform = null;
    elements.start.hidden = false;
    elements.start.disabled = false;
    elements.start.textContent = "重新启动动态数字人";
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
    elements.answer.textContent = answer;
    await platform.writeText(answer, {
      nlp: false,
      tts: { volume: 100 },
      avatar_dispatch: { interactive_mode: 1 }
    });
    elements.input.value = "";
  } catch (error) {
    elements.answer.textContent = normalizeError(error);
    setStatus("回答失败，请稍后重试");
  } finally {
    elements.ask.disabled = false;
    elements.input.disabled = false;
    elements.input.focus();
  }
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
  setStatus(message);
  elements.start.disabled = true;
  elements.answer.textContent = message;
}

function showRuntimeError(error) {
  ready = false;
  setControls(false);
  const message = normalizeError(error);
  setStatus(message);
  elements.answer.textContent = message;
}

function normalizeError(error) {
  if (typeof error === "string") return error;
  return error?.message || (error?.code ? `数字人服务错误（${error.code}）` : "数字人服务暂不可用");
}
