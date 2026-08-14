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

export function readBody(req) {
	return readBodyBuffer(req).then((buffer) => buffer.toString("utf8"));
}

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

export async function readMultipartForm(req) {
	const contentType = String(req.headers["content-type"] || "");
	const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
	if (!boundaryMatch) {
		const error = new Error("A multipart boundary is required.");
		error.statusCode = 400;
		error.code = "MULTIPART_BOUNDARY_REQUIRED";
		throw error;
	}

	const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
	const body = await readBodyBuffer(req);
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

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}
