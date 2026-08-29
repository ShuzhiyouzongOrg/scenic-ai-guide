/**
 * @fileoverview 灵山与拈花湾资料的 DOCX/Markdown 解析、知识分块、运行时索引和快照恢复服务。
 * @description
 * 负责解析景区资料、生成结构化知识分块、发布版本化索引，并恢复可用知识快照。
 */

/**
 * @typedef {object} ScenicSpotKnowledge
 * @description 结构化景点知识记录。
 * @property {string} id 景点 ID。
 * @property {string} scenicArea 所属景区。
 * @property {string} name 景点名称。
 * @property {string[]} aliases 多语言名称和业务别名。
 * @property {string} locationText 位置说明。
 * @property {string} parameters 建筑或景观参数。
 * @property {string} coreFunction 核心功能。
 * @property {string} culture 文化内涵。
 * @property {string} detail 详细介绍。
 * @property {string} highlights 游玩亮点。
 * @property {string} openInfo 演艺或开放信息。
 * @property {string} notes 备注。
 */

/**
 * @typedef {object} KnowledgeChunk
 * @description 可写入知识快照并参与检索的结构化分块。
 * @property {string} id 分块 ID。
 * @property {string} documentId 来源文档 ID。
 * @property {string|null} scenicSpotId 关联景点 ID。
 * @property {string} [parentId] 父级分块 ID。
 * @property {string} title 分块标题。
 * @property {string} content 分块正文。
 * @property {string} [context] 补充上下文。
 * @property {string} [sectionPath] 文档章节路径。
 * @property {string[]} keywords 检索关键词。
 * @property {string} source 来源文件名。
 * @property {string} language 内容语言。
 * @property {string} [fileType] 来源文件扩展名。
 * @property {string} [documentType] 文档类型。
 * @property {string} [knowledgeScope] 知识用途范围。
 * @property {string} [accessScope] 知识访问范围。
 * @property {string} [tenantId] 租户标识。
 * @property {string} [scenicArea] 所属景区。
 * @property {string|null} [validFrom] 生效时间。
 * @property {string|null} [validTo] 失效时间。
 * @property {boolean} [enabled] 是否参与检索。
 * @property {number} [page] PDF 页码。
 * @property {string} [sheetName] 工作表名称。
 * @property {string} [range] 单元格范围。
 * @property {number} [rowStart] 起始行号。
 * @property {number} [rowEnd] 结束行号。
 * @property {string} [indexVersion] 索引版本。
 * @property {string} [contentHash] 内容摘要。
 * @property {string} [embeddingRef] 远程向量引用。
 * @property {string} [createdAt] 分块创建时间。
 */

/**
 * @typedef {object} KnowledgeDocument
 * @description 知识快照中的来源文档元数据。
 * @property {string} id 文档 ID。
 * @property {string} fileName 文件名。
 * @property {string} fileType 文件类型。
 * @property {string} language 文档语言。
 * @property {string} status 处理状态。
 * @property {string} [processingStage] 当前处理阶段。
 * @property {number} chunkCount 生成的分块数量。
 * @property {string} createdAt 创建时间。
 * @property {string} [contentHash] 内容摘要。
 * @property {string} [knowledgeScope] 知识用途范围。
 * @property {string} [accessScope] 知识访问范围。
 * @property {string} [tenantId] 租户标识。
 * @property {string} [scenicArea] 所属景区。
 * @property {string} [documentType] 文档类型。
 * @property {string|null} [validFrom] 生效时间。
 * @property {string|null} [validTo] 失效时间。
 * @property {boolean} [enabled] 是否参与检索。
 * @property {string} [indexVersion] 索引版本。
 * @property {boolean} [skipped] 是否因内容未变化而跳过重建。
 */

/**
 * @typedef {object} GuideSection
 * @description 综合导览文档切分后的章节。
 * @property {string} id 章节 ID。
 * @property {string} title 章节标题。
 * @property {string} content 章节正文。
 * @property {string[]} keywords 检索关键词。
 */

/**
 * @typedef {object} KnowledgeBase
 * @description 某一索引版本的完整知识快照。
 * @property {string} generatedAt 快照生成时间。
 * @property {string} [indexVersion] 索引版本。
 * @property {string} [chunkerVersion] 分块器版本。
 * @property {string} [sourceDir] 原始资料目录。
 * @property {string} [scope] 快照适用范围。
 * @property {KnowledgeDocument[]} documents 来源文档列表。
 * @property {ScenicSpotKnowledge[]} spots 景点知识列表。
 * @property {GuideSection[]} [guideSections] 综合导览章节。
 * @property {KnowledgeChunk[]} chunks 检索分块列表。
 */
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.mjs";
import { extractDocxText } from "./docx.mjs";
import {
  documentTypeFor,
  normalizeAccessScope,
  normalizeKnowledgeScope,
  normalizeTenantId
} from "./knowledgeMetadata.mjs";
import { withKnowledgeWriteLock } from "./knowledgeWriteLock.mjs";

/**
 * @description
 * 结构化景点资料的标准文件名。
 * @type {string} 结构化景点资料的标准文件名。
 */
const STRUCTURED_DOC = "灵山胜境 景点结构化数据集.docx";
/**
 * @description
 * 综合导览资料的标准文件名。
 * @type {string} 综合导览资料的标准文件名。
 */
const GUIDE_DOC = "灵山胜境：历史、文化、景点特色与个性化游览指南.docx";
/**
 * @description
 * 构成可恢复发布快照的生成文件。
 * @type {string[]} 构成可恢复发布快照的生成文件。
 */
const GENERATED_KNOWLEDGE_FILES = ["knowledge.json", "knowledge-chunks.json", "scenic-spots.json"];
/**
 * @description
 * 当前结构感知分块器版本。
 * @type {string} 当前结构感知分块器版本。
 */
export const CHUNKER_VERSION = "structure-v2";

/**
 * @description
 * 结构化 DOCX 记录的字段顺序。
 * @type {string[]} 结构化 DOCX 记录的字段顺序。
 */
const structuredFields = [
  "景区名称",
  "景点ID",
  "景点名称",
  "具体位置",
  "建筑/景观参数",
  "核心功能",
  "文化内涵",
  "详细介绍",
  "游玩亮点",
  "演艺/开放信息",
  "备注"
];

/**
 * @description
 * 结构化数据覆盖的景区及其 ID 格式。每条记录以独占一行的景区名和下一行景点 ID 开始。
 * @type {Array<{area: string, idPattern: RegExp}>}
 */
const SCENIC_AREAS = [
  { area: "灵山胜境", idPattern: /^LS-\d{3}$/ },
  { area: "拈花湾禅意小镇", idPattern: /^NH-\d{3}$/ }
];

/**
 * @description
 * 根据景点 ID 判断所属景区。
 * @private
 * @param {*} id 景点 ID。
 * @returns {string|null} 景区名称；格式不匹配时返回 `null`。
 */
function areaForId(id) {
  return SCENIC_AREAS.find((entry) => entry.idPattern.test(id))?.area || null;
}

/**
 * @description
 * 判断一行是否为表格或章节边界，防止标题混入上一条景点备注。
 * @private
 * @param {string} line 清理后的文本行。
 * @returns {boolean} 属于边界时为 `true`。
 */
function isTableBoundary(line) {
  return /景点数据集/.test(line) || /^(子表|表\d|景区名称|数据集说明|字段规范|核心构成)/.test(line);
}

/**
 * @description
 * 综合导览文档中用于切分章节的已知标题。
 * @type {string[]} 综合导览文档中用于切分章节的已知标题。
 */
const guideHeadings = [
  "景区概况与千年历史渊源",
  "小灵山的佛教缘起",
  "祥符禅寺的千年兴衰",
  "现代灵山胜境的崛起",
  "核心文化内涵",
  "佛教文化的深度传承",
  "传统艺术与现代科技的完美融合",
  "祈福文化的特色体验",
  "世界佛教文化的交流平台",
  "核心景点特色详解",
  "灵山大佛",
  "灵山梵宫",
  "九龙灌浴",
  "五印坛城",
  "祥符禅寺",
  "个性化游览路线推荐",
  "历史文化爱好者路线",
  "自然风光爱好者路线",
  "亲子家庭路线",
  "实用游览贴士",
  "最佳游览时间"
];

