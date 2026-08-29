/**
 * @fileoverview 文本型 PDF 的页级文本提取与 OCR 分流。
 * @description
 * 提取文本型 PDF 的页级内容，并将扫描件或低文本密度文档分流至 OCR。
 *
 * 该实现只处理 PDF 文本操作符，不把 PDF 二进制直接按 UTF-8 索引；扫描页或密度过低的
 * 文档返回 `needsOcr`，等待后续 OCR 任务，不伪装为已处理。
 */

/**
 * @typedef {object} PdfKnowledgeInput
 * @description 待解析 PDF 及其知识元数据。
 * @property {Buffer} buffer PDF 文件内容。
 * @property {string} documentId 文档 ID。
 * @property {string} fileName 文件名。
 * @property {string} [knowledgeScope] 知识用途范围。
 * @property {string} [scenicArea] 所属景区。
 * @property {string} [language] 文档语言。
 */

/**
 * @typedef {object} PdfKnowledgePage
 * @description 从 PDF 提取的一页文本。
 * @property {number} page 页码。
 * @property {string} content 清理后的页面文本。
 */

/**
 * @typedef {object} PdfKnowledgeResult
 * @description PDF 文本提取与 OCR 分流结果。
 * @property {Array<Record<string, *>>} chunks 可索引的页级知识分块；需要 OCR 时为空数组。
 * @property {PdfKnowledgePage[]} pages 已提取且非空的页面文本。
 * @property {number} pageCount PDF 页面总数。
 * @property {boolean} needsOcr 是否应转入 OCR 处理。
 * @property {string} parser 解析器标识。
 * @property {string} documentHash PDF 内容的 SHA-256 摘要。
 */
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * @description
 * PDF 解析资源上限。
 * @type {Readonly<Record<string, number>>} PDF 解析资源上限。
 */
export const PDF_LIMITS = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxPages: 500,
  maxInflatedStreamBytes: 8 * 1024 * 1024,
  minCharsPerPage: 20
});

/**
 * @description
 * 提取 PDF 页面文本并判断是否需要 OCR。
 * @param {PdfKnowledgeInput} input 解析输入。
 * @returns {PdfKnowledgeResult} 解析结果。
 * @throws {Error & {code: string, statusCode?: number}} 文件签名、加密、页数或解析失败时抛出。
 * @example
 * const result = extractPdfKnowledge({
 *   buffer: pdfBuffer,
 *   documentId: "upload_pdf_1",
 *   fileName: "景区资料.pdf"
 * });
 */
export function extractPdfKnowledge({
  buffer,
  documentId,
  fileName,
  knowledgeScope = "visitor_qa",
  scenicArea = "",
  language = "zh"
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw pdfError("PDF_SIGNATURE_INVALID", "The uploaded file is not a valid PDF package.");
  }
  if (buffer.length > PDF_LIMITS.maxBytes) {
    throw pdfError("PDF_TOO_LARGE", "The PDF exceeds the processing size limit.", 413);
  }
  const source = buffer.toString("latin1");
  if (/\/Encrypt\b/u.test(source)) {
    throw pdfError("PDF_ENCRYPTED", "Encrypted PDFs require manual review before indexing.");
  }

  const objectTexts = extractPageTexts(source);
  const rawPages = objectTexts.length > 0 ? objectTexts : [{ page: 1, text: extractTextOperators(source) }];
  const pages = rawPages
    .map((item, index) => ({ page: item.page || index + 1, content: cleanPageText(item.text) }))
    .filter((item) => item.content);
  const pageCount = Math.max(
    pages.length,
    (source.match(/\/Type\s*\/Page(?!s)\b/gu) || []).length || 1
  );
  if (pageCount > PDF_LIMITS.maxPages) {
    throw pdfError("PDF_TOO_MANY_PAGES", "The PDF has too many pages.");
  }

  const needsOcr = pages.length === 0
    || pages.reduce((sum, page) => sum + page.content.length, 0) < pageCount * PDF_LIMITS.minCharsPerPage
    || pages.some((page) => page.content.length < PDF_LIMITS.minCharsPerPage);
  const chunks = needsOcr
    ? []
    : pages.map((page) => {
      const content = `页码：${page.page}\n${page.content}`;
      return {
        id: `${documentId}_page_${String(page.page).padStart(3, "0")}`,
        documentId,
        parentId: `${documentId}_page_${String(page.page).padStart(3, "0")}`,
        scenicSpotId: null,
        title: `${fileName} 第 ${page.page} 页`,
        sectionPath: `page:${page.page}`,
        content,
        context: `来源：${fileName}；页码：${page.page}`,
        keywords: extractKeywords(page.content),
        source: fileName,
        language,
        fileType: "pdf",
        documentType: "pdf",
        knowledgeScope,
        scenicArea,
        page: page.page,
        enabled: true,
        contentHash: createHash("sha256").update(content).digest("hex")
      };
    });

  return {
    chunks,
    pages,
    pageCount,
    needsOcr,
    parser: "builtin-pdf-text",
    documentHash: createHash("sha256").update(buffer).digest("hex")
  };
}

