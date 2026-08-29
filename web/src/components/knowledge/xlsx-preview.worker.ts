/**
 * @fileoverview 在 Web Worker 中解析并裁剪 XLSX 文档预览数据。
 * @description 限制工作表、行和列数量，将单元格规范化后回传给知识文档界面。
 */

import { read, utils } from 'xlsx'

const maxSheets = 12
const maxRows = 120
const maxColumns = 30

/**
 * @typedef {object} PreviewRequest
 * @description 主线程发送给 XLSX 预览 Worker 的解析请求。
 * @property {number} id 用于匹配请求与响应的序号。
 * @property {ArrayBuffer} data 待解析的 XLSX 二进制内容。
 */
interface PreviewRequest {
  id: number
  data: ArrayBuffer
}

/**
 * @typedef {object} PreviewSheet
 * @description 单个工作表经过行列上限裁剪后的预览结构。
 * @property {string} name 工作表名称。
 * @property {string[][]} rows 已规范化为字符串的二维单元格数组。
 * @property {boolean} truncated 工作表是否因行列上限而被截断。
 */
interface PreviewSheet {
  name: string
  rows: string[][]
  truncated: boolean
}

/**
 * @description 将工作表单元格统一转换为可展示字符串，并把日期序列化为 ISO 文本。
 * @param {unknown} value XLSX 解析得到的原始单元格值。
 * @returns {string} 可安全发送给主线程的单元格文本。
 */
function normalizeCell(value: unknown) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

self.onmessage = (event: MessageEvent<PreviewRequest>) => {
  const { id, data } = event.data
  try {
    const workbook = read(data, {
      type: 'array',
      dense: true,
      raw: false,
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      sheetRows: maxRows + 1
    })
    const sheetNames = workbook.SheetNames.slice(0, maxSheets)
    const sheets: PreviewSheet[] = sheetNames.map((name) => {
      const worksheet = workbook.Sheets[name]
      const sourceRows = utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      })
      const rows = sourceRows
        .slice(0, maxRows)
        .map((row) => row.slice(0, maxColumns).map(normalizeCell))
      return {
        name,
        rows,
        truncated: sourceRows.length > maxRows || sourceRows.some((row) => row.length > maxColumns)
      }
    })

    self.postMessage({
      id,
      ok: true,
      sheets,
      sheetCount: workbook.SheetNames.length,
      sheetsTruncated: workbook.SheetNames.length > maxSheets
    })
  } catch (reason) {
    self.postMessage({
      id,
      ok: false,
      error: reason instanceof Error ? reason.message : 'Unable to parse spreadsheet.'
    })
  }
}