/**
 * @description
 * 从标准 DOCX 和补充 Markdown 全量构建知识库，同时保留已有上传文档分块。
 * @param {{sourceDir?: string}} [options={}] 原始资料目录。
 * @returns {KnowledgeBase} 已写入运行时生成目录的知识库。
 * @throws {Error & {statusCode: 404, code: "SOURCE_FILE_NOT_FOUND"}} 标准资料缺失时抛出。
 * @throws {Error} DOCX 解析、目录读取或文件写入失败时透传异常。
 * @example
 * const knowledge = buildKnowledge({ sourceDir: "../docs/scenic-materials" });
 */
export function buildKnowledge({ sourceDir = resolve(process.cwd(), "..", "docs", "scenic-materials") } = {}) {
  const structuredPath = join(sourceDir, STRUCTURED_DOC);
  const guidePath = join(sourceDir, GUIDE_DOC);
  const existingKnowledge = loadKnowledge();
  const uploadedDocuments = (existingKnowledge?.documents || []).filter((document) =>
    String(document.id || "").startsWith("upload_")
  );
  const uploadedDocumentIds = new Set(uploadedDocuments.map((document) => document.id));
  const uploadedChunks = (existingKnowledge?.chunks || []).filter((chunk) =>
    uploadedDocumentIds.has(chunk.documentId)
  );

  assertFile(structuredPath);
  assertFile(guidePath);

  const generatedDir = join(config.dataDir, "generated");
  mkdirSync(generatedDir, { recursive: true });

  const structuredText = extractDocxText(structuredPath);
  const guideText = extractDocxText(guidePath);
  const spots = parseStructuredSpots(structuredText);
  const guideSections = parseGuideSections(guideText);
  const baseChunks = buildChunks(spots, guideSections);
  const supplementalDocuments = [
    ...loadSupplementalMarkdown(sourceDir, spots),
    ...loadSupplementalBinaryMetadata(sourceDir)
  ];
  const chunks = [
    ...baseChunks,
    ...supplementalDocuments.flatMap((document) => document.chunks),
    ...uploadedChunks
  ];

  const documents = [
    {
      id: "doc_structured_lingshan_spots",
      fileName: STRUCTURED_DOC,
      fileType: "docx",
      language: "zh",
      processingStage: "processed",
      knowledgeScope: "visitor_qa",
      accessScope: "public",
      tenantId: "default",
      scenicArea: "灵山胜境 拈花湾禅意小镇",
      documentType: "docx",
      validFrom: null,
      validTo: null,
      enabled: true,
      status: "processed",
      chunkCount: chunks.filter((chunk) => chunk.documentId === "doc_structured_lingshan_spots").length,
      createdAt: new Date().toISOString()
    },
    {
      id: "doc_lingshan_guide",
      fileName: GUIDE_DOC,
      fileType: "docx",
      language: "zh",
      processingStage: "processed",
      knowledgeScope: "visitor_qa",
      accessScope: "public",
      tenantId: "default",
      scenicArea: "灵山胜境 拈花湾禅意小镇",
      documentType: "docx",
      validFrom: null,
      validTo: null,
      enabled: true,
      status: "processed",
      chunkCount: chunks.filter((chunk) => chunk.documentId === "doc_lingshan_guide").length,
      createdAt: new Date().toISOString()
    },
    ...supplementalDocuments.map(({ chunks: documentChunks, ...document }) => ({
      ...document,
      processingStage: document.status === "skipped" ? "classified" : "processed",
      chunkCount: documentChunks.length,
      createdAt: new Date().toISOString()
    })),
    ...uploadedDocuments
  ];

  const indexVersion = createIndexVersion({ documents, chunks });
  const versionedDocuments = documents.map((document) => ({
    ...document,
    accessScope: normalizeAccessScope(document.accessScope, document.knowledgeScope),
    tenantId: normalizeTenantId(document.tenantId),
    indexVersion
  }));
  const versionedChunks = chunks.map((chunk) => ({
    ...chunk,
    indexVersion,
    enabled: chunk.enabled !== false,
    knowledgeScope: chunk.knowledgeScope || "visitor_qa",
    accessScope: normalizeAccessScope(chunk.accessScope, chunk.knowledgeScope || "visitor_qa"),
    tenantId: normalizeTenantId(chunk.tenantId),
    documentType: chunk.documentType || documentTypeFor(chunk.fileType),
    scenicArea: chunk.scenicArea || spots.find((spot) => spot.id === chunk.scenicSpotId)?.scenicArea || ""
  }));
  const result = {
    generatedAt: new Date().toISOString(),
    indexVersion,
    chunkerVersion: CHUNKER_VERSION,
    sourceDir: basename(sourceDir),
    scope: "灵山胜境 拈花湾禅意小镇",
    documents: versionedDocuments,
    spots,
    guideSections,
    chunks: versionedChunks
  };

  writeKnowledgeSnapshot(generatedDir, result);
  writeFileSync(join(generatedDir, "structured-source.txt"), structuredText, "utf8");
  writeFileSync(join(generatedDir, "guide-source.txt"), guideText, "utf8");

  return result;
}

/**
 * @description
 * 优先从可写运行时目录加载知识库，缺失时回退到发布包快照。
 * @returns {KnowledgeBase|null} 知识库；两个位置均不存在时返回 `null`。
 * @throws {SyntaxError|Error} 文件存在但 JSON 无效或读取失败时抛出。
 * @example
 * const knowledge = loadKnowledge();
 */
export function loadKnowledge() {
  const runtimeDir = runtimeGeneratedDir();
  const pointer = loadKnowledgeFrom(join(runtimeDir, "active-index.json"));
  if (pointer?.indexVersion) {
    const snapshot = loadKnowledgeFrom(join(runtimeDir, "snapshots", pointer.indexVersion, "knowledge.json"));
    if (isValidKnowledgeSnapshot(snapshot) && snapshot.indexVersion === pointer.indexVersion) {
      return snapshot;
    }
  }
  return (
    loadKnowledgeFrom(join(runtimeDir, "knowledge.json")) ||
    loadKnowledgeFrom(join(bundledGeneratedDir(), "knowledge.json"))
  );
}

/**
 * @description
 * 返回当前活动知识快照版本，供答案缓存键和观测信息使用。
 * @returns {string} 活动版本；尚未构建时返回 `unbuilt`。
 * @throws {Error|SyntaxError} 活动指针或知识快照读取、解析失败时透传异常。
 * @example
 * const version = getActiveKnowledgeVersion();
 */
export function getActiveKnowledgeVersion() {
  return loadKnowledge()?.indexVersion || "unbuilt";
}

/**
 * @description
 * 列出运行时目录中已经校验的知识快照，供管理端查看和回滚。
 * @returns {Array<{indexVersion:string,chunkerVersion:string,generatedAt:string,documentCount:number,chunkCount:number,active:boolean}>} 按活动状态和生成时间排序的知识版本摘要。
 * @throws {Error} 快照目录读取或 JSON 解析失败时透传异常。
 * @example
 * const versions = listKnowledgeVersions();
 */
export function listKnowledgeVersions() {
  const generatedDir = runtimeGeneratedDir();
  const snapshotsDir = join(generatedDir, "snapshots");
  const activeVersion = getActiveKnowledgeVersion();
  const versions = new Map();
  if (existsSync(snapshotsDir)) {
    for (const entry of readdirSync(snapshotsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isSafeIndexVersion(entry.name)) continue;
      const snapshot = loadKnowledgeFrom(join(snapshotsDir, entry.name, "knowledge.json"));
      if (!isValidKnowledgeSnapshot(snapshot) || snapshot.indexVersion !== entry.name) continue;
      versions.set(entry.name, summarizeKnowledgeVersion(snapshot, activeVersion));
    }
  }
  const active = loadKnowledge();
  if (isValidKnowledgeSnapshot(active) && !versions.has(active.indexVersion)) {
    versions.set(active.indexVersion, summarizeKnowledgeVersion(active, activeVersion));
  }
  return [...versions.values()].sort((left, right) => (
    Number(right.active) - Number(left.active)
    || Date.parse(right.generatedAt || 0) - Date.parse(left.generatedAt || 0)
    || right.indexVersion.localeCompare(left.indexVersion)
  ));
}

