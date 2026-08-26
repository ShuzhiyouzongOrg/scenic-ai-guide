import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE = "data/tests/retrieval-baseline.json";

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

function readMetric(metrics, path) {
  return path.split(".").reduce((value, key) => value?.[key], metrics);
}

function buildFailureMessage(metric, actual, regression, allowedRegression, maxValue) {
  if (maxValue !== undefined && actual > maxValue) {
    return `${metric}=${actual} exceeds the absolute ceiling ${maxValue}`;
  }
  return `${metric} regressed by ${round(regression)}; maximum allowed regression is ${round(allowedRegression)}`;
}

function round(value) {
  return Number(value.toFixed(6));
}

function readOption(args, name, fallback) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function printResult(result) {
  console.log(`RAG regression gate: ${result.passed ? "PASS" : "FAIL"} (${result.suite})`);
  for (const check of result.checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.message}`);
  }
}

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
