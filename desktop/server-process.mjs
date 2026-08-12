let stopping = false;
let stopServer = async () => {};

function postToParent(message) {
  if (process.parentPort) {
    process.parentPort.postMessage(message);
  } else if (process.send) {
    process.send(message);
  }
}

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
