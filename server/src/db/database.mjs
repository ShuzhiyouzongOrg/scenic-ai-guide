/**
 * @fileoverview SQLite 持久化、迁移和参考数据初始化模块。
 *
 * 数据库按需打开并在模块内缓存。普通服务端使用 `better-sqlite3`；Electron 桌面运行时通过
 * `NodeSqliteDatabase` 适配内置 `node:sqlite`，对上层暴露相同的同步 API。测试未设置
 * `SQLITE_PATH` 时使用内存数据库，从而保证进程级隔离。
 *
 * @typedef {{
 *   prepare(sql: string): {get(...args: unknown[]): any, all(...args: unknown[]): any[], run(...args: unknown[]): any},
 *   exec(sql: string): DatabaseLike,
 *   pragma(source: string): unknown[],
 *   transaction(callback: Function): Function,
 *   close(): void
 * }} DatabaseLike
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "../config.mjs";
import { loadKnowledge } from "../services/knowledgeBuild.mjs";
import { hashPassword } from "./password.mjs";

/** @type {DatabaseLike|null} 当前进程复用的数据库实例。 */
let db = null;
/** @type {NodeRequire} 用于从 ESM 加载原生 CommonJS SQLite 驱动。 */
const require = createRequire(import.meta.url);

/**
 * 根据运行环境创建 SQLite 驱动实例。
 *
 * @param {string} path SQLite 文件路径或 `:memory:`。
 * @returns {DatabaseLike} 同步数据库适配器。
 * @throws {Error} 桌面运行时缺少 `node:sqlite` 或普通运行时无法加载 `better-sqlite3` 时抛出。
 * @private
 */
function createDatabase(path) {
  if (process.env.DESKTOP_USE_NODE_SQLITE === "1") {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require("node:sqlite"));
    } catch (error) {
      throw new Error(
        "The desktop runtime requires Electron with built-in node:sqlite support.",
        { cause: error }
      );
    }
    return new NodeSqliteDatabase(path, DatabaseSync);
  }
  const Database = require("better-sqlite3");
  return new Database(path);
}

/**
 * 将 Electron 内置 `node:sqlite` 包装成项目所需的 `better-sqlite3` 子集。
 *
 * @private
 */
class NodeSqliteDatabase {
  /**
   * @param {string} path SQLite 文件路径或 `:memory:`。
   * @param {new (path: string) => any} DatabaseSync `node:sqlite` 的同步数据库构造器。
   * @throws {Error} 数据库文件无法打开或驱动初始化失败时抛出。
   */
  constructor(path, DatabaseSync) {
    this.database = new DatabaseSync(path);
  }

  /**
   * 创建可执行的 SQL 预编译语句。
   * @param {string} sql SQL 文本。
   * @returns {any} `node:sqlite` StatementSync。
   * @throws {Error} SQL 无法编译时透传 SQLite 异常。
   */
  prepare(sql) {
    return this.database.prepare(sql);
  }

  /**
   * 执行一段无需返回行集的 SQL。
   * @param {string} sql SQL 文本。
   * @returns {NodeSqliteDatabase} 当前适配器，支持链式调用。
   * @throws {Error} SQL 执行失败时透传 SQLite 异常。
   */
  exec(sql) {
    this.database.exec(sql);
    return this;
  }

  /**
   * 执行 SQLite PRAGMA 读取或赋值语句。
   * @param {string} source 不含 `PRAGMA` 前缀的表达式。
   * @returns {unknown[]} 查询行；赋值操作返回空数组。
   * @throws {Error} PRAGMA 无效或执行失败时透传 SQLite 异常。
   */
  pragma(source) {
    const statement = String(source).trim().replace(/;$/, "");
    if (statement.includes("=")) {
      this.database.exec(`PRAGMA ${statement}`);
      return [];
    }
    return this.database.prepare(`PRAGMA ${statement}`).all();
  }

  /**
   * 将回调包装为同步事务，并在异常时自动回滚。
   * @template {(...args: any[]) => any} T
   * @param {T} callback 事务主体。
   * @returns {T} 可调用的事务包装函数。
   * @throws {Error} 回调异常会在回滚后原样重新抛出。
   */
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }

  /**
   * 关闭底层数据库连接。
   * @returns {void}
   * @throws {Error} 连接关闭失败时透传 SQLite 异常。
   */
  close() {
    this.database.close();
  }
}

/** @type {Readonly<Record<string, string>>} 内置数字人的产品展示名称。 */
const DIGITAL_HUMAN_NAMES = {
  receptionMale: "景行·灵山迎宾使（男）",
  receptionFemale: "灵悦·莲心礼宾使（女）",
  scenicFemaleA: "云觉·大佛文化使（女）",
  scenicFemaleB: "梵音·梵宫导览使（女）",
  live2dHaru: "春和·九龙灵使（女）",
  live2dHiyori: "晴音·莲华旅伴（女）",
  live2dKei: "知远·坛城研学使（男）",
  live2dHibiki: "清响·禅旅伙伴（男）"
};
/** @type {string} 新建数字人配置的默认欢迎语。 */
const DEFAULT_DIGITAL_HUMAN_WELCOME = "您好，我是灵山胜境 AI 导游，很高兴为您服务。";
/** @type {string} 历史迎宾女声音色，用于兼容迁移识别。 */
const LEGACY_RECEPTION_FEMALE_VOICE = "x6_zhantingnvjiedai_pro";
/** @type {string} 当前获授权的迎宾女声音色。 */
const LICENSED_RECEPTION_FEMALE_VOICE = "x6_jingqudaolannvsheng_mini";
/** @type {string} 历史 Live2D 男声音色，用于兼容迁移识别。 */
const LEGACY_LIVE2D_MALE_TTS_VOICE = "x4_pengfei";
/** @type {string} 当前 Live2D 男声音色。 */
const LIVE2D_MALE_TTS_VOICE = "x6_zhantingnanjiedai_pro";

