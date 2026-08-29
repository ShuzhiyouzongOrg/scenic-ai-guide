/**
 * @fileoverview Web 主入口包体积报告脚本。
 * @description 读取构建清单并汇总入口及关联资源体积，用于定位首屏包体积变化。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

/**
 * @description 描述可视化报告中单个模块片段的渲染与压缩体积。
 * @typedef {object} BundlePart
 * @property {number} renderedLength 未压缩渲染字节数。
 * @property {number} gzipLength Gzip 压缩字节数。
 * @property {number} brotliLength Brotli 压缩字节数。
 */
interface BundlePart {
  renderedLength: number
  gzipLength: number
  brotliLength: number
}

/**
 * @description 描述模块标识及其在各构建分块中的片段映射。
 * @typedef {object} BundleMeta
 * @property {string} id 模块标识。
 * @property {Record<string, string>} moduleParts 构建分块名称到片段标识的映射。
 */
interface BundleMeta {
  id: string
  moduleParts: Record<string, string>
}

/**
 * @description 描述 Rollup 可视化器输出的片段数据和模块元数据。
 * @typedef {object} VisualizerReport
 * @property {Record<string, BundlePart>} nodeParts 片段标识到体积数据的映射。
 * @property {Record<string, BundleMeta>} nodeMetas 模块标识到模块元数据的映射。
 */
interface VisualizerReport {
  nodeParts: Record<string, BundlePart>
  nodeMetas: Record<string, BundleMeta>
}

const root = process.cwd()
const reportPath = resolve(root, 'performance/pagespeed/current/bundle-stats.json')
const htmlPath = resolve(root, 'dist/index.html')
const outputPath = resolve(root, 'performance/pagespeed/current/main-entry-top-20.json')
const html = readFileSync(htmlPath, 'utf8')
const entryMatch = html.match(/<script[^>]+src="\/?([^"?]+\.js)"/u)

if (!entryMatch) throw new Error(`Unable to find the production entry script in ${htmlPath}.`)

const entry = entryMatch[1]
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as VisualizerReport
const availableChunks = new Set(
  Object.values(report.nodeMetas).flatMap((meta) => Object.keys(meta.moduleParts))
)

if (!availableChunks.has(entry)) {
  throw new Error(`Bundle report does not contain the current entry ${entry}; rebuild with VITE_BUNDLE_REPORT=true.`)
}

const modules = Object.values(report.nodeMetas)
  .flatMap((meta) => {
    const partId = meta.moduleParts[entry]
    const part = partId ? report.nodeParts[partId] : undefined
    return part ? [{ module: meta.id.replaceAll('\\', '/'), ...part }] : []
  })
  .sort((left, right) => right.gzipLength - left.gzipLength)

if (modules.length === 0) throw new Error(`No modules were attributed to ${entry}.`)

const payload = {
  entry: basename(entry),
  moduleCount: modules.length,
  totals: modules.reduce(
    (total, module) => ({
      renderedBytes: total.renderedBytes + module.renderedLength,
      gzipBytes: total.gzipBytes + module.gzipLength,
      brotliBytes: total.brotliBytes + module.brotliLength
    }),
    { renderedBytes: 0, gzipBytes: 0, brotliBytes: 0 }
  ),
  top20: modules.slice(0, 20)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`PASS  wrote ${payload.top20.length} main-entry modules to ${outputPath}`)
