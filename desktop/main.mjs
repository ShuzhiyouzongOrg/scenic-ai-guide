/**
 * @fileoverview 数智游踪 Electron 主进程入口。
 * @description 负责桌面运行目录初始化、服务端子进程生命周期、主窗口安全策略、IPC 桥接与冒烟测试编排。
 */
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fork as forkNodeProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @description 桌面窗口、系统提示和本地服务使用的产品名称。
 * @type {string}
 */
const APP_NAME = "数智游踪";
/**
 * @description 本地服务启动与健康检查允许等待的最长时间。
 * @type {number}
 */
const STARTUP_TIMEOUT_MS = 30_000;
/**
 * @description 本地服务优雅关闭超时后执行强制终止的等待时间。
 * @type {number}
 */
const SHUTDOWN_TIMEOUT_MS = 5_000;
/**
 * @description 允许交由系统默认程序打开的外部链接协议。
 * @type {Set<string>}
 */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);
/**
 * @description 标识当前进程是否运行真实桌面安装包冒烟测试。
 * @type {boolean}
 */
const SMOKE_TEST = process.argv.includes("--smoke-test") || process.env.DESKTOP_SMOKE_TEST === "1";

if (process.env.DESKTOP_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.DESKTOP_USER_DATA_DIR));
} else if (!app.isPackaged) {
  app.setPath(
    "userData",
    resolve(import.meta.dirname, "..", "..", "LocalTemp", "desktop-user-data")
  );
}

/**
 * @description 当前活动主窗口；窗口关闭后恢复为 `null`。
 * @type {BrowserWindow|null}
 */
let mainWindow = null;
/**
 * @description 当前本地服务子进程，兼容打包态 utilityProcess 与开发态 child_process。
 * @type {import("electron").UtilityProcess|import("node:child_process").ChildProcess|null}
 */
let backendProcess = null;
/**
 * @description 标识当前服务是否由 Electron utilityProcess 启动。
 * @type {boolean}
 */
let backendUsesUtilityProcess = false;
/**
 * @description 本地 HTTP 服务实际监听端口；服务未就绪时为 `null`。
 * @type {number|null}
 */
let backendPort = null;
/**
 * @description 正在执行的应用启动任务，用于合并并发启动请求。
 * @type {Promise<BrowserWindow|null>|null}
 */
let bootstrapPromise = null;
/**
 * @description 正在执行的服务关闭任务，用于保证关闭流程幂等。
 * @type {Promise<void>|null}
 */
let shutdownPromise = null;
/**
 * @description 标识退出前的服务关闭流程已经完成，避免重复拦截退出事件。
 * @type {boolean}
 */
let quitAfterBackendStops = false;

/**
 * @description 返回打包态或开发态的桌面源码根目录。
 * @returns {string} 桌面资源根目录。
 */
function desktopRoot() {
  return app.isPackaged ? app.getAppPath() : import.meta.dirname;
}

/**
 * @description 根据打包状态计算 Web、服务端、运行数据和环境文件路径。
 * @returns {{root: string, runtimeData: string, webDist: string, serverEntryPath: string, serverLauncherPath: string, serverEnvPath: string, bundledServerEnvPath: string|null, serverWorkingDirectory: string}} 桌面运行路径集合。
 */
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

/**
 * @description 在首次运行或环境文件仍由桌面端托管时，将安装包默认配置复制到用户数据目录。
 * @param {{bundledServerEnvPath: string|null, serverEnvPath: string}} paths 环境文件路径。
 * @returns {void}
 * @throws {Error} 环境文件读取或复制失败时透传文件系统异常。
 */
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

/**
 * @description 读取 dotenv 文件并保留第一个等号后的完整值；文件缺失时返回空对象。
 * @param {string|null} filePath dotenv 文件路径。
 * @returns {Record<string, string>} 已解析的环境变量映射。
 * @throws {Error} 文件存在但无法读取时透传文件系统异常。
 */
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

/**
 * @description 合并安装包默认配置与用户配置，用户提供的非空值优先。
 * @param {{bundledServerEnvPath: string|null, serverEnvPath: string}} paths 环境文件路径。
 * @returns {Record<string, string>} 可传给桌面服务的合并配置。
 */
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

