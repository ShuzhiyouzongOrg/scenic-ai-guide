/**
 * @fileoverview Web 构建产物敏感信息扫描脚本。
 * @description 检查环境变量、配置文件和产物文本，阻止凭证、私钥或 Source Map 意外发布。
 */
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

/**
 * @description 读取命令行选项后的值，缺失时使用默认值。
 * @param {string} name 命令行选项名称。
 * @param {string} fallback 未提供选项值时使用的默认值。
 * @returns {string} 命令行传入值或默认值。
 */
function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

/**
 * @description 递归列出目录下的全部文件。
 * @param {string} directory 待遍历的目录绝对路径。
 * @returns {string[]} 目录树中的文件绝对路径列表。
 * @throws {Error} 目录无法读取时由文件系统接口抛出。
 */
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/**
 * @description 判断路径是否存在且为目录，并将访问异常视为不存在。
 * @param {string} path 待检查的文件系统路径。
 * @returns {boolean} 路径为可访问目录时返回 `true`。
 */
function directoryExists(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * @description 解析环境变量文件中的名称和值，并忽略注释或无效行。
 * @param {string} path 环境变量文件路径。
 * @returns {Array<[string, string]>} 环境变量名称和值组成的元组列表；读取失败时返回空数组。
 */
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

/**
 * @description 根据字符偏移量计算文本中的一基行号。
 * @param {string} text 完整文本内容。
 * @param {number} offset 从零开始的字符偏移量。
 * @returns {number} 对应的一基行号。
 */
function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

/**
 * @description 判断配置值是否为示例、占位符或测试前缀，而非真实凭证。
 * @param {string} value 待识别的环境变量值。
 * @returns {boolean} 值符合已知占位模式时返回 `true`。
 */
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
