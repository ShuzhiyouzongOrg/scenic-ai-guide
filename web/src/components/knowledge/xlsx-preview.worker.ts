import { read, utils } from 'xlsx'

const maxSheets = 12
const maxRows = 120
const maxColumns = 30

interface PreviewRequest {
  id: number
  data: ArrayBuffer
}

interface PreviewSheet {
  name: string
  rows: string[][]
  truncated: boolean
}

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
