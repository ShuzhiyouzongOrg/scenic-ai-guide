import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hybridSearch } from "../src/services/retrieval.mjs";

const args = process.argv.slice(2);
const testFile = resolve(args.find((arg) => !arg.startsWith("--")) || "data/tests/retrieval-cases-expanded.json");
const outputFlag = args.find((arg) => arg.startsWith("--output="));
const cases = JSON.parse(readFileSync(testFile, "utf8"));
const baseline = hybridSearch("灵山大佛多高", { limit: 5 }).decision.thresholds;
const evaluated = cases.map((item) => ({
  item,
  result: hybridSearch(item.question, { limit: 5, locale: item.locale })
}));
const profiles = [
  ...[8, 10, 12, 14, 16, 20].map((minRuleScore) => ({
    minRuleScore,
    minBm25Score: baseline.minBm25Score,
    minQueryCoverage: baseline.minQueryCoverage
  })),
  ...[0.15, 0.25, 0.35, 0.5].map((minBm25Score) => ({
    minRuleScore: baseline.minRuleScore,
    minBm25Score,
    minQueryCoverage: baseline.minQueryCoverage
  })),
  ...[0, 0.1, 0.2, 0.3, 0.4].map((minQueryCoverage) => ({
    minRuleScore: baseline.minRuleScore,
    minBm25Score: baseline.minBm25Score,
    minQueryCoverage
  }))
];

const curves = uniqueProfiles(profiles).map((thresholds) => ({
  ...thresholds,
  ...measure(evaluated, thresholds)
}));
const recommended = [...curves]
  .filter((curve) => curve.answerRecall >= 0.95 && curve.noAnswerAccuracy >= 0.95)
  .sort((left, right) => right.balancedScore - left.balancedScore || left.falseAcceptRate - right.falseAcceptRate)[0]
  || [...curves].sort((left, right) => right.balancedScore - left.balancedScore)[0];
const report = {
  testFile,
  baseline,
  generatedAt: new Date().toISOString(),
  recommended,
  curves,
  byLanguage: groupMetrics(evaluated, (entry) => entry.item.locale, recommended),
  byIntent: groupMetrics(
    evaluated,
    (entry) => entry.result.intents?.[0]?.intent || "unknown",
    recommended
  ),
  byCategory: groupMetrics(evaluated, (entry) => entry.item.category, recommended)
};

console.log(JSON.stringify(report, null, 2));
if (outputFlag) {
  const outputPath = resolve(outputFlag.slice("--output=".length));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function groupMetrics(rows, keyFor, thresholds) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(keyFor(row) || "unknown");
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return Object.fromEntries([...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, measure(values, thresholds)]));
}

function measure(rows, thresholds) {
  let truePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  const reasons = {};
  for (const { item, result } of rows) {
    const answerable = classify(result, thresholds);
    const expected = item.shouldAnswer !== false;
    if (expected && answerable) truePositive += 1;
    else if (expected) falseNegative += 1;
    else if (!answerable) trueNegative += 1;
    else falsePositive += 1;
    const reason = result.decision?.reason || "unknown";
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
  const answerRecall = rateOrNull(truePositive, truePositive + falseNegative);
  const noAnswerAccuracy = rateOrNull(trueNegative, trueNegative + falsePositive);
  const availableAccuracy = [answerRecall, noAnswerAccuracy].filter((value) => value !== null);
  return {
    total: rows.length,
    answerRecall,
    noAnswerAccuracy,
    falseRejectRate: rateOrNull(falseNegative, truePositive + falseNegative),
    falseAcceptRate: rateOrNull(falsePositive, trueNegative + falsePositive),
    balancedScore: Number((availableAccuracy.reduce((sum, value) => sum + value, 0)
      / Math.max(availableAccuracy.length, 1)).toFixed(4)),
    reasons
  };
}

function classify(result, thresholds) {
  if (result.decision?.reason === "scope_blocked" || result.results.length === 0) return false;
  const coverage = Number(result.confidence?.evidenceCoverage || 0);
  if (coverage < thresholds.minQueryCoverage) return false;
  return Number(result.confidence?.strongestRuleScore || 0) >= thresholds.minRuleScore
    || Number(result.confidence?.strongestBm25Score || 0) >= thresholds.minBm25Score
    || (result.spotMatches || []).some((spot) => spot.confidence >= 0.8);
}

function uniqueProfiles(values) {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];
}

function rate(value, total) {
  return total === 0 ? 0 : Number((value / total).toFixed(4));
}

function rateOrNull(value, total) {
  return total === 0 ? null : rate(value, total);
}
