/**
 * @fileoverview 无外部依赖的 DOCX 正文提取与 WordprocessingML 纯文本转换工具。
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * 从 DOCX ZIP 容器的 `word/document.xml` 中提取纯文本。
 * 直接读取 ZIP 中央目录并使用 Node.js zlib 解压，兼容中文路径且无需外部命令。
 * @param {string|Buffer|URL|number} filePath 可传给 `readFileSync` 的 DOCX 文件路径或文件描述符。
 * @returns {string} 清理后的文档正文。
 * @throws {NodeJS.ErrnoException} 当文件不存在或无法读取时抛出文件系统异常。
 * @throws {Error & {code: "DOCX_ENTRY_NOT_FOUND"}} 当文档不包含 `word/document.xml` 时抛出。
 * @throws {Error} 当 ZIP 条目无法解压时抛出 zlib 异常。
 * @example
 * const text = extractDocxText("./guide.docx");
 */
export function extractDocxText(filePath) {
  const buffer = readFileSync(filePath);
  const xml = readZipEntry(buffer, "word/document.xml");
  if (xml == null) {
    const error = new Error(`word/document.xml not found in ${filePath}`);
    error.code = "DOCX_ENTRY_NOT_FOUND";
    throw error;
  }
  return docxXmlToText(xml.toString("utf8"));
}

/**
 * 在 ZIP 中央目录中查找条目，并依据中央目录记录的大小读取本地数据。
 * 这可兼容本地头大小为零、实际大小写在流式数据描述符中的条目。
 * @private
 * @param {Buffer} buffer 完整 ZIP 文件内容。
 * @param {string} entryName UTF-8 条目名称。
 * @returns {Buffer|null} 解压后的条目内容；ZIP 结构无效或未找到时返回 `null`。
 * @throws {RangeError} 当 ZIP 目录偏移越界时可能抛出。
 * @throws {Error} 当压缩数据无效时抛出 zlib 异常。
 */
function readZipEntry(buffer, entryName) {
  const EOCD_SIGNATURE = 0x06054b50;
  const target = Buffer.from(entryName, "utf8");

  let eocd = -1;
  const minEocd = 22;
  const scanStart = Math.max(0, buffer.length - (minEocd + 0xffff));
  for (let offset = buffer.length - minEocd; offset >= scanStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) {
    return null;
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
      break;
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const nameStart = pointer + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength);

    if (name.equals(target)) {
      return readLocalEntry(buffer, localOffset, method, compressedSize);
    }
    pointer = nameStart + nameLength + extraLength + commentLength;
  }

  return null;
}

/**
 * 从 ZIP 本地文件头定位并解压一个条目。
 * @private
 * @param {Buffer} buffer 完整 ZIP 文件内容。
 * @param {number} localOffset 本地文件头的字节偏移。
 * @param {number} method ZIP 压缩方法；`0` 表示存储，其他当前按 raw DEFLATE 处理。
 * @param {number} compressedSize 压缩后字节数。
 * @returns {Buffer|null} 条目原始内容；本地头签名不正确时返回 `null`。
 * @throws {RangeError} 当本地头偏移越界时可能抛出。
 * @throws {Error} 当 DEFLATE 数据无法解压时抛出 zlib 异常。
 */
function readLocalEntry(buffer, localOffset, method, compressedSize) {
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    return null;
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + compressedSize);

  // method 0 = stored (no compression), method 8 = raw DEFLATE.
  return method === 0 ? Buffer.from(data) : inflateRawSync(data);
}

/**
 * 将 WordprocessingML XML 转换为适合检索的纯文本。
 * @param {string} xml `word/document.xml` 的 UTF-8 文本。
 * @returns {string} 保留段落、表格单元格和制表符边界的纯文本。
 * @example
 * docxXmlToText("<w:p><w:r><w:t>灵山</w:t></w:r></w:p>"); // "灵山"
 */
export function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
