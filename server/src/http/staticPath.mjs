/**
 * @fileoverview 静态文件路径安全解析器，用于阻止目录穿越、NUL 和跨盘符访问。
 * @description 将 URL 路径约束在指定根目录内，阻止目录穿越、NUL 与跨盘符访问。
 */
import * as systemPath from "node:path";

/**
 * @description 将 URL 路径安全地限制在指定静态根目录内。
 *
 * @param {string} publicDir 静态资源根目录。
 * @param {string} pathname URL pathname；根路径会映射到 `index.html`。
 * @param {typeof import("node:path")} [pathApi=systemPath] 可替换的路径 API，便于跨平台测试。
 * @returns {string|null} 安全的绝对文件路径；输入非法或逃逸根目录时返回 `null`。
 * @example
 * const filePath = resolveStaticFilePath("/srv/web", "/assets/app.js");
 * if (!filePath) throw new Error("invalid static path");
 */
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
