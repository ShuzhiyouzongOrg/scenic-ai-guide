/**
 * @fileoverview Dense Embedding 的 SQLite 持久缓存。
 *
 * 缓存键只由模型、维度和上下文化正文哈希组成，不保存 API 密钥或原始查询。
 */
import { createHash } from "node:crypto";

/**
 * 创建 SQLite Embedding 缓存适配器。
 * @param {import("better-sqlite3").Database} db 数据库连接。
 * @returns {{getMany(entries: object[]): Map<string, number[]>, setMany(entries: object[]): number}}
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
 * 构造不含正文的稳定缓存条目。
 * @param {string} model Embedding 模型。
 * @param {number} dimensions 向量维度。
 * @param {string} text 实际送入模型的上下文化正文。
 * @returns {{key:string, model:string, dimensions:number, contentHash:string}}
 */
export function embeddingCacheEntry(model, dimensions, text) {
  const contentHash = createHash("sha256").update(String(text || "")).digest("hex");
  const key = createHash("sha256")
    .update(`${model}\u0000${dimensions}\u0000${contentHash}`)
    .digest("hex");
  return { key, model, dimensions, contentHash };
}

/** @param {string} value JSON 向量。 @param {number} dimensions 预期维度。 @returns {number[]|null} */
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
