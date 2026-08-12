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
    ? join(root, "runtime", "default-server.env")
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
    APP_NAME,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "0",
    DATA_DIR: paths.runtimeData,
    UPLOAD_DIR: uploadDir,
    SQLITE_PATH: join(paths.runtimeData, "scenic.sqlite"),
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
    icon: process.platform === "linux"
      ? join(desktopRoot(), "assets", "icons", "linux", "512x512", "cn.shuzhiyouzong.desktop.png")
      : undefined,
    webPreferences: {
      preload: join(desktopRoot(), "preload.mjs"),
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
