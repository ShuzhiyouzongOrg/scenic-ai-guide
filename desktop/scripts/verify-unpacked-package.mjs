import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { extractFile, listPackage } from "@electron/asar";

import { verifyPackagedTree, walk } from "./package-verifier.mjs";

const input = resolve(process.argv[2] || "dist");
assert.ok(existsSync(input), `Package directory is missing: ${input}`);

function normalizeAsarPath(path) {
  return path.replace(/^[/\\]+/, "").replaceAll("\\", "/");
}

const roots = existsSync(join(input, "resources", "app.asar"))
  ? [input]
  : walk(input)
      .filter((path) => /[\\/](?:resources|Resources)[\\/]app\.asar$/.test(path))
      .map((path) => dirname(dirname(path)));
assert.ok(roots.length > 0, `No unpacked application was found below ${input}.`);

for (const root of [...new Set(roots)]) {
  const result = verifyPackagedTree(root, {
    readAsar(asarPath) {
      const paths = listPackage(asarPath).map(normalizeAsarPath);
      return {
        paths,
        read(path) {
          const normalized = normalizeAsarPath(path);
          assert.ok(paths.includes(normalized), `Missing app.asar entry: ${normalized}`);
          return extractFile(asarPath, path.replaceAll("/", sep)).toString("utf8");
        }
      };
    }
  });
  console.log(`Verified ${result.name}: ${result.files} packaged files.`);
}
