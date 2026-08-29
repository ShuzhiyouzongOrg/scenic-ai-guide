/**
 * @fileoverview Lighthouse 报告摘要脚本。
 * @description 从 Lighthouse JSON 中提取核心评分、体验指标和主要优化机会并输出摘要。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const reportDirectory = resolve(process.argv[2] || 'performance/reports/lighthouse/mobile')
const profile = process.argv[3] || basename(reportDirectory)
const files = readdirSync(reportDirectory)
  .filter((name) => /^(?:login|register|forget-password)-[123]\.json$/u.test(name))
  .sort()

if (files.length !== 9) throw new Error(`Expected 9 Lighthouse reports, received ${files.length}.`)

const entries = files.map((file) => {
  const report = JSON.parse(readFileSync(join(reportDirectory, file), 'utf8'))
  const route = file.replace(/-[123]\.json$/u, '')
  return {
    file,
    route,
    lighthouseVersion: report.lighthouseVersion,
    performance: report.categories.performance.score * 100,
    accessibility: report.categories.accessibility.score * 100,
    bestPractices: report.categories['best-practices'].score * 100,
    seo: report.categories.seo.score * 100,
    fcpMs: report.audits['first-contentful-paint'].numericValue,
    lcpMs: report.audits['largest-contentful-paint'].numericValue,
    tbtMs: report.audits['total-blocking-time'].numericValue,
    cls: report.audits['cumulative-layout-shift'].numericValue,
    speedIndexMs: report.audits['speed-index'].numericValue
  }
})

const metrics = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo',
  'fcpMs',
  'lcpMs',
  'tbtMs',
  'cls',
  'speedIndexMs'
]
/**
 * @description 计算数值样本排序后的中位位置值。
 * @param {number[]} values 非空数值样本列表。
 * @returns {number} 排序后位于中间索引的样本值。
 */
const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const routes = [...new Set(entries.map((entry) => entry.route))]
const routeMedians = Object.fromEntries(
  routes.map((route) => {
    const reports = entries.filter((entry) => entry.route === route)
    return [
      route,
      Object.fromEntries(metrics.map((metric) => [metric, median(reports.map((entry) => entry[metric]))]))
    ]
  })
)

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profile,
  lighthouseVersions: [...new Set(entries.map((entry) => entry.lighthouseVersion))],
  runsPerRoute: 3,
  routeMedians,
  reports: entries
}
writeFileSync(join(reportDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(`PASS  summarized ${files.length} ${profile} Lighthouse reports.`)
