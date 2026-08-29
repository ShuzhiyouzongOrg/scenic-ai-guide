/**
 * @fileoverview SQLite 活动知识版本读取器。
 * @description
 * 从 SQLite 活动版本装配检索知识对象，并校验数据库与发布快照的一致性。
 *
 * SQLite 保存活动版本的文档和片段元数据，JSON 只负责发布快照恢复及补充景点展示资料。
 * 检索链路通过本模块读取一致的活动版本，避免 JSON 和数据库分别演进。
 */

/**
 * @typedef {object} ActiveKnowledgeStore
 * @description 从活动 SQLite 版本装配的检索知识对象。
 * @property {string} generatedAt 活动版本生成时间。
 * @property {string} indexVersion 活动索引版本。
 * @property {string} chunkerVersion 分块器版本。
 * @property {string} [sourceDir] 原始资料目录名称。
 * @property {string} [scope] 快照适用范围。
 * @property {object[]} documents 活动版本文档。
 * @property {object[]} spots 景点知识记录。
 * @property {object[]} [guideSections] 综合导览章节。
 * @property {object[]} chunks 活动版本分块。
 */

/**
 * @typedef {object} KnowledgeStoreConsistency
 * @description SQLite 活动知识版本的一致性检查结果。
 * @property {boolean} ok 是否未发现一致性问题。
 * @property {string|null} indexVersion 活动索引版本。
 * @property {number} documents 活动文档数量。
 * @property {number} chunks 活动分块数量。
 * @property {string[]} issues 一致性问题代码。
 */
import { getDb } from "../db/database.mjs";
import { loadKnowledge as loadJsonKnowledge } from "./knowledgeBuild.mjs";

/**
 * @description
 * 从 SQLite 活动版本组装检索所需知识对象。
 *
 * 数据库尚未完成同步时回退到 JSON，确保旧部署可以平滑启动；一旦存在活动 SQLite 版本，
 * 文档和片段正文均以 SQLite 为准。
 * @returns {ActiveKnowledgeStore|object|null} SQLite 活动知识对象；数据库尚未同步时返回 JSON 快照，均未构建时返回 `null`。
 * @throws {Error|SyntaxError} SQLite 查询、JSON 文件读取或解析失败时透传异常。
 * @example
 * const knowledge = loadKnowledgeFromSqlite();
 */
export function loadKnowledgeFromSqlite() {
  const jsonKnowledge = loadJsonKnowledge();
  const db = getDb();
  const version = db.prepare(
    `SELECT index_version, chunker_version, generated_at
     FROM knowledge_index_versions WHERE active = 1 LIMIT 1`
  ).get();
  if (!version) return jsonKnowledge;

  const documentRows = db.prepare(
    `SELECT id, file_name, file_type, content_hash, status, processing_stage,
            knowledge_scope, access_scope, tenant_id, scenic_area, language, document_type, valid_from, valid_to,
            enabled, index_version, chunk_count, created_at
     FROM knowledge_documents
     WHERE index_version = ?
     ORDER BY rowid ASC`
  ).all(version.index_version);
  const documentById = new Map(documentRows.map((row) => [row.id, row]));
  const chunkRows = db.prepare(
    `SELECT id, document_id, scenic_spot_id, parent_id, title, section_path, content,
            keywords, page, sheet_name, cell_range, row_start, row_end, knowledge_scope, access_scope, tenant_id,
            scenic_area, language, document_type, valid_from, valid_to, enabled,
            index_version, content_hash, embedding_ref, created_at
     FROM knowledge_chunks
     WHERE index_version = ?
     ORDER BY rowid ASC`
  ).all(version.index_version);
  const chunks = chunkRows.map((row) => ({
    id: row.id.replace(`${version.index_version}:`, ""),
    documentId: row.document_id,
    scenicSpotId: row.scenic_spot_id || null,
    parentId: row.parent_id || undefined,
    title: row.title || "",
    sectionPath: row.section_path || "",
    content: row.content,
    context: `来源：${documentById.get(row.document_id)?.file_name || row.document_id}；章节：${row.title || row.section_path || ""}`,
    keywords: parseJsonArray(row.keywords),
    source: documentById.get(row.document_id)?.file_name || row.document_id,
    language: row.language || "und",
    fileType: row.document_type || undefined,
    documentType: row.document_type || undefined,
    knowledgeScope: row.knowledge_scope || "visitor_qa",
    accessScope: row.access_scope || "public",
    tenantId: row.tenant_id || "default",
    scenicArea: row.scenic_area || "",
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    enabled: Number(row.enabled ?? 1) !== 0,
    page: row.page || null,
    sheetName: row.sheet_name || null,
    range: row.cell_range || null,
    rowStart: row.row_start || null,
    rowEnd: row.row_end || null,
    indexVersion: row.index_version,
    contentHash: row.content_hash || null,
    embeddingRef: row.embedding_ref || null,
    createdAt: row.created_at
  }));
  const spots = loadSqliteSpots(db);
  return {
    ...(jsonKnowledge || {}),
    generatedAt: version.generated_at,
    indexVersion: version.index_version,
    chunkerVersion: version.chunker_version,
    documents: documentRows.map(toKnowledgeDocument),
    spots: spots.length ? spots : jsonKnowledge?.spots || [],
    chunks
  };
}

