/**
 * @fileoverview 检索候选融合与多样性排序模块。
 * @description
 * 提供 Reciprocal Rank Fusion、多层确定性去重和 MMR 排序能力，
 * 用于统一不同检索通道的量纲并抑制重复证据占满上下文。
 */

/**
 * @description 使用 Reciprocal Rank Fusion 合并不同量纲的候选分数和命中原因。
 * @param {Array<Array<{chunk: object, score: number, reasons?: string[], channel?: string}>>} rankedLists 通道排序列表。
 * @param {object} [options={}] 融合参数；权重按通道顺序应用。
 * @param {number} [options.k=60] RRF 排名平滑常数。
 * @param {number} [options.limit=50] 最多保留候选数。
 * @param {number[]} [options.weights=[]] 与通道顺序对应的非负权重。
 * @returns {Array<{chunk: object, score: number, reasons: string[], channels: object[]}>} 融合候选。
 * @throws {TypeError} 排序列表或候选结构不符合预期时抛出。
 * @example
 * const fused = reciprocalRankFusion([bm25Candidates, denseCandidates], { weights: [1, 1.2] });
 */
export function reciprocalRankFusion(rankedLists, { k = 60, limit = 50, weights = [] } = {}) {
  const merged = new Map();
  rankedLists.forEach((list, listIndex) => {
    const weight = Math.max(0, Number(weights[listIndex] ?? 1));
    list.forEach((item, rank) => {
      const id = item.chunk.id;
      const current = merged.get(id) || { chunk: item.chunk, score: 0, reasons: [], channels: [] };
      current.score += weight / (k + rank + 1);
      current.reasons.push(...(item.reasons || []));
      current.channels.push({ channel: item.channel || `channel_${listIndex + 1}`, rank: rank + 1, score: item.score, weight });
      merged.set(id, current);
    });
  });
  return [...merged.values()]
    .map((item) => ({ ...item, reasons: [...new Set(item.reasons)] }))
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, limit);
}

/**
 * @description
 * 在 MMR 前剔除同内容、同父片段和同章节内的确定性重复候选。
 * 不同 child 只在正文相同时合并，避免破坏 Parent-Child 的多事实召回。
 * @param {Array<{chunk: object, score: number}>} candidates 候选列表。
 * @returns {Array<object>} 保留最高分代表项的候选。
 * @example
 * const unique = deduplicateCandidates(candidates);
 */
export function deduplicateCandidates(candidates = []) {
  const selected = [];
  const exactKeys = new Set();
  for (const candidate of candidates) {
    const chunk = candidate?.chunk || {};
    const normalizedContent = normalizeContent(chunk.content);
    const keys = [
      chunk.contentHash ? `hash:${chunk.contentHash}` : "",
      normalizedContent ? `content:${normalizedContent}` : "",
      normalizedContent
        ? `parent:${chunk.documentId || ""}:${chunk.parentId || ""}:${normalizedContent}`
        : "",
      normalizedContent
        ? `section:${chunk.documentId || ""}:${chunk.sectionPath || chunk.title || ""}:${normalizedContent}`
        : ""
    ].filter(Boolean);
    if (keys.some((key) => exactKeys.has(key))) continue;
    keys.forEach((key) => exactKeys.add(key));
    selected.push(candidate);
  }
  return selected;
}

/**
 * @description 用轻量 Jaccard 相似度执行 MMR，抑制同一章节和重复上传占满上下文。
 * @param {Array<{chunk: object, score: number, reasons?: string[], channels?: object[]}>} candidates 候选列表。
 * @param {object} [options={}] MMR 参数。
 * @param {number} [options.limit=5] 最多选择候选数。
 * @param {number} [options.lambda=0.82] 相关性相对多样性的权重。
 * @param {number} [options.maxPerParent=2] 同一父分块最多保留数量。
 * @returns {Array<object>} 多样性排序结果。
 * @example
 * const diversified = maximalMarginalRelevance(fused, { limit: 5 });
 */
export function maximalMarginalRelevance(candidates, { limit = 5, lambda = 0.82, maxPerParent = 2 } = {}) {
  const selected = [];
  const parentCounts = new Map();
  const remaining = deduplicateCandidates(candidates);
  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    const selectedDocuments = new Set(selected.map((item) => item.chunk.documentId).filter(Boolean));
    const unseenDocumentAvailable = selected.length > 0
      && remaining.some((item) => item.chunk.documentId && !selectedDocuments.has(item.chunk.documentId));
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (
        selected.length === 1
        && unseenDocumentAvailable
        && candidate.chunk.documentId
        && selectedDocuments.has(candidate.chunk.documentId)
      ) continue;
      const parentId = candidate.chunk.parentId || candidate.chunk.documentId || candidate.chunk.id;
      if ((parentCounts.get(parentId) || 0) >= maxPerParent) continue;
      const relevance = candidate.score;
      const redundancy = selected.reduce((max, item) => Math.max(max, textSimilarity(candidate.chunk, item.chunk)), 0);
      const mmrScore = lambda * relevance - (1 - lambda) * redundancy;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) break;
    const [selectedItem] = remaining.splice(bestIndex, 1);
    const parentId = selectedItem.chunk.parentId || selectedItem.chunk.documentId || selectedItem.chunk.id;
    parentCounts.set(parentId, (parentCounts.get(parentId) || 0) + 1);
    selected.push({ ...selectedItem, mmrScore: bestScore });
  }
  return selected;
}

/**
 * @description 将正文统一为适合确定性比较的小写单空格文本。
 * @param {*} value 原始正文。
 * @returns {string} 用于确定性去重的规范化文本。
 */
function normalizeContent(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

/**
 * @description 计算两个知识分块标题与正文词项集合的 Jaccard 相似度。
 * @param {object} left 左侧知识分块。
 * @param {object} right 右侧知识分块。
 * @returns {number} 取值范围为 0 至 1 的 Jaccard 相似度。
 */
function textSimilarity(left, right) {
  const a = new Set(tokenize(String(left.title || "") + " " + String(left.content || "")));
  const b = new Set(tokenize(String(right.title || "") + " " + String(right.content || "")));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

/**
 * @description 提取字母、数字、完整词组和中文双字词组成的轻量词项集合。
 * @param {string} text 待切分文本。
 * @returns {string[]} 去重后的轻量词项。
 */
function tokenize(text) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const terms = new Set(normalized.match(/[\p{L}\p{N}]+/gu) || []);
  const chars = normalized.match(/[\u3400-\u9fff]/gu) || [];
  for (let index = 0; index + 1 < chars.length; index += 1) terms.add(chars[index] + chars[index + 1]);
  return [...terms];
}
