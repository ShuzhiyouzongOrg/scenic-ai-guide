/**
 * @fileoverview XLSX 工作簿的结构化知识提取器。
 *
 * @description 解析只读取单元格缓存，不执行宏、外链或公式；每条记录保留工作表和行范围，
 * 便于管理员追溯来源。用途隔离由上传服务决定，行为分析表不会自动进入游客 RAG。
 */
import XLSX from "xlsx";
import { createHash } from "node:crypto";

/**
 * @description XLSX 解析资源与安全上限。
 * @type {Readonly<Record<string, number>>}
 * @example
 * const maxRows = XLSX_LIMITS.maxRows;
 */
export const XLSX_LIMITS = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 128 * 1024 * 1024,
  maxEntries: 4_096,
  maxCompressionRatio: 150,
  maxSheets: 24,
  maxRows: 20_000,
  maxColumns: 128,
  maxChunks: 8_000
});

/**
 * @description 解析工作簿并转换为带表头的结构化文本分块。
 * @param {{buffer: Buffer, documentId: string, fileName: string, knowledgeScope?: string, scenicArea?: string, language?: string}} input 解析输入。
 * @returns {{chunks: object[], sheets: object[], skippedSheets: string[], workbookHash: string}} 结构化结果。
 * @throws {Error & {code: string, statusCode?: number}} 文件损坏、超限或工作表结构异常时抛出。
 * @example
 * const result = extractXlsxKnowledge({ buffer, documentId: "doc-1", fileName: "guide.xlsx" });
 */
export function extractXlsxKnowledge({
  buffer,
  documentId,
  fileName,
  knowledgeScope = "visitor_qa",
  scenicArea = "",
  language = "zh"
}) {
  assertBuffer(buffer);
  if (buffer.length > XLSX_LIMITS.maxBytes) {
    throw processingError("XLSX_TOO_LARGE", "The workbook exceeds the processing size limit.", 413);
  }
  inspectXlsxPackage(buffer);

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
      dense: true
    });
  } catch (error) {
    throw processingError("XLSX_INVALID", "The workbook could not be parsed.", 422, error);
  }

  const sheets = [];
  const skippedSheets = [];
  const chunks = [];
  const visibility = new Map(
    (workbook.Workbook?.Sheets || []).map((sheet) => [sheet.name, Number(sheet.Hidden || 0)])
  );

  if (workbook.SheetNames.length > XLSX_LIMITS.maxSheets) {
    throw processingError("XLSX_TOO_MANY_SHEETS", "The workbook has too many worksheets.", 422);
  }

  for (const sheetName of workbook.SheetNames) {
    if (visibility.get(sheetName) > 0) {
      skippedSheets.push(sheetName);
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const range = sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    if (!range) {
      skippedSheets.push(sheetName);
      continue;
    }
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    if (rowCount > XLSX_LIMITS.maxRows || columnCount > XLSX_LIMITS.maxColumns) {
      throw processingError("XLSX_SHEET_TOO_LARGE", `Worksheet ${sheetName} exceeds the processing limit.`, 422);
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false
    });
    const normalizedRows = rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
    const headerIndex = findHeaderRow(normalizedRows);
    const headers = uniqueHeaders(normalizedRows[headerIndex] || [], columnCount);
    const dataStart = headerIndex + 1;
    let rowStart = null;
    let rowEnd = null;

    for (let index = dataStart; index < normalizedRows.length; index += 1) {
      const row = normalizedRows[index];
      if (!row.some(Boolean)) continue;
      const values = headers.map((header, column) => `${header}：${row[column] || ""}`);
      const content = [
        `工作表：${sheetName}`,
        `表头：${headers.join("｜")}`,
        values.join("；")
      ].join("\n").trim();
      const actualRow = range.s.r + index + 1;
      rowStart ??= actualRow;
      rowEnd = actualRow;
      const chunkId = `${documentId}_sheet_${slug(sheetName)}_row_${actualRow}`;
      chunks.push({
        id: chunkId,
        documentId,
        parentId: `${documentId}_sheet_${slug(sheetName)}`,
        scenicSpotId: null,
        title: `${sheetName} 第 ${actualRow} 行`,
        sectionPath: sheetName,
        content,
        context: `来源：${fileName}；工作表：${sheetName}；行：${actualRow}`,
        keywords: headers.filter(Boolean),
        source: fileName,
        language,
        fileType: "xlsx",
        documentType: "xlsx",
        knowledgeScope,
        scenicArea,
        sheetName,
        range: `${XLSX.utils.encode_cell({ r: actualRow - 1, c: range.s.c })}:${XLSX.utils.encode_cell({ r: actualRow - 1, c: range.e.c })}`,
        rowStart: actualRow,
        rowEnd: actualRow,
        enabled: true,
        contentHash: createHash("sha256").update(content).digest("hex")
      });
      if (chunks.length > XLSX_LIMITS.maxChunks) {
        throw processingError("XLSX_TOO_MANY_CHUNKS", "The workbook produces too many knowledge chunks.", 422);
      }
    }

    sheets.push({
      sheetName,
      range: sheet["!ref"],
      rowStart: rowStart ?? range.s.r + 1,
      rowEnd: rowEnd ?? range.s.r,
      rowCount,
      columnCount,
      headerRow: range.s.r + headerIndex + 1,
      chunkCount: chunks.filter((chunk) => chunk.sheetName === sheetName).length
    });
  }

  return {
    chunks,
    sheets,
    skippedSheets,
    workbookHash: createHash("sha256").update(buffer).digest("hex")
  };
}