/**
 * @description
 * 将活动指针恢复到已经校验过的历史知识版本。
 *
 * 该函数用于数据库同步或上传后处理失败时回滚刚切换的 JSON 快照；它不会删除
 * 新版本目录，便于管理员保留现场进行审计。
 *
 * @param {string} indexVersion 目标历史版本。
 * @returns {KnowledgeBase} 恢复后的活动知识快照。
 * @throws {Error & {code:string,statusCode:number}} 目标快照不存在或校验失败时抛出。
 * @throws {Error} 锁文件、活动指针或快照文件读写失败时透传异常。
 * @example
 * const knowledge = activateKnowledgeVersion("structure-v2-example");
 */
export function activateKnowledgeVersion(indexVersion) {
  if (!isSafeIndexVersion(indexVersion)) {
    const error = new Error("The requested knowledge version is invalid.");
    error.code = "KNOWLEDGE_VERSION_INVALID";
    error.statusCode = 400;
    throw error;
  }
  const generatedDir = runtimeGeneratedDir();
  const snapshotDir = join(generatedDir, "snapshots", String(indexVersion || ""));
  const knowledge = loadKnowledgeFrom(join(snapshotDir, "knowledge.json"));
  if (!isValidKnowledgeSnapshot(knowledge) || knowledge.indexVersion !== indexVersion) {
    const error = new Error("The requested knowledge snapshot is unavailable or invalid.");
    error.code = "KNOWLEDGE_VERSION_INVALID";
    error.statusCode = 409;
    throw error;
  }
  return withKnowledgeWriteLock(generatedDir, () => {
    writeJson(join(generatedDir, "active-index.json"), {
      indexVersion,
      chunkerVersion: knowledge.chunkerVersion || CHUNKER_VERSION,
      generatedAt: knowledge.generatedAt
    });
    for (const fileName of GENERATED_KNOWLEDGE_FILES) {
      copyFileSync(join(snapshotDir, fileName), join(generatedDir, fileName));
    }
    return knowledge;
  });
}

/**
 * @description
 * 判断索引版本是否只包含可安全用于目录名的字符。
 * @param {string} value 版本值。
 * @returns {boolean} 是否可安全作为目录名。
 */
function isSafeIndexVersion(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(String(value || ""));
}

/**
 * @description
 * 汇总知识快照的版本状态、生成时间、文档数和分块数。
 * @param {KnowledgeBase} knowledge 快照。
 * @param {string} activeVersion 活动版本。
 * @returns {object} 可供版本列表展示的快照摘要。
 */
function summarizeKnowledgeVersion(knowledge, activeVersion) {
  return {
    indexVersion: knowledge.indexVersion,
    chunkerVersion: knowledge.chunkerVersion || "legacy",
    generatedAt: knowledge.generatedAt || "",
    documentCount: knowledge.documents?.length || 0,
    chunkCount: knowledge.chunks?.length || 0,
    active: knowledge.indexVersion === activeVersion
  };
}

/**
 * @description
 * 将发布包内已验证知识快照恢复到可写运行时目录。
 * 生产环境的 `DATA_DIR` 通常位于版本目录外，新建数据卷可用此方法初始化索引。
 * @param {{force?: boolean}} [options={}] 恢复选项。
 * @param {boolean} [options.force=false] 是否覆盖已存在的运行时知识库。
 * @returns {KnowledgeBase} 运行时知识库。
 * @throws {Error & {statusCode: 503, code: "KNOWLEDGE_SEED_MISSING"|"KNOWLEDGE_SEED_RESTORE_FAILED"}} 发布快照缺失或恢复后无法读取时抛出。
 * @throws {Error} 目录创建、复制或 JSON 解析失败时透传异常。
 * @example
 * const knowledge = restoreBundledKnowledge({ force: true });
 */
export function restoreBundledKnowledge({ force = false } = {}) {
  const runtimeDir = runtimeGeneratedDir();
  const runtimeKnowledge = join(runtimeDir, "knowledge.json");
  if (!force && existsSync(runtimeKnowledge)) {
    return loadKnowledgeFrom(runtimeKnowledge);
  }

  const bundledDir = bundledGeneratedDir();
  const missingFiles = GENERATED_KNOWLEDGE_FILES.filter(
    (fileName) => !existsSync(join(bundledDir, fileName))
  );
  if (missingFiles.length > 0) {
    const error = new Error("Bundled knowledge snapshot is unavailable.");
    error.statusCode = 503;
    error.code = "KNOWLEDGE_SEED_MISSING";
    throw error;
  }

  mkdirSync(runtimeDir, { recursive: true });
  if (force) {
    rmSync(join(runtimeDir, "active-index.json"), { force: true });
  }
  if (resolve(runtimeDir) !== resolve(bundledDir)) {
    for (const fileName of GENERATED_KNOWLEDGE_FILES) {
      copyFileSync(join(bundledDir, fileName), join(runtimeDir, fileName));
    }
  }

  const knowledge = loadKnowledgeFrom(runtimeKnowledge);
  if (!knowledge) {
    const error = new Error("Bundled knowledge snapshot could not be restored.");
    error.statusCode = 503;
    error.code = "KNOWLEDGE_SEED_RESTORE_FAILED";
    throw error;
  }
  return knowledge;
}

/**
 * @description
 * 将纯文本或 Markdown 按章节与默认 600 个估算 token 切分为可检索知识块。
 * @param {{documentId: string, fileName: string, text: string, fileType?: string, spots?: ScenicSpotKnowledge[], metadata?: object}} input 文档信息。
 * @returns {KnowledgeChunk[]} 有序知识分块。
 * @example
 * const chunks = buildTextDocumentChunks({ documentId: "upload_1", fileName: "faq.md", text: "# 门票\n成人票说明" });
 */
export function buildTextDocumentChunks({
  documentId,
  fileName,
  text,
  fileType = extname(fileName).replace(".", "") || "txt",
  spots = [],
  metadata = {}
}) {
  const sections = parseTextSections(text, fileName);
  const language = inferDocumentLanguage(fileName, text);
  const chunks = [];

  for (const section of sections) {
    const parts = splitLongText(section.content);
    for (let index = 0; index < parts.length; index += 1) {
      const content = parts[index];
      chunks.push({
        id: `${documentId}_chunk_${String(chunks.length + 1).padStart(3, "0")}`,
        documentId,
        scenicSpotId: matchLocalizedSpotId(section.title, spots),
        parentId: `${documentId}_section_${String(sections.indexOf(section) + 1).padStart(3, "0")}`,
        title: section.title,
        sectionPath: section.title,
        content,
        context: `来源：${fileName}；章节：${section.title}`,
        keywords: extractDocumentKeywords(`${section.title} ${content}`, spots),
        source: fileName,
        language,
        fileType,
        documentType: metadata.documentType || documentTypeFor(fileType),
        knowledgeScope: metadata.knowledgeScope || normalizeKnowledgeScope(undefined, fileName),
        accessScope: normalizeAccessScope(metadata.accessScope, metadata.knowledgeScope || normalizeKnowledgeScope(undefined, fileName)),
        tenantId: normalizeTenantId(metadata.tenantId),
        scenicArea: metadata.scenicArea || "",
        validFrom: metadata.validFrom || null,
        validTo: metadata.validTo || null,
        enabled: metadata.enabled !== false,
        contentHash: createHash("sha256").update(content).digest("hex")
      });
    }
  }

  return chunks;
}

/**
 * @description
 * 将上传文本加入运行时知识库，并原子式替换同 ID 文档的旧元数据和分块。
 * @param {{documentId: string, fileName: string, text: string, fileType: string, metadata?: object}} input 文档信息。
 * @returns {KnowledgeDocument} 已索引文档元数据。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 无基础知识库且快照无法恢复时抛出。
 * @throws {Error & {statusCode: 422, code: "KNOWLEDGE_DOCUMENT_EMPTY"}} 文档无可索引文本时抛出。
 * @throws {Error} 快照恢复、JSON 读取或文件写入失败时透传异常。
 * @example
 * const document = indexTextKnowledgeDocument({ documentId: "upload_1", fileName: "faq.txt", text: "开放时间", fileType: "txt" });
 */
export function indexTextKnowledgeDocument({ documentId, fileName, text, fileType, metadata = {} }) {
  const knowledge = loadKnowledge() || restoreBundledKnowledge();
  if (!knowledge) {
    const error = new Error("Knowledge base has not been built.");
    error.statusCode = 409;
    error.code = "KNOWLEDGE_NOT_BUILT";
    throw error;
  }

  const chunks = buildTextDocumentChunks({
    documentId,
    fileName,
    text,
    fileType,
    spots: knowledge.spots || [],
    metadata
  });
  return indexKnowledgeChunksDocument({ documentId, fileName, fileType, chunks, metadata });
}

