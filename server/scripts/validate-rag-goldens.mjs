/**
 * @fileoverview RAG 黄金数据集校验脚本。
 * @description 检查检索与回答案例的结构、覆盖率、文档引用、知识实体和多语言完整性。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(serverRoot, "..");
const defaultRetrievalPath = join(serverRoot, "data", "tests", "retrieval-cases-expanded.json");
const defaultAnswerPath = join(serverRoot, "data", "tests", "answer-cases.json");
const defaultKnowledgePath = join(serverRoot, "data", "generated", "knowledge.json");
const requiredLocales = ["zh", "zh-TW", "en", "ja", "ko", "th"];

/**
 * @description 校验检索案例、回答案例与当前知识快照之间的结构、引用和多语言覆盖一致性。
 * @param {{retrievalPath?: string, answerPath?: string, knowledgePath?: string}} [options={}] 黄金数据文件路径。
 * @param {string} [options.retrievalPath] 检索案例 JSON 文件路径。
 * @param {string} [options.answerPath] 回答案例 JSON 文件路径。
 * @param {string} [options.knowledgePath] 生成知识快照 JSON 文件路径。
 * @returns {{retrievalCases: number, answerCases: number, positiveCount: number, noAnswerCount: number, languageCounts: Record<string, number>, splitCounts: Record<string, number>, sourceFileCount: number, knowledgeDocumentCount: number, errorCount: number, errors: string[]}} 案例数量、语言分布、知识引用覆盖和错误明细。
 * @example
 * const summary = validateRagGoldens();
 * if (summary.errorCount > 0) console.error(summary.errors);
 */
export function validateRagGoldens({
  retrievalPath = defaultRetrievalPath,
  answerPath = defaultAnswerPath,
  knowledgePath = defaultKnowledgePath
} = {}) {
  const errors = [];
  const retrievalCases = readJsonArray(retrievalPath, "retrieval cases", errors);
  const answerCases = readJsonArray(answerPath, "answer cases", errors);
  const knowledge = readJsonObject(knowledgePath, "knowledge snapshot", errors);
  const documents = Array.isArray(knowledge.documents) ? knowledge.documents : [];
  const chunks = Array.isArray(knowledge.chunks) ? knowledge.chunks : [];
  const documentIds = new Set(documents.map((document) => document.id));
  const spotIds = new Set(chunks.map((chunk) => chunk.scenicSpotId).filter(Boolean));
  const chunksByDocument = groupBy(chunks, (chunk) => chunk.documentId);
  const allKnowledgeText = normalizeText(chunks.map(chunkSearchText).join("\n"));

  validateRetrievalCases({
    cases: retrievalCases,
    errors,
    documentIds,
    spotIds,
    chunksByDocument,
    allKnowledgeText
  });
  validateAnswerCases(retrievalCases, answerCases, errors);

  const languageCounts = Object.fromEntries(
    requiredLocales.map((locale) => [
      locale,
      retrievalCases.filter((item) => item.locale === locale).length
    ])
  );
  const splitCounts = countBy(retrievalCases, (item) => item.split || "missing");
  const positiveCount = retrievalCases.filter((item) => item.shouldAnswer === true).length;
  const noAnswerCount = retrievalCases.filter((item) => item.shouldRefuse === true).length;
  const summary = {
    retrievalCases: retrievalCases.length,
    answerCases: answerCases.length,
    positiveCount,
    noAnswerCount,
    languageCounts,
    splitCounts,
    sourceFileCount: new Set(retrievalCases.flatMap((item) => item.sourceFiles || [])).size,
    knowledgeDocumentCount: documents.length,
    errorCount: errors.length,
    errors
  };

  return summary;
}

/**
 * @description 校验检索案例字段、唯一性、来源可追溯性及语言和拒答覆盖。
 * @param {{cases: object[], errors: string[], documentIds: Set<string>, spotIds: Set<string>, chunksByDocument: Map<string, object[]>, allKnowledgeText: string}} input 检索案例及知识索引。
 * @returns {void}
 */
