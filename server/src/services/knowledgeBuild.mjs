/**
 * @fileoverview 灵山与拈花湾资料的 DOCX/Markdown 解析、知识分块、运行时索引和快照恢复服务。
 *
 * @typedef {object} ScenicSpotKnowledge
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
 * @typedef {{id: string, documentId: string, scenicSpotId: string|null, title: string, content: string, keywords: string[], source: string, language: string, fileType?: string}} KnowledgeChunk
 * @typedef {{id: string, fileName: string, fileType: string, language: string, status: string, chunkCount: number, createdAt: string}} KnowledgeDocument
 * @typedef {{generatedAt: string, sourceDir?: string, scope?: string, documents: KnowledgeDocument[], spots: ScenicSpotKnowledge[], guideSections?: object[], chunks: KnowledgeChunk[]}} KnowledgeBase
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.mjs";
import { extractDocxText } from "./docx.mjs";

/** @type {string} 结构化景点资料的标准文件名。 */
const STRUCTURED_DOC = "灵山胜境 景点结构化数据集.docx";
/** @type {string} 综合导览资料的标准文件名。 */
const GUIDE_DOC = "灵山胜境：历史、文化、景点特色与个性化游览指南.docx";
/** @type {string[]} 构成可恢复发布快照的生成文件。 */
const GENERATED_KNOWLEDGE_FILES = ["knowledge.json", "knowledge-chunks.json", "scenic-spots.json"];

/** @type {string[]} 结构化 DOCX 记录的字段顺序。 */
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
 * 结构化数据覆盖的景区及其 ID 格式。每条记录以独占一行的景区名和下一行景点 ID 开始。
 * @type {Array<{area: string, idPattern: RegExp}>}
 */
const SCENIC_AREAS = [
  { area: "灵山胜境", idPattern: /^LS-\d{3}$/ },
  { area: "拈花湾禅意小镇", idPattern: /^NH-\d{3}$/ }
];

/**
 * 根据景点 ID 判断所属景区。
 * @private
 * @param {*} id 景点 ID。
 * @returns {string|null} 景区名称；格式不匹配时返回 `null`。
 */
function areaForId(id) {
  return SCENIC_AREAS.find((entry) => entry.idPattern.test(id))?.area || null;
}

/**
 * 判断一行是否为表格或章节边界，防止标题混入上一条景点备注。
 * @private
 * @param {string} line 清理后的文本行。
 * @returns {boolean} 属于边界时为 `true`。
 */
function isTableBoundary(line) {
  return /景点数据集/.test(line) || /^(子表|表\d|景区名称|数据集说明|字段规范|核心构成)/.test(line);
}

/** @type {string[]} 综合导览文档中用于切分章节的已知标题。 */
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
  const supplementalDocuments = loadSupplementalMarkdown(sourceDir, spots);
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
      status: "processed",
      chunkCount: chunks.filter((chunk) => chunk.documentId === "doc_structured_lingshan_spots").length,
      createdAt: new Date().toISOString()
    },
    {
      id: "doc_lingshan_guide",
      fileName: GUIDE_DOC,
      fileType: "docx",
      language: "zh",
      status: "processed",
      chunkCount: chunks.filter((chunk) => chunk.documentId === "doc_lingshan_guide").length,
      createdAt: new Date().toISOString()
    },
    ...supplementalDocuments.map(({ chunks: documentChunks, ...document }) => ({
      ...document,
      status: "processed",
      chunkCount: documentChunks.length,
      createdAt: new Date().toISOString()
    })),
    ...uploadedDocuments
  ];

  const result = {
    generatedAt: new Date().toISOString(),
    sourceDir: basename(sourceDir),
    scope: "灵山胜境 拈花湾禅意小镇",
    documents,
    spots,
    guideSections,
    chunks
  };

  writeJson(join(generatedDir, "knowledge.json"), result);
  writeJson(join(generatedDir, "scenic-spots.json"), spots);
  writeJson(join(generatedDir, "knowledge-chunks.json"), chunks);
  writeFileSync(join(generatedDir, "structured-source.txt"), structuredText, "utf8");
  writeFileSync(join(generatedDir, "guide-source.txt"), guideText, "utf8");

  return result;
}

/**
 * 优先从可写运行时目录加载知识库，缺失时回退到发布包快照。
 * @returns {KnowledgeBase|null} 知识库；两个位置均不存在时返回 `null`。
 * @throws {SyntaxError|Error} 文件存在但 JSON 无效或读取失败时抛出。
 * @example
 * const knowledge = loadKnowledge();
 */
export function loadKnowledge() {
  return (
    loadKnowledgeFrom(join(runtimeGeneratedDir(), "knowledge.json")) ||
    loadKnowledgeFrom(join(bundledGeneratedDir(), "knowledge.json"))
  );
}

/**
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
 * 将纯文本或 Markdown 按章节与最大 700 字符切分为可检索知识块。
 * @param {{documentId: string, fileName: string, text: string, fileType?: string, spots?: ScenicSpotKnowledge[]}} input 文档信息。
 * @returns {KnowledgeChunk[]} 有序知识分块。
 * @example
 * const chunks = buildTextDocumentChunks({ documentId: "upload_1", fileName: "faq.md", text: "# 门票\n成人票说明" });
 */
