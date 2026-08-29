/**
 * @fileoverview RAG 检索质量评估脚本。
 * @description 对规则、关键词、BM25、融合与重排模式计算召回率、MRR、NDCG、引用命中率和时延。
 */
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

/**
 * @description 根据数据集文件名推断评测套件。
 * @param {string} filePath 数据集路径。
 * @returns {"full"|"smoke"} 扩展集为 `full`，否则为 `smoke`。
 */
function inferSuite(filePath) {
  return filePath.includes("expanded") ? "full" : "smoke";
}

/**
 * @description 将命令行检索模式映射为对应搜索函数。
 * @param {string} value 检索模式。
 * @returns {typeof keywordSearch} 规则、BM25 或混合检索函数。
 * @throws {Error} 模式不受支持时抛出。
 */
function selectSearch(value) {
  if (value === "rule") return keywordSearch;
  if (value === "bm25") return bm25Search;
  if (value === "hybrid") return hybridSearch;
  throw new Error(`Unsupported retrieval mode: ${value}`);
}

/**
 * @description 将 Windows 路径分隔符转换为可移植正斜杠。
 * @param {string} filePath 文件路径。
 * @returns {string} 可移植路径。
 */
function toPortablePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

/**
 * @description 调用黄金集校验器检查指定检索数据集。
 * @param {string} filePath 检索数据集路径。
 * @returns {Promise<object>} 黄金集校验报告。
 * @throws {Error|SyntaxError} 校验模块加载或数据集解析失败时抛出。
 */
async function validateDataset(filePath) {
  const { validateRagGoldens } = await import("./validate-rag-goldens.mjs");
  return validateRagGoldens({ retrievalPath: filePath });
}

/**
 * @description 判断检索结果是否命中案例期望的标题、景点或文档。
 * @param {object|null|undefined} entry 检索结果。
 * @param {object} item 黄金案例。
 * @returns {boolean} 命中任一相关性条件时为 `true`。
 */
function isRelevant(entry, item) {
  return matchesAny(entry?.title, item.expectedTopTitles || [])
    || (item.expectedSpotIds || []).includes(entry?.scenicSpotId)
    || (item.expectedDocumentIds || []).includes(entry?.documentId);
}

/**
 * @description 判断结构化引用是否命中案例期望来源。
 * @param {object|null|undefined} citation 结构化引用。
 * @param {object} item 黄金案例。
 * @returns {boolean} 命中标题、景点或文档时为 `true`。
 */
function isCitationRelevant(citation, item) {
  return matchesAny(citation?.sectionTitle, item.expectedTopTitles || [])
    || (item.expectedSpotIds || []).includes(citation?.scenicSpotId)
    || (item.expectedDocumentIds || []).includes(citation?.documentId);
}

/**
 * @description 从检索结果摘取失败报告所需字段。
 * @param {object} entry 检索结果。
 * @returns {object} 精简失败候选。
 */
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

/**
 * @description 判断实际文本与任一期望文本是否相等或互相包含。
 * @param {string|null|undefined} value 实际文本。
 * @param {string[]} expectedValues 期望文本列表。
 * @returns {boolean} 存在匹配项时为 `true`。
 */
function matchesAny(value, expectedValues) {
  if (!value || expectedValues.length === 0) return false;
  return expectedValues.some((expected) => value === expected || value.includes(expected) || expected.includes(value));
}

/**
 * @description 计算并保留四位小数的比率。
 * @param {number} value 分子。
 * @param {number} total 分母。
 * @returns {number} 比率；分母为零时返回 `0`。
 */
function toRate(value, total) {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

/**
 * @description 按最近秩法计算数值样本分位数。
 * @param {number[]} values 数值样本。
 * @param {number} ratio 分位比例。
 * @returns {number} 保留三位小数的分位值；空样本返回 `0`。
 */
function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Number(sorted[index].toFixed(3));
}

/**
 * @description 计算检索上下文两两词集合 Jaccard 相似度的平均值。
 * @param {object[]} results 检索结果。
 * @returns {number} 保留四位小数的平均冗余度。
 */
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

/**
 * @description 从结果标题和正文提取长度至少为二的字母数字词项。
 * @param {object|null|undefined} result 检索结果。
 * @returns {string[]} 规范化词项。
 */
function contentTerms(result) {
  return String(`${result?.title || ""} ${result?.content || ""}`)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) || [];
}

/**
 * @description 按语言聚合召回、引用、拒答和时延指标。
 * @param {object[]} values 逐案例评测结果。
 * @returns {Record<string, object>} 以语言代码为键的指标报告。
 */
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