function validateRetrievalCases({
  cases,
  errors,
  documentIds,
  spotIds,
  chunksByDocument,
  allKnowledgeText
}) {
  if (cases.length < 150) errors.push(`DATASET_TOO_SMALL:${cases.length}`);
  const seenIds = new Set();
  const seenQuestions = new Map();

  for (const [index, item] of cases.entries()) {
    const label = item?.id || `index_${index}`;
    requireString(item, "id", label, errors);
    requireString(item, "category", label, errors);
    requireString(item, "question", label, errors);
    requireString(item, "locale", label, errors);
    requireString(item, "queryStyle", label, errors);
    requireArray(item, "expectedDocumentIds", label, errors);
    requireArray(item, "expectedTopTitles", label, errors);
    requireArray(item, "expectedSpotIds", label, errors);
    requireArray(item, "expectedTerms", label, errors);
    requireArray(item, "forbiddenFacts", label, errors);
    requireArray(item, "sourceFiles", label, errors);

    if (seenIds.has(item.id)) errors.push(`DUPLICATE_ID:${item.id}`);
    seenIds.add(item.id);
    const normalizedQuestion = normalizeText(item.question);
    if (normalizedQuestion && seenQuestions.has(normalizedQuestion)) {
      errors.push(`DUPLICATE_QUESTION:${seenQuestions.get(normalizedQuestion)}:${item.id}`);
    } else if (normalizedQuestion) {
      seenQuestions.set(normalizedQuestion, item.id);
    }

    if (!requiredLocales.includes(item.locale)) errors.push(`UNSUPPORTED_LOCALE:${label}:${item.locale}`);
    if (!new Set(["tuning", "holdout"]).has(item.split)) errors.push(`INVALID_SPLIT:${label}:${item.split}`);
    if (typeof item.shouldAnswer !== "boolean") errors.push(`INVALID_SHOULD_ANSWER:${label}`);
    if (typeof item.shouldRefuse !== "boolean") errors.push(`INVALID_SHOULD_REFUSE:${label}`);
    if (item.shouldAnswer === item.shouldRefuse) errors.push(`REFUSAL_FLAG_MISMATCH:${label}`);
    if ((item.forbiddenFacts || []).length === 0) errors.push(`MISSING_FORBIDDEN_FACTS:${label}`);

    for (const documentId of item.expectedDocumentIds || []) {
      if (!documentIds.has(documentId)) errors.push(`UNKNOWN_DOCUMENT:${label}:${documentId}`);
    }
    for (const sourceFile of item.sourceFiles || []) {
      if (!existsSync(resolve(repositoryRoot, sourceFile))) errors.push(`MISSING_SOURCE_FILE:${label}:${sourceFile}`);
    }
    for (const spotId of item.expectedSpotIds || []) {
      if (!spotIds.has(spotId)) errors.push(`UNKNOWN_SPOT:${label}:${spotId}`);
      const expectedSourceHasSpot = (item.expectedDocumentIds || []).some((documentId) =>
        (chunksByDocument.get(documentId) || []).some((chunk) => chunk.scenicSpotId === spotId)
      );
      if (!expectedSourceHasSpot) errors.push(`SPOT_NOT_IN_EXPECTED_SOURCE:${label}:${spotId}`);
    }

    if (item.shouldAnswer === true) {
      if ((item.expectedDocumentIds || []).length === 0) errors.push(`MISSING_EXPECTED_DOCUMENT:${label}`);
      if ((item.expectedTopTitles || []).length === 0 && (item.expectedSpotIds || []).length === 0) {
        errors.push(`MISSING_EXPECTED_SECTION_OR_SPOT:${label}`);
      }
      if ((item.expectedTerms || []).length === 0) errors.push(`MISSING_EXPECTED_FACTS:${label}`);
      if ((item.sourceFiles || []).length === 0) errors.push(`MISSING_POSITIVE_SOURCE:${label}`);

      const expectedChunks = (item.expectedDocumentIds || []).flatMap(
        (documentId) => chunksByDocument.get(documentId) || []
      );
      const expectedText = normalizeText(expectedChunks.map(chunkSearchText).join("\n"));
      if (!(item.expectedTopTitles || []).some((title) => expectedText.includes(normalizeText(title)))) {
        errors.push(`SECTION_NOT_IN_EXPECTED_SOURCE:${label}`);
      }
      for (const fact of item.expectedTerms || []) {
        if (!expectedText.includes(normalizeText(fact))) errors.push(`FACT_NOT_IN_EXPECTED_SOURCE:${label}:${fact}`);
      }
    } else {
      if ((item.expectedDocumentIds || []).length > 0) errors.push(`REFUSAL_HAS_EXPECTED_DOCUMENT:${label}`);
      if ((item.expectedTerms || []).length > 0) errors.push(`REFUSAL_HAS_EXPECTED_FACTS:${label}`);
      if ((item.sourceFiles || []).length > 0) errors.push(`REFUSAL_HAS_SOURCE_FILE:${label}`);
    }

    for (const fact of item.forbiddenFacts || []) {
      if (!allKnowledgeText.includes(normalizeText(fact))) errors.push(`FORBIDDEN_FACT_NOT_TRACEABLE:${label}:${fact}`);
    }
  }

  for (const locale of requiredLocales) {
    const count = cases.filter((item) => item.locale === locale).length;
    if (count < 10) errors.push(`INSUFFICIENT_LANGUAGE_COVERAGE:${locale}:${count}`);
  }
  if (!cases.some((item) => item.split === "tuning")) errors.push("MISSING_TUNING_SPLIT");
  if (!cases.some((item) => item.split === "holdout")) errors.push("MISSING_HOLDOUT_SPLIT");
  const noAnswerCount = cases.filter((item) => item.shouldRefuse === true).length;
  if (noAnswerCount < 30) errors.push(`INSUFFICIENT_NO_ANSWER_CASES:${noAnswerCount}`);
}

