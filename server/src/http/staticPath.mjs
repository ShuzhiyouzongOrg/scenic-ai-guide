import * as systemPath from "node:path";

export function resolveStaticFilePath(publicDir, pathname, pathApi = systemPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0") || decodedPath.split(/[\\/]+/).includes("..")) {
    return null;
  }

  const requestedPath = decodedPath === "" || decodedPath === "/" ? "index.html" : decodedPath;
  const relativePath = pathApi.normalize(requestedPath)
    .replace(/^[/\\]+/, "");

  // A Windows drive path remains absolute after leading separators are removed.
  // Reject it explicitly before resolving so the same input is safe on every OS.
  if (/^[a-zA-Z]:/.test(relativePath) || pathApi.parse(relativePath).root) {
    return null;
  }

  const publicRoot = pathApi.resolve(publicDir);
  const filePath = pathApi.resolve(publicRoot, relativePath);
  const relation = pathApi.relative(publicRoot, filePath);
  if (relation === ".." || relation.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relation)) {
    return null;
  }
  return filePath;
}
