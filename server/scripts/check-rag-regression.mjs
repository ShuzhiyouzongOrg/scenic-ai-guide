/**
 * @fileoverview RAG 回归基线检查脚本。
 * @description 将当前评测报告与指定套件基线比较，并输出机器可读的违规项。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE = "data/tests/retrieval-baseline.json";

/**
 * @description 将当前 RAG 评测报告与指定基线套件的案例契约和指标阈值逐项比较。
 * @param {{baselineDocument: object, report: object, suite: string}} input 回归评测输入。
 * @param {object} input.baselineDocument 包含版本号和套件阈值的基线文档。
 * @param {object} input.report 当前检索评测报告。
 * @param {string} input.suite 待检查的基线套件名称。
 * @returns {{schemaVersion: number, generatedAt: string, suite: string, baselineVersion: string, passed: boolean, checks: object[], violations: object[]}} 回归门禁报告。
 * @throws {Error} 指定套件未配置基线时抛出。
 * @example
 * const result = evaluateRegression({ baselineDocument, report, suite: "smoke" });
 */
export function evaluateRegression({ baselineDocument, report, suite }) {
  const baseline = baselineDocument?.suites?.[suite];
  if (!baseline) {
    throw new Error(`Baseline suite is not configured: ${suite}`);
  }

  const checks = [];
  checks.push(compareValue({
    name: "report.suite",
    actual: report?.suite,
    expected: suite,
    predicate: (actual, expected) => actual === expected,
    expectation: suite
  }));
  checks.push(compareValue({
    name: "dataset.path",
    actual: report?.dataset?.path,
    expected: baseline.dataset.path,
    predicate: (actual, expected) => actual === expected,
    expectation: baseline.dataset.path
  }));
  checks.push(compareValue({
    name: "dataset.caseCount",
    actual: report?.dataset?.caseCount,
    expected: baseline.dataset.caseCount,
    predicate: (actual, expected) => actual >= expected,
    expectation: `>= ${baseline.dataset.caseCount}`
  }));
  checks.push(compareValue({
    name: "dataset.sha256",
    actual: report?.dataset?.sha256,
    expected: baseline.dataset.sha256,
    predicate: (actual, expected) => actual === expected,
    expectation: baseline.dataset.sha256
  }));

  for (const [metric, threshold] of Object.entries(baseline.metrics)) {
    checks.push(compareMetric(report?.metrics, metric, threshold));
  }

  const violations = checks.filter((check) => !check.passed);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    suite,
    baselineVersion: baselineDocument.version,
    passed: violations.length === 0,
    checks,
    violations
  };
}

/**
 * @description 将单项当前指标与允许绝对或相对回退的基线阈值比较。
 * @param {object} metrics 当前报告指标对象。
 * @param {string} metric 点分隔的指标路径。
 * @param {{baseline: number, direction: "higher"|"lower", maxAbsoluteRegression?: number, maxRelativeRegression?: number, maxValue?: number}} threshold 基线及容差配置。
 * @returns {object} 单项指标检查结果。
 */
function compareMetric(metrics, metric, threshold) {
  const actual = readMetric(metrics, metric);
  const baseline = threshold.baseline;
  if (!Number.isFinite(actual) || !Number.isFinite(baseline)) {
    return {
      name: metric,
      actual: actual ?? null,
      baseline,
      direction: threshold.direction,
      passed: false,
      message: "Metric is missing or is not a finite number"
    };
  }

  const regression = threshold.direction === "higher"
    ? Math.max(0, baseline - actual)
    : Math.max(0, actual - baseline);
  const allowedRegression = threshold.maxAbsoluteRegression
    ?? Math.abs(baseline) * (threshold.maxRelativeRegression ?? 0);
  const regressionPassed = regression <= allowedRegression + Number.EPSILON;
  const ceilingPassed = threshold.maxValue === undefined || actual <= threshold.maxValue;
  const passed = regressionPassed && ceilingPassed;

  return {
    name: metric,
    actual,
    baseline,
    direction: threshold.direction,
    regression: round(regression),
    allowedRegression: round(allowedRegression),
    maxValue: threshold.maxValue ?? null,
    passed,
    message: passed
      ? "Within allowed regression"
      : buildFailureMessage(metric, actual, regression, allowedRegression, threshold.maxValue)
  };
}

