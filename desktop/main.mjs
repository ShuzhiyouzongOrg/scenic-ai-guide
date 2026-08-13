import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fork as forkNodeProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP_NAME = "数智游踪";
const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);
const SMOKE_TEST = process.argv.includes("--smoke-test") || process.env.DESKTOP_SMOKE_TEST === "1";

if (process.env.DESKTOP_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.DESKTOP_USER_DATA_DIR));
} else if (!app.isPackaged) {
  app.setPath(
    "userData",
    resolve(import.meta.dirname, "..", "..", "LocalTemp", "desktop-user-data")
  );
}

let mainWindow = null;
let backendProcess = null;
let backendUsesUtilityProcess = false;
let backendPort = null;
let bootstrapPromise = null;
let shutdownPromise = null;
let quitAfterBackendStops = false;

function desktopRoot() {
  return app.isPackaged ? app.getAppPath() : import.meta.dirname;
}

function runtimePaths() {
  const root = desktopRoot();
  const repositoryRoot = app.isPackaged ? root : resolve(root, "..");
  const runtimeData = join(app.getPath("userData"), "runtime", "data");
  const webDist = app.isPackaged
    ? join(root, "web", "dist")
    : join(repositoryRoot, "web", "dist");
  const serverEntryPath = app.isPackaged
    ? join(root, "runtime", "server", "src", "app.mjs")
    : join(repositoryRoot, "server", "src", "app.mjs");
  const serverLauncherPath = join(root, "server-process.mjs");
  const serverEnvPath = app.isPackaged
    ? join(app.getPath("userData"), "server.env")
    : join(repositoryRoot, "server", ".env");
  const bundledServerEnvPath = app.isPackaged
    ? join(process.resourcesPath, "runtime", "default-server.env")
    : null;
  const serverWorkingDirectory = app.isPackaged
    ? app.getPath("userData")
    : join(repositoryRoot, "server");

  return {
    root,
    runtimeData,
    webDist,
    serverEntryPath,
    serverLauncherPath,
    serverEnvPath,
    bundledServerEnvPath,
    serverWorkingDirectory
  };
}

function provisionServerEnvironment(paths) {
  if (!paths.bundledServerEnvPath || !existsSync(paths.bundledServerEnvPath)) {
    return;
  }

  const managedHeader = "# Managed by the desktop runtime.";
  const currentConfig = existsSync(paths.serverEnvPath)
    ? readFileSync(paths.serverEnvPath, "utf8")
    : "";
  if (!currentConfig || currentConfig.startsWith(managedHeader)) {
    copyFileSync(paths.bundledServerEnvPath, paths.serverEnvPath);
  }
}

function parseEnvironmentFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    values[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
  }
  return values;
}

function readRuntimeEnvironment(paths) {
  const defaults = parseEnvironmentFile(paths.bundledServerEnvPath);
  const userValues = parseEnvironmentFile(paths.serverEnvPath);
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(userValues)) {
    if (String(value).trim() || !Object.hasOwn(merged, key)) {
      merged[key] = value;
    }
  }
  return merged;
}

function getAvatarCredentials() {
  const paths = runtimePaths();
  provisionServerEnvironment(paths);
  const values = readRuntimeEnvironment(paths);
  return {
    appId: values.XFYUN_APP_ID || "",
    apiKey: values.XFYUN_API_KEY || "",
    apiSecret: values.XFYUN_API_SECRET || ""
  };
}