/**
 * @description
 * 将已完成解析的结构化分块写入新知识版本，并在校验后原子切换活动快照。
 * @param {{documentId: string, fileName: string, fileType: string, chunks: KnowledgeChunk[], metadata?: object}} input 文档和分块。
 * @returns {KnowledgeDocument} 已索引文档元数据。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 无基础知识库且快照无法恢复时抛出。
 * @throws {Error & {statusCode: 422, code: "KNOWLEDGE_DOCUMENT_EMPTY"}} 没有可索引分块时抛出。
 * @throws {Error} 快照恢复、JSON 读取或文件写入失败时透传异常。
 * @example
 * const document = indexKnowledgeChunksDocument({
 *   documentId: "upload_1",
 *   fileName: "faq.pdf",
 *   fileType: "pdf",
 *   chunks
 * });
 */
export function indexKnowledgeChunksDocument({ documentId, fileName, fileType, chunks, metadata = {} }) {
  const knowledge = loadKnowledge() || restoreBundledKnowledge();
  if (!knowledge) {
    const error = new Error("Knowledge base has not been built.");
    error.statusCode = 409;
    error.code = "KNOWLEDGE_NOT_BUILT";
    throw error;
  }

  if (chunks.length === 0) {
    const error = new Error("The uploaded document does not contain indexable text.");
    error.statusCode = 422;
    error.code = "KNOWLEDGE_DOCUMENT_EMPTY";
    throw error;
  }

  const createdAt = new Date().toISOString();
  const nextChunks = chunks.map((chunk) => ({
    ...chunk,
    knowledgeScope: metadata.knowledgeScope || chunk.knowledgeScope || normalizeKnowledgeScope(undefined, fileName),
    accessScope: normalizeAccessScope(
      metadata.accessScope || chunk.accessScope,
      metadata.knowledgeScope || chunk.knowledgeScope || normalizeKnowledgeScope(undefined, fileName)
    ),
    tenantId: normalizeTenantId(metadata.tenantId || chunk.tenantId),
    documentType: metadata.documentType || chunk.documentType || documentTypeFor(fileType),
    scenicArea: metadata.scenicArea || chunk.scenicArea || "",
    validFrom: metadata.validFrom || chunk.validFrom || null,
    validTo: metadata.validTo || chunk.validTo || null,
    enabled: metadata.enabled !== false && chunk.enabled !== false
  }));
  const documentContentHash = metadata.contentHash || createDocumentContentHash(nextChunks);
  const previousDocument = (knowledge.documents || []).find((item) => item.id === documentId);
  const previousChunks = (knowledge.chunks || [])
    .filter((item) => item.documentId === documentId)
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  const sameChunks = previousChunks.length === nextChunks.length
    && previousChunks.every((previous, index) => (
      previous.id === nextChunks[index].id
      && (previous.contentHash || createHash("sha256").update(previous.content || "").digest("hex"))
        === (nextChunks[index].contentHash || createHash("sha256").update(nextChunks[index].content || "").digest("hex"))
    ));
  if (
    previousDocument?.contentHash === documentContentHash
    && knowledge.chunkerVersion === CHUNKER_VERSION
    && sameChunks
  ) {
    return { ...previousDocument, skipped: true, indexVersion: knowledge.indexVersion };
  }
  const document = {
    id: documentId,
    fileName,
    fileType,
    language: metadata.language || inferDocumentLanguage(fileName, nextChunks.map((chunk) => chunk.content).join("\n")),
    knowledgeScope: metadata.knowledgeScope || normalizeKnowledgeScope(undefined, fileName),
    accessScope: normalizeAccessScope(
      metadata.accessScope,
      metadata.knowledgeScope || normalizeKnowledgeScope(undefined, fileName)
    ),
    tenantId: normalizeTenantId(metadata.tenantId),
    scenicArea: metadata.scenicArea || "",
    documentType: metadata.documentType || documentTypeFor(fileType),
    validFrom: metadata.validFrom || null,
    validTo: metadata.validTo || null,
    enabled: metadata.enabled !== false,
    contentHash: documentContentHash,
    processingStage: "processed",
    status: "processed",
    chunkCount: nextChunks.length,
    createdAt
  };
  const next = {
    ...knowledge,
    generatedAt: createdAt,
    documents: [
      ...(knowledge.documents || []).filter((item) => item.id !== documentId),
      document
    ],
    chunks: [
      ...(knowledge.chunks || []).filter((item) => item.documentId !== documentId),
      ...nextChunks
    ]
  };
  next.indexVersion = createIndexVersion(next);
  next.chunkerVersion = CHUNKER_VERSION;
  next.documents = next.documents.map((item) => ({
    ...item,
    knowledgeScope: item.knowledgeScope || normalizeKnowledgeScope(undefined, item.fileName),
    accessScope: normalizeAccessScope(item.accessScope, item.knowledgeScope || normalizeKnowledgeScope(undefined, item.fileName)),
    tenantId: normalizeTenantId(item.tenantId),
    documentType: item.documentType || documentTypeFor(item.fileType),
    enabled: item.enabled !== false,
    indexVersion: next.indexVersion
  }));
  next.chunks = next.chunks.map((item) => ({
    ...item,
    knowledgeScope: item.knowledgeScope || normalizeKnowledgeScope(undefined, item.source),
    accessScope: normalizeAccessScope(item.accessScope, item.knowledgeScope || normalizeKnowledgeScope(undefined, item.source)),
    tenantId: normalizeTenantId(item.tenantId),
    documentType: item.documentType || documentTypeFor(item.fileType),
    enabled: item.enabled !== false,
    indexVersion: next.indexVersion
  }));
  const generatedDir = runtimeGeneratedDir();
  mkdirSync(generatedDir, { recursive: true });
  writeKnowledgeSnapshot(generatedDir, next);

  return { ...document, indexVersion: next.indexVersion };
}

/**
 * @description
 * 从运行时知识库删除指定文档及其全部分块。
 * @param {string[]} [documentIds=[]] 待删除文档 ID。
 * @returns {number} 删除的文档元数据数量。
 * @throws {Error} 知识 JSON 读取或写入失败时透传异常。
 * @example
 * const removed = removeIndexedKnowledgeDocuments(["upload_1"]);
 */
export function removeIndexedKnowledgeDocuments(documentIds = []) {
  const ids = new Set(documentIds.filter(Boolean));
  if (ids.size === 0) return 0;

  const knowledge = loadKnowledge();
  if (!knowledge) return 0;

  const documents = (knowledge.documents || []).filter((document) => !ids.has(document.id));
  const chunks = (knowledge.chunks || []).filter((chunk) => !ids.has(chunk.documentId));
  const removedDocuments = (knowledge.documents || []).length - documents.length;
  const removedChunks = (knowledge.chunks || []).length - chunks.length;
  if (removedDocuments === 0 && removedChunks === 0) return 0;

  const next = {
    ...knowledge,
    generatedAt: new Date().toISOString(),
    documents,
    chunks
  };
  next.indexVersion = createIndexVersion(next);
  next.documents = next.documents.map((item) => ({ ...item, indexVersion: next.indexVersion }));
  next.chunks = next.chunks.map((item) => ({ ...item, indexVersion: next.indexVersion }));
  const generatedDir = runtimeGeneratedDir();
  mkdirSync(generatedDir, { recursive: true });
  writeKnowledgeSnapshot(generatedDir, next);
  return removedDocuments;
}

/**
 * @description
 * 获取当前部署的可写知识生成目录。
 * @private
 * @returns {string} 绝对目录。
 */
function runtimeGeneratedDir() {
  return join(config.dataDir, "generated");
}

/**
 * @description
 * 获取源码发布包内置知识快照目录。
 * @private
 * @returns {string} 绝对目录。
 */
function bundledGeneratedDir() {
  return resolve(fileURLToPath(new URL("../../data/generated", import.meta.url)));
}

/**
 * @description
 * 从指定 JSON 文件读取知识库。
 * @private
 * @param {string} filePath JSON 文件路径。
 * @returns {KnowledgeBase|null} 解析后的知识库；文件不存在时为 `null`。
 * @throws {SyntaxError|Error} JSON 无效或文件读取失败时抛出。
 */