/**
 * @description 校验回答案例与同 ID 检索案例的字段一一对应。
 * @param {object[]} retrievalCases 检索黄金案例。
 * @param {object[]} answerCases 回答黄金案例。
 * @param {string[]} errors 错误收集数组。
 * @returns {void}
 */
function validateAnswerCases(retrievalCases, answerCases, errors) {
  if (answerCases.length !== retrievalCases.length) {
    errors.push(`ANSWER_CASE_COUNT_MISMATCH:${answerCases.length}:${retrievalCases.length}`);
  }
  const answersById = new Map(answerCases.map((item) => [item.id, item]));
  if (answersById.size !== answerCases.length) errors.push("DUPLICATE_ANSWER_CASE_ID");

  for (const retrievalCase of retrievalCases) {
    const answerCase = answersById.get(retrievalCase.id);
    if (!answerCase) {
      errors.push(`MISSING_ANSWER_CASE:${retrievalCase.id}`);
      continue;
    }
    const comparisons = [
      ["question", answerCase.question, retrievalCase.question],
      ["locale", answerCase.locale, retrievalCase.locale],
      ["split", answerCase.split, retrievalCase.split],
      ["shouldRefuse", answerCase.shouldRefuse, retrievalCase.shouldRefuse],
      ["expectedDocumentIds", answerCase.expectedDocumentIds, retrievalCase.expectedDocumentIds],
      ["expectedSectionTitles", answerCase.expectedSectionTitles, retrievalCase.expectedTopTitles],
      ["expectedSpotIds", answerCase.expectedSpotIds, retrievalCase.expectedSpotIds],
      ["expectedFacts", answerCase.expectedFacts, retrievalCase.expectedTerms],
      ["forbiddenFacts", answerCase.forbiddenFacts, retrievalCase.forbiddenFacts],
      ["sourceFiles", answerCase.sourceFiles, retrievalCase.sourceFiles]
    ];
    for (const [field, actual, expected] of comparisons) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(`ANSWER_CASE_MISMATCH:${retrievalCase.id}:${field}`);
      }
    }
  }
}

