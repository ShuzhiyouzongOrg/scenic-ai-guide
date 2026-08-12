import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repositoryDir = resolve(desktopDir, "..");
const sources = [
  resolve(repositoryDir, "server", "src", "app.mjs"),
  resolve(repositoryDir, "server", "data", "generated", "knowledge.json"),
  resolve(repositoryDir, "web", "dist", "index.html")
];

for (const source of sources) {
  if (!existsSync(source)) {
    throw new Error(`Desktop runtime source is missing: ${source}`);
  }
}

console.log("Desktop runtime sources are ready for packaging.");
