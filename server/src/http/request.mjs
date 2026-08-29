/**
 * @fileoverview Node HTTP 请求体解析工具，覆盖 JSON、原始字节和 multipart 表单。
 * @description 解析 JSON、原始字节和 multipart 表单，并实施请求体大小与格式限制。
 */

/**
 * @typedef {object} MultipartFile
 * @description multipart 表单中的单个文件字段。
 * @property {string} fileName 客户端提交的文件名。
 * @property {string} mimeType 文件媒体类型。
 * @property {Buffer} buffer 文件原始字节。
 */

/**
 * @typedef {object} MultipartForm
 * @description 解析后的 multipart 文本字段和文件字段集合。
 * @property {Record<string, string>} fields 文本字段映射。
 * @property {Record<string, MultipartFile>} files 文件字段映射。
 */

/**
 * @description 读取并解析 JSON 请求体；空请求体返回空对象。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求对象。
 * @returns {Promise<Record<string, unknown>>} 解析后的 JSON 对象。
 * @throws {Error & {statusCode: number, code: string}} 请求体不是合法 JSON 时抛出 `INVALID_JSON`。
 * @example
 * const body = await readJson(req);
 * const question = String(body.question || "");
 */
export async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON request body.");
    error.statusCode = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

/**
 * @description 以 UTF-8 文本读取完整请求体。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求对象。
 * @returns {Promise<string>} 请求体文本。
 * @throws {Error & {statusCode?: number, code?: string}} 流读取失败或超出默认大小限制时抛出。
 * @example
 * const raw = await readBody(req);
 */
export function readBody(req) {
	return readBodyBuffer(req).then((buffer) => buffer.toString("utf8"));
}

/**
 * @description 将请求流聚合为 Buffer，并限制最大字节数以防止内存耗尽。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求对象。
 * @param {number} [maxBytes=15728640] 允许读取的最大字节数。
 * @returns {Promise<Buffer>} 完整请求体。
 * @throws {Error & {statusCode: number, code: string}} 超限时抛出 `REQUEST_TOO_LARGE`，流错误则原样透传。
 * @example
 * const audio = await readBodyBuffer(req, 5 * 1024 * 1024);
 */
export function readBodyBuffer(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxBytes) {
				const error = new Error("Request body is too large.");
				error.statusCode = 413;
				error.code = "REQUEST_TOO_LARGE";
				reject(error);
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
    req.on("error", reject);
		req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * @description 解析简单的 `multipart/form-data` 请求，将文本字段和文件字段分开返回。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求对象。
 * @param {number} [maxBytes=15728640] 表单体最大字节数。
 * @returns {Promise<MultipartForm>} 文本字段和文件字段映射。
 * @throws {Error & {statusCode: number, code: string}} 缺少 boundary 时抛出
 * `MULTIPART_BOUNDARY_REQUIRED`，超限时抛出 `REQUEST_TOO_LARGE`。
 * @example
 * const { fields, files } = await readMultipartForm(req);
 * console.log(fields.sessionId, files.avatar?.mimeType);
 */
export async function readMultipartForm(req, maxBytes = 15 * 1024 * 1024) {
	const contentType = String(req.headers["content-type"] || "");
	const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
	if (!boundaryMatch) {
		const error = new Error("A multipart boundary is required.");
		error.statusCode = 400;
		error.code = "MULTIPART_BOUNDARY_REQUIRED";
		throw error;
	}

	const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
	const body = await readBodyBuffer(req, maxBytes);
	const fields = {};
	const files = {};
	let cursor = 0;

	while (cursor < body.length) {
		const boundaryIndex = body.indexOf(boundary, cursor);
		if (boundaryIndex < 0) break;
		const partStart = boundaryIndex + boundary.length;
		if (body.subarray(partStart, partStart + 2).toString() === "--") break;
		const headerStart = partStart + 2;
		const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
		if (headerEnd < 0) break;
		const nextBoundary = body.indexOf(boundary, headerEnd + 4);
		if (nextBoundary < 0) break;

		const headerText = body.subarray(headerStart, headerEnd).toString("utf8");
		const disposition = headerText.match(/content-disposition:\s*form-data;[^\r\n]*/i)?.[0] || "";
		const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
		const fileName = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
		const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
		const contentEnd = Math.max(headerEnd + 4, nextBoundary - 2);
		const content = body.subarray(headerEnd + 4, contentEnd);

		if (name) {
			if (fileName) files[name] = { fileName, mimeType, buffer: content };
			else fields[name] = content.toString("utf8");
		}
		cursor = nextBoundary;
	}

	return { fields, files };
}

/**
 * @description 从 Authorization 请求头提取 Bearer Token。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求对象。
 * @returns {string} Token 文本；请求头缺失或格式不匹配时返回空字符串。
 * @example
 * const token = getBearerToken(req);
 */
export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}
