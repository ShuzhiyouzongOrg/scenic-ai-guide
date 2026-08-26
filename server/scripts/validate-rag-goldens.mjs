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

function readJsonArray(path, label, errors) {
  const value = readJson(path, label, errors);
  if (!Array.isArray(value)) {
    errors.push(`NOT_AN_ARRAY:${label}:${path}`);
    return [];
  }
  return value;
}

function readJsonObject(path, label, errors) {
  const value = readJson(path, label, errors);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    errors.push(`NOT_AN_OBJECT:${label}:${path}`);
    return {};
  }
  return value;
}

function readJson(path, label, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`INVALID_JSON:${label}:${path}:${error.message}`);
    return null;
  }
}

function requireString(item, field, label, errors) {
  if (typeof item?.[field] !== "string" || !item[field].trim()) errors.push(`MISSING_STRING:${label}:${field}`);
}

function requireArray(item, field, label, errors) {
  if (!Array.isArray(item?.[field])) errors.push(`MISSING_ARRAY:${label}:${field}`);
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function chunkSearchText(chunk) {
  return [chunk.title, chunk.content, chunk.context, chunk.source].filter(Boolean).join("\n");
}

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
