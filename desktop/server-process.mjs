/**
 * @fileoverview Electron 服务端子进程入口。
 * @description 在 utilityProcess 或 child_process 中启动本地 HTTP 服务，并向父进程报告就绪、错误与关闭状态。
 */
/**
 * @description 标识服务子进程是否已经进入关闭流程。
 * @type {boolean}
 */
let stopping = false;
/**
 * @description 服务模块加载后替换为真实关闭函数；加载前调用时安全返回已完成 Promise。
 * @type {() => Promise<void>}
 */
let stopServer = async () => {};

/**
 * @description 通过 Electron utilityProcess 消息端口或 child_process IPC 向父进程发送服务状态。
 * @param {Record<string, unknown>} message 就绪、错误或关闭完成消息。
 * @returns {void}
 */
function postToParent(message) {
  if (process.parentPort) {
    process.parentPort.postMessage(message);
  } else if (process.send) {
    process.send(message);
  }
}

/**
 * @description 幂等停止 HTTP 服务，向父进程确认关闭完成并结束服务子进程。
 * @returns {Promise<void>} 服务关闭流程完成后结束。
 */
async function shutdown() {
  if (stopping) {
    return;
  }
  stopping = true;

  try {
    await stopServer();
    postToParent({ type: "shutdown-complete" });
    process.exit(0);
  } catch (error) {
    postToParent({
      type: "server-error",
      message: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

process.parentPort?.on("message", (event) => {
  if (event.data?.type === "shutdown") {
    void shutdown();
  }
});
process.on("message", (message) => {
  if (message?.type === "shutdown") {
    void shutdown();
  }
});

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("uncaughtException", (error) => {
  postToParent({ type: "server-error", message: error.message });
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  postToParent({ type: "server-error", message: String(error) });
  process.exit(1);
});

try {
  const serverEntry = process.env.DESKTOP_SERVER_ENTRY;
  if (!serverEntry) {
    throw new Error("DESKTOP_SERVER_ENTRY is required.");
  }
  const backend = await import(serverEntry);
  stopServer = backend.stopServer;
  const { server, startServer } = backend;
  await startServer({ host: "127.0.0.1", port: 0 });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The desktop server did not expose a TCP address.");
  }
  postToParent({ type: "server-ready", port: address.port });
} catch (error) {
  postToParent({
    type: "server-error",
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}
