import { gunzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(webRoot, option('--config', 'performance/sensitive-scan.json'))
const reportPath = resolve(
  webRoot,
  option('--report', 'performance/reports/sensitive-scan.json')
)
const warnOnly = process.argv.includes('--warn-only')
const config = JSON.parse(readFileSync(configPath, 'utf8'))

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function directoryExists(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function parseEnvironmentFile(path) {
  try {
    const values = []
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match) continue
      values.push([match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')])
    }
    return values
  } catch {
    return []
  }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

function isPlaceholder(value) {
  return /^(?:<.*>|example|sample|placeholder|changeme|replace-me|undefined|null|test(?:ing)?[-_])/i.test(
    value
  )
}

const sensitiveName = new RegExp(config.sensitiveEnvironmentNamePattern, 'i')
const allowedClientEnvironmentNames = new Set(config.allowedClientEnvironmentNames || [])
const sensitiveValues = new Map()
for (const [name, rawValue] of Object.entries(process.env)) {
  const value = String(rawValue || '').trim()
  if (
    sensitiveName.test(name) &&
    !allowedClientEnvironmentNames.has(name) &&
    value.length >= config.minimumEnvironmentValueLength &&
    !isPlaceholder(value)
  ) {
    sensitiveValues.set(`${name} (process)`, value)
  }
}
for (const envFile of config.environmentFiles) {
  for (const [name, rawValue] of parseEnvironmentFile(resolve(webRoot, envFile))) {
    const value = rawValue.trim()
    if (
      sensitiveName.test(name) &&
      !allowedClientEnvironmentNames.has(name) &&
      value.length >= config.minimumEnvironmentValueLength &&
      !isPlaceholder(value)
    ) {
      sensitiveValues.set(`${name} (${envFile})`, value)
    }
  }
}

const allowedExtensions = new Set(config.textExtensions)
const patterns = config.patterns.map((pattern) => ({
  ...pattern,
  expression: new RegExp(pattern.expression, pattern.flags || 'g')
}))
const findings = []
let scannedFiles = 0
let scannedBytes = 0

for (const rootName of config.scanRoots) {
  const root = resolve(webRoot, rootName)
  if (!directoryExists(root)) continue
  for (const path of walk(root)) {
    const relativePath = relative(webRoot, path).replaceAll(sep, '/')
    const extension = extname(path).toLowerCase()
    const isGzipText =
      path.endsWith('.gz') && allowedExtensions.has(extname(path.slice(0, -3)).toLowerCase())
    if (!allowedExtensions.has(extension) && !isGzipText) continue

    const bytes = statSync(path).size
    if (bytes > config.maximumFileBytes) {
      findings.push({ rule: 'scan-size-limit', file: relativePath, line: null })
      continue
    }

    const buffer = readFileSync(path)
    const text = isGzipText ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8')
    scannedFiles += 1
    scannedBytes += buffer.length

    if (rootName === 'dist' && (path.endsWith('.map') || path.endsWith('.map.gz'))) {
      findings.push({ rule: 'public-sourcemap', file: relativePath, line: null })
    }

    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0
      let match
      while ((match = pattern.expression.exec(text)) !== null) {
        findings.push({
          rule: pattern.id,
          file: relativePath,
          line: lineAt(text, match.index)
        })
        if (match[0].length === 0) pattern.expression.lastIndex += 1
      }
    }

    for (const [name, value] of sensitiveValues) {
      let offset = text.indexOf(value)
      while (offset >= 0) {
        findings.push({
          rule: `environment-value:${name}`,
          file: relativePath,
          line: lineAt(text, offset)
        })
        offset = text.indexOf(value, offset + value.length)
      }
    }
  }
}

const uniqueFindings = [
  ...new Map(
    findings.map((finding) => [
      `${finding.rule}\0${finding.file}\0${finding.line ?? ''}`,
      finding
    ])
  ).values()
]
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  warnOnly,
  scannedFiles,
  scannedBytes,
  sensitiveValueSources: [...sensitiveValues.keys()].sort(),
  findingCount: uniqueFindings.length,
  findings: uniqueFindings
}
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (uniqueFindings.length > 0) {
  for (const finding of uniqueFindings) {
    console.error(
      `[sensitive-scan] ${finding.rule}: ${finding.file}${finding.line ? `:${finding.line}` : ''}`
    )
  }
  console.error(`Sensitive build scan found ${uniqueFindings.length} issue(s).`)
  if (!warnOnly) process.exitCode = 1
} else {
  console.log(`Sensitive build scan passed: ${scannedFiles} files, no findings.`)
}
