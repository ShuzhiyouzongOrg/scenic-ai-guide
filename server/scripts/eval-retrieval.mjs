import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { bm25Search, hybridSearch, keywordSearch } from "../src/services/retrieval.mjs";

const args = process.argv.slice(2);
const testFile = args.find((arg) => !arg.startsWith("--")) || join("data", "tests", "retrieval-cases.json");
const outputFlag = args.find((arg) => arg.startsWith("--output="));
const suiteFlag = args.find((arg) => arg.startsWith("--suite="));
const modeFlag = args.find((arg) => arg.startsWith("--mode="));
const allowCaseFailures = args.includes("--no-fail-on-cases");
const suite = suiteFlag?.slice("--suite=".length) || inferSuite(testFile);
const mode = modeFlag?.slice("--mode=".length) || "hybrid";
const search = selectSearch(mode);
const resolvedTestFile = resolve(testFile);
const shouldValidateDataset = args.includes("--validate-dataset");
const datasetValidation = shouldValidateDataset && suite === "full"
  ? await validateDataset(resolvedTestFile)
  : null;
if (datasetValidation?.errorCount > 0) {
  throw new Error(`RAG golden dataset validation failed:\n${datasetValidation.errors.join("\n")}`);
}
const cases = JSON.parse(readFileSync(resolvedTestFile, "utf8"));
const datasetSha256 = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
const failures = [];
const latencies = [];
const redundancies = [];
const outcomes = [];
const summary = {
  total: cases.length,
  positiveTotal: 0,
  noAnswerTotal: 0,
  noAnswerCorrect: 0,
  top1TitleHits: 0,
  top3TitleHits: 0,
  top3SpotHits: 0,
  top3TermHits: 0,
  citationHits: 0,
  top1CitationHits: 0,
  recallHits: { 1: 0, 3: 0, 5: 0 },
  reciprocalRankSum: 0,
  ndcgAt5Sum: 0,
  decisionReasons: {}
};

for (const item of cases) {
  const started = performance.now();
  const result = search(item.question, { limit: 5, locale: item.locale });
  const latencyMs = performance.now() - started;
  latencies.push(latencyMs);
  const results = result.results.slice(0, 5);
  redundancies.push(contextRedundancy(results));
  const reason = result.decision?.reason || "unknown";
  summary.decisionReasons[reason] = (summary.decisionReasons[reason] || 0) + 1;
  const topResults = results.slice(0, 3);
  const shouldAnswer = item.shouldAnswer !== false;
  if (!shouldAnswer) {
    summary.noAnswerTotal += 1;
    const correct = result.decision?.answerable === false;
    if (correct) summary.noAnswerCorrect += 1;
    else failures.push({
      id: item.id,
      question: item.question,
      expected: "no_answer",
      decision: result.decision,
      actualTop5: results.map(toFailureResult)
    });
    outcomes.push({
      locale: item.locale,
      shouldAnswer: false,
      noAnswerCorrect: correct,
      decisionReason: reason,
      latencyMs
    });
    continue;
  }

  summary.positiveTotal += 1;
  const top1 = topResults[0];
  const topTitles = topResults.map((entry) => entry.title);
  const topSpotIds = topResults.map((entry) => entry.scenicSpotId).filter(Boolean);
  const topContent = topResults.map((entry) => `${entry.title}\n${entry.content}`).join("\n");
  const titleTop1Hit = matchesAny(top1?.title, item.expectedTopTitles || []);
  const titleTop3Hit = topTitles.some((title) => matchesAny(title, item.expectedTopTitles || []));
  const spotHit = (item.expectedSpotIds || []).length === 0
    || topSpotIds.some((spotId) => item.expectedSpotIds.includes(spotId));
  const termHit = (item.expectedTerms || []).length === 0
    || item.expectedTerms.some((term) => topContent.includes(term));
  const firstRelevantRank = results.findIndex((entry) => isRelevant(entry, item)) + 1;

  if (titleTop1Hit) summary.top1TitleHits += 1;
  if (titleTop3Hit) summary.top3TitleHits += 1;
  if (spotHit) summary.top3SpotHits += 1;
  if (termHit) summary.top3TermHits += 1;
  for (const k of [1, 3, 5]) {
    if (firstRelevantRank > 0 && firstRelevantRank <= k) summary.recallHits[k] += 1;
  }
  if (firstRelevantRank > 0) summary.reciprocalRankSum += 1 / firstRelevantRank;
  if (firstRelevantRank > 0 && firstRelevantRank <= 5) {
    summary.ndcgAt5Sum += 1 / Math.log2(firstRelevantRank + 1);
  }
  const citationHit = results.slice(0, 5).some((entry) => isCitationRelevant(entry.citation, item));
  const top1CitationHit = isCitationRelevant(results[0]?.citation, item);
  if (citationHit) summary.citationHits += 1;
  if (top1CitationHit) summary.top1CitationHits += 1;
  outcomes.push({
    locale: item.locale,
    shouldAnswer: true,
    titleTop1Hit,
    titleTop3Hit,
    spotHit,
    termHit,
    firstRelevantRank,
    citationHit,
    top1CitationHit,
    decisionReason: reason,
    latencyMs
  });

  if (!titleTop3Hit || !spotHit || !termHit) {
    failures.push({
      id: item.id,
      question: item.question,
      expectedTopTitles: item.expectedTopTitles || [],
      expectedSpotIds: item.expectedSpotIds || [],
      expectedTerms: item.expectedTerms || [],
      actualTop5: results.map(toFailureResult),
      checks: { titleTop1Hit, titleTop3Hit, spotHit, termHit, citationHit }
    });
  }
}