/** @type {string} 创建所有业务表与索引的幂等 DDL。 */
const DDL = `
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar TEXT,
  real_name TEXT,
  gender TEXT,
  nickname TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  bio TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL,
  role_code TEXT UNIQUE NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  channel TEXT,
  satisfaction_score INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent_label TEXT,
  emotion_label TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  rating INTEGER,
  vote TEXT,
  emotion TEXT,
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback (session_id);

CREATE TABLE IF NOT EXISTS scenic_spots (
  id TEXT PRIMARY KEY,
  scenic_area TEXT,
  name TEXT NOT NULL,
  aliases TEXT,
  location_text TEXT,
  parameters TEXT,
  core_function TEXT,
  culture TEXT,
  detail TEXT,
  highlights TEXT,
  open_info TEXT,
  notes TEXT,
  source TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS digital_human_configs (
  id TEXT PRIMARY KEY,
  name TEXT,
  -- engine: which rendering engine drives this avatar.
  --   'xfyun'  -> iFlytek cloud streaming avatar (uses avatar_id + vcn)
  --   'live2d' -> local Live2D canvas (uses model_id), a redundancy/fallback path
  -- Whichever config is enabled decides what the visitor page renders.
  engine TEXT NOT NULL DEFAULT 'xfyun',
  avatar_id TEXT,
  vcn TEXT,
  -- model_id: Live2D character folder name (only used when engine = 'live2d')
  model_id TEXT,
  character_asset TEXT,
  appearance TEXT,
  outfit TEXT,
  theme TEXT,
  voice_id TEXT,
  speech_rate REAL,
  welcome_text TEXT,
  emotion_style TEXT,
  service_status TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  stored_name TEXT,
  mime_type TEXT,
  size INTEGER,
  file_type TEXT,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  processing_stage TEXT NOT NULL DEFAULT 'uploaded',
  knowledge_scope TEXT NOT NULL DEFAULT 'visitor_qa',
  access_scope TEXT NOT NULL DEFAULT 'public',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scenic_area TEXT,
  language TEXT,
  document_type TEXT,
  valid_from TEXT,
  valid_to TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  index_version TEXT,
  metadata TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_processing_tasks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  external_job_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  result_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(document_id, task_type, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_runnable
  ON knowledge_processing_tasks(task_type, status, next_attempt_at);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  scenic_spot_id TEXT,
  parent_id TEXT,
  title TEXT,
  section_path TEXT,
  content TEXT NOT NULL,
  keywords TEXT,
  page INTEGER,
  sheet_name TEXT,
  cell_range TEXT,
  row_start INTEGER,
  row_end INTEGER,
  knowledge_scope TEXT NOT NULL DEFAULT 'visitor_qa',
  access_scope TEXT NOT NULL DEFAULT 'public',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scenic_area TEXT,
  language TEXT,
  document_type TEXT,
  valid_from TEXT,
  valid_to TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  index_version TEXT,
  content_hash TEXT,
  embedding_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope ON knowledge_chunks(knowledge_scope, enabled);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_version ON knowledge_chunks(index_version);

CREATE TABLE IF NOT EXISTS rag_embedding_cache (
  cache_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  UNIQUE(model, dimensions, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_rag_embedding_cache_lookup
  ON rag_embedding_cache(model, dimensions, content_hash);

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id TEXT PRIMARY KEY,
  question_hash TEXT NOT NULL,
  question_preview TEXT NOT NULL,
  scenic_area TEXT NOT NULL DEFAULT 'general',
  intent TEXT NOT NULL DEFAULT 'unknown',
  reasons TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  confirmed_at TEXT,
  dismissed_at TEXT,
  UNIQUE(question_hash, scenic_area, intent)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status_frequency
  ON knowledge_gaps(status, occurrence_count DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS rag_experiment_state (
  experiment_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  rollback_reason TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rolled_back_at TEXT
);

CREATE TABLE IF NOT EXISTS rag_experiment_events (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  message_id TEXT,
  variant TEXT NOT NULL,
  scenario TEXT,
  refused INTEGER NOT NULL DEFAULT 0,
  feedback_recorded INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER,
  citation_count INTEGER NOT NULL DEFAULT 0,
  citation_clicked INTEGER NOT NULL DEFAULT 0,
  latency_ms REAL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  embedding_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  provider TEXT,
  model TEXT,
  index_version TEXT,
  cached INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rag_experiment_variant_time
  ON rag_experiment_events(experiment_id, variant, created_at);
CREATE INDEX IF NOT EXISTS idx_rag_experiment_session_message
  ON rag_experiment_events(experiment_id, session_hash, message_id);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_time
  ON admin_audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_index_versions (
  index_version TEXT PRIMARY KEY,
  chunker_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  document_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tourist_behavior (
  id TEXT PRIMARY KEY,
  tourist_id TEXT,
  age INTEGER,
  gender TEXT,
  attraction_name TEXT,
  visit_date TEXT,
  stay_duration REAL,
  ticket_cost REAL,
  food_cost REAL,
  shopping_cost REAL,
  transport_cost REAL,
  entertainment_cost REAL,
  total_cost REAL,
  group_size INTEGER,
  satisfaction INTEGER
);

CREATE TABLE IF NOT EXISTS route_selections (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  route_id TEXT,
  route_name TEXT,
  route_type TEXT,
  duration_minutes INTEGER,
  node_ids TEXT,
  tags TEXT,
  preferences TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_annotations (
  message_id TEXT PRIMARY KEY,
  label TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_vital_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  rating TEXT NOT NULL,
  app_version TEXT NOT NULL,
  device_class TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_vitals_version_metric_time
  ON web_vital_events(app_version, metric, created_at DESC);
`;