/**
 * @description
 * 按页面对象的 Contents 引用提取文本；无法建立页面引用时回退到全部流。
 * @param {string} source Latin-1 PDF 源。
 * @returns {Array<{page: number, text: string}>} 页面文本。
 */
function extractPageTexts(source) {
  const objects = new Map();
  const objectPattern = /(\d+)\s+0\s+obj([\s\S]*?)endobj/gu;
  for (const match of source.matchAll(objectPattern)) {
    objects.set(Number(match[1]), match[2]);
  }
  const pages = [];
  for (const [objectId, object] of objects) {
    if (!/\/Type\s*\/Page(?!s)\b/u.test(object)) continue;
    const refs = [...object.matchAll(/(\d+)\s+0\s+R/gu)].map((match) => Number(match[1]));
    const text = refs.map((ref) => extractObjectText(objects.get(ref) || "")).join(" ");
    if (text.trim()) pages.push({ page: pages.length + 1, text });
    else pages.push({ page: pages.length + 1, text: extractObjectText(object) });
    void objectId;
  }
  if (pages.length > 0) return pages;
  const streams = [...objects.values()].map(extractObjectText).filter(Boolean);
  return streams.length > 0 ? [{ page: 1, text: streams.join(" ") }] : [];
}

/**
 * @description
 * 从单个 PDF 对象中提取可显示文本。
 * @param {string} object PDF 对象内容。
 * @returns {string} 对象文本。
 */
function extractObjectText(object) {
  const stream = object.match(/stream\r?\n([\s\S]*?)\r?\nendstream/u);
  if (!stream) return extractTextOperators(object);
  let payload = Buffer.from(stream[1], "latin1");
  if (/\/FlateDecode\b/u.test(object)) {
    try {
      payload = inflateSync(payload, { maxOutputLength: PDF_LIMITS.maxInflatedStreamBytes });
    } catch {
      return "";
    }
  }
  return extractTextOperators(payload.toString("latin1"));
}

/**
 * @description
 * 从 PDF 内容流的文本操作符中提取文字。
 * @param {string} source PDF 文本或解压后的内容。
 * @returns {string} 操作符中的文字。
 */
function extractTextOperators(source) {
  const values = [];
  for (const match of source.matchAll(/(\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>)\s*Tj/gu)) {
    values.push(decodePdfString(match[1]));
  }
  for (const match of source.matchAll(/\[([\s\S]*?)\]\s*TJ/gu)) {
    const parts = [...match[1].matchAll(/(\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>)/gu)]
      .map((item) => decodePdfString(item[1]));
    values.push(parts.join(""));
  }
  return values.join(" ");
}

/**
 * @description
 * 解码 PDF literal 或十六进制字符串。
 * @param {string} token PDF literal或十六进制字符串。
 * @returns {string} Unicode文本。
 */
function decodePdfString(token) {
  if (token.startsWith("<")) {
    const hex = token.slice(1, -1).replace(/\s/gu, "");
    const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex");
    return decodeBytes(bytes);
  }
  const body = token.slice(1, -1).replace(/\\([nrtbf()\\])/gu, (_, value) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[value] || value));
  return decodeBytes(Buffer.from(body, "latin1"));
}

/**
 * @description
 * 按 PDF 常见编码顺序将字节转换为 Unicode 文本。
 * @param {Buffer} bytes PDF 字符串字节。
 * @returns {string} 解码文本。
 */
function decodeBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return swapped.toString("utf16le");
  }
  return bytes.toString("utf8");
}

/**
 * @description
 * 清理页面文本中的空白和不可见字符。
 * @param {string} value 页面原文。
 * @returns {string} 清理后的文本。
 */
function cleanPageText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

/**
 * @description
 * 从页面正文提取去重后的轻量关键词。
 * @param {string} text 页面正文。
 * @returns {string[]} 轻量关键词。
 */
function extractKeywords(text) {
  return [...new Set((String(text).match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) || []).slice(0, 40))];
}

/**
 * @description
 * 创建携带业务错误码和 HTTP 状态码的 PDF 解析异常。
 * @param {string} code 错误码。
 * @param {string} message 错误消息。
 * @param {number} [statusCode=422] HTTP状态码。
 * @returns {Error & {code: string, statusCode: number}} 错误对象。
 */
function pdfError(code, message, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