/**
 * @description
 * 校验 SQLite 活动知识版本的文档、片段和统计信息是否一致。
 * @returns {KnowledgeStoreConsistency} 校验结果。
 * @throws {Error} SQLite 查询失败时透传数据库异常。
 * @example
 * const consistency = verifyKnowledgeStoreConsistency();
 */
export function verifyKnowledgeStoreConsistency() {
  const db = getDb();
  const activeVersions = db.prepare(
    "SELECT * FROM knowledge_index_versions WHERE active = 1 ORDER BY generated_at DESC"
  ).all();
  if (activeVersions.length === 0) {
    return {
      ok: false,
      indexVersion: null,
      documents: 0,
      chunks: 0,
      issues: ["KNOWLEDGE_ACTIVE_VERSION_MISSING"]
    };
  }

  const version = activeVersions[0];
  const documents = db.prepare(
    "SELECT id, chunk_count FROM knowledge_documents WHERE index_version = ?"
  ).all(version.index_version);
  const chunks = db.prepare(
    "SELECT document_id, COUNT(*) AS count FROM knowledge_chunks WHERE index_version = ? GROUP BY document_id"
  ).all(version.index_version);
  const chunkCounts = new Map(chunks.map((row) => [row.document_id, Number(row.count || 0)]));
  const documentIds = new Set(documents.map((row) => row.id));
  const issues = [];
  if (activeVersions.length !== 1) issues.push("KNOWLEDGE_MULTIPLE_ACTIVE_VERSIONS");
  const totalChunks = chunks.reduce((sum, row) => sum + Number(row.count || 0), 0);
  if (Number(version.document_count) !== documents.length) issues.push("KNOWLEDGE_DOCUMENT_COUNT_MISMATCH");
  if (Number(version.chunk_count) !== totalChunks) issues.push("KNOWLEDGE_CHUNK_COUNT_MISMATCH");
  for (const document of documents) {
    if (Number(document.chunk_count || 0) !== Number(chunkCounts.get(document.id) || 0)) {
      issues.push(`KNOWLEDGE_DOCUMENT_CHUNK_MISMATCH:${document.id}`);
    }
  }
  for (const documentId of chunkCounts.keys()) {
    if (!documentIds.has(documentId)) issues.push(`KNOWLEDGE_ORPHAN_CHUNKS:${documentId}`);
  }

  return {
    ok: issues.length === 0,
    indexVersion: version.index_version,
    documents: documents.length,
    chunks: totalChunks,
    issues
  };
}

/**
 * @description
 * 将 SQLite 文档记录转换为检索使用的知识文档对象。
 * @param {Record<string, *>} row SQLite文档行。
 * @returns {Record<string, *>} 检索文档。
 */
function toKnowledgeDocument(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    contentHash: row.content_hash || null,
    status: row.status,
    processingStage: row.processing_stage,
    knowledgeScope: row.knowledge_scope,
    accessScope: row.access_scope || "public",
    tenantId: row.tenant_id || "default",
    scenicArea: row.scenic_area || "",
    language: row.language || "und",
    documentType: row.document_type || row.file_type,
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    enabled: Number(row.enabled ?? 1) !== 0,
    indexVersion: row.index_version,
    chunkCount: row.chunk_count,
    createdAt: row.created_at
  };
}

/**
 * @description
 * 读取 SQLite 景点记录并转换为检索使用的景点列表。
 * @param {import("better-sqlite3").Database} db SQLite连接。
 * @returns {Record<string, *>[]} 景点列表。
 */
function loadSqliteSpots(db) {
  return db.prepare(
    `SELECT id, scenic_area, name, aliases, location_text, parameters, core_function,
            culture, detail, highlights, open_info, notes
     FROM scenic_spots WHERE enabled = 1 ORDER BY id ASC`
  ).all().map((row) => ({
    id: row.id,
    scenicArea: row.scenic_area || "",
    name: row.name,
    aliases: parseJsonArray(row.aliases),
    locationText: row.location_text || "",
    parameters: row.parameters || "",
    coreFunction: row.core_function || "",
    culture: row.culture || "",
    detail: row.detail || "",
    highlights: row.highlights || "",
    openInfo: row.open_info || "",
    notes: row.notes || ""
  }));
}

/**
 * @description
 * 解析数据库中的 JSON 数组字段，异常或非数组值回退为空数组。
 * @param {*} value JSON数组字段。
 * @returns {Array<*>} 解析后的数组。
 */
function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
