import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requiredServerEnvKeys,
  selectServerEnvironment,
  serializeServerEnvironment
} from "./runtime-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repositoryDir = resolve(desktopDir, "..");
const sources = [
  resolve(repositoryDir, "server", "src", "app.mjs"),
  resolve(repositoryDir, "server", "data", "generated", "knowledge.json"),
  resolve(repositoryDir, "web", "dist", "index.html")
];
const generatedDir = resolve(desktopDir, "generated");
const generatedServerEnv = resolve(generatedDir, "server.env");
const localServerEnv = resolve(repositoryDir, "server", ".env");
for (const source of sources) {
  if (!existsSync(source)) {
    throw new Error(`Desktop runtime source is missing: ${source}`);
  }
}

mkdirSync(generatedDir, { recursive: true });
const sourceEnvironment = !process.env.CI && existsSync(localServerEnv)
  ? readFileSync(localServerEnv, "utf8")
  : process.env;
const selectedEnvironment = selectServerEnvironment(sourceEnvironment);
const missingKeys = requiredServerEnvKeys.filter(
  (key) => !String(selectedEnvironment[key] || "").trim()
);
if (missingKeys.length > 0) {
  throw new Error(`Desktop service configuration is missing: ${missingKeys.join(", ")}`);
}
writeFileSync(generatedServerEnv, serializeServerEnvironment(selectedEnvironment), {
  mode: 0o600
});

console.log("Desktop runtime sources are ready for packaging.");
