/**
 * @fileoverview RAG 消融评测门禁脚本。
 * @description 比较规则检索、BM25、融合检索与可选重排阶段的质量和时延指标。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @description 校验融合检索不低于单通道，并可选校验 Reranker 前后质量和时延。
 * @param {{rule: object, bm25: object, fusion: object, rerankBefore?: object, rerankAfter?: object, maxRerankP95Ms?: number}} input 规则、BM25、融合和可选重排评测报告。
 * @returns {{passed: boolean, checks: object[], violations: object[]}} 门禁结论、全部检查项和未通过项。
 * @example
 * const result = evaluateAblation({ rule, bm25, fusion });
 * if (!result.passed) process.exitCode = 1;
 */
export function evaluateAblation(input) {
  const checks = [];
  for (const metric of ["recallAt5", "mrr"]) {
    const singleBest = Math.max(readMetric(input.rule, metric), readMetric(input.bm25, metric));
    const actual = readMetric(input.fusion, metric);
    checks.push(check(metric, actual, singleBest, actual >= singleBest, "fusion >= best single channel"));
  }
  if (input.rerankBefore && input.rerankAfter) {
    for (const metric of ["ndcgAt5", "top1CitationHitRate"]) {
      const before = readMetric(input.rerankBefore, metric);
      const after = readMetric(input.rerankAfter, metric);
      checks.push(check(`rerank.${metric}`, after, before, after >= before, "after >= before"));
    }
    const p95 = readMetric(input.rerankAfter, "retrievalLatencyMs.p95");
    const budget = Number(input.maxRerankP95Ms || 1200);
    checks.push(check("rerank.retrievalLatencyMs.p95", p95, budget, p95 <= budget, `<= ${budget} ms`));
  }
  const violations = checks.filter((item) => !item.passed);
  return { passed: violations.length === 0, checks, violations };
}

/**
 * @description 构造一条消融指标检查结果。
 * @param {string} name 指标名称。
 * @param {number} actual 当前值。
 * @param {number} baseline 对照值。
 * @param {boolean} passed 是否满足预期。
 * @param {string} expectation 比较规则说明。
 * @returns {{name: string, actual: number, baseline: number, passed: boolean, expectation: string}} 检查结果。
 */
function check(name, actual, baseline, passed, expectation) {
  return { name, actual, baseline, passed, expectation };
}

/**
 * @description 从评测报告或其 `metrics` 字段读取嵌套数值指标。
 * @param {object} report 评测报告。
 * @param {string} path 点分隔指标路径。
 * @returns {number} 有限数值；缺失或非法时为负无穷。
 */
function readMetric(report, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], report?.metrics || report);
  return Number.isFinite(Number(value)) ? Number(value) : Number.NEGATIVE_INFINITY;
}

/**
 * @description 从命令行参数读取指定选项。
 * @param {string[]} args 命令行参数。
 * @param {string} name 选项名称。
 * @param {boolean} [required=true] 是否要求必须提供。
 * @returns {string} 选项值；可选且缺失时为空字符串。
 * @throws {Error} 必填选项缺失时抛出。
 */
function option(args, name, required = true) {
  const value = args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value && required) throw new Error(`Missing --${name}=...`);
  return value || "";
}

/**
 * @description 读取并解析一个 JSON 报告文件。
 * @param {string} path 文件路径。
 * @returns {object} 解析后的报告对象。
 * @throws {Error|SyntaxError} 文件读取或 JSON 解析失败时抛出。
 */
function load(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

/**
 * @description 读取各通道报告，执行消融门禁并写出结果。
 * @returns {void}
 * @throws {Error|SyntaxError} 参数、报告读取、JSON 解析或结果写入失败时抛出。
 */
function main() {
  const args = process.argv.slice(2);
  const before = option(args, "rerank-before", false);
  const after = option(args, "rerank-after", false);
  const result = evaluateAblation({
    rule: load(option(args, "rule")),
    bm25: load(option(args, "bm25")),
    fusion: load(option(args, "fusion")),
    rerankBefore: before ? load(before) : undefined,
    rerankAfter: after ? load(after) : undefined,
    maxRerankP95Ms: Number(option(args, "max-rerank-p95-ms", false) || 1200)
  });
  const outputPath = resolve(option(args, "output", false) || "rag-ablation-gate.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...result
  }, null, 2)}\n`, "utf8");
  for (const item of result.checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.actual} (${item.expectation} ${item.baseline})`);
  }
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