function loadKnowledgeFrom(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * @description
 * 解析结构化景点 DOCX 纯文本；优先按行记录解析，失败时回退到字段标记解析。
 * @param {string} text DOCX 提取的纯文本。
 * @returns {ScenicSpotKnowledge[]} 灵山和拈花湾景点。
 * @example
 * const spots = parseStructuredSpots(structuredText);
 */
export function parseStructuredSpots(text) {
  const lineSpots = parseStructuredSpotsByLines(text);
  if (lineSpots.length > 0) {
    return lineSpots;
  }

  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/(灵山胜境|拈花湾禅意小镇)\s+((?:LS|NH)-\d{3})/g)];
  const spots = [];

  for (let index = 0; index < matches.length; index += 1) {
    const id = matches[index][2];
    const start = matches[index].index;
    const next = matches[index + 1]?.index ?? normalized.length;
    const recordText = normalized.slice(start, next).trim();
    const parsed = parseSpotRecord(id, recordText);
    if (parsed) {
      spots.push(parsed);
    }
  }

  return spots;
}

/**
 * @description
 * 按“景区名行 + 匹配的景点 ID 行”识别结构化景点记录。
 * @private
 * @param {string} text 结构化资料纯文本。
 * @returns {ScenicSpotKnowledge[]} 景点列表。
 */
function parseStructuredSpotsByLines(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const areaNames = new Set(SCENIC_AREAS.map((entry) => entry.area));
  const recordStarts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const idLine = lines[index + 1] || "";
    if (areaNames.has(lines[index]) && areaForId(idLine) === lines[index]) {
      recordStarts.push(index);
    }
  }

  const spots = [];

  for (let startIndex = 0; startIndex < recordStarts.length; startIndex += 1) {
    const start = recordStarts[startIndex];
    let end = recordStarts[startIndex + 1] ?? lines.length;
    // Stop before the next table header so section headers between two tables
    // (e.g. "表2：拈花湾禅意小镇 景点数据集") never leak into the last record.
    for (let cursor = start + 1; cursor < end; cursor += 1) {
      if (isTableBoundary(lines[cursor])) {
        end = cursor;
        break;
      }
    }

    const recordLines = lines.slice(start, end);
    const [
      scenicArea,
      id,
      name,
      locationText,
      parameters,
      coreFunction,
      culture,
      detail,
      highlights,
      openInfo,
      notes
    ] = recordLines;

    if (!id || !name || areaForId(id) !== scenicArea) {
      continue;
    }

    spots.push({
      id,
      scenicArea,
      name,
      aliases: buildAliases(name, scenicArea),
      locationText: locationText || "",
      parameters: parameters || "",
      coreFunction: coreFunction || "",
      culture: culture || "",
      detail: detail || "",
      highlights: highlights || "",
      openInfo: openInfo || "",
      notes: recordLines.slice(10).join("\n") || notes || ""
    });
  }

  return spots;
}

/**
 * @description
 * 按已知标题位置切分综合导览文档，未命中标题时生成单一兜底章节。
 * @param {string} text 导览资料纯文本。
 * @returns {Array<{id: string, title: string, content: string, keywords: string[]}>} 导览章节。
 * @example
 * const sections = parseGuideSections(guideText);
 */
export function parseGuideSections(text) {
  const normalized = normalizeText(text).replace(/\n+/g, "\n");
  const positions = [];

  for (const heading of guideHeadings) {
    const index = normalized.indexOf(heading);
    if (index !== -1) {
      positions.push({ heading, index });
    }
  }

  positions.sort((left, right) => left.index - right.index);

  const sections = [];
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index];
    const next = positions[index + 1];
    const content = normalized
      .slice(current.index + current.heading.length, next ? next.index : normalized.length)
      .trim();

    if (content) {
      sections.push({
        id: `guide_${String(sections.length + 1).padStart(2, "0")}`,
        title: current.heading,
        content,
        keywords: extractKeywords(`${current.heading} ${content}`)
      });
    }
  }

  if (sections.length === 0 && normalized) {
    sections.push({
      id: "guide_01",
      title: "灵山胜境导览指南",
      content: normalized,
      keywords: extractKeywords(normalized)
    });
  }

  return sections;
}

/**
 * @description
 * 将结构化景点和导览章节转换为基础知识分块。
 * @param {ScenicSpotKnowledge[]} spots 景点列表。
 * @param {Array<object>} guideSections 导览章节。
 * @returns {KnowledgeChunk[]} 基础知识分块。
 * @example
 * const chunks = buildChunks(spots, guideSections);
 */
