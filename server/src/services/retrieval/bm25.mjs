/**
 * @fileoverview BM25 倒排检索模块。
 * @description
 * 提供兼容中英日韩文本的词项切分、索引构建和候选检索能力，
 * 以轻量且可解释的方式为知识库检索提供稀疏召回通道。
 */

/**
 * @typedef {object} Bm25Document
 * @description BM25 索引中的单个文档统计记录。
 * @property {object} chunk 原始知识分块。
 * @property {Map<string, number>} counts 加权词项对应的词频。
 * @property {number} length 加权词项总数，最小值为 1。
 */

/**
 * @typedef {object} Bm25Index
 * @description 知识快照对应的 BM25 内存索引。
 * @property {object[]} chunks 原始知识分块列表。
 * @property {Map<string, Bm25Document>} documents 按分块 ID 索引的文档统计记录。
 * @property {Map<string, number>} idf 各词项的逆文档频率。
 * @property {number} averageLength 加权文档的平均词项长度。
 */

/**
 * @typedef {object} Bm25Candidate
 * @description BM25 通道返回的标准检索候选。
 * @property {object} chunk 命中的知识分块。
 * @property {number} score BM25 相关性分数。
 * @property {string[]} reasons 可解释的命中原因。
 * @property {"bm25"} channel 候选来源通道。
 */

/**
 * @description
 * 为查询和知识分块生成中英日韩兼容的词项；中文同时保留双字词和完整专名。
 * @param {*} value 原始文本。
 * @returns {string[]} 去重词项。
 * @example
 * tokenizeBm25("灵山大佛开放时间");
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
 * @description 为知识快照构建 BM25 所需的词频、逆文档频率和平均长度统计量。
 * @param {object[]} chunks 知识分块。
 * @returns {Bm25Index} 可直接用于稀疏检索的 BM25 索引。
 * @throws {TypeError} `chunks` 不可迭代或分块字段不符合预期时抛出。
 * @example
 * const index = buildBm25Index([{ id: "spot-1", title: "灵山大佛", keywords: [], content: "高八十八米" }]);
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
 * @description 执行 BM25 检索，并按相关性分数返回统一结构的候选对象。
 * @param {Bm25Index} index BM25 索引。
 * @param {*} query 查询文本。
 * @param {{limit?: number, filter?: (chunk: object) => boolean}} [options={}] 检索选项。
 * @returns {Bm25Candidate[]} 按分数降序排列且受数量限制的候选列表。
 * @throws {TypeError} 索引结构无效或过滤函数执行失败时抛出。
 * @example
 * const candidates = searchBm25(index, "灵山大佛高度", { limit: 5 });
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

/**
 * @description 统计词项列表中每个词项的出现次数。
 * @param {string[]} terms 词项列表。
 * @returns {Map<string, number>} 词项到词频的映射。
 */
function countTerms(terms) {
  const counts = new Map();
  for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
  return counts;
}
