/**
 * @fileoverview Web 资源体积预算检查脚本。
 * @description 对生产资源、入口包和压缩体积执行预算校验，并支持维护可追踪的基线文件。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(webRoot, option('--dist', 'dist'))
const configPath = resolve(webRoot, option('--config', 'performance/resource-budget.json'))
const baselinePath = resolve(
  webRoot,
  option('--baseline', 'performance/budgets/baseline.json')
)
const reportPath = resolve(
  webRoot,
  option('--report', 'performance/reports/resource-budget.json')
)
const writeBaseline = process.argv.includes('--write-baseline')
const enforce = process.argv.includes('--enforce')
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
 * @throws {Error} 目录不存在或读取失败时由文件系统接口抛出。
 */
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/**
 * @description 将本地静态资源 URL 转换为构建目录中的文件路径。
 * @param {string} url HTML 中引用的资源 URL。
 * @returns {string | null} 对应的本地文件路径；外部地址或 Data URL 返回 `null`。
 */
function publicPathToFile(url) {
  const clean = url.split(/[?#]/, 1)[0]
  if (/^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith('data:')) return null
  return join(distRoot, ...clean.replace(/^\/+/, '').split('/'))
}

/**
 * @description 获取资源的预压缩 Gzip 体积，缺少预压缩文件时即时计算。
 * @param {string} path 原始资源文件路径。
 * @returns {{bytes: number, source: 'precompressed' | 'calculated'}} 传输字节数及其来源。
 * @throws {Error} 原始资源无法读取或压缩失败时抛出。
 */
function transportSize(path) {
  try {
    return { bytes: statSync(`${path}.gz`).size, source: 'precompressed' }
  } catch {
    return { bytes: gzipSync(readFileSync(path), { level: 9 }).length, source: 'calculated' }
  }
}

/**
 * @description 计算当前资源指标相对基线的字节数和百分比变化。
 * @param {number} current 当前指标值。
 * @param {number} baseline 基线指标值。
 * @returns {{bytes: number, percent: number | null} | null} 差值；基线无效时返回 `null`。
 */
function metricDelta(current, baseline) {
  if (!Number.isFinite(baseline)) return null
  const bytes = current - baseline
  return {
    bytes,
    percent: baseline === 0 ? null : Number(((bytes / baseline) * 100).toFixed(2))
  }
}

/**
 * @description 执行 Git 只读命令并在失败或空输出时返回回退值。
 * @param {string[]} args 传给 Git 的参数列表。
 * @param {string} [fallback] 命令失败或输出为空时使用的回退值。
 * @returns {string} 去除首尾空白后的命令输出或回退值。
 */
function gitValue(args, fallback = 'unknown') {
  try {
    return (
      execFileSync('git', args, {
        cwd: webRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim() || fallback
    )
  } catch {
    return fallback
  }
}

const files = walk(distRoot)
  .filter((path) => !path.endsWith('.gz') && !path.endsWith('.map'))
  .map((path) => ({
    path,
    relativePath: relative(distRoot, path).replaceAll(sep, '/'),
    bytes: statSync(path).size
  }))
const indexHtml = readFileSync(join(distRoot, 'index.html'), 'utf8')
const scriptUrls = [
  ...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)
].map((match) => match[1])
const stylesheetUrls = [
  ...indexHtml.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)
].map((match) => match[1])
const entryScripts = scriptUrls
  .map(publicPathToFile)
  .filter((path) => path && extname(path) === '.js')
const entryStyles = stylesheetUrls
  .map(publicPathToFile)
  .filter((path) => path && extname(path) === '.css')

if (entryScripts.length === 0) throw new Error('No entry JavaScript was found in dist/index.html.')

const entryJavaScript = entryScripts.map((path) => ({
  path: relative(distRoot, path).replaceAll(sep, '/'),
  rawBytes: statSync(path).size,
  gzip: transportSize(path)
}))
const entryCss = entryStyles.map((path) => ({
  path: relative(distRoot, path).replaceAll(sep, '/'),
  rawBytes: statSync(path).size,
  gzip: transportSize(path)
}))
const chunks = files
  .filter((file) => file.relativePath.startsWith('assets/') && extname(file.path) === '.js')
  .map((file) => ({ ...file, gzip: transportSize(file.path) }))
  .sort((a, b) => b.gzip.bytes - a.gzip.bytes)
const backgroundExpressions = config.backgroundAssetPatterns.map(
  (expression) => new RegExp(expression, 'i')
)
const backgrounds = files
  .filter((file) => backgroundExpressions.some((expression) => expression.test(file.relativePath)))
  .sort((a, b) => b.bytes - a.bytes)
const largestResources = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 20)
const compressibleExtensions = new Set(config.compressibleExtensions)

const metrics = {
  entryJavaScriptGzipBytes: entryJavaScript.reduce((sum, file) => sum + file.gzip.bytes, 0),
  entryCssGzipBytes: entryCss.reduce((sum, file) => sum + file.gzip.bytes, 0),
  backgroundAssetMaxBytes: backgrounds[0]?.bytes || 0,
  chunkGzipMaxBytes: chunks[0]?.gzip.bytes || 0,
  maximumAssetBytes: largestResources[0]?.bytes || 0,
  totalAssetBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  estimatedCompressibleGzipBytes: files
    .filter((file) => compressibleExtensions.has(extname(file.path).toLowerCase()))
    .reduce((sum, file) => sum + transportSize(file.path).bytes, 0)
}

const violations = []
for (const [metric, limit] of Object.entries(config.budgets)) {
  if (metrics[metric] > limit) {
    violations.push({ metric, actualBytes: metrics[metric], limitBytes: limit })
  }
}

let baseline = null
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
} catch {
  baseline = null
}
const relativeToBaseline = Object.fromEntries(
  Object.entries(metrics).map(([name, value]) => [
    name,
    metricDelta(value, baseline?.metrics?.[name])
  ])
)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: gitValue(['rev-parse', 'HEAD']),
  dirty: gitValue(['status', '--porcelain'], '') !== '',
  enforce,
  budgets: config.budgets,
  metrics,
  relativeToBaseline,
  violationCount: violations.length,
  violations,
  entryJavaScript,
  entryCss,
  backgrounds: backgrounds.map(({ relativePath, bytes }) => ({ path: relativePath, bytes })),
  largestChunks: chunks.slice(0, 20).map(({ relativePath, bytes, gzip }) => ({
    path: relativePath,
    rawBytes: bytes,
    gzipBytes: gzip.bytes,
    gzipSource: gzip.source
  })),
  largestResources: largestResources.map(({ relativePath, bytes }) => ({
    path: relativePath,
    bytes
  })),
  distFingerprint: createHash('sha256')
    .update(
      files
        .map((file) => `${file.relativePath}\0${file.bytes}`)
        .sort()
        .join('\n')
    )
    .digest('hex')
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (writeBaseline) {
  const snapshot = {
    schemaVersion: 1,
    capturedAt: report.generatedAt,
    commit: report.commit,
    dirty: report.dirty,
    distFingerprint: report.distFingerprint,
    metrics
  }
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Resource budget baseline written to ${relative(webRoot, baselinePath)}.`)
}

for (const [name, value] of Object.entries(metrics)) {
  const delta = relativeToBaseline[name]
  const deltaText = delta
    ? ` (${delta.bytes >= 0 ? '+' : ''}${delta.bytes} bytes${
        delta.percent === null
          ? ''
          : `, ${delta.percent >= 0 ? '+' : ''}${delta.percent}%`
      })`
    : ''
  console.log(`${name}: ${value} bytes${deltaText}`)
}
for (const violation of violations) {
  console.warn(
    `[resource-budget] ${violation.metric}: ${violation.actualBytes} > ${violation.limitBytes} bytes`
  )
}

if (violations.length > 0 && enforce) {
  process.exitCode = 1
} else if (violations.length > 0) {
  console.warn(`Resource budget has ${violations.length} warning(s); enforcement is disabled.`)
} else {
  console.log('Resource budget passed without warnings.')
}
