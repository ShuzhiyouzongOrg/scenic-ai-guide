import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 校验融合检索不低于单通道，并可选校验 Reranker 前后质量和时延。
 * @param {{rule:object,bm25:object,fusion:object,rerankBefore?:object,rerankAfter?:object,maxRerankP95Ms?:number}} input 报告。
 * @returns {{passed:boolean,checks:object[],violations:object[]}}
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

function check(name, actual, baseline, passed, expectation) {
  return { name, actual, baseline, passed, expectation };
}

function readMetric(report, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], report?.metrics || report);
  return Number.isFinite(Number(value)) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function option(args, name, required = true) {
  const value = args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value && required) throw new Error(`Missing --${name}=...`);
  return value || "";
}

function load(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

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