/**
 * 解析当前进程应使用的 SQLite 地址。
 * @returns {string} 显式路径的绝对值，或未配置时的 `:memory:`。
 * @private
 */
function resolveSqlitePath() {
  const configured = process.env.SQLITE_PATH;
  if (!configured || configured === ":memory:") {
    return ":memory:";
  }
  return resolve(process.cwd(), configured);
}

/**
 * 获取已迁移并完成参考数据初始化的单例数据库。
 *
 * @returns {DatabaseLike} 可同步执行查询和事务的数据库实例。
 * @throws {Error} 驱动加载、目录访问、迁移或种子数据写入失败时抛出。
 * @example
 * const row = getDb().prepare("SELECT * FROM admin_users WHERE id = ?").get(userId);
 */
export function getDb() {
  if (db) {
    return db;
  }
  const path = resolveSqlitePath();
  db = createDatabase(path);
  if (path !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedReferenceData(db);
  syncKnowledgeSnapshot(db, loadKnowledge());
  return db;
}

/**
 * 将活动 JSON 快照的版本和分块元数据事务式同步到 SQLite，供一致性审计和后续迁移使用。
 * JSON 仍是当前运行时只读快照；SQLite 保留可查询的版本与分块副本。
 * @param {DatabaseLike} instance 数据库连接。
 * @param {object|null} knowledge 知识快照。
 * @returns {{indexVersion: string, chunks: number}|null} 同步摘要。
 */
export function syncKnowledgeSnapshot(instance, knowledge) {
  if (!instance || !knowledge?.indexVersion || !Array.isArray(knowledge.chunks)) return null;
  const write = instance.transaction(() => {
    const documents = knowledge.documents || [];
    const activeDocumentIds = new Set(documents.map((document) => document.id));
    instance.prepare("UPDATE knowledge_index_versions SET active = 0 WHERE active = 1").run();
    instance.prepare(
      `INSERT OR REPLACE INTO knowledge_index_versions
        (index_version, chunker_version, generated_at, document_count, chunk_count, active)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run(
      knowledge.indexVersion,
      knowledge.chunkerVersion || "legacy",
      knowledge.generatedAt || new Date().toISOString(),
      (knowledge.documents || []).length,
      knowledge.chunks.length
    );
    const existingDocument = instance.prepare("SELECT id FROM knowledge_documents WHERE id = ?");
    const insertDocument = instance.prepare(
      `INSERT INTO knowledge_documents
        (id, file_name, mime_type, file_type, content_hash, status, processing_stage,
         knowledge_scope, access_scope, tenant_id, scenic_area, language, document_type, valid_from, valid_to,
         enabled, index_version, chunk_count, created_at)
       VALUES
        (@id, @file_name, @mime_type, @file_type, @content_hash, @status, @processing_stage,
         @knowledge_scope, @access_scope, @tenant_id, @scenic_area, @language, @document_type, @valid_from, @valid_to,
         @enabled, @index_version, @chunk_count, @created_at)`
    );
    const updateDocument = instance.prepare(
      `UPDATE knowledge_documents
       SET file_name = @file_name, file_type = @file_type, content_hash = @content_hash,
           status = @status, processing_stage = @processing_stage,
           knowledge_scope = @knowledge_scope, access_scope = @access_scope, tenant_id = @tenant_id,
           scenic_area = @scenic_area,
           language = @language, document_type = @document_type, valid_from = @valid_from,
           valid_to = @valid_to, enabled = @enabled, index_version = @index_version,
           chunk_count = @chunk_count
       WHERE id = @id`
    );
    for (const document of documents) {
      const values = {
        id: document.id,
        file_name: document.fileName,
        mime_type: document.mimeType || null,
        file_type: document.fileType || null,
        content_hash: document.contentHash || null,
        status: document.status || "processed",
        processing_stage: document.processingStage || document.status || "processed",
        knowledge_scope: document.knowledgeScope || "visitor_qa",
        access_scope: document.accessScope || "public",
        tenant_id: document.tenantId || "default",
        scenic_area: document.scenicArea || null,
        language: document.language || "und",
        document_type: document.documentType || document.fileType || null,
        valid_from: document.validFrom || null,
        valid_to: document.validTo || null,
        enabled: document.enabled === false ? 0 : 1,
        index_version: knowledge.indexVersion,
        chunk_count: Number(document.chunkCount || 0),
        created_at: document.createdAt || knowledge.generatedAt || new Date().toISOString()
      };
      if (existingDocument.get(document.id)) {
        updateDocument.run(values);
      } else {
        insertDocument.run(values);
      }
    }
    const uploadRows = instance.prepare(
      "SELECT id FROM knowledge_documents WHERE stored_name IS NOT NULL"
    ).all();
    const clearInactiveUpload = instance.prepare(
      "UPDATE knowledge_documents SET index_version = NULL, chunk_count = 0 WHERE id = ?"
    );
    for (const row of uploadRows) {
      if (!activeDocumentIds.has(row.id)) clearInactiveUpload.run(row.id);
    }
    instance.prepare("DELETE FROM knowledge_chunks WHERE index_version = ?").run(knowledge.indexVersion);
    const insert = instance.prepare(
      `INSERT INTO knowledge_chunks
        (id, document_id, scenic_spot_id, parent_id, title, section_path, content, keywords,
         page, sheet_name, cell_range, row_start, row_end, knowledge_scope, access_scope, tenant_id, scenic_area,
         language, document_type, valid_from, valid_to, enabled, index_version, content_hash,
         embedding_ref, created_at)
       VALUES
        (@id, @document_id, @scenic_spot_id, @parent_id, @title, @section_path, @content, @keywords,
         @page, @sheet_name, @cell_range, @row_start, @row_end, @knowledge_scope, @access_scope, @tenant_id, @scenic_area,
         @language, @document_type, @valid_from, @valid_to, @enabled, @index_version, @content_hash,
         @embedding_ref, @created_at)`
    );
    for (const chunk of knowledge.chunks) {
      insert.run({
        id: `${knowledge.indexVersion}:${chunk.id}`,
        document_id: chunk.documentId,
        scenic_spot_id: chunk.scenicSpotId || null,
        parent_id: chunk.parentId || null,
        title: chunk.title || null,
        section_path: chunk.sectionPath || null,
        content: chunk.content,
        keywords: JSON.stringify(chunk.keywords || []),
        page: chunk.page || null,
        sheet_name: chunk.sheetName || null,
        cell_range: chunk.range || null,
        row_start: chunk.rowStart || null,
        row_end: chunk.rowEnd || null,
        knowledge_scope: chunk.knowledgeScope || "visitor_qa",
        access_scope: chunk.accessScope || "public",
        tenant_id: chunk.tenantId || "default",
        scenic_area: chunk.scenicArea || null,
        language: chunk.language || "und",
        document_type: chunk.documentType || chunk.fileType || null,
        valid_from: chunk.validFrom || null,
        valid_to: chunk.validTo || null,
        enabled: chunk.enabled === false ? 0 : 1,
        index_version: knowledge.indexVersion,
        content_hash: chunk.contentHash || null,
        embedding_ref: chunk.embeddingRef || null,
        created_at: knowledge.generatedAt || new Date().toISOString()
      });
    }
  });
  write();
  return { indexVersion: knowledge.indexVersion, chunks: knowledge.chunks.length };
}

/**
 * 对数据库执行幂等建表、补列和参考数据迁移。
 *
 * @param {DatabaseLike} instance 待迁移数据库。
 * @returns {void}
 * @throws {Error} 任一 DDL、PRAGMA 或迁移 SQL 失败时抛出。
 * @example
 * const database = getDb();
 * migrate(database);
 */
export function migrate(instance) {
  if (!instance) {
    throw new Error("A database instance is required.");
  }
  instance.exec(DDL);
  addMissingColumns(instance);
  backfillLegacyKnowledgeScopes(instance);
  backfillLegacyAccessScopes(instance);
  instance.exec(
    "CREATE INDEX IF NOT EXISTS idx_knowledge_documents_content_hash ON knowledge_documents(content_hash)"
  );
  instance.exec(
    "CREATE INDEX IF NOT EXISTS idx_knowledge_documents_scope ON knowledge_documents(knowledge_scope, enabled)"
  );
  instance.exec(
    "CREATE INDEX IF NOT EXISTS idx_knowledge_documents_index_version ON knowledge_documents(index_version)"
  );
  instance.exec(
    "CREATE INDEX IF NOT EXISTS idx_knowledge_documents_access ON knowledge_documents(tenant_id, access_scope, enabled)"
  );
  instance.exec(
    "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_access ON knowledge_chunks(index_version, tenant_id, access_scope, enabled)"
  );
  return instance;
}

// Lightweight additive migration: CREATE TABLE IF NOT EXISTS never alters an
// existing table, so databases created before a column was added need the new
// columns back-filled. Each entry is applied only when the column is absent.
/**
 * 为旧版数据库补充当前版本要求但尚不存在的列。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @throws {Error} 表结构读取或 `ALTER TABLE` 失败时抛出。
 * @private
 */
function addMissingColumns(instance) {
  const additions = {
    admin_users: [
      { name: "avatar", ddl: "avatar TEXT" },
      { name: "real_name", ddl: "real_name TEXT" },
      { name: "gender", ddl: "gender TEXT" },
      { name: "nickname", ddl: "nickname TEXT" },
      { name: "email", ddl: "email TEXT" },
      { name: "phone", ddl: "phone TEXT" },
      { name: "address", ddl: "address TEXT" },
      { name: "bio", ddl: "bio TEXT" }
    ],
    digital_human_configs: [
      { name: "engine", ddl: "engine TEXT NOT NULL DEFAULT 'xfyun'" },
      { name: "model_id", ddl: "model_id TEXT" }
    ],
    knowledge_documents: [
      { name: "content_hash", ddl: "content_hash TEXT" },
      { name: "processing_stage", ddl: "processing_stage TEXT NOT NULL DEFAULT 'uploaded'" },
      { name: "knowledge_scope", ddl: "knowledge_scope TEXT NOT NULL DEFAULT 'visitor_qa'" },
      { name: "access_scope", ddl: "access_scope TEXT NOT NULL DEFAULT 'public'" },
      { name: "tenant_id", ddl: "tenant_id TEXT NOT NULL DEFAULT 'default'" },
      { name: "scenic_area", ddl: "scenic_area TEXT" },
      { name: "language", ddl: "language TEXT" },
      { name: "document_type", ddl: "document_type TEXT" },
      { name: "valid_from", ddl: "valid_from TEXT" },
      { name: "valid_to", ddl: "valid_to TEXT" },
      { name: "enabled", ddl: "enabled INTEGER NOT NULL DEFAULT 1" },
      { name: "error_code", ddl: "error_code TEXT" },
      { name: "error_message", ddl: "error_message TEXT" },
      { name: "attempt_count", ddl: "attempt_count INTEGER NOT NULL DEFAULT 0" },
      { name: "started_at", ddl: "started_at TEXT" },
      { name: "finished_at", ddl: "finished_at TEXT" },
      { name: "index_version", ddl: "index_version TEXT" },
      { name: "metadata", ddl: "metadata TEXT" }
    ],
    knowledge_chunks: [
      { name: "access_scope", ddl: "access_scope TEXT NOT NULL DEFAULT 'public'" },
      { name: "tenant_id", ddl: "tenant_id TEXT NOT NULL DEFAULT 'default'" }
    ]
  };
  for (const [table, columns] of Object.entries(additions)) {
    const existing = new Set(instance.pragma(`table_info(${table})`).map((c) => c.name));
    for (const column of columns) {
      if (!existing.has(column.name)) {
        instance.exec(`ALTER TABLE ${table} ADD COLUMN ${column.ddl}`);
      }
    }
  }
}

/**
 * 将旧数据库中由新增列默认值误标为游客问答的运营资料重新隔离。
 *
 * 该迁移只匹配明确的行为分析或运营统计文件名，重复执行不会改变结果。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {number} 本次修正的文档数量。
 */
export function backfillLegacyKnowledgeScopes(instance) {
  const result = instance.prepare(
    `UPDATE knowledge_documents
     SET knowledge_scope = 'operations_analytics'
     WHERE knowledge_scope = 'visitor_qa'
       AND (file_name LIKE '%行为分析%'
         OR file_name LIKE '%游客行为%'
         OR file_name LIKE '%消费分析%'
         OR file_name LIKE '%运营统计%'
         OR file_name LIKE '%旅游数据%')`
  ).run();
  return Number(result.changes || 0);
}

/**
 * 将旧数据库中的非游客资料默认访问范围收紧为管理员，避免新增列默认值过宽。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {number} 修正文档与分块总数。
 */
export function backfillLegacyAccessScopes(instance) {
  const documents = instance.prepare(
    `UPDATE knowledge_documents SET access_scope = 'admin'
     WHERE knowledge_scope <> 'visitor_qa' AND access_scope = 'public'`
  ).run();
  const chunks = instance.prepare(
    `UPDATE knowledge_chunks SET access_scope = 'admin'
     WHERE knowledge_scope <> 'visitor_qa' AND access_scope = 'public'`
  ).run();
  return Number(documents.changes || 0) + Number(chunks.changes || 0);
}

// Seed only the small reference rows the product needs to boot (default digital
// human, admin account, scenic-spot catalogue). Heavy behaviour analytics rows
// are imported separately (scripts/db-init.mjs or lazily in behaviorAnalytics).
/**
 * 在单个事务中写入角色、管理员、数字人和景点参考数据。
 *
 * @param {DatabaseLike} instance 已完成建表的数据库实例。
 * @returns {void}
 * @throws {Error} 任一种子或兼容迁移失败时回滚并抛出。
 * @example
 * seedReferenceData(getDb());
 */
export function seedReferenceData(instance) {
  if (!instance) {
    throw new Error("A database instance is required.");
  }
  seedAdminUser(instance);
  seedSystemRoles(instance);
  seedDigitalHuman(instance);
  seedDigitalHumanCatalog(instance);
  migrateLegacyDigitalHumanTestFixture(instance);
  migrateLegacyDigitalHumanNames(instance);
  migrateUnsupportedXfyunVoices(instance);
  migrateUnsupportedLive2dVoices(instance);
  seedScenicSpots(instance);
  return instance;
}

/**
 * 写入管理员、运营人员和游客三个内置角色及默认权限。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function seedSystemRoles(instance) {
  const insert = instance.prepare(
    `INSERT OR IGNORE INTO system_roles
      (role_name, role_code, description, enabled, permissions, created_at)
     VALUES (@role_name, @role_code, @description, @enabled, @permissions, @created_at)`
  );
  const now = new Date().toISOString();
  insert.run({
    role_name: "管理员",
    role_code: "admin",
    description: "管理系统全部功能",
    enabled: 1,
    permissions: "[\"*\"]",
    created_at: now
  });
  insert.run({
    role_name: "运营人员",
    role_code: "operator",
    description: "处理景区内容与游客服务",
    enabled: 1,
    permissions: "[\"/admin/knowledge\",\"/admin/operation\"]",
    created_at: now
  });
  insert.run({
    role_name: "游客",
    role_code: "visitor",
    description: "使用数字人导览、地图导览及帮助页面",
    enabled: 1,
    permissions: "[\"/guide\",\"/help/docs\",\"/change/log\"]",
    created_at: now
  });
}

/**
 * 在管理员账号不存在时创建配置文件指定的初始账号。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function seedAdminUser(instance) {
  const count = instance.prepare("SELECT COUNT(*) AS n FROM admin_users").get().n;
  if (count > 0) {
    return;
  }
  instance
    .prepare(
      `INSERT INTO admin_users (id, username, password_hash, display_name, role, status, created_at)
       VALUES (@id, @username, @password_hash, @display_name, @role, @status, @created_at)`
    )
    .run({
      id: "user_admin",
      username: config.adminUsername,
      password_hash: hashPassword(config.adminPassword),
      display_name: "系统管理员",
      role: "admin",
      status: "active",
      created_at: new Date().toISOString()
    });
}

/**
 * 写入默认启用的讯飞数字人配置并更新未修改过的历史种子。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function seedDigitalHuman(instance) {
  const count = instance.prepare("SELECT COUNT(*) AS n FROM digital_human_configs").get().n;
  if (count > 0) {
    return;
  }
  instance
    .prepare(
      `INSERT INTO digital_human_configs
        (id, name, engine, avatar_id, vcn, model_id, character_asset, appearance, outfit, theme, voice_id,
         speech_rate, welcome_text, emotion_style, service_status, enabled, updated_at)
       VALUES
        (@id, @name, @engine, @avatar_id, @vcn, @model_id, @character_asset, @appearance, @outfit, @theme, @voice_id,
         @speech_rate, @welcome_text, @emotion_style, @service_status, @enabled, @updated_at)`
    )
    .run({
      id: "dh_xf_daolan_female_a",
      name: DIGITAL_HUMAN_NAMES.scenicFemaleA,
      engine: "xfyun",
      avatar_id: process.env.DEFAULT_AVATAR_ID || "cnrmkf0e2000000006",
      vcn: process.env.DEFAULT_AVATAR_VCN || "x6_jingqudaolannvsheng_mini",
      model_id: "",
      character_asset: "",
      appearance: "xfyun-interactive-avatar",
      outfit: "guide-uniform",
      theme: "lingshan-teal-gold",
      voice_id: process.env.DEFAULT_AVATAR_VCN || "x6_jingqudaolannvsheng_mini",
      speech_rate: 1,
      welcome_text:
        "您好，我是灵山胜境 AI 导游，可以为您讲解景点、规划路线并回答游览问题。",
      emotion_style: "warm",
      service_status: "online",
      enabled: 1,
      updated_at: new Date().toISOString()
    });
}

// Catalog of ready-to-use avatars. Unlike seedDigitalHuman (which only runs on
// an empty table), these rows are upserted idempotently by fixed id via
// INSERT OR IGNORE, so they also appear in databases that were created earlier.
// The seeded iFlytek guide remains enabled; administrators can switch to any
// other catalog entry from the console.
//
// Two engines coexist here for redundancy: if the iFlytek cloud avatars are
// unavailable, an admin can switch the visitor page to a local Live2D model
// (and vice-versa). The 4 Live2D characters below are chosen from the bundled
// free model set — 2 male-presenting (Kei, Hibiki) and 2 female-presenting
// (Haru, Hiyori); gender labels are approximate and only guide selection.
/**
 * 写入完整的讯飞与 Live2D 数字人目录。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function seedDigitalHumanCatalog(instance) {
  const now = new Date().toISOString();
  const baseXfyun = {
    engine: "xfyun",
    model_id: "",
    character_asset: "",
    appearance: "xfyun-interactive-avatar",
    outfit: "guide-uniform",
    theme: "lingshan-teal-gold",
    speech_rate: 1,
    welcome_text: DEFAULT_DIGITAL_HUMAN_WELCOME,
    emotion_style: "warm",
    service_status: "online",
    enabled: 0,
    updated_at: now
  };
  const baseLive2d = {
    engine: "live2d",
    avatar_id: "",
    outfit: "",
    theme: "lingshan-teal-gold",
    character_asset: "",
    appearance: "live2d-canvas",
    speech_rate: 1,
    welcome_text: DEFAULT_DIGITAL_HUMAN_WELCOME,
    emotion_style: "warm",
    service_status: "online",
    enabled: 0,
    updated_at: now
  };

  const catalog = [
    // iFlytek cloud avatars (name, vcn, avatar_id) supplied for this deployment.
    { ...baseXfyun, id: "dh_xf_zhanting_male", name: DIGITAL_HUMAN_NAMES.receptionMale, vcn: "x6_zhantingnanjiedai_pro", avatar_id: "cnr5dg8n2000000003", voice_id: "x6_zhantingnanjiedai_pro" },
    { ...baseXfyun, id: "dh_xf_zhanting_female", name: DIGITAL_HUMAN_NAMES.receptionFemale, vcn: LICENSED_RECEPTION_FEMALE_VOICE, avatar_id: "cnrfb86h2000000004", voice_id: LICENSED_RECEPTION_FEMALE_VOICE },
    { ...baseXfyun, id: "dh_xf_shangwu_yinyu", name: DIGITAL_HUMAN_NAMES.receptionMale, vcn: "x6_xiangruiyingyu_pro", avatar_id: "cnr5dg8n2000000003", voice_id: "x6_xiangruiyingyu_pro" },
    // Same voice, two different avatar images -> kept as two rows, names disambiguated.
    { ...baseXfyun, id: "dh_xf_daolan_female_a", name: DIGITAL_HUMAN_NAMES.scenicFemaleA, vcn: "x6_jingqudaolannvsheng_mini", avatar_id: "cnrmkf0e2000000006", voice_id: "x6_jingqudaolannvsheng_mini" },
    { ...baseXfyun, id: "dh_xf_daolan_female_b", name: DIGITAL_HUMAN_NAMES.scenicFemaleB, vcn: "x6_jingqudaolannvsheng_mini", avatar_id: "cnrn9jgi2000000005", voice_id: "x6_jingqudaolannvsheng_mini" },
    // Local Live2D fallback avatars (name, model_id = character folder, vcn = TTS voice for lip-sync audio).
    { ...baseLive2d, id: "dh_l2d_haru", name: DIGITAL_HUMAN_NAMES.live2dHaru, model_id: "Haru", vcn: "x5_lingxiaoyue_flow", voice_id: "guide_female" },
    { ...baseLive2d, id: "dh_l2d_hiyori", name: DIGITAL_HUMAN_NAMES.live2dHiyori, model_id: "Hiyori", vcn: "x5_lingxiaoyue_flow", voice_id: "guide_female" },
    { ...baseLive2d, id: "dh_l2d_kei", name: DIGITAL_HUMAN_NAMES.live2dKei, model_id: "Kei", vcn: LIVE2D_MALE_TTS_VOICE, voice_id: LIVE2D_MALE_TTS_VOICE },
    { ...baseLive2d, id: "dh_l2d_hibiki", name: DIGITAL_HUMAN_NAMES.live2dHibiki, model_id: "Hibiki", vcn: LIVE2D_MALE_TTS_VOICE, voice_id: LIVE2D_MALE_TTS_VOICE }
  ];

  const insert = instance.prepare(
    `INSERT OR IGNORE INTO digital_human_configs
       (id, name, engine, avatar_id, vcn, model_id, character_asset, appearance, outfit, theme, voice_id,
        speech_rate, welcome_text, emotion_style, service_status, enabled, updated_at)
     VALUES
       (@id, @name, @engine, @avatar_id, @vcn, @model_id, @character_asset, @appearance, @outfit, @theme, @voice_id,
        @speech_rate, @welcome_text, @emotion_style, @service_status, @enabled, @updated_at)`
  );
  const tx = instance.transaction((rows) => {
    for (const row of rows) {
      insert.run({ avatar_id: "", model_id: "", ...row });
    }
  });
  tx(catalog);
}

// A legacy database test accidentally inherited server/.env and wrote this
// exact fixture into the deployment database. Remove only that known row and
// restore the shipped scenic-guide avatar when the fixture was active.
/**
 * 将旧测试数字人记录升级为当前可用配置。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function migrateLegacyDigitalHumanTestFixture(instance) {
  const fixture = instance
    .prepare(
      `SELECT enabled FROM digital_human_configs
       WHERE id = ? AND avatar_id = ? AND vcn = ?`
    )
    .get("dh_test_2", "test_avatar", "x5_test");
  if (!fixture) return;

  const restore = instance.transaction(() => {
    instance
      .prepare(
        `DELETE FROM digital_human_configs
         WHERE id = ? AND avatar_id = ? AND vcn = ?`
      )
      .run("dh_test_2", "test_avatar", "x5_test");

    if (!fixture.enabled) return;
    const fallback = instance.prepare("SELECT id FROM digital_human_configs WHERE id = ?").get("dh_xf_daolan_female_a");
    if (!fallback) return;

    instance.prepare("UPDATE digital_human_configs SET enabled = 0").run();
    instance.prepare("UPDATE digital_human_configs SET enabled = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), fallback.id);
  });
  restore();
}

// Rename only names shipped by earlier versions. Administrator-defined names
// are deliberately left untouched.
/**
 * 将历史数字人名称迁移到当前产品命名。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function migrateLegacyDigitalHumanNames(instance) {
  const legacyNames = [
    ["灵灵", DIGITAL_HUMAN_NAMES.receptionMale],
    ["展厅接待男", DIGITAL_HUMAN_NAMES.receptionMale],
    ["展厅接待男声", DIGITAL_HUMAN_NAMES.receptionMale],
    ["景行·灵山迎宾使", DIGITAL_HUMAN_NAMES.receptionMale],
    ["商务殷语", DIGITAL_HUMAN_NAMES.receptionMale],
    ["展厅接待女", DIGITAL_HUMAN_NAMES.receptionFemale],
    ["展厅接待女声", DIGITAL_HUMAN_NAMES.receptionFemale],
    ["灵悦·莲心礼宾使", DIGITAL_HUMAN_NAMES.receptionFemale],
    ["景区导览形象一", DIGITAL_HUMAN_NAMES.scenicFemaleA],
    ["景区导览女声（形象一）", DIGITAL_HUMAN_NAMES.scenicFemaleA],
    ["云觉·大佛文化使", DIGITAL_HUMAN_NAMES.scenicFemaleA],
    ["景区导览形象二", DIGITAL_HUMAN_NAMES.scenicFemaleB],
    ["景区导览女声（形象二）", DIGITAL_HUMAN_NAMES.scenicFemaleB],
    ["梵音·梵宫导览使", DIGITAL_HUMAN_NAMES.scenicFemaleB],
    ["春 Haru（女）", DIGITAL_HUMAN_NAMES.live2dHaru],
    ["Live2D · 春（女声）", DIGITAL_HUMAN_NAMES.live2dHaru],
    ["春和·九龙灵使", DIGITAL_HUMAN_NAMES.live2dHaru],
    ["日和 Hiyori（女）", DIGITAL_HUMAN_NAMES.live2dHiyori],
    ["Live2D · 日和（女声）", DIGITAL_HUMAN_NAMES.live2dHiyori],
    ["晴音·莲华旅伴", DIGITAL_HUMAN_NAMES.live2dHiyori],
    ["圭 Kei（男）", DIGITAL_HUMAN_NAMES.live2dKei],
    ["Live2D · 圭（男声）", DIGITAL_HUMAN_NAMES.live2dKei],
    ["知远·坛城研学使", DIGITAL_HUMAN_NAMES.live2dKei],
    ["响 Hibiki（男）", DIGITAL_HUMAN_NAMES.live2dHibiki],
    ["Live2D · 响（男声）", DIGITAL_HUMAN_NAMES.live2dHibiki],
    ["清响·禅旅伙伴", DIGITAL_HUMAN_NAMES.live2dHibiki]
  ];
  const update = instance.prepare("UPDATE digital_human_configs SET name = ? WHERE name = ?");
  const tx = instance.transaction((rows) => {
    for (const [previousName, nextName] of rows) {
      update.run(nextName, previousName);
    }
  });
  tx(legacyNames);
}

// The reception-female avatar can start a video stream with the legacy voice,
// but writeText fails its TTS licence check. Migrate only the untouched built-in
// row so administrator-defined avatar and voice combinations remain unchanged.
/**
 * 将已停用的讯飞音色替换为当前授权音色，同时保护用户自定义记录。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function migrateUnsupportedXfyunVoices(instance) {
  const row = instance
    .prepare("SELECT * FROM digital_human_configs WHERE id = ?")
    .get("dh_xf_zhanting_female");
  if (!isUntouchedLegacyReceptionFemaleSeed(row)) return;

  instance
    .prepare(
      `UPDATE digital_human_configs
       SET vcn = ?, voice_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      LICENSED_RECEPTION_FEMALE_VOICE,
      LICENSED_RECEPTION_FEMALE_VOICE,
      new Date().toISOString(),
      row.id
    );
}

/**
 * 判断记录是否仍等同于历史迎宾女声默认种子。
 * @param {Record<string, unknown>|undefined} row 数据库记录。
 * @returns {boolean} 可安全自动迁移时为 `true`。
 * @private
 */
function isUntouchedLegacyReceptionFemaleSeed(row) {
  return Boolean(
    row &&
      row.name === DIGITAL_HUMAN_NAMES.receptionFemale &&
      row.engine === "xfyun" &&
      row.avatar_id === "cnrfb86h2000000004" &&
      row.vcn === LEGACY_RECEPTION_FEMALE_VOICE &&
      (row.model_id || "") === "" &&
      (row.character_asset || "") === "" &&
      row.appearance === "xfyun-interactive-avatar" &&
      row.outfit === "guide-uniform" &&
      row.theme === "lingshan-teal-gold" &&
      row.voice_id === LEGACY_RECEPTION_FEMALE_VOICE &&
      Number(row.speech_rate) === 1 &&
      row.welcome_text === DEFAULT_DIGITAL_HUMAN_WELCOME &&
      row.emotion_style === "warm" &&
      row.service_status === "online"
  );
}

// x4_pengfei is not licensed for the configured WebAPI account and produced a
// mock tone instead of speech. Only migrate untouched built-in rows; custom
// administrator voice choices are left unchanged.
/**
 * 将 Live2D 历史男声音色迁移到当前可用音色。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function migrateUnsupportedLive2dVoices(instance) {
  const legacySeeds = [
    { id: "dh_l2d_kei", name: DIGITAL_HUMAN_NAMES.live2dKei, modelId: "Kei" },
    { id: "dh_l2d_hibiki", name: DIGITAL_HUMAN_NAMES.live2dHibiki, modelId: "Hibiki" }
  ];
  const select = instance.prepare("SELECT * FROM digital_human_configs WHERE id = ?");
  const update = instance.prepare(
    `UPDATE digital_human_configs
     SET vcn = ?, voice_id = ?, updated_at = ?
     WHERE id = ?`
  );
  const now = new Date().toISOString();
  for (const seed of legacySeeds) {
    const row = select.get(seed.id);
    if (!isUntouchedLegacyLive2dSeed(row, seed)) continue;
    update.run(LIVE2D_MALE_TTS_VOICE, LIVE2D_MALE_TTS_VOICE, now, seed.id);
  }
}

/**
 * 判断 Live2D 记录是否仍保持给定历史种子的默认值。
 * @param {Record<string, unknown>|undefined} row 数据库记录。
 * @param {Record<string, unknown>} seed 对照种子。
 * @returns {boolean} 未经用户定制时为 `true`。
 * @private
 */
function isUntouchedLegacyLive2dSeed(row, seed) {
  return Boolean(
    row &&
      row.name === seed.name &&
      row.engine === "live2d" &&
      (row.avatar_id || "") === "" &&
      row.vcn === LEGACY_LIVE2D_MALE_TTS_VOICE &&
      row.model_id === seed.modelId &&
      (row.character_asset || "") === "" &&
      row.appearance === "live2d-canvas" &&
      (row.outfit || "") === "" &&
      row.theme === "lingshan-teal-gold" &&
      row.voice_id === "guide_male" &&
      Number(row.speech_rate) === 1 &&
      row.welcome_text === DEFAULT_DIGITAL_HUMAN_WELCOME &&
      row.emotion_style === "warm" &&
      row.service_status === "online"
  );
}

/**
 * 将知识库中的结构化景点写入管理端景点表，已存在记录则保留并更新。
 * @param {DatabaseLike} instance 数据库实例。
 * @returns {void}
 * @private
 */
function seedScenicSpots(instance) {
  // Idempotent, additive seed (INSERT OR IGNORE keyed by id): every boot syncs
  // the generated catalogue so spots added later — e.g. the 拈花湾 sub-area —
  // land in databases that were created before they existed, without touching
  // rows an admin may have edited.
  const knowledge = loadKnowledge();
  const spots = knowledge?.spots || [];
  if (!spots.length) {
    return;
  }
  const insert = instance.prepare(
    `INSERT OR IGNORE INTO scenic_spots
      (id, scenic_area, name, aliases, location_text, parameters, core_function,
       culture, detail, highlights, open_info, notes, source, enabled, updated_at)
     VALUES
      (@id, @scenic_area, @name, @aliases, @location_text, @parameters, @core_function,
       @culture, @detail, @highlights, @open_info, @notes, @source, 1, @updated_at)`
  );
  const now = new Date().toISOString();
  const tx = instance.transaction((rows) => {
    for (const spot of rows) {
      insert.run({
        id: spot.id,
        scenic_area: spot.scenicArea || "灵山胜境",
        name: spot.name || "",
        aliases: JSON.stringify(spot.aliases || []),
        location_text: spot.locationText || "",
        parameters: spot.parameters || "",
        core_function: spot.coreFunction || "",
        culture: spot.culture || "",
        detail: spot.detail || "",
        highlights: spot.highlights || "",
        open_info: spot.openInfo || "",
        notes: spot.notes || "",
        source: "generated",
        updated_at: now
      });
    }
  });
  tx(spots);
}

// Test/maintenance helper: drop the memoized handle so the next getDb() reopens.
/**
 * 关闭并清空模块缓存的数据库实例。
 *
 * @returns {void}
 * @throws {Error} SQLite 连接关闭失败时透传异常。
 * @example
 * await stopServer(); // stopServer 内部调用 closeDb()
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