function assertRuntimeFiles(paths) {
  const missing = [paths.webDist, paths.serverEntryPath, paths.serverLauncherPath]
    .filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Desktop runtime files are missing:\n${missing.join("\n")}`);
  }
}

function backendEnvironment(paths) {
  const uploadDir = join(paths.runtimeData, "uploads");
  mkdirSync(uploadDir, { recursive: true });

  return {
    ...process.env,
    ...readRuntimeEnvironment(paths),
    APP_NAME,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "0",
    DATA_DIR: paths.runtimeData,
    UPLOAD_DIR: uploadDir,
    SQLITE_PATH: join(paths.runtimeData, "scenic.sqlite"),
    DESKTOP_USE_NODE_SQLITE: "1",
    WEB_DIST_DIR: paths.webDist,
    CONFIG_ENV_FILE: paths.serverEnvPath,
    DESKTOP_SERVER_ENTRY: pathToFileURL(paths.serverEntryPath).href
  };
}

async function waitForHealth(port) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }

  throw new Error(`Desktop server health check timed out: ${lastError?.message || "unknown error"}`);
}

async function startBackend() {
  if (backendProcess && backendPort) {
    return backendPort;
  }

  const paths = runtimePaths();
  assertRuntimeFiles(paths);
  provisionServerEnvironment(paths);

  const child = app.isPackaged
    ? utilityProcess.fork(paths.serverLauncherPath, [], {
        cwd: paths.serverWorkingDirectory,
        env: backendEnvironment(paths),
        serviceName: `${APP_NAME} 本地服务`,
        stdio: "pipe"
      })
    : forkNodeProcess(paths.serverLauncherPath, [], {
        cwd: paths.serverWorkingDirectory,
        env: backendEnvironment(paths),
        execPath: process.env.DESKTOP_NODE_EXEC_PATH || "node",
        stdio: ["ignore", "pipe", "pipe", "ipc"]
      });
  backendProcess = child;
  backendUsesUtilityProcess = app.isPackaged;
  child.stdout?.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

  const port = await new Promise((resolvePort, rejectPort) => {
    const timeout = setTimeout(() => {
      rejectPort(new Error("Desktop server did not report a port in time."));
    }, STARTUP_TIMEOUT_MS);

    const settle = (callback) => {
      clearTimeout(timeout);
      callback();
    };

    child.on("message", (message) => {
      if (message?.type === "server-ready") {
        settle(() => resolvePort(message.port));
      } else if (message?.type === "server-error") {
        settle(() => rejectPort(new Error(message.message || "Desktop server failed.")));
      }
    });
    child.once("exit", (code) => {
      if (!backendPort) {
        settle(() => rejectPort(new Error(`Desktop server exited before startup (code ${code}).`)));
      }
      backendProcess = null;
      backendPort = null;
    });
  });

  backendPort = Number(port);
  await waitForHealth(backendPort);
  return backendPort;
}

function stopBackend() {
  if (shutdownPromise) {
    return shutdownPromise;
  }
  if (!backendProcess) {
    return Promise.resolve();
  }

  const child = backendProcess;
  shutdownPromise = new Promise((resolveShutdown) => {
    const timeout = setTimeout(() => {
      child.kill();
      backendProcess = null;
      backendPort = null;
      shutdownPromise = null;
      resolveShutdown();
    }, SHUTDOWN_TIMEOUT_MS);

    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      backendProcess = null;
      backendPort = null;
      shutdownPromise = null;
      resolveShutdown();
    };

    child.on("message", (message) => {
      if (message?.type === "shutdown-complete") {
        finish();
      }
    });
    child.once("exit", finish);
    if (backendUsesUtilityProcess) {
      child.postMessage({ type: "shutdown" });
    } else {
      child.send({ type: "shutdown" });
    }
  });

  return shutdownPromise;
}

function isTrustedLocalUrl(rawUrl) {
  if (!backendPort) {
    return false;
  }
  try {
    const url = new URL(rawUrl);
    return url.origin === `http://127.0.0.1:${backendPort}`;
  } catch {
    return false;
  }
}

async function openExternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return false;
    }
    await shell.openExternal(url.toString());
    return true;
  } catch {
    return false;
  }
}

async function prepareSmokeSession(window, port) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const payload = await response.json();
    const token = payload?.data?.token || '';
    if (!response.ok || !token) {
      return { ok: false, status: response.status };
    }
    const state = JSON.stringify({
      language: 'zh',
      isLogin: true,
      isLock: false,
      lockPassword: '',
      info: {},
      searchHistory: [],
      accessToken: token,
      refreshToken: payload?.data?.refreshToken || ''
    });
    for (const key of ['user', 'sys-vundefined-user', 'sys-v0.0.0-user', 'sys-v1.0.0-user']) {
      localStorage.setItem(key, state);
    }
    localStorage.setItem('sys-version', 'undefined');
    return { ok: true, status: response.status };
  })()`);
  if (!result.ok) {
    throw new Error(`Desktop smoke-test login failed with status ${result.status}.`);
  }
  await window.loadURL(
    `http://127.0.0.1:${port}/?desktop-smoke=${Date.now()}#/guide/experience`
  );
}