const metrics = {
  total: summary.total,
  positiveTotal: summary.positiveTotal,
  noAnswerTotal: summary.noAnswerTotal,
  top1TitleAccuracy: toRate(summary.top1TitleHits, summary.positiveTotal),
  top3TitleAccuracy: toRate(summary.top3TitleHits, summary.positiveTotal),
  top3SpotAccuracy: toRate(summary.top3SpotHits, summary.positiveTotal),
  top3TermRecall: toRate(summary.top3TermHits, summary.positiveTotal),
  recallAt1: toRate(summary.recallHits[1], summary.positiveTotal),
  recallAt3: toRate(summary.recallHits[3], summary.positiveTotal),
  recallAt5: toRate(summary.recallHits[5], summary.positiveTotal),
  mrr: toRate(summary.reciprocalRankSum, summary.positiveTotal),
  ndcgAt5: toRate(summary.ndcgAt5Sum, summary.positiveTotal),
  decisionReasons: summary.decisionReasons,
  citationHitRate: toRate(summary.citationHits, summary.positiveTotal),
  top1CitationHitRate: toRate(summary.top1CitationHits, summary.positiveTotal),
  noAnswerAccuracy: summary.noAnswerTotal ? toRate(summary.noAnswerCorrect, summary.noAnswerTotal) : null,
  retrievalLatencyMs: {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: Number(Math.max(...latencies, 0).toFixed(3))
  },
  averageContextRedundancy: Number((redundancies.reduce((sum, value) => sum + value, 0)
    / Math.max(redundancies.length, 1)).toFixed(4)),
  byLanguage: buildLanguageMetrics(outcomes),
  failureCount: failures.length
};

