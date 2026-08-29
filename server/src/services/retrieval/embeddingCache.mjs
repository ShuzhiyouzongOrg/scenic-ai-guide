/**
 * @fileoverview Dense Embedding SQLite 缓存模块。
 * @description
 * 缓存键只由模型、维度和上下文化正文哈希组成，不保存 API 密钥或原始查询，
 * 并提供批量读取、批量写入和稳定缓存键生成能力。
 */
import { createHash } from "node:crypto";

/**
 * @typedef {object} EmbeddingCacheEntry
 * @description 不包含明文正文的 Embedding 缓存索引项。
 * @property {string} key 缓存主键。
 * @property {string} model Embedding 模型名称。
 * @property {number} dimensions 向量维度。
 * @property {string} contentHash 上下文化正文的 SHA-256 哈希。
 */

/**
 * @typedef {EmbeddingCacheEntry & {vector: number[]}} EmbeddingCacheWriteEntry
 * @description 包含待持久化向量的缓存写入项。
 */

/**
 * @typedef {object} SqliteEmbeddingCache
 * @description 基于 SQLite 的 Embedding 缓存适配器。
 * @property {(entries?: EmbeddingCacheEntry[]) => Map<string, number[]>} getMany 批量读取有效缓存向量。
 * @property {(entries?: EmbeddingCacheWriteEntry[]) => number} setMany 批量写入缓存并返回写入数量。
 */

/**
 * @description 创建 SQLite Embedding 缓存适配器，并预编译读取、触碰和写入语句。
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @returns {SqliteEmbeddingCache} 可批量读写向量的缓存适配器。
 * @throws {Error} 数据库语句预编译失败时透传底层异常。
 * @example
 * const cache = createSqliteEmbeddingCache(db);
 * const vectors = cache.getMany([embeddingCacheEntry("model", 1024, "正文")]);
 */
export function createSqliteEmbeddingCache(db) {
  const select = db.prepare(
    `SELECT cache_key, vector_json FROM rag_embedding_cache
     WHERE model = ? AND dimensions = ? AND content_hash = ?`
  );
  const touch = db.prepare("UPDATE rag_embedding_cache SET last_used_at = ? WHERE cache_key = ?");
  const upsert = db.prepare(
    `INSERT INTO rag_embedding_cache
      (cache_key, model, dimensions, content_hash, vector_json, created_at, last_used_at)
     VALUES (@cache_key, @model, @dimensions, @content_hash, @vector_json, @created_at, @last_used_at)
     ON CONFLICT(cache_key) DO UPDATE SET
       vector_json = excluded.vector_json,
       last_used_at = excluded.last_used_at`
  );
  return {
    /**
     * @description 批量读取维度匹配且内容可解析的缓存向量，并刷新最后使用时间。
     * @param {EmbeddingCacheEntry[]} [entries=[]] 待查询的缓存索引项。
     * @returns {Map<string, number[]>} 缓存键到数值向量的映射。
     * @throws {Error} 数据库读取或更新时间失败时透传底层异常。
     */
    getMany(entries = []) {
      const now = new Date().toISOString();
      const found = new Map();
      for (const entry of entries) {
        const row = select.get(entry.model, entry.dimensions, entry.contentHash);
        if (!row) continue;
        const vector = parseVector(row.vector_json, entry.dimensions);
        if (!vector) continue;
        found.set(entry.key, vector);
        touch.run(now, row.cache_key);
      }
      return found;
    },
    /**
     * @description 在单个数据库事务中批量新增或更新缓存向量。
     * @param {EmbeddingCacheWriteEntry[]} [entries=[]] 待写入的缓存项。
     * @returns {number} 成功提交的缓存项数量。
     * @throws {Error} 数据库事务或写入失败时透传底层异常。
     */
    setMany(entries = []) {
      if (entries.length === 0) return 0;
      const now = new Date().toISOString();
      const write = db.transaction((rows) => {
        for (const entry of rows) {
          upsert.run({
            cache_key: entry.key,
            model: entry.model,
            dimensions: entry.dimensions,
            content_hash: entry.contentHash,
            vector_json: JSON.stringify(entry.vector),
            created_at: now,
            last_used_at: now
          });
        }
      });
      write(entries);
      return entries.length;
    }
  };
}

/**
 * @description 根据模型、维度和正文哈希构造不含明文正文的稳定缓存条目。
 * @param {string} model Embedding 模型。
 * @param {number} dimensions 向量维度。
 * @param {string} text 实际送入模型的上下文化正文。
 * @returns {EmbeddingCacheEntry} 稳定缓存索引项。
 * @example
 * const entry = embeddingCacheEntry("qwen3.7-text-embedding", 1024, "景区：灵山胜境");
 */
export function embeddingCacheEntry(model, dimensions, text) {
  const contentHash = createHash("sha256").update(String(text || "")).digest("hex");
  const key = createHash("sha256")
    .update(`${model}\u0000${dimensions}\u0000${contentHash}`)
    .digest("hex");
  return { key, model, dimensions, contentHash };
}

/**
 * @description 解析缓存中的 JSON 向量，并验证长度及所有元素的数值有效性。
 * @param {string} value JSON 格式的向量文本。
 * @param {number} dimensions 预期向量维度。
 * @returns {number[]|null} 合法数值向量；解析失败或维度不符时返回 `null`。
 */
function parseVector(value, dimensions) {
  try {
    const vector = JSON.parse(value);
    if (!Array.isArray(vector) || vector.length !== dimensions) return null;
    if (vector.some((item) => !Number.isFinite(Number(item)))) return null;
    return vector.map(Number);
  } catch {
    return null;
  }
}