export function buildTextDocumentChunks({
  documentId,
  fileName,
  text,
  fileType = extname(fileName).replace(".", "") || "txt",
  spots = []
}) {
  const sections = parseTextSections(text, fileName);
  const language = inferDocumentLanguage(fileName, text);
  const chunks = [];

  for (const section of sections) {
    const parts = splitLongText(section.content, 700);
    for (let index = 0; index < parts.length; index += 1) {
      const content = parts[index];
      chunks.push({
        id: `${documentId}_chunk_${String(chunks.length + 1).padStart(3, "0")}`,
        documentId,
        scenicSpotId: matchLocalizedSpotId(section.title, spots),
        title: section.title,
        content,
        keywords: extractDocumentKeywords(`${section.title} ${content}`, spots),
        source: fileName,
        language,
        fileType
      });
    }
  }

  return chunks;
}

/**
 * 将上传文本加入运行时知识库，并原子式替换同 ID 文档的旧元数据和分块。
 * @param {{documentId: string, fileName: string, text: string, fileType: string}} input 文档信息。
 * @returns {KnowledgeDocument} 已索引文档元数据。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 无基础知识库且快照无法恢复时抛出。
 * @throws {Error & {statusCode: 422, code: "KNOWLEDGE_DOCUMENT_EMPTY"}} 文档无可索引文本时抛出。
 * @throws {Error} 快照恢复、JSON 读取或文件写入失败时透传异常。
 * @example
 * const document = indexTextKnowledgeDocument({ documentId: "upload_1", fileName: "faq.txt", text: "开放时间", fileType: "txt" });
 */
export function indexTextKnowledgeDocument({ documentId, fileName, text, fileType }) {
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
    spots: knowledge.spots || []
  });
  if (chunks.length === 0) {
    const error = new Error("The uploaded document does not contain indexable text.");
    error.statusCode = 422;
    error.code = "KNOWLEDGE_DOCUMENT_EMPTY";
    throw error;
  }

  const createdAt = new Date().toISOString();
  const document = {
    id: documentId,
    fileName,
    fileType,
    language: inferDocumentLanguage(fileName, text),
    status: "processed",
    chunkCount: chunks.length,
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
      ...chunks
    ]
  };
  const generatedDir = runtimeGeneratedDir();
  mkdirSync(generatedDir, { recursive: true });
  writeJson(join(generatedDir, "knowledge.json"), next);
  writeJson(join(generatedDir, "knowledge-chunks.json"), next.chunks);

  return document;
}

/**
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
  const generatedDir = runtimeGeneratedDir();
  mkdirSync(generatedDir, { recursive: true });
  writeJson(join(generatedDir, "knowledge.json"), next);
  writeJson(join(generatedDir, "knowledge-chunks.json"), chunks);
  return removedDocuments;
}

/**
 * 获取当前部署的可写知识生成目录。
 * @private
 * @returns {string} 绝对目录。
 */
function runtimeGeneratedDir() {
  return join(config.dataDir, "generated");
}

/**
 * 获取源码发布包内置知识快照目录。
 * @private
 * @returns {string} 绝对目录。
 */
function bundledGeneratedDir() {
  return resolve(fileURLToPath(new URL("../../data/generated", import.meta.url)));
}

/**
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
      title: spot.name,
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
      language: "zh"
    });
  }

  for (const section of guideSections) {
    for (const part of splitLongText(section.content, 700)) {
      chunks.push({
        id: `chunk_${section.id}_${String(chunks.length + 1).padStart(3, "0")}`,
        documentId: "doc_lingshan_guide",
        scenicSpotId: matchSpotId(section.title, part, spots),
        title: section.title,
        content: part,
        keywords: section.keywords,
        source: GUIDE_DOC,
        language: "zh"
      });
    }
  }

  return chunks;
}

/**
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

  /** 将当前缓冲正文写入章节列表。 @returns {void} */
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
 * 对实体匹配文本执行 NFKC、转小写和空白规范化。
 * @private
 * @param {*} value 原始文本。
 * @returns {string} 规范化文本。
 */
function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
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
 * 尽量按句子边界将长文本拆分到指定最大长度。
 * 单个超长句不会被硬切，以保持语义完整。
 * @private
 * @param {string} text 文本。
 * @param {number} maxLength 目标最大字符数。
 * @returns {string[]} 有序文本分块。
 */
function splitLongText(text, maxLength) {
  const clean = text.trim();
  if (clean.length <= maxLength) {
    return [clean];
  }

  const sentences = clean.split(/(?<=[。！？；])|(?<=[.!?])\s+/);
  const parts = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
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
 * 规范化 DOCX 提取文本中的换行、制表符和连续空格。
 * @private
 * @param {string} text 原始文本。
 * @returns {string} 清理后的文本。
 */
function normalizeText(text) {
  return text.replace(/\r/g, "\n").replace(/\t+/g, "").replace(/[ ]{2,}/g, " ").trim();
}

/**
 * 断言源资料文件存在。
 * @private
 * @param {string} filePath 文件路径。
 * @returns {void}
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
 * 以两空格缩进和结尾换行写入 UTF-8 JSON。
 * @private
 * @param {string} filePath 输出路径。
 * @param {*} data 可序列化数据。
 * @returns {void}
 * @throws {TypeError|Error} 数据不可序列化或文件无法写入时抛出。
 */
function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
