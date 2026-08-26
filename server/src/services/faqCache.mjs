/**
 * @fileoverview 高频问答的进程内缓存服务。
 *
 * 缓存键由知识版本、问答模式和规范化问题组成；命中后可跳过知识检索与大模型调用。
 * 数据仅保存在当前进程中，并通过 TTL 与最大条目数限制生命周期和内存占用。
 *
 * @typedef {object} FaqCacheEntry
 * @property {*} value 缓存的回答对象。
 * @property {number} hits 已命中次数。
 * @property {number} createdAt 创建时间的 Unix 毫秒时间戳。
 * @property {number} expiresAt 过期时间的 Unix 毫秒时间戳。
 */
import { createHash } from "node:crypto";
import { getActiveKnowledgeVersion } from "./knowledgeBuild.mjs";

/** @type {Map<string, FaqCacheEntry>} 以规范化问题为键的进程内缓存。 */
const store = new Map();
/** @type {number} 默认缓存有效期，单位为毫秒。 */
const DEFAULT_TTL_MS = 1000 * 60 * 30;
/** @type {number} 缓存允许保留的最大问题数。 */
const MAX_ENTRIES = 500;

/**
 * 生成包含问答模式的稳定缓存键。
 * @private
 * @param {*} question 用户问题；非字符串值会先转换为字符串。
 * @param {*} mode 问答模式；空值按 `qa` 处理。
 * @returns {string} 去除大小写、空白和常见标点后的缓存键。
 */
function normalizeQuestion(question, mode, knowledgeVersion = getActiveKnowledgeVersion(), context = {}) {
  const base = String(question || "")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:~～]+/g, "")
    .trim();
  const questionHash = createHash("sha256").update(base).digest("hex").slice(0, 24);
  return JSON.stringify({
    knowledgeVersion: knowledgeVersion || "unbuilt",
    mode: mode || "qa",
    locale: context.locale || "und",
    scenicArea: context.scenicArea || "",
    retrievalMode: context.retrievalMode || "hybrid",
    accessScopes: normalizeScopes(context.accessScopes),
    tenantId: context.tenantId || "default",
    questionHash
  });
}

/**
 * 读取尚未过期的缓存回答，并累计命中次数。
 * @param {*} question 用户问题。
 * @param {*} mode 问答模式。
 * @returns {*|null} 缓存值；未命中或已过期时返回 `null`。
 * @example
 * const answer = getCachedAnswer("灵山大佛几点开放？", "qa");
 */
export function getCachedAnswer(question, mode, knowledgeVersion, context = {}) {
  if (containsSensitiveText(question)) return null;
  const key = normalizeQuestion(question, mode, knowledgeVersion, context);
  const entry = store.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  entry.hits += 1;
  return entry.value;
}

/**
 * 写入或替换问题缓存；容量已满时淘汰最早插入的条目。
 * @param {*} question 用户问题。
 * @param {*} mode 问答模式。
 * @param {*} value 要缓存的回答对象。
 * @param {number} [ttlMs=DEFAULT_TTL_MS] 有效期，单位为毫秒。
 * @param {string} [knowledgeVersion] 实际生成回答时使用的知识版本。
 * @returns {void}
 * @example
 * setCachedAnswer("灵山大佛几点开放？", "qa", { answer: "07:00 开放" });
 */
export function setCachedAnswer(question, mode, value, ttlMs = DEFAULT_TTL_MS, knowledgeVersion, context = {}) {
  if (containsSensitiveText(question)) return false;
  if (store.size >= MAX_ENTRIES) {
    // Evict the oldest entry to bound memory.
    const oldestKey = store.keys().next().value;
    if (oldestKey) {
      store.delete(oldestKey);
    }
  }
  const key = normalizeQuestion(question, mode, knowledgeVersion, context);
  store.set(key, {
    value,
    hits: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
  return true;
}

/**
 * 获取当前缓存规模及每个条目的命中统计。
 * @returns {{size: number, entries: Array<{key: string, hits: number, createdAt: string}>}} 缓存统计快照。
 * @example
 * const { size, entries } = faqCacheStats();
 */
export function faqCacheStats() {
  return {
    size: store.size,
    entries: [...store.entries()].map(([key, entry]) => ({
      key,
      hits: entry.hits,
      createdAt: new Date(entry.createdAt).toISOString()
    }))
  };
}

/**
 * 清空当前进程内的全部问答缓存。
 * @returns {void}
 * @example
 * clearFaqCache();
 */
export function clearFaqCache() {
  store.clear();
}

/** @param {*} values 权限范围。 @returns {string[]} 排序后的唯一范围。 */
function normalizeScopes(values) {
  return [...new Set((Array.isArray(values) ? values : ["public"]).map(String).filter(Boolean))].sort();
}

/** @param {*} value 文本。 @returns {boolean} 是否含个人身份信息。 */
function containsSensitiveText(value) {
  const text = String(value || "");
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(text)
    || /\b1\d{10}\b/u.test(text)
    || /\b\d{17}[\dXx]\b/u.test(text)
    || /(?:身份证|手机号|电话|邮箱)\s*[:：]?\s*[\w@.+-]{5,}/u.test(text);
}