/**
 * @description 从本机服务环境中读取渲染进程所需的讯飞数字人凭据。
 * @returns {{appId: string, apiKey: string, apiSecret: string}} 数字人凭据；未配置字段为空字符串。
 * @throws {Error} 运行路径或环境文件读取失败时抛出。
 */
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

/**
 * @description 检查桌面运行所需的 Web 构建、服务入口和子进程启动器。
 * @param {{webDist: string, serverEntryPath: string, serverLauncherPath: string}} paths 运行文件路径。
 * @returns {void}
 * @throws {Error} 任一必需文件或目录缺失时抛出。
 */
function assertRuntimeFiles(paths) {
  const missing = [paths.webDist, paths.serverEntryPath, paths.serverLauncherPath]
    .filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Desktop runtime files are missing:\n${missing.join("\n")}`);
  }
}

/**
 * @description 组装仅监听回环地址的桌面服务端子进程环境变量。
 * @param {{runtimeData: string, webDist: string, serverEntryPath: string, serverEnvPath: string, bundledServerEnvPath: string|null}} paths 桌面运行路径。
 * @returns {NodeJS.ProcessEnv} 包含数据目录、SQLite 路径和服务入口的子进程环境。
 * @throws {Error} 运行目录创建或环境文件读取失败时抛出。
 */
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

/**
 * @description 在启动时限内轮询本地服务健康端点，直到返回成功状态。
 * @param {number} port 本地服务端口。
 * @returns {Promise<void>} 健康检查成功后完成。
 * @throws {Error} 服务持续不可用直到超时时抛出。
 */
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

/**
 * @description 启动或复用桌面本地服务子进程，并等待端口上报和健康检查通过。
 * @returns {Promise<number>} 本地服务监听端口。
 * @throws {Error} 运行文件缺失、子进程异常退出、端口上报超时或健康检查失败时抛出。
 */
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

/**
 * @description 请求桌面本地服务优雅退出，超时后强制终止，并复用并发关闭 Promise。
 * @returns {Promise<void>} 子进程退出且运行状态清理后完成。
 */
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

/**
 * @description 判断 URL 是否属于当前桌面本地服务的受信任回环源。
 * @param {string} rawUrl 待验证 URL。
 * @returns {boolean} URL 与当前回环服务同源时返回 `true`。
 */
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

/**
 * @description 使用系统默认程序打开 HTTP、HTTPS 或邮件链接。
 * @param {string} rawUrl 待打开的外部 URL。
 * @returns {Promise<boolean>} 协议受信任且系统打开成功时返回 `true`。
 */
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

/**
 * @description 为打包冒烟测试登录管理员账号、写入本地会话并跳转到 AI 数字人导览页。
 * @param {BrowserWindow} window 待准备的 Electron 窗口。
 * @param {number} port 本地服务端口。
 * @returns {Promise<void>} 会话写入和页面跳转完成后结束。
 * @throws {Error} 测试登录失败或页面脚本执行失败时抛出。
 */
async function prepareSmokeSession(window, port) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'admin' })
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

/**
 * @description 创建受上下文隔离保护的主窗口，限制导航来源，并按需执行真实安装包冒烟验证。
 * @param {number} port 本地服务端口。
 * @returns {Promise<void>} 主页面加载及可选冒烟验证完成后结束。
 * @throws {Error} 页面加载、测试登录或服务配置验证失败时抛出。
 */
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

/**
 * @description 注册应用信息、数字人凭据和外部链接三个主进程 IPC 处理器。
 * @returns {void}
 */
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

/**
 * @description 创建或复用桌面应用启动 Promise，避免并发创建多个窗口和服务。
 * @returns {Promise<BrowserWindow|null>} 当前主窗口。
 * @throws {Error} 服务端或窗口初始化失败时抛出。
 */
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

/**
 * @description 按顺序启动本地 HTTP 服务并创建指向该服务的主窗口。
 * @returns {Promise<BrowserWindow|null>} 创建完成的主窗口。
 * @throws {Error} 本地服务或窗口创建失败时抛出。
 */
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