/**
 * @description 使用给定谓词比较一个报告契约值与基线值。
 * @param {{name: string, actual: *, expected: *, predicate: (actual: *, expected: *) => boolean, expectation: string}} input 比较参数。
 * @returns {object} 契约值检查结果。
 */
function compareValue({ name, actual, expected, predicate, expectation }) {
  const passed = predicate(actual, expected);
  return {
    name,
    actual: actual ?? null,
    baseline: expected,
    passed,
    message: passed ? "Matches baseline contract" : `Expected ${expectation}, received ${actual ?? "missing"}`
  };
}

/**
 * @description 按点分隔路径读取嵌套指标值。
 * @param {object} metrics 指标对象。
 * @param {string} path 指标路径。
 * @returns {*} 指标值；路径不存在时为 `undefined`。
 */
function readMetric(metrics, path) {
  return path.split(".").reduce((value, key) => value?.[key], metrics);
}

/**
 * @description 根据绝对上限或回退幅度生成失败说明。
 * @param {string} metric 指标名称。
 * @param {number} actual 当前值。
 * @param {number} regression 实际回退量。
 * @param {number} allowedRegression 允许回退量。
 * @param {number|undefined} maxValue 绝对上限。
 * @returns {string} 失败说明。
 */
function buildFailureMessage(metric, actual, regression, allowedRegression, maxValue) {
  if (maxValue !== undefined && actual > maxValue) {
    return `${metric}=${actual} exceeds the absolute ceiling ${maxValue}`;
  }
  return `${metric} regressed by ${round(regression)}; maximum allowed regression is ${round(allowedRegression)}`;
}

/**
 * @description 将数值保留六位小数。
 * @param {number} value 原始数值。
 * @returns {number} 舍入后的数值。
 */
function round(value) {
  return Number(value.toFixed(6));
}

/**
 * @description 从命令行参数读取 `--name=value` 形式的选项。
 * @param {string[]} args 命令行参数。
 * @param {string} name 选项名称。
 * @param {string} fallback 未提供选项时的默认值。
 * @returns {string} 选项值或默认值。
 */
function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

/**
 * @description 将回归门禁摘要和逐项结果输出到控制台。
 * @param {{passed: boolean, suite: string, checks: object[]}} result 回归门禁报告。
 * @returns {void}
 */
function printResult(result) {
  console.log(`RAG regression gate: ${result.passed ? "PASS" : "FAIL"} (${result.suite})`);
  for (const check of result.checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.message}`);
  }
}

/**
 * @description 读取命令行配置与报告，执行回归门禁并写出 JSON 结果。
 * @returns {void}
 * @throws {Error|SyntaxError} 文件读写、JSON 解析或基线套件校验失败时抛出。
 */
function main() {
  const args = process.argv.slice(2);
  const suite = readOption(args, "suite", "smoke");
  const reportPath = resolve(readOption(args, "report", "rag-evaluation.json"));
  const baselinePath = resolve(readOption(args, "baseline", DEFAULT_BASELINE));
  const outputPath = resolve(readOption(args, "output", "rag-regression-gate.json"));
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const baselineDocument = JSON.parse(readFileSync(baselinePath, "utf8"));
  const result = evaluateRegression({ baselineDocument, report, suite });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    ...result,
    baselinePath,
    reportPath,
    reportGeneratedAt: report.generatedAt ?? null
  }, null, 2)}\n`, "utf8");
  printResult(result);

  if (!result.passed) {
    if (process.env.GITHUB_ACTIONS === "true") {
      for (const violation of result.violations) {
        console.error(`::error title=RAG regression detected::${violation.name}: ${violation.message}`);
      }
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
