/**
 * @fileoverview 轻量、可解释的 BM25 倒排检索通道。
 */

/**
 * 为查询和知识分块生成中英日韩兼容的词项；中文同时保留双字词和完整专名。
 * @param {*} value 原始文本。
 * @returns {string[]} 去重词项。
 */
export function tokenizeBm25(value) {
  const normalized = String(value || "").normalize("NFKC").toLowerCase();
  const terms = new Set(normalized.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || []);
  const cjk = normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/gu) || [];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    terms.add(`${cjk[index]}${cjk[index + 1]}`);
  }
  return [...terms].filter((term) => term.length > 1);
}

/**
 * 为知识快照构建 BM25 所需统计量。
 * @param {object[]} chunks 知识分块。
 * @returns {{chunks: object[], documents: Map<string, object>, idf: Map<string, number>, averageLength: number}} BM25索引。
 */
export function buildBm25Index(chunks) {
  const documents = new Map();
  const documentFrequency = new Map();
  let totalLength = 0;
  for (const chunk of chunks) {
    const title = tokenizeBm25(chunk.title);
    const keywords = tokenizeBm25((chunk.keywords || []).join(" "));
    const body = tokenizeBm25(chunk.content);
    const weighted = [...title, ...title, ...title, ...keywords, ...keywords, ...body];
    const counts = countTerms(weighted);
    documents.set(chunk.id, { chunk, counts, length: weighted.length || 1 });
    totalLength += weighted.length || 1;
    for (const term of new Set(weighted)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [term, frequency] of documentFrequency) {
    idf.set(term, Math.log(1 + (chunks.length - frequency + 0.5) / (frequency + 0.5)));
  }
  return { chunks, documents, idf, averageLength: totalLength / Math.max(chunks.length, 1) };
}

/**
 * 执行 BM25 检索并返回标准候选对象。
 * @param {{chunks: object[], documents: Map<string, object>, idf: Map<string, number>, averageLength: number}} index BM25索引。
 * @param {*} query 查询文本。
 * @param {{limit?: number, filter?: (chunk: object) => boolean}} [options={}] 检索选项。
 * @returns {Array<{chunk: object, score: number, reasons: string[], channel: string}>} 候选列表。
 */
export function searchBm25(index, query, { limit = 20, filter = () => true } = {}) {
  const queryTerms = tokenizeBm25(query);
  const results = [];
  const k1 = 1.2;
  const b = 0.75;
  for (const document of index.documents.values()) {
    if (!filter(document.chunk)) continue;
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      const tf = document.counts.get(term) || 0;
      if (!tf) continue;
      matched += 1;
      const idf = index.idf.get(term) || 0;
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * document.length / index.averageLength)));
    }
    if (score <= 0) continue;
    results.push({
      chunk: document.chunk,
      score,
      reasons: [`BM25命中 ${matched} 个词项`],
      channel: "bm25"
    });
  }
  return results.sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id)).slice(0, limit);
}

/** @param {string[]} terms 词项列表。 @returns {Map<string, number>} 词频。 */
function countTerms(terms) {
  const counts = new Map();
  for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
  return counts;
}