async function createMainWindow(port) {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f5f7fa",
    ...(process.platform === "linux"
      ? {
          icon: join(
            desktopRoot(),
            "assets",
            "icons",
            "linux",
            "512x512",
            "cn.shuzhiyouzong.desktop.png"
          )
        }
      : {}),
    webPreferences: {
      preload: join(desktopRoot(), "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedLocalUrl(url)) {
      return { action: "allow" };
    }
    void openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedLocalUrl(url)) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await window.loadURL(`http://127.0.0.1:${port}/#/guide/experience`);
  mainWindow = window;
  if (SMOKE_TEST) {
    await prepareSmokeSession(window, port);
    const runtimeStatus = await window.webContents.executeJavaScript(`(async () => {
      const bridge = window.shuzhiyouzongDesktop;
      if (!bridge?.getAvatarCredentials) {
        return {
          bridgeAvailable: false,
          credentialsAvailable: false,
          providersAvailable: false,
          avatarConfigured: false,
          llmAvailable: false
        };
      }
      const credentials = await bridge.getAvatarCredentials();
      const healthResponse = await fetch('/api/health');
      const health = await healthResponse.json();
      const avatarResponse = await fetch('/api/digital-human/config');
      const avatar = await avatarResponse.json();
      const chatResponse = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: '请用一句话概括灵山梵宫穹顶的艺术特点。桌面云端模型验证编号：' + Date.now(),
          sessionId: 'desktop-package-smoke',
          locale: 'zh-CN'
        })
      });
      const chat = await chatResponse.json();
      const avatarDeadline = Date.now() + 30000;
      let avatarState = '';
      let avatarError = '';
      while (Date.now() < avatarDeadline) {
        const avatarElement = document.querySelector('.dh-avatar');
        avatarState = Array.from(avatarElement?.classList || [])
          .find((name) => name.startsWith('dh-status-'))
          ?.replace('dh-status-', '') || '';
        avatarError = document.querySelector('.dh-fallback-tip')?.textContent?.trim() || '';
        if (avatarState === 'ready' || avatarState === 'speaking' || avatarState === 'error') break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      return {
        bridgeAvailable: true,
        credentialsAvailable: Boolean(
          credentials?.appId && credentials?.apiKey && credentials?.apiSecret
        ),
        providersAvailable: Boolean(
          healthResponse.ok &&
          health?.data?.providers?.llm === 'openai' &&
          health?.data?.providers?.tts === 'xfyun'
        ),
        avatarConfigured: Boolean(
          avatarResponse.ok &&
          avatar?.data?.engine === 'xfyun' &&
          avatar?.data?.avatarId &&
          avatar?.data?.assetAvailable
        ),
        avatarConnected: avatarState === 'ready' || avatarState === 'speaking',
        avatarState,
        avatarError,
        pageUrl: location.href,
        pageTitle: document.title,
        storageKeys: Object.keys(localStorage).filter((key) => key.includes('user')),
        llmAvailable: Boolean(chatResponse.ok && chat?.data?.provider === 'openai'),
        llmProvider: chat?.data?.provider || '',
        llmModel: chat?.data?.model || '',
        llmLatencyMs: Number(chat?.data?.latency?.llmMs || 0)
      };
    })()`);
    if (
      !runtimeStatus.bridgeAvailable ||
      !runtimeStatus.credentialsAvailable ||
      !runtimeStatus.providersAvailable ||
      !runtimeStatus.avatarConfigured ||
      !runtimeStatus.avatarConnected ||
      !runtimeStatus.llmAvailable
    ) {
      throw new Error(
        `Desktop service configuration smoke test failed: ` +
        `avatarState=${runtimeStatus.avatarState || 'missing'}, ` +
        `avatarError=${runtimeStatus.avatarError || 'none'}, ` +
        `pageUrl=${runtimeStatus.pageUrl || 'unknown'}, ` +
        `storageKeys=${runtimeStatus.storageKeys?.join(',') || 'none'}.`
      );
    }
    console.log(
      `Desktop LLM smoke test passed: provider=${runtimeStatus.llmProvider}, ` +
      `model=${runtimeStatus.llmModel}, latencyMs=${runtimeStatus.llmLatencyMs}.`
    );
    console.log(`Desktop avatar smoke test passed: state=${runtimeStatus.avatarState}.`);
    console.log("Desktop service configuration smoke test passed.");
    setTimeout(() => app.quit(), 2_500);
  }
}

function registerIpc() {
  ipcMain.handle("desktop:get-app-info", () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  }));
  ipcMain.handle("desktop:get-avatar-credentials", () => getAvatarCredentials());
  ipcMain.handle("desktop:open-external", (_event, url) => openExternal(url));
}

async function bootstrap() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = bootstrapApplication();
  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

async function bootstrapApplication() {
  const port = await startBackend();
  await createMainWindow(port);
  return mainWindow;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName(APP_NAME);
    registerIpc();
    try {
      await bootstrap();
    } catch (error) {
      console.error(error);
      if (SMOKE_TEST) {
        await stopBackend();
        app.exit(1);
        return;
      }
      dialog.showErrorBox(
        `${APP_NAME} 启动失败`,
        error instanceof Error ? error.message : String(error)
      );
      await stopBackend();
      app.quit();
    }
  });
}

app.on("activate", async () => {
  await app.whenReady();
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await bootstrap();
    } catch (error) {
      dialog.showErrorBox(`${APP_NAME} 启动失败`, error instanceof Error ? error.message : String(error));
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!backendProcess || quitAfterBackendStops) {
    return;
  }
  event.preventDefault();
  void stopBackend().finally(() => {
    quitAfterBackendStops = true;
    app.quit();
  });
});