console.log(JSON.stringify(metrics, null, 2));
if (outputFlag) {
  const outputPath = resolve(outputFlag.slice("--output=".length));
  mkdirSync(dirname(outputPath), { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    suite,
    dataset: {
      path: toPortablePath(relative(process.cwd(), resolvedTestFile)),
      sha256: datasetSha256,
      caseCount: cases.length,
      validation: datasetValidation
    },
    evaluator: {
      name: `offline-${mode}-search`,
      mode,
      topK: 5
    },
    metrics,
    failures
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (failures.length > 0 && !allowCaseFailures) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}

function inferSuite(filePath) {
  return filePath.includes("expanded") ? "full" : "smoke";
}

function selectSearch(value) {
  if (value === "rule") return keywordSearch;
  if (value === "bm25") return bm25Search;
  if (value === "hybrid") return hybridSearch;
  throw new Error(`Unsupported retrieval mode: ${value}`);
}

function toPortablePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function validateDataset(filePath) {
  const { validateRagGoldens } = await import("./validate-rag-goldens.mjs");
  return validateRagGoldens({ retrievalPath: filePath });
}

function isRelevant(entry, item) {
  return matchesAny(entry?.title, item.expectedTopTitles || [])
    || (item.expectedSpotIds || []).includes(entry?.scenicSpotId)
    || (item.expectedDocumentIds || []).includes(entry?.documentId);
}

function isCitationRelevant(citation, item) {
  return matchesAny(citation?.sectionTitle, item.expectedTopTitles || [])
    || (item.expectedSpotIds || []).includes(citation?.scenicSpotId)
    || (item.expectedDocumentIds || []).includes(citation?.documentId);
}

function toFailureResult(entry) {
  return {
    title: entry.title,
    score: entry.score,
    scenicSpotId: entry.scenicSpotId,
    documentId: entry.documentId,
    reasons: entry.reasons,
    channelRanks: entry.channelRanks
  };
}

function matchesAny(value, expectedValues) {
  if (!value || expectedValues.length === 0) return false;
  return expectedValues.some((expected) => value === expected || value.includes(expected) || expected.includes(value));
}

function toRate(value, total) {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number(sorted[index].toFixed(3));
}

function contextRedundancy(results) {
  if (results.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < results.length; left += 1) {
    for (let right = left + 1; right < results.length; right += 1) {
      const a = new Set(contentTerms(results[left]));
      const b = new Set(contentTerms(results[right]));
      const union = new Set([...a, ...b]).size;
      total += union ? [...a].filter((term) => b.has(term)).length / union : 0;
      pairs += 1;
    }
  }
  return Number((total / Math.max(pairs, 1)).toFixed(4));
}

function contentTerms(result) {
  return String(`${result?.title || ""} ${result?.content || ""}`)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function buildLanguageMetrics(values) {
  const locales = [...new Set(values.map((item) => item.locale || "und"))].sort();
  return Object.fromEntries(locales.map((locale) => {
    const slice = values.filter((item) => (item.locale || "und") === locale);
    const positives = slice.filter((item) => item.shouldAnswer);
    const negatives = slice.filter((item) => !item.shouldAnswer);
    const relevantRanks = positives.map((item) => item.firstRelevantRank || 0);
    const decisionReasons = {};
    for (const item of slice) {
      decisionReasons[item.decisionReason] = (decisionReasons[item.decisionReason] || 0) + 1;
    }
    const positiveFailures = positives.filter((item) => !item.titleTop3Hit || !item.spotHit || !item.termHit).length;
    const negativeFailures = negatives.filter((item) => !item.noAnswerCorrect).length;
    return [locale, {
      total: slice.length,
      positiveTotal: positives.length,
      noAnswerTotal: negatives.length,
      top1TitleAccuracy: toRate(positives.filter((item) => item.titleTop1Hit).length, positives.length),
      top3TitleAccuracy: toRate(positives.filter((item) => item.titleTop3Hit).length, positives.length),
      top3SpotAccuracy: toRate(positives.filter((item) => item.spotHit).length, positives.length),
      top3TermRecall: toRate(positives.filter((item) => item.termHit).length, positives.length),
      recallAt1: toRate(relevantRanks.filter((rank) => rank > 0 && rank <= 1).length, positives.length),
      recallAt3: toRate(relevantRanks.filter((rank) => rank > 0 && rank <= 3).length, positives.length),
      recallAt5: toRate(relevantRanks.filter((rank) => rank > 0 && rank <= 5).length, positives.length),
      mrr: toRate(relevantRanks.reduce((sum, rank) => sum + (rank > 0 ? 1 / rank : 0), 0), positives.length),
      ndcgAt5: toRate(relevantRanks.reduce(
        (sum, rank) => sum + (rank > 0 && rank <= 5 ? 1 / Math.log2(rank + 1) : 0),
        0
      ), positives.length),
      citationHitRate: toRate(positives.filter((item) => item.citationHit).length, positives.length),
      top1CitationHitRate: toRate(positives.filter((item) => item.top1CitationHit).length, positives.length),
      noAnswerAccuracy: negatives.length
        ? toRate(negatives.filter((item) => item.noAnswerCorrect).length, negatives.length)
        : null,
      retrievalLatencyMs: {
        p50: percentile(slice.map((item) => item.latencyMs), 0.5),
        p95: percentile(slice.map((item) => item.latencyMs), 0.95),
        max: Number(Math.max(...slice.map((item) => item.latencyMs), 0).toFixed(3))
      },
      decisionReasons,
      failureCount: positiveFailures + negativeFailures
    }];
  }));
}