export function buildChunks(spots, guideSections) {
  const chunks = [];

  for (const spot of spots) {
    chunks.push({
      id: `chunk_spot_${spot.id}`,
        documentId: "doc_structured_lingshan_spots",
        scenicSpotId: spot.id,
        parentId: `spot_${spot.id}`,
        title: spot.name,
        sectionPath: spot.name,
      content: [
        `${spot.name}位于${spot.locationText}`,
        spot.parameters ? `建筑/景观参数：${spot.parameters}` : "",
        spot.coreFunction ? `核心功能：${spot.coreFunction}` : "",
        spot.culture ? `文化内涵：${spot.culture}` : "",
        spot.detail ? `详细介绍：${spot.detail}` : "",
        spot.highlights ? `游玩亮点：${spot.highlights}` : "",
        spot.openInfo ? `演艺/开放信息：${spot.openInfo}` : "",
        spot.notes ? `备注：${spot.notes}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
        keywords: extractKeywords(`${spot.name} ${spot.aliases.join(" ")} ${spot.detail} ${spot.highlights}`),
        source: STRUCTURED_DOC,
        language: "zh",
        fileType: "docx",
        documentType: "docx",
        knowledgeScope: "visitor_qa",
        scenicArea: spot.scenicArea,
        validFrom: null,
        validTo: null,
        enabled: true,
        contentHash: createHash("sha256").update(spot.name + spot.detail + spot.highlights).digest("hex")
      });
  }

  for (const section of guideSections) {
    for (const part of splitLongText(section.content)) {
      chunks.push({
        id: `chunk_${section.id}_${String(chunks.length + 1).padStart(3, "0")}`,
        documentId: "doc_lingshan_guide",
        scenicSpotId: matchSpotId(section.title, part, spots),
        parentId: `guide_${section.id}`,
        title: section.title,
        sectionPath: section.title,
        content: part,
        context: `来源：${GUIDE_DOC}；章节：${section.title}`,
        keywords: section.keywords,
        source: GUIDE_DOC,
        language: "zh",
        fileType: "docx",
        documentType: "docx",
        knowledgeScope: "visitor_qa",
        scenicArea: "灵山胜境",
        validFrom: null,
        validTo: null,
        enabled: true,
        contentHash: createHash("sha256").update(part).digest("hex")
      });
    }
  }

  return chunks;
}

/**
 * @description
 * 使用字段标记从压平文本中解析单条景点记录。
 * @private
 * @param {string} id 景点 ID。
 * @param {string} recordText 当前记录文本。
 * @returns {ScenicSpotKnowledge|null} 景点记录；缺少字段标记时返回 `null`。
 */
function parseSpotRecord(id, recordText) {
  const afterId = recordText.slice(recordText.indexOf(id) + id.length).trim();
  const nextIdIndex = afterId.search(/LS-\d{3}|NH-\d{3}/);
  const safeText = nextIdIndex === -1 ? afterId : afterId.slice(0, nextIdIndex);
  const markerPositions = structuredFields
    .slice(3)
    .map((field) => ({ field, index: safeText.indexOf(field) }))
    .filter((item) => item.index !== -1)
    .sort((left, right) => left.index - right.index);

  if (markerPositions.length === 0) {
    return null;
  }

  const nameAndLocation = safeText.slice(0, markerPositions[0].index).trim();
  const name = extractSpotName(nameAndLocation);
  const locationText = nameAndLocation.slice(name.length).trim();
  const values = {};

  for (let index = 0; index < markerPositions.length; index += 1) {
    const current = markerPositions[index];
    const next = markerPositions[index + 1];
    values[current.field] = safeText
      .slice(current.index + current.field.length, next ? next.index : safeText.length)
      .trim();
  }

  const scenicArea = areaForId(id) || "灵山胜境";

  return {
    id,
    scenicArea,
    name,
    aliases: buildAliases(name, scenicArea),
    locationText,
    parameters: values["建筑/景观参数"] || "",
    coreFunction: values["核心功能"] || "",
    culture: values["文化内涵"] || "",
    detail: values["详细介绍"] || "",
    highlights: values["游玩亮点"] || "",
    openInfo: values["演艺/开放信息"] || "",
    notes: values["备注"] || ""
  };
}

/**
 * @description
 * 从名称与位置混合文本开头提取已知景点名，未知景点采用首个短语。
 * @private
 * @param {string} text 名称与位置文本。
 * @returns {string} 景点名称。
 */
function extractSpotName(text) {
  const knownNames = [
    "灵山大照壁",
    "五明桥",
    "佛足坛",
    "五智门",
    "菩提大道",
    "九龙灌浴",
    "降魔浮雕",
    "阿育王柱",
    "天下第一掌",
    "百子戏弥勒",
    "祥符禅寺",
    "登云道",
    "灵山大佛",
    "灵山梵宫",
    "五印坛城",
    "曼飞龙塔",
    "拈花广场",
    "梵天花海",
    "香月花街",
    "拈花堂",
    "五灯湖",
    "鹿鸣谷"
  ];

  const found = knownNames.find((name) => text.startsWith(name));
  if (found) {
    return found;
  }

  return text.split(/[，,。；;]/)[0].slice(0, 16);
}

/**
 * @description
 * 为景点构建中文短称、业务称呼和中英日韩繁体别名。
 * @private
 * @param {string} name 景点名称。
 * @param {string} scenicArea 所属景区。
 * @returns {string[]} 去重后的别名列表。
 */
function buildAliases(name, scenicArea) {
  const aliases = new Set([name]);

  // 拈花湾 spots share the area name as an alias so retrieval and scope checks
  // triggered by "拈花湾" / "禅意小镇" reach every sub-spot.
  if (scenicArea === "拈花湾禅意小镇") {
    aliases.add("拈花湾");
    aliases.add("拈花湾禅意小镇");
    aliases.add("禅意小镇");
  }

  const spotAliases = {
    拈花广场: ["拈花微笑", "广场"],
    梵天花海: ["花海"],
    香月花街: ["花街", "禅意商业街"],
    拈花堂: ["禅堂", "抄经"],
    五灯湖: ["灯光秀", "禅行"],
    鹿鸣谷: ["山谷", "鹿鸣"],
    灵山大佛: ["Lingshan Grand Buddha", "Lingshan Buddha", "링산대불", "靈山大佛", "霊山大仏"],
    九龙灌浴: ["Nine Dragons Bathing", "Nine Dragons Bathing show", "구룡관욕", "九龍灌浴"],
    灵山梵宫: ["Lingshan Brahma Palace", "Brahma Palace", "Fan Gong", "링산 범궁", "靈山梵宮", "霊山梵宮"],
    五印坛城: ["Five Mudra Mandala", "Five-Seal Mandala", "오인단성", "五印壇城"],
    祥符禅寺: ["Xiangfu Chan Temple", "Xiangfu Temple", "상부선사", "祥符禪寺", "祥符禅寺"],
    百子戏弥勒: ["Hundred Children Playing with Maitreya", "백자희미륵", "百子戲彌勒", "百子戯弥勒"],
    菩提大道: ["Bodhi Avenue", "보리대도", "菩提大道"],
    曼飞龙塔: ["Manfeilong Pagoda", "만비룡탑", "曼飛龍塔"]
  };
  for (const alias of spotAliases[name] || []) {
    aliases.add(alias);
  }

  if (name === "灵山大佛") {
    aliases.add("大佛");
    aliases.add("佛像");
    aliases.add("抱佛脚");
  }

  if (name === "灵山梵宫") {
    aliases.add("梵宫");
    aliases.add("吉祥颂");
  }

  if (name === "九龙灌浴") {
    aliases.add("九龙喷水");
    aliases.add("花开见佛");
  }

  if (name === "祥符禅寺") {
    aliases.add("古寺");
    aliases.add("禅寺");
  }

  return [...aliases];
}

/**
 * @description
 * 读取资料目录内全部 Markdown 文件并构建补充知识文档。
 * @private
 * @param {string} sourceDir 资料目录。
 * @param {ScenicSpotKnowledge[]} spots 景点列表。
 * @returns {Array<{id: string, fileName: string, fileType: "md", language: string, chunks: KnowledgeChunk[]}>} 补充文档。
 * @throws {Error} 目录或文件读取失败时透传文件系统异常。
 */
function loadSupplementalMarkdown(sourceDir, spots) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const fileName = entry.name;
      const documentId = documentIdForFile(fileName);
      const text = readFileSync(join(sourceDir, fileName), "utf8");
      return {
        id: documentId,
        fileName,
        fileType: "md",
        language: inferDocumentLanguage(fileName, text),
        chunks: buildTextDocumentChunks({
          documentId,
          fileName,
          text,
          fileType: "md",
          spots
        })
      };
    });
}

/**
 * @description
 * 按 Markdown 标题切分文本；普通文本或无正文标题时回退为单一章节。
 * @private
 * @param {*} text 文档文本。
 * @param {string} fileName 文件名，用于生成兜底标题。
 * @returns {Array<{title: string, content: string}>} 文档章节。
 */
function parseTextSections(text, fileName) {
  const fallbackTitle = basename(fileName, extname(fileName));
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let documentTitle = fallbackTitle;
  let currentTitle = fallbackTitle;
  let content = [];

  /**
   * @description
   * 将已累积的章节正文写入章节列表并清空缓冲区。
   * @returns {void}
   */
  const flush = () => {
    const value = content.join("\n").trim();
    if (value) {
      sections.push({ title: currentTitle || documentTitle, content: value });
    }
    content = [];
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!heading) {
      content.push(line);
      continue;
    }

    flush();
    const level = line.match(/^#+/)?.[0].length || 1;
    const title = heading[1].trim();
    if (level === 1) {
      documentTitle = title;
    }
    currentTitle = title || documentTitle;
  }
  flush();

  if (sections.length === 0) {
    const value = String(text || "").trim();
    return value ? [{ title: documentTitle, content: value }] : [];
  }
  return sections;
}

/**
 * @description
 * 根据标题中的多语言景点别名匹配景点 ID。
 * @private
 * @param {string} title 章节标题。
 * @param {ScenicSpotKnowledge[]} spots 景点列表。
 * @returns {string|null} 景点 ID；未匹配时为 `null`。
 */
function matchLocalizedSpotId(title, spots) {
  const normalizedTitle = normalizeSearchText(title);
  const spot = spots.find((item) =>
    (item.aliases || [item.name]).some((alias) => normalizedTitle.includes(normalizeSearchText(alias)))
  );
  return spot?.id || null;
}

/**
 * @description
 * 从文档文本提取命中的景点别名和 Unicode 字母数字词。
 * @private
 * @param {*} text 标题与正文。
 * @param {ScenicSpotKnowledge[]} spots 景点列表。
 * @returns {string[]} 去重且最多 40 项的关键词。
 */
function extractDocumentKeywords(text, spots) {
  const normalizedText = normalizeSearchText(text);
  const aliases = spots
    .flatMap((spot) => spot.aliases || [spot.name])
    .filter((alias) => normalizedText.includes(normalizeSearchText(alias)));
  const lexical = String(text || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) || [];
  return [...new Set([...aliases, ...lexical])].slice(0, 40);
}

/**
 * @description
 * 根据文件名 ASCII 部分生成稳定的补充文档 ID。
 * @private
 * @param {string} fileName 文件名。
 * @returns {string} `doc_` 前缀文档 ID。
 */
function documentIdForFile(fileName) {
  const stem = basename(fileName, extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `doc_${stem || "supplemental"}`;
}

/**
 * @description
 * 优先按文件名语言标记、其次按字符分布推断文档语言。
 * @private
 * @param {*} fileName 文件名。
 * @param {*} [text=""] 文档正文。
 * @returns {"zh"|"zh-TW"|"en"|"ko"|"ja"|"th"|"und"} BCP 47 风格语言代码或未知标记。
 */
function inferDocumentLanguage(fileName, text = "") {
  const normalized = String(fileName || "").toLowerCase();
  if (/(^|[._-])zh[-_]?tw([._-]|$)/.test(normalized)) return "zh-TW";
  if (/(^|[._-])en([._-]|$)/.test(normalized)) return "en";
  if (/(^|[._-])ko([._-]|$)/.test(normalized)) return "ko";
  if (/(^|[._-])ja([._-]|$)/.test(normalized)) return "ja";
  if (/(^|[._-])th([._-]|$)/.test(normalized)) return "th";

  const content = String(text || "");
  if (/[\u0e00-\u0e7f]/u.test(content)) return "th";
  if (/[\uac00-\ud7af]/u.test(content)) return "ko";
  if (/[\u3040-\u30ff]/u.test(content)) return "ja";
  if (/[靈灣點開間覽價線體與於臺龍門歷]/u.test(content)) return "zh-TW";
  const latinCount = (content.match(/[a-z]/giu) || []).length;
  const cjkCount = (content.match(/[\u3400-\u9fff]/gu) || []).length;
  if (latinCount >= 20 && latinCount > cjkCount * 2) return "en";
  if (cjkCount > 0) return "zh";
  return "und";
}

/**
 * @description
 * 对实体匹配文本执行 NFKC、转小写和空白规范化。
 * @private
 * @param {*} value 原始文本。
 * @returns {string} 规范化文本。
 */
function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * @description
 * 将非路线/贴士类导览章节关联到正文中提及的首个景点。
 * @private
 * @param {string} title 章节标题。
 * @param {string} content 章节正文。
 * @param {ScenicSpotKnowledge[]} spots 景点列表。
 * @returns {string|null} 景点 ID；通用章节或未匹配时为 `null`。
 */
function matchSpotId(title, content, spots) {
  if (/(路线|贴士|时间|政策|推荐)/.test(title)) {
    return null;
  }

  const text = `${title} ${content}`;
  const spot = spots.find((item) => item.aliases.some((alias) => text.includes(alias)));
  return spot?.id || null;
}

/**
 * @description
 * 按轻量 token 估算文本长度。
 *
 * 该估算器不依赖模型 SDK，适合低配置服务器的离线建索引：中日韩字符和
 * 标点按一个预算单位计算，连续拉丁字母/数字按约四字符一个单位计算，空白
 * 不占预算。它不是特定模型 tokenizer 的替代品，但能稳定约束上下文大小，且
 * 不会把代理项拆成无效的 UTF-16 字符。
 *
 * @param {*} value 待估算文本。
 * @returns {number} 估算 token 数。
 * @example
 * estimateTextTokens("灵山大佛开放时间");
 */
export function estimateTextTokens(value) {
  return tokenAtoms(String(value || "")).reduce((sum, atom) => sum + atom.cost, 0);
}

/**
 * @description
 * 将长文本按结构边界和 token 预算切分，并为相邻块保留有限重叠。
 *
 * 默认上限为 600 个估算 token、重叠 64 个估算 token，处于任务要求的
 * 300--600 / 50--80 区间。短文档不强行补齐到 300，避免把互不相关的章节
 * 合并；长句或长表格行才会退化为 Unicode 安全的窗口切分。
 * @param {string} text 文本。
 * @param {object|number} [options={}] 预算选项；数字参数按最大 token 处理。
 * @param {number} [options.maxTokens=600] 单个分块的最大估算 token 数。
 * @param {number} [options.overlapTokens=64] 相邻分块的重叠估算 token 数。
 * @returns {string[]} 有序文本分块。
 * @throws {TypeError} 文本不是字符串时抛出。
 * @example
 * const chunks = splitLongText(text, { maxTokens: 500, overlapTokens: 64 });
 */
export function splitLongText(text, options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("Chunking input must be a string.");
  }

  const clean = text.replace(/\r\n?/gu, "\n").trim();
  if (!clean) return [];

  const normalizedOptions = typeof options === "number"
    ? { maxTokens: options, overlapTokens: 64 }
    : options;
  const maxTokens = normalizeChunkBudget(normalizedOptions.maxTokens, 600, 32);
  const overlapTokens = normalizeChunkBudget(
    normalizedOptions.overlapTokens,
    64,
    0,
    Math.max(maxTokens - 1, 0)
  );

  if (estimateTextTokens(clean) <= maxTokens) {
    return [clean];
  }

  const units = splitTextUnits(clean);
  const parts = [];
  let currentUnits = [];
  let currentTokens = 0;

  const flushCurrent = () => {
    const value = currentUnits.join("\n").trim();
    if (value) parts.push(value);
    currentUnits = [];
    currentTokens = 0;
  };

  for (const unit of units) {
    const unitTokens = estimateTextTokens(unit);
    if (unitTokens > maxTokens) {
      flushCurrent();
      parts.push(...splitByTokenWindow(unit, maxTokens, overlapTokens));
      continue;
    }

    if (currentUnits.length > 0 && currentTokens + unitTokens > maxTokens) {
      const previous = currentUnits.join("\n").trim();
      flushCurrent();
      const overlap = takeTailByTokenBudget(previous, overlapTokens);
      if (overlap && estimateTextTokens(overlap) + unitTokens <= maxTokens) {
        currentUnits = [overlap, unit];
        currentTokens = estimateTextTokens(overlap) + unitTokens;
      } else {
        currentUnits = [unit];
        currentTokens = unitTokens;
      }
      continue;
    }

    currentUnits.push(unit);
    currentTokens += unitTokens;
  }

  flushCurrent();
  return parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
}

/**
 * @description
 * 规范化分块预算，避免环境变量或测试参数导致无穷循环。
 * @private
 * @param {*} value 原始值。
 * @param {number} fallback 默认值。
 * @param {number} minimum 下限。
 * @param {number} [maximum=Number.MAX_SAFE_INTEGER] 上限。
 * @returns {number} 正整数预算。
 */
function normalizeChunkBudget(value, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
  return Math.min(Math.max(resolved, minimum), maximum);
}

/**
 * @description
 * 按空行、列表行和中英文句末标点生成结构单元。
 * @private
 * @param {string} text 文本。
 * @returns {string[]} 适合装箱的段落/句子单元。
 */
function splitTextUnits(text) {
  return text
    .split(/\n{2,}/u)
    .flatMap((paragraph) => paragraph
      .split("\n")
      .flatMap((line) => line.split(/(?<=[。！？；])|(?<=[.!?])\s+/u))
      .map((unit) => unit.trim())
      .filter(Boolean));
}

/**
 * @description
 * 将单个超长结构单元按估算 token 窗口切分。
 * @private
 * @param {string} text 单元文本。
 * @param {number} maxTokens 最大预算。
 * @param {number} overlapTokens 重叠预算。
 * @returns {string[]} 窗口列表。
 */
function splitByTokenWindow(text, maxTokens, overlapTokens) {
  const atoms = tokenAtoms(text);
  const parts = [];
  let start = 0;

  while (start < atoms.length) {
    let end = start;
    let budget = 0;
    while (end < atoms.length) {
      const nextBudget = budget + atoms[end].cost;
      if (end > start && nextBudget > maxTokens) break;
      budget = nextBudget;
      end += 1;
    }
    if (end === start) end += 1;

    const value = atoms.slice(start, end).map((atom) => atom.text).join("").trim();
    if (value) parts.push(value);
    if (end >= atoms.length) break;

    let overlapStart = end;
    let overlapBudget = 0;
    while (overlapStart > start && overlapBudget < overlapTokens) {
      overlapStart -= 1;
      overlapBudget += atoms[overlapStart].cost;
    }
    start = Math.max(start + 1, overlapStart);
  }

  return parts;
}

/**
 * @description
 * 取文本末尾不超过预算的完整 token 原子。
 * @private
 * @param {string} text 文本。
 * @param {number} budget token 预算。
 * @returns {string} 重叠文本。
 */
function takeTailByTokenBudget(text, budget) {
  if (budget <= 0) return "";
  const atoms = tokenAtoms(text);
  let start = atoms.length;
  let used = 0;
  while (start > 0 && used < budget) {
    start -= 1;
    used += atoms[start].cost;
  }
  return atoms.slice(start).map((atom) => atom.text).join("").trim();
}

/**
 * @description
 * 将文本转为可安全拼接的预算原子。
 * @private
 * @param {string} text 文本。
 * @returns {Array<{text: string, cost: number}>} 原子序列。
 */
function tokenAtoms(text) {
  const chars = Array.from(text);
  const atoms = [];
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];
    if (/\s/u.test(char)) {
      atoms.push({ text: char, cost: 0 });
      index += 1;
      continue;
    }

    if (isCjkOrCyrillic(char) || /\p{P}|\p{S}/u.test(char)) {
      atoms.push({ text: char, cost: 1 });
      index += 1;
      continue;
    }

    if (/\p{L}|\p{N}/u.test(char)) {
      let end = index + 1;
      while (end < chars.length && /\p{L}|\p{N}/u.test(chars[end]) && !isCjkOrCyrillic(chars[end])) {
        end += 1;
      }
      const word = chars.slice(index, end).join("");
      const maxWordCharacters = 4 * 600;
      for (let offset = 0; offset < word.length; offset += maxWordCharacters) {
        const value = word.slice(offset, offset + maxWordCharacters);
        atoms.push({ text: value, cost: Math.max(1, Math.ceil(value.length / 4)) });
      }
      index = end;
      continue;
    }

    atoms.push({ text: char, cost: 1 });
    index += 1;
  }

  return atoms;
}

/**
 * @description
 * 判断字符是否属于以单字符预算更合适的东亚或西里尔文字。
 * @private
 * @param {string} char 单个 Unicode 码点。
 * @returns {boolean} 属于该字符集时为 `true`。
 */
function isCjkOrCyrillic(char) {
  return /[\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\u0400-\u052f]/u.test(char);
}

/**
 * @description
 * 从中文基础资料中选择预定义业务关键词。
 * @private
 * @param {string} text 文本。
 * @returns {string[]} 文本中实际出现的关键词。
 */
function extractKeywords(text) {
  const candidates = [
    "灵山胜境",
    "灵山大佛",
    "九龙灌浴",
    "灵山梵宫",
    "五印坛城",
    "祥符禅寺",
    "佛教文化",
    "祈福",
    "演出",
    "路线",
    "游览路线",
    "历史文化爱好者路线",
    "自然风光爱好者路线",
    "亲子家庭路线",
    "门票",
    "开放",
    "太湖",
    "赵朴初",
    "玄奘",
    "吉祥颂",
    "拈花湾",
    "禅意小镇",
    "拈花广场",
    "梵天花海",
    "香月花街",
    "拈花堂",
    "五灯湖",
    "鹿鸣谷",
    "禅行",
    "拈花微笑"
  ];

  return candidates.filter((item) => text.includes(item));
}

/**
 * @description
 * 规范化 DOCX 提取文本中的换行、制表符和连续空格。
 * @private
 * @param {string} text 原始文本。
 * @returns {string} 清理后的文本。
 */
function normalizeText(text) {
  return text.replace(/\r/g, "\n").replace(/\t+/g, "").replace(/[ ]{2,}/g, " ").trim();
}

/**
 * @description
 * 断言源资料文件存在。
 * @private
 * @param {string} filePath 文件路径。
 * @returns {void} 无返回值。
 * @throws {Error & {statusCode: 404, code: "SOURCE_FILE_NOT_FOUND"}} 文件不存在时抛出。
 */
function assertFile(filePath) {
  if (!existsSync(filePath)) {
    const error = new Error(`Source file not found: ${basename(filePath)}`);
    error.statusCode = 404;
    error.code = "SOURCE_FILE_NOT_FOUND";
    throw error;
  }
}

/**
 * @description
 * 为资料目录中的 XLSX/PDF 建立可见的处理记录，但默认不把运营分析表写入游客索引。
 * 上传流程会对显式标记为 `visitor_qa` 的同类文件执行实际解析。
 * @private
 * @param {string} sourceDir 资料目录。
 * @returns {Array<object>} 二进制资料的状态元数据。
 */
function loadSupplementalBinaryMetadata(sourceDir) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(xlsx|pdf)$/iu.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const fileType = extname(entry.name).slice(1).toLowerCase();
      const knowledgeScope = normalizeKnowledgeScope(undefined, entry.name);
      return {
        id: documentIdForFile(entry.name),
        fileName: entry.name,
        fileType,
        language: "und",
        knowledgeScope,
        scenicArea: "",
        documentType: documentTypeFor(fileType),
        validFrom: null,
        validTo: null,
        enabled: true,
        status: "skipped",
        processingStage: "classified",
        skipReason: knowledgeScope === "operations_analytics"
          ? "Operations analytics source is isolated from visitor QA."
          : "Binary source requires an explicit upload classification before indexing.",
        chunkCount: 0,
        chunks: []
      };
    });
}

/**
 * @description
 * 校验知识快照的最小结构，阻止损坏 JSON 被设为活动版本。
 * @param {*} value 候选快照。
 * @returns {boolean} 结构完整时为 `true`。
 * @private
 */
function isValidKnowledgeSnapshot(value) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof value.indexVersion === "string"
    && Array.isArray(value.documents)
    && Array.isArray(value.chunks)
    && Array.isArray(value.spots)
  );
}

/**
 * @description
 * 生成由文档与分块内容决定的知识版本号；相同内容可稳定复用版本。
 * @param {{documents?: object[], chunks?: object[]}} knowledge 知识数据。
 * @returns {string} 版本号。
 * @private
 */
function createIndexVersion(knowledge) {
  const payload = JSON.stringify({
    documents: knowledge.documents || [],
    chunks: (knowledge.chunks || []).map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      contentHash: chunk.contentHash,
      content: chunk.content,
      knowledgeScope: chunk.knowledgeScope,
      accessScope: chunk.accessScope,
      tenantId: chunk.tenantId,
      enabled: chunk.enabled,
      validFrom: chunk.validFrom,
      validTo: chunk.validTo
    }))
  });
  const digest = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `${CHUNKER_VERSION}-${Date.now().toString(36)}-${digest}-${randomBytes(2).toString("hex")}`;
}

/**
 * @description
 * 根据文档所有 child 的有序内容生成稳定指纹，用于跳过无变化的重建。
 * @private
 * @param {object[]} chunks 文档分块。
 * @returns {string} 文档内容指纹。
 */
function createDocumentContentHash(chunks) {
  return createHash("sha256")
    .update(chunks
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
      .map((chunk) => `${chunk.id}\u0000${chunk.contentHash || chunk.content || ""}`)
      .join("\u0001"))
    .digest("hex");
}

/**
 * @description
 * 将完整快照写入独立版本目录，完成校验后再原子切换活动指针。
 * @param {string} generatedDir 可写生成目录。
 * @param {KnowledgeBase} knowledge 知识快照。
 * @returns {void} 无返回值。
 * @throws {Error} 临时快照写入、校验或活动指针切换失败时抛出。
 * @private
 */
function writeKnowledgeSnapshot(generatedDir, knowledge) {
  if (!isValidKnowledgeSnapshot(knowledge)) {
    throw new Error("Knowledge snapshot validation failed.");
  }
  withKnowledgeWriteLock(generatedDir, () => {
    const snapshotDir = join(generatedDir, "snapshots", knowledge.indexVersion);
    mkdirSync(snapshotDir, { recursive: true });
    writeJson(join(snapshotDir, "knowledge.json"), knowledge);
    writeJson(join(snapshotDir, "knowledge-chunks.json"), knowledge.chunks);
    writeJson(join(snapshotDir, "scenic-spots.json"), knowledge.spots);

    const checked = loadKnowledgeFrom(join(snapshotDir, "knowledge.json"));
    if (!isValidKnowledgeSnapshot(checked) || checked.indexVersion !== knowledge.indexVersion) {
      throw new Error("Knowledge snapshot validation failed.");
    }

    writeJson(join(generatedDir, "active-index.json"), {
      indexVersion: knowledge.indexVersion,
      generatedAt: knowledge.generatedAt
    });

    // Keep the legacy root files for older packaging and diagnostics. The active
    // pointer always targets the complete version directory above.
    writeJson(join(generatedDir, "knowledge.json"), knowledge);
    writeJson(join(generatedDir, "knowledge-chunks.json"), knowledge.chunks);
    writeJson(join(generatedDir, "scenic-spots.json"), knowledge.spots);
  });
}

/**
 * @description
 * 以两空格缩进和结尾换行写入 UTF-8 JSON。
 * @private
 * @param {string} filePath 输出路径。
 * @param {*} data 可序列化数据。
 * @returns {void} 无返回值。
 * @throws {TypeError|Error} 数据不可序列化或文件无法写入时抛出。
 */
function writeJson(filePath, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = openSync(temporaryPath, "w");
  try {
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporaryPath, filePath);
}
