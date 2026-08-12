import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

if (process.platform !== "linux") {
  throw new Error("Linux package verification must run on Linux.");
}

const outputDirectory = resolve(process.argv[2] || "dist");
assert.ok(existsSync(outputDirectory), `Package directory is missing: ${outputDirectory}`);

const packageFiles = readdirSync(outputDirectory).filter((name) =>
  [".AppImage", ".deb"].includes(extname(name))
);
assert.ok(packageFiles.some((name) => name.endsWith(".AppImage")), "AppImage is missing.");
assert.ok(packageFiles.some((name) => name.endsWith(".deb")), "Debian package is missing.");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const unpackedDirectory = join(outputDirectory, "linux-unpacked");
assert.ok(existsSync(unpackedDirectory), "linux-unpacked runtime is missing.");
const unpackedFiles = walk(unpackedDirectory);
const nativeModules = unpackedFiles.filter((path) => extname(path) === ".node");
assert.deepEqual(nativeModules, [], `Unexpected native modules: ${nativeModules.join(", ")}`);

assert.ok(
  unpackedFiles.some((path) => path.endsWith("resources/app.asar")),
  "Packaged app.asar is missing."
);

for (const name of packageFiles) {
  assert.ok(statSync(join(outputDirectory, name)).size > 0, `${name} is empty.`);
}

console.log("Linux packages contain no host-linked Node native modules.");