/**
 * @description 读取 JSON 并要求顶层值为数组，失败时记录错误并回退为空数组。
 * @param {string} path 文件路径。
 * @param {string} label 数据标签。
 * @param {string[]} errors 错误收集数组。
 * @returns {Array<*>} JSON 数组或空数组。
 */
function readJsonArray(path, label, errors) {
  const value = readJson(path, label, errors);
  if (!Array.isArray(value)) {
    errors.push(`NOT_AN_ARRAY:${label}:${path}`);
    return [];
  }
  return value;
}

/**
 * @description 读取 JSON 并要求顶层值为非数组对象，失败时记录错误并回退为空对象。
 * @param {string} path 文件路径。
 * @param {string} label 数据标签。
 * @param {string[]} errors 错误收集数组。
 * @returns {object} JSON 对象或空对象。
 */
function readJsonObject(path, label, errors) {
  const value = readJson(path, label, errors);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    errors.push(`NOT_AN_OBJECT:${label}:${path}`);
    return {};
  }
  return value;
}

/**
 * @description 读取并解析 JSON；异常转为校验错误而不向外抛出。
 * @param {string} path 文件路径。
 * @param {string} label 数据标签。
 * @param {string[]} errors 错误收集数组。
 * @returns {*|null} 解析值；失败时为 `null`。
 */
function readJson(path, label, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`INVALID_JSON:${label}:${path}:${error.message}`);
    return null;
  }
}

/**
 * @description 要求案例指定字段为非空字符串，否则记录错误。
 * @param {object} item 案例对象。
 * @param {string} field 字段名。
 * @param {string} label 案例标签。
 * @param {string[]} errors 错误收集数组。
 * @returns {void}
 */
function requireString(item, field, label, errors) {
  if (typeof item?.[field] !== "string" || !item[field].trim()) errors.push(`MISSING_STRING:${label}:${field}`);
}

/**
 * @description 要求案例指定字段为数组，否则记录错误。
 * @param {object} item 案例对象。
 * @param {string} field 字段名。
 * @param {string} label 案例标签。
 * @param {string[]} errors 错误收集数组。
 * @returns {void}
 */
function requireArray(item, field, label, errors) {
  if (!Array.isArray(item?.[field])) errors.push(`MISSING_ARRAY:${label}:${field}`);
}

/**
 * @description 对校验文本执行 NFKC、转小写和空白规范化。
 * @param {*} value 原始文本。
 * @returns {string} 规范化文本。
 */
function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * @description 拼接知识分块中可用于事实追溯的文本字段。
 * @param {object} chunk 知识分块。
 * @returns {string} 标题、正文、上下文和来源组成的文本。
 */
function chunkSearchText(chunk) {
  return [chunk.title, chunk.content, chunk.context, chunk.source].filter(Boolean).join("\n");
}

/**
 * @description 按回调生成的键将值分组到 Map。
 * @template T,K
 * @param {T[]} values 输入值。
 * @param {(value: T) => K} keyFor 分组键生成函数。
 * @returns {Map<K, T[]>} 分组映射。
 */
function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

/**
 * @description 按回调生成的键统计出现次数。
 * @template T
 * @param {T[]} values 输入值。
 * @param {(value: T) => string} keyFor 统计键生成函数。
 * @returns {Record<string, number>} 各键计数。
 */
function countBy(values, keyFor) {
  const result = {};
  for (const value of values) {
    const key = keyFor(value);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const summary = validateRagGoldens();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errorCount > 0) process.exitCode = 1;
}