/**
 * @description 检查 ZIP 中央目录，限制解压体积、文件数、压缩比、宏和外部链接。
 * @param {Buffer} buffer XLSX ZIP 字节。
 * @returns {void} 无返回值。
 * @throws {Error & {code:string,statusCode:number}} 包结构或安全限制不满足时抛出。
 */
function inspectXlsxPackage(buffer) {
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  let entries = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  while ((offset = buffer.indexOf(signature, offset)) !== -1) {
    if (offset + 46 > buffer.length) {
      throw processingError("XLSX_ZIP_DIRECTORY_INVALID", "The workbook ZIP directory is truncated.", 422);
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
    if (nextOffset > buffer.length) {
      throw processingError("XLSX_ZIP_DIRECTORY_INVALID", "The workbook ZIP entry is truncated.", 422);
    }
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8")
      .replaceAll("\\", "/")
      .toLowerCase();
    if (fileName.includes("../") || fileName.startsWith("/")) {
      throw processingError("XLSX_PATH_TRAVERSAL", "The workbook contains an unsafe ZIP path.", 422);
    }
    if (fileName.endsWith("vbaproject.bin") || fileName.includes("/macrosheets/")) {
      throw processingError("XLSX_MACRO_REJECTED", "Macro-enabled workbooks are not accepted as knowledge documents.", 422);
    }
    if (fileName.includes("/externallinks/")) {
      throw processingError("XLSX_EXTERNAL_LINK_REJECTED", "Workbooks with external links are not accepted.", 422);
    }
    entries += 1;
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (entries > XLSX_LIMITS.maxEntries || totalUncompressed > XLSX_LIMITS.maxUncompressedBytes) {
      throw processingError("XLSX_EXPANDED_SIZE_LIMIT", "The expanded workbook exceeds the processing limit.", 413);
    }
    const ratio = uncompressedSize / Math.max(compressedSize, 1);
    if (uncompressedSize > 1024 * 1024 && ratio > XLSX_LIMITS.maxCompressionRatio) {
      throw processingError("XLSX_COMPRESSION_RATIO_LIMIT", "The workbook compression ratio is unsafe.", 422);
    }
    offset = nextOffset;
  }
  if (entries === 0 || totalCompressed === 0) {
    throw processingError("XLSX_ZIP_DIRECTORY_INVALID", "The workbook ZIP directory is missing.", 422);
  }
}

/**
 * @description 校验输入为非空且具有 ZIP 签名的 XLSX 字节。
 * @private
 * @param {Buffer} buffer 文件字节。
 * @returns {void} 无返回值。
 * @throws {Error & {code: "XLSX_EMPTY"|"XLSX_SIGNATURE_INVALID", statusCode: 422}} 输入为空或签名无效时抛出。
 */
function assertBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw processingError("XLSX_EMPTY", "The workbook is empty.", 422);
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw processingError("XLSX_SIGNATURE_INVALID", "The uploaded file is not a valid XLSX package.", 422);
  }
}

/**
 * @description 在前十二行中选择非空唯一单元格最多的一行作为表头。
 * @private
 * @param {string[][]} rows 工作表行。
 * @returns {number} 选中的表头行下标。
 */
function findHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    const score = new Set(rows[index].filter(Boolean)).size;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * @description 补齐空表头并为重复列名追加序号。
 * @private
 * @param {string[]} row 原始表头。
 * @param {number} width 工作表列宽。
 * @returns {string[]} 与列宽一致的唯一表头。
 */
function uniqueHeaders(row, width) {
  const seen = new Map();
  return Array.from({ length: width }, (_, index) => {
    const base = row[index] || `列${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

/**
 * @description 将任意文本转换为适合分块 ID 的短安全片段。
 * @private
 * @param {string} value 任意字符串。
 * @returns {string} 仅含字母、数字和下划线的安全片段。
 */
function slug(value) {
  return String(value).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 40) || "sheet";
}

/**
 * @description 创建带业务错误码、HTTP 状态和可选原因的 XLSX 处理异常。
 * @private
 * @param {string} code 错误码。
 * @param {string} message 错误消息。
 * @param {number} [statusCode=422] HTTP 状态码。
 * @param {Error} [cause] 原始异常。
 * @returns {Error & {code: string, statusCode: number}} XLSX 处理异常。
 */
function processingError(code, message, statusCode = 422, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
