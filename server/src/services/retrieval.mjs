/**
 * @fileoverview 灵山知识库的关键词与混合检索、实体识别、意图加权和引用生成服务。
 *
 * @typedef {{intent: string, preferredTerms: string[], preferredDocuments: string[]}} RetrievalIntent
 * @typedef {{id: string, name: string, alias: string, confidence: number}} SpotMatch
 * @typedef {{chunkId: string, documentId: string, documentName: string, sectionTitle: string, scenicSpotId: string|null, scenicSpotName: string|null, quote: string}} Citation
 * @typedef {{id: string, score: number, title: string, content: string, contextContent?: string, parentContent?: string, parentChunkIds?: string[], source: string, documentId: string, scenicSpotId: string|null, scenicSpotName: string|null, keywords: string[], citation: Citation, reasons: string[]}} RetrievalResult
 */
import { createHash } from "node:crypto";
import { loadKnowledgeFromSqlite } from "./knowledgeRepository.mjs";
import { getActiveKnowledgeVersion } from "./knowledgeBuild.mjs";
import { config } from "../config.mjs";
import { createRetrievalTraceId, recordRetrievalTrace } from "./retrievalTrace.mjs";
import { detectOutOfScope } from "./guardrails.mjs";
import { buildQueryPlan } from "./retrieval/query.mjs";
import { buildBm25Index, searchBm25 } from "./retrieval/bm25.mjs";
import { maximalMarginalRelevance, reciprocalRankFusion } from "./retrieval/fusion.mjs";
import {
  buildRemoteRagConfig,
  embedTexts,
  getRemoteRagConfigIssues,
  isRemoteDenseReady,
  isRemoteRerankerReady,
  queryQdrant,
  rerankDocuments
} from "./retrieval/remoteProviders.mjs";

/** @type {Map<string, object>} 按知识版本缓存的 BM25 统计量。 */
const bm25Indexes = new Map();
/** @type {Map<string, object>} 版本化检索结果缓存。 */
const retrievalCache = new Map();
/** @type {number} 检索缓存上限。 */
const MAX_RETRIEVAL_CACHE_ENTRIES = 500;
/** @type {number} 检索缓存有效期。 */
const RETRIEVAL_CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {Record<string, string[]>} 常见问题词到检索扩展词的多语言映射。 */
const querySynonyms = {
  多高: ["高", "高度", "通高", "总高", "建筑/景观参数"],
  高度: ["高", "通高", "总高", "建筑/景观参数"],
  几点: ["时间", "开放", "演出", "时段"],
  什么时候: ["时间", "开放", "演出", "时段"],
  看点: ["亮点", "特色", "游玩亮点", "最佳体验"],
  介绍: ["详细介绍", "文化内涵", "核心功能"],
  路线: ["游览路线", "推荐路线", "经典路线", "时长"],
  门票: ["票价", "费用", "成人票", "半价"],
  吃饭: ["餐饮", "素斋", "美食"],
  拍照: ["打卡", "合影", "拍摄", "取景"],
  "how tall": ["height", "88 meters", "grand buddha"],
  height: ["tall", "meters", "grand buddha"],
  "opening hours": ["open", "closing", "last admission", "visitor center"],
  ticket: ["admission", "price", "adult ticket", "concession"],
  route: ["itinerary", "suggested route", "hours", "highlights"],
  highlights: ["features", "what to see", "experience"],
  "높이": ["몇 미터", "88미터", "링산대불"],
  "운영 시간": ["개장", "폐장", "마지막 입장", "관광안내센터"],
  "입장권": ["가격", "성인권", "우대권"],
  "관람 경로": ["추천 경로", "동선", "시간"],
  "볼거리": ["특징", "체험", "명소"],
  "高さ": ["何メートル", "88メートル", "霊山大仏"],
  "営業時間": ["開園", "閉園", "最終入場", "ビジターセンター"],
  "入場券": ["料金", "大人券", "割引券"],
  "ルート": ["おすすめルート", "所要時間", "見どころ"],
  "ファミリー": ["ファミリールート", "約4時間", "百子戯弥勒"],
  "家族": ["ファミリールート", "子ども", "体験展示"],
  "見どころ": ["特徴", "体験", "名所"],
  "幾點": ["時間", "開放", "表演", "時段"],
  "吉祥頌": ["靈山梵宮", "演出時間", "約 20 分鐘"],
  "門票": ["票價", "費用", "成人票", "半價票"],
  "路線": ["遊覽路線", "推薦路線", "時長"],
  "親子": ["親子輕鬆路線", "約 4 小時", "百子戲彌勒"],
  "輕鬆": ["親子輕鬆路線", "約 4 小時", "互動展示"],
  "拈花灣": ["拈花灣禪意小鎮", "拈花廣場", "五燈湖", "鹿鳴谷"],
  "看點": ["亮點", "特色", "最佳體驗"],
  "สูงเท่าไร": ["ความสูง", "88 เมตร", "พระใหญ่หลิงซาน"],
  "กี่เมตร": ["ความสูง", "88 เมตร", "พระใหญ่หลิงซาน"],
  "กี่โมง": ["เวลา", "การแสดง", "เวลาเปิด"],
  "บัตรเข้าชม": ["ราคา", "ค่าเข้า", "210 หยวน"],
  "เส้นทาง": ["เส้นทางแนะนำ", "ลำดับการเที่ยว", "ชั่วโมง"],
  "จุดเด่น": ["สถานที่น่าสนใจ", "ประสบการณ์", "ถ่ายรูป"]
};

/** @type {Array<RetrievalIntent & {triggers: string[]}>} 通用业务意图识别与加权规则。 */
const intentRules = [
  {
    intent: "height",
    triggers: ["多高", "高度", "通高", "总高", "几米", "how tall", "height", "tall", "높이", "몇 미터", "高さ", "何メートル", "幾公尺", "สูงเท่าไร", "กี่เมตร", "ความสูง"],
    preferredTerms: ["高", "高度", "通高", "总高", "建筑/景观参数", "米", "m", "88 meters", "88미터", "88メートル", "88 公尺", "88 เมตร", "ความสูง"],
    preferredDocuments: ["doc_structured_lingshan_spots"]
  },
  {
    intent: "open_time",
    triggers: ["开放", "开放时间", "几点开", "几点关", "闭馆", "营业", "opening hours", "open", "close", "운영 시간", "개장", "폐장", "営業時間", "開園", "閉園", "開放時間", "เวลาเปิด", "เปิดกี่โมง", "ปิดกี่โมง"],
    preferredTerms: ["开放", "开放时间", "闭馆", "运营", "演艺/开放信息", "opening", "closing", "운영 시간", "営業時間", "開放時間", "เวลาเปิด", "เวลาปิด"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "performance_time",
    triggers: ["演出", "几点", "表演", "吉祥颂", "吉祥頌", "场次", "时长", "show", "performance", "start", "공연", "몇 시", "시작", "上演", "何時", "開始", "表演", "幾點", "การแสดง", "กี่โมง", "เริ่มเวลา"],
    preferredTerms: ["演出", "表演", "时间", "时长", "10:35", "11:30", "14:00", "16:00", "吉祥颂", "吉祥頌", "靈山梵宮", "約 20 分鐘", "show", "performance", "공연", "上演", "表演", "การแสดง", "เวลาเริ่ม"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "ticket",
    triggers: ["门票", "票价", "多少钱", "费用", "成人票", "半价", "免票", "ticket", "admission", "price", "입장권", "요금", "入場券", "料金", "門票", "票價", "บัตรเข้าชม", "ค่าเข้า", "ราคาเท่าไร"],
    preferredTerms: ["门票", "票价", "费用", "成人票", "半价", "免票", "210", "105", "ticket", "admission", "입장권", "入場券", "門票", "บัตรเข้าชม", "210 หยวน"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "route",
    triggers: ["路线", "游览", "推荐", "几小时", "半日", "route", "itinerary", "recommend", "관람 경로", "경로", "추천", "ルート", "提案", "路線", "推薦", "เส้นทาง", "แนะนำ", "ครึ่งวัน", "เที่ยวอย่างไร"],
    preferredTerms: ["路线", "路线规划", "推荐", "历史文化爱好者路线", "自然风光爱好者路线", "亲子家庭路线", "小时", "route", "itinerary", "경로", "ルート", "路線", "เส้นทางแนะนำ", "ชั่วโมง"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "highlight",
    triggers: ["看点", "亮点", "特色", "怎么玩", "拍照", "打卡", "highlight", "highlights", "what to see", "볼거리", "특징", "見どころ", "特徴", "看點", "亮點", "จุดเด่น", "สถานที่น่าสนใจ", "ถ่ายรูป"],
    preferredTerms: ["看点", "亮点", "特色", "游玩亮点", "最佳体验", "拍照", "打卡", "highlights", "볼거리", "見どころ", "看點", "จุดเด่น", "สถานที่น่าสนใจ"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "history",
    triggers: ["历史", "玄奘", "小灵山", "灵鹫山", "起源", "渊源", "关系", "history", "origin", "Xuanzang", "역사", "현장", "歴史", "玄奘", "歷史", "淵源", "ประวัติ", "ที่มา", "กำเนิด"],
    preferredTerms: ["历史", "玄奘", "小灵山", "灵鹫山", "佛教缘起", "渊源", "唐贞观", "history", "Xuanzang", "역사", "歴史", "歷史", "ประวัติ", "ราชวงศ์ถัง"],
    preferredDocuments: ["doc_lingshan_guide", "doc_structured_lingshan_spots"]
  }
];

/** @type {Record<string, string[]>} 面向特定事实问题的直接检索扩展词。 */
const directQuerySynonyms = {
  "无锡": ["坐落", "位于", "马山镇", "太湖西北部"],
  "占地": ["占地面积", "平方米", "30万平方米"],
  "几a": ["5a", "国家5a", "旅游景区"],
  "A级": ["5A", "国家5A", "旅游景区"],
  "合适": ["最佳游览时间", "季节选择", "春秋季节"],
  "什么时候去": ["最佳游览时间", "季节选择", "春秋季节"],
  "入园": ["建议上午9点前入园", "人流高峰", "时间安排"],
  "素斋": ["梵宫素斋", "餐饮", "50元"],
  "自助": ["自助", "餐饮", "50元"],
  "孩子": ["亲子家庭路线", "轻松游", "百子戏弥勒"],
  "轻松": ["亲子家庭路线", "轻松游"],
  "family": ["family route", "about 4 hours", "children"],
  "가족": ["가족 코스", "약 4시간", "아이"],
  "ファミリー": ["ファミリールート", "約4時間", "百子戯弥勒"],
  "親子": ["親子輕鬆路線", "約 4 小時", "百子戲彌勒"],
  "ครอบครัว": ["เส้นทางครอบครัว", "ประมาณ 4 ชั่วโมง", "เด็ก"],
  "钟": ["祥符禅钟", "江南第一钟", "12.8吨"],
  "五明": ["声明", "因明", "内明", "医方明", "工巧明"],
  "落成开光": ["1997年11月15日", "落成开光"],
  "五方五佛": ["赵朴初", "五方五佛", "东方空缺"]
};

/** @type {Array<RetrievalIntent & {triggers: string[]}>} 景区概况、游览季节等精确事实意图规则。 */
const directIntentRules = [
  {
    intent: "overview",
    triggers: ["无锡", "占地", "几a", "A级", "5A"],
    preferredTerms: ["坐落", "马山镇", "太湖西北部", "占地面积", "30万平方米", "国家5A"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "best_time",
    triggers: ["什么时候去", "合适", "最佳游览时间", "季节"],
    preferredTerms: ["最佳游览时间", "季节选择", "春秋季节", "3-5月", "9-11月"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "entry_time",
    triggers: ["入园", "几点入园"],
    preferredTerms: ["建议上午9点前入园", "人流高峰", "时间安排"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "dining",
    triggers: ["素斋", "自助", "餐饮", "吃饭"],
    preferredTerms: ["梵宫素斋", "自助", "50元", "餐饮"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "family_route",
    triggers: ["孩子", "亲子", "轻松", "family", "with children", "가족", "아이", "ファミリー", "家族", "子ども", "親子", "輕鬆", "ครอบครัว", "เด็ก"],
    preferredTerms: ["亲子家庭路线", "轻松游", "百子戏弥勒", "孩子", "family route", "가족", "ファミリールート", "親子輕鬆路線", "百子戲彌勒", "เส้นทางครอบครัว"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "specific_fact",
    triggers: ["钟", "五明", "落成开光", "五方五佛"],
    preferredTerms: ["祥符禅钟", "12.8吨", "声明", "因明", "内明", "1997年11月15日", "赵朴初", "五方五佛"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  }
];

/** @type {string[]} 分词阶段主动保留的中英日韩繁体主题词。 */
const topicKeywords = [
  "历史",
  "文化",
  "佛教",
  "祈福",
  "演出",
  "开放",
  "路线",
  "门票",
  "交通",
  "餐饮",
  "住宿",
  "亲子",
  "自然",
  "拍照",
  "打卡",
  "消费",
  "满意度",
  "讲解",
  "玄奘",
  "小灵山",
  "灵鹫山",
  "渊源",
  "height",
  "opening hours",
  "performance",
  "ticket",
  "route",
  "highlights",
  "history",
  "높이",
  "운영 시간",
  "공연",
  "입장권",
  "관람 경로",
  "볼거리",
  "역사",
  "高さ",
  "営業時間",
  "上演",
  "入場券",
  "ルート",
  "見どころ",
  "歴史",
  "開放時間",
  "表演",
  "門票",
  "路線",
  "看點",
  "歷史",
  "ความสูง",
  "เวลาเปิด",
  "การแสดง",
  "บัตรเข้าชม",
  "เส้นทาง",
  "จุดเด่น",
  "ประวัติ"
];

/** @type {Set<string>} 英文检索停用词。 */
const stopWords = new Set([
  "a", "an", "and", "are", "at", "for", "how", "in", "is", "me", "of", "on", "please", "the", "to", "what", "when",
  "about", "does", "recommend", "tell", "you", "your"
]);

/** @type {Set<string>} 不足以进行景点局部匹配的通用灵山名称。 */
const genericSpotTokens = new Set(["灵山", "靈山", "霊山", "lingshan", "링산", "หลิงซาน"]);

/**
 * 使用关键词匹配、实体和意图权重检索知识库。
 * @param {*} query 查询文本。
 * @param {{limit?: number, locale?: string}} [options={}] 检索选项。
 * @returns {object} 查询分析与排序后的检索结果。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @example
 * const result = keywordSearch("灵山大佛高度", { limit: 3 });
 */
export function keywordSearch(query, options = {}) {
  return searchKnowledge(query, {
    ...options,
    mode: "keyword"
  });
}

/**
 * 使用关键词、查询覆盖度、语种及结构化资料权重执行混合检索。
 * @param {*} query 查询文本。
 * @param {{limit?: number, locale?: string}} [options={}] 检索选项。
 * @returns {object} 查询分析与排序后的检索结果。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @example
 * const result = hybridSearch("九龙灌浴几点表演？", { locale: "zh" });
 */
export function hybridSearch(query, options = {}) {
  return searchKnowledge(query, {
    ...options,
    mode: "hybrid"
  });
}

/**
 * 仅使用 BM25 通道检索，主要用于离线消融评测和回归门禁。
 * @param {*} query 查询文本。
 * @param {{limit?: number, locale?: string}} [options={}] 检索选项。
 * @returns {object} 标准检索响应。
 */
export function bm25Search(query, options = {}) {
  return searchKnowledge(query, {
    ...options,
    mode: "bm25"
  });
}

/**
 * 执行可降级的企业级混合检索。
 *
 * 远程配置完整时使用“规则/BM25 + Dense + RRF + Reranker”；缺少密钥、
 * Qdrant 未同步、超时或限流时返回现有本地混合检索，不中断问答服务。
 *
 * @param {*} query 查询文本。
 * @param {{limit?: number, locale?: string, scenicArea?: string, documentType?: string, knowledgeScope?: string, strictLanguage?: boolean}} [options={}] 检索选项。
 * @param {{config?: object, fetchImpl?: typeof fetch}} [dependencies={}] 可注入远程配置和 fetch。
 * @returns {Promise<object>} 带远程通道状态的检索响应。
 */
export async function hybridSearchAsync(query, options = {}, dependencies = {}) {
  const config = dependencies.config || buildRemoteRagConfig();
  const finalLimit = clamp(Number(options.limit || 5), 1, 20);
  if (!isRemoteDenseReady(config)) {
    const configurationIssues = getRemoteRagConfigIssues(config, ["shared", "embedding", "vector"]);
    return {
      ...hybridSearch(query, { ...options, limit: finalLimit }),
      remote: {
        status: config.enabled ? "not_configured" : "disabled",
        dense: false,
        reranked: false,
        degraded: false,
        reason: config.enabled
          ? configurationIssues[0] || "remote_credentials_missing"
          : "remote_disabled",
        configurationIssues
      }
    };
  }

  const startedAt = performance.now();
  const candidateLimit = Math.max(finalLimit, config.candidateLimit || 20);
  const local = hybridSearch(query, { ...options, limit: candidateLimit });
  const knowledge = loadKnowledgeFromSqlite();
  const activeIndexVersion = local.indexVersion || knowledge?.indexVersion || getActiveKnowledgeVersion();
  const chunkById = new Map((knowledge?.chunks || [])
    .filter((chunk) => passesMetadataFilter(chunk, options))
    .map((chunk) => [chunk.id, chunk]));
  try {
    const queryPlan = buildQueryPlan(query);
    const denseQueries = queryPlan.subQueries?.length > 1
      ? queryPlan.subQueries.slice(0, 3)
      : [queryPlan.original];
    const embeddingStartedAt = performance.now();
    const embedded = await withTimeout(
      embedTexts(denseQueries, config, { fetchImpl: dependencies.fetchImpl }),
      config.subqueryTimeoutMs,
      "SUBQUERY_TIMEOUT"
    );
    const embeddingMs = performance.now() - embeddingStartedAt;
    const vectorStartedAt = performance.now();
    const denseRowsByQuery = await withTimeout(Promise.all(embedded.vectors.map((vector) => (
      queryQdrant(vector, config, {
        limit: candidateLimit,
        indexVersion: activeIndexVersion,
        knowledgeScope: options.knowledgeScope || "visitor_qa",
        accessScopes: normalizeAccessScopes(options.accessScopes),
        tenantId: options.tenantId || "default",
        scenicArea: options.scenicArea || null,
        documentType: options.documentType || null,
        language: options.strictLanguage ? normalizeLanguageFilter(options.locale) : null
      }, { fetchImpl: dependencies.fetchImpl })
    ))), config.subqueryTimeoutMs, "SUBQUERY_TIMEOUT");
    const vectorMs = performance.now() - vectorStartedAt;
    const lexical = local.results
      .map((result) => ({
        chunk: chunkById.get(result.id),
        score: result.score,
        reasons: result.reasons || [],
        channel: "lexical"
      }))
      .filter((item) => item.chunk);
    const denseLists = denseRowsByQuery.map((rows, queryIndex) => rows.map((row) => ({
        chunk: chunkById.get(row.chunkId),
        score: row.score,
        reasons: [`Dense语义相似度：${row.score.toFixed(4)}`],
        channel: `dense_subquery_${queryIndex + 1}`
      }))
      .filter((item) => item.chunk));
    const dense = reciprocalRankFusion(denseLists, { limit: candidateLimit })
      .map((item) => ({ ...item, channel: "dense" }));
    let fused = reciprocalRankFusion([lexical, dense], { limit: candidateLimit });
    let reranked = false;
    let rerankMs = 0;
    let rerankFailure = null;
    if (fused.length > 0 && isRemoteRerankerReady(config)) {
      const rerankStartedAt = performance.now();
      try {
        const order = await rerankDocuments(
          String(query || ""),
          fused.map((item) => `${item.chunk.title}\n${item.chunk.content}`),
          config,
          { topN: fused.length, fetchImpl: dependencies.fetchImpl }
        );
        const selected = new Set();
        const ordered = [];
        for (const result of order) {
          const item = fused[result.index];
          if (!item || selected.has(result.index)) continue;
          selected.add(result.index);
          ordered.push({
            ...item,
            score: result.score,
            reasons: [...(item.reasons || []), `语义重排分：${result.score.toFixed(4)}`]
          });
        }
        fused.forEach((item, index) => {
          if (!selected.has(index)) ordered.push(item);
        });
        fused = ordered;
        reranked = order.length > 0;
      } catch (error) {
        rerankFailure = error.code || "RERANK_REQUEST_FAILED";
      } finally {
        rerankMs = performance.now() - rerankStartedAt;
      }
    }
    const ranked = maximalMarginalRelevance(applyFreshnessPreference(fused, local.intents || []), {
      limit: finalLimit,
      maxPerParent: options.maxPerParent || 2
    });
    const parentLookup = buildParentLookup(
      (knowledge.chunks || []).filter((chunk) => passesMetadataFilter(chunk, options))
    );
    const results = ranked.map((item) => formatResult(item, knowledge.spots || [], parentLookup));
    return {
      ...local,
      total: results.length,
      results,
      conflicts: detectConflictingFacts(results, local.intents || []),
      channels: [
        ...(local.channels || []),
        { name: "dense", count: dense.length },
        { name: "dense_subqueries", count: denseQueries.length },
        { name: "remote_rrf", count: fused.length },
        { name: "reranker", count: reranked ? fused.length : 0 }
      ],
      decision: results.length > 0
        ? { answerable: true, reason: "candidate_found", blockedPlace: null }
        : local.decision,
      remote: {
        status: rerankFailure ? "partial" : "ready",
        dense: true,
        reranked,
        degraded: Boolean(rerankFailure),
        reason: rerankFailure,
        model: {
          embedding: embedded.model,
          reranker: reranked ? config.reranker.model : null
        },
        latencyMs: {
          embedding: Number(embeddingMs.toFixed(3)),
          vector: Number(vectorMs.toFixed(3)),
          rerank: Number(rerankMs.toFixed(3)),
          total: Number((performance.now() - startedAt).toFixed(3))
        },
        usage: embedded.usage,
        queryCount: denseQueries.length
      }
    };
  } catch (error) {
    return {
      ...hybridSearch(query, { ...options, limit: finalLimit }),
      remote: {
        status: "degraded",
        dense: false,
        reranked: false,
        degraded: true,
        reason: error.code || "REMOTE_RETRIEVAL_FAILED",
        latencyMs: { total: Number((performance.now() - startedAt).toFixed(3)) }
      }
    };
  }
}

/**
 * 执行共享检索流程：加载知识、规范化、分词、扩展、意图和实体识别、评分与格式化。
 * @private
 * @param {*} query 查询文本。
 * @param {{mode: "keyword"|"hybrid", limit?: number, locale?: string}} options 检索选项。
 * @returns {{query: *, mode: string, locale: string|null, tokens: string[], expandedTerms: string[], intents: RetrievalIntent[], spotMatches: SpotMatch[], total: number, results: RetrievalResult[]}} 检索响应。
 * @throws {Error} 知识库未构建、查询为空或知识数据读取失败时抛出。
 */
function searchKnowledge(query, options) {
  const knowledge = loadKnowledgeFromSqlite();
  if (!knowledge) {
    const error = new Error("Knowledge base has not been built.");
    error.statusCode = 409;
    error.code = "KNOWLEDGE_NOT_BUILT";
    throw error;
  }

  const queryPlan = buildQueryPlan(query);
  const normalizedQuery = normalize(queryPlan.normalized);
  if (!normalizedQuery) {
    const error = new Error("Query is required.");
    error.statusCode = 400;
    error.code = "QUERY_REQUIRED";
    throw error;
  }

  const limit = clamp(Number(options.limit || 5), 1, 20);
  const traceId = createRetrievalTraceId();
  const traceStartedAt = Date.now();
  const cacheKey = JSON.stringify({
    indexVersion: knowledge.indexVersion || "legacy",
    mode: options.mode,
    queryHash: createHash("sha256").update(normalizedQuery).digest("hex").slice(0, 24),
    limit,
    locale: options.locale || null,
    strictLanguage: options.strictLanguage === true,
    knowledgeScope: options.knowledgeScope || "visitor_qa",
    accessScopes: normalizeAccessScopes(options.accessScopes),
    tenantId: options.tenantId || "default",
    scenicArea: options.scenicArea || null,
    documentType: options.documentType || null,
    includeExpired: options.includeExpired === true
  });
  const cacheable = !containsSensitiveQuery(query);
  const cached = cacheable ? retrievalCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) {
    const response = structuredClone({ ...cached.response, cached: true, traceId });
    recordRetrievalTrace({
      traceId,
      query,
      ...response,
      candidates: response.results.map((result, index) => ({
        id: result.id,
        rank: index + 1,
        score: result.score,
        channelRanks: result.channelRanks || []
      })),
      latencyMs: 0
    });
    return response;
  }
  if (cached) retrievalCache.delete(cacheKey);
  const tokens = tokenize(normalizedQuery);
  const queryVariants = [...new Set([
    ...queryPlan.variants,
    ...(queryPlan.subQueries || [])
  ].map((variant) => normalize(variant)).filter(Boolean))].slice(0, 6);
  const variantTokens = [...new Set(queryVariants.flatMap((variant) => tokenize(variant)))];
  const expandedTerms = expandTerms(variantTokens);
  const intents = detectIntents(queryVariants.join(" "), variantTokens);
  const spotMatches = matchSpots(normalizedQuery, tokens, knowledge.spots);
  const scopeDetection = detectOutOfScope(query);
  const eligibleChunks = scopeDetection.outOfScope
    ? []
    : (knowledge.chunks || []).filter((chunk) => passesMetadataFilter(chunk, options));
  const ruleQueries = queryPlan.subQueries?.length > 1 ? queryPlan.subQueries : [normalizedQuery];
  const ruleScored = mergeSubqueryScores(ruleQueries.map((subQuery, index) => {
    const subTokens = tokenize(normalize(subQuery));
    const subIntents = detectIntents(normalize(subQuery), subTokens);
    const subSpots = matchSpots(normalize(subQuery), subTokens, knowledge.spots);
    return eligibleChunks
      .map((chunk) => scoreChunk(chunk, {
        query: normalize(subQuery),
        tokens: subTokens,
        expandedTerms: expandTerms(subTokens),
        intents: subIntents,
        spotMatches: subSpots,
        locale: options.locale,
        mode: options.mode
      }))
      .filter((item) => item.score > 0)
      .map((item) => ({ ...item, channel: `rule_subquery_${index + 1}` }));
  }), Math.max(limit * 10, 20));

  let ranked;
  let channels = [{ name: "rule", count: ruleScored.length }];
  if (options.mode === "hybrid") {
    const bm25Index = getBm25Index(knowledge, eligibleChunks);
    const bm25Lists = queryVariants.map((variant, index) => searchBm25(bm25Index, variant, {
      limit: Math.max(limit * 10, 20)
    }).map((item) => ({ ...item, channel: `bm25_rewrite_${index + 1}` })));
    const bm25 = reciprocalRankFusion(bm25Lists, { limit: Math.max(limit * 10, 20) })
      .map((item) => ({ ...item, channel: "bm25" }));
    const preferRuleChannel = shouldPreferRuleChannel(intents, spotMatches);
    const fusedBase = reciprocalRankFusion([[
      ...ruleScored.map((item) => ({ ...item, channel: "rule" }))
    ], bm25], {
      limit: Math.max(limit * 8, 20),
      // Use intent/entity evidence to preserve deterministic exact-match
      // strengths while BM25 remains dominant for broad semantic facts.
      weights: preferRuleChannel ? [1.65, 0.35] : [0.35, 1.65]
    });
    const maxRuleScore = Math.max(...ruleScored.map((item) => item.score), 1);
    const maxBm25Score = Math.max(...bm25.map((item) => item.score), 1);
    const ruleScores = new Map(ruleScored.map((item) => [item.chunk.id, item.score]));
    const bm25Scores = new Map(bm25.map((item) => [item.chunk.id, item.score]));
    const fused = fusedBase
      .map((item) => ({
        ...item,
        // Use the measured strongest lexical channel as the deterministic
        // tie-breaker while weighted RRF remains the primary fusion score.
        score: item.score
          + ((ruleScores.get(item.chunk.id) || 0) / maxRuleScore) * (preferRuleChannel ? 0.02 : 0.002)
          + ((bm25Scores.get(item.chunk.id) || 0) / maxBm25Score) * (preferRuleChannel ? 0.002 : 0.02)
      }))
      .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
    ranked = maximalMarginalRelevance(applyFreshnessPreference(fused, intents), {
      limit,
      maxPerParent: options.maxPerParent || 2
    });
    channels = [
      { name: "rule", count: ruleScored.length },
      { name: "bm25", count: bm25.length },
      { name: "rrf", count: fused.length },
      { name: "mmr", count: ranked.length }
    ];
  } else if (options.mode === "bm25") {
    const bm25Index = getBm25Index(knowledge, eligibleChunks);
    const bm25Lists = queryVariants.map((variant, index) => searchBm25(bm25Index, variant, {
      limit: Math.max(limit * 10, 20)
    }).map((item) => ({ ...item, channel: `bm25_rewrite_${index + 1}` })));
    const bm25 = reciprocalRankFusion(bm25Lists, { limit: Math.max(limit * 8, 20) })
      .map((item) => ({ ...item, channel: "bm25" }));
    ranked = maximalMarginalRelevance(applyFreshnessPreference(bm25, intents), {
      limit,
      maxPerParent: options.maxPerParent || 2
    });
    channels = [
      { name: "bm25", count: bm25.length },
      { name: "mmr", count: ranked.length }
    ];
  } else {
    ranked = applyFreshnessPreference(ruleScored, intents).slice(0, limit);
  }
  const parentLookup = buildParentLookup(eligibleChunks);
  const results = ranked.map((item) => formatResult(item, knowledge.spots, parentLookup));
  const conflicts = detectConflictingFacts(results, intents);
  const strongestRuleScore = ranked.reduce((max, item) => Math.max(
    max,
    ...(item.channels || [])
      .filter((channel) => channel.channel === "rule")
      .map((channel) => Number(channel.score || 0))
  ), 0);
  const strongestBm25Score = ranked.reduce((max, item) => Math.max(
    max,
    ...(item.channels || [])
      .filter((channel) => channel.channel === "bm25")
      .map((channel) => Number(channel.score || 0))
  ), 0);
  const topEvidenceText = results
    .slice(0, 3)
    .map((item) => `${item.title} ${item.content}`)
    .join(" ");
  const evidenceCoverage = queryCoverage(tokens, topEvidenceText);
  const thresholds = resolveDecisionThresholds(options.locale, intents);
  const hasIndependentEvidence = strongestRuleScore >= thresholds.minRuleScore
    || strongestBm25Score >= thresholds.minBm25Score
    || spotMatches.some((match) => match.confidence >= 0.8);
  const decisionReason = scopeDetection.outOfScope
    ? "scope_blocked"
    : results.length === 0
      ? "no_candidate"
      : evidenceCoverage < thresholds.minQueryCoverage
        ? "missing_fact"
        : !hasIndependentEvidence
          ? "low_relevance"
          : "candidate_found";

  const response = {
    traceId,
    query,
    mode: options.mode,
    locale: options.locale || null,
    indexVersion: knowledge.indexVersion || getActiveKnowledgeVersion(),
    filters: {
      knowledgeScope: options.knowledgeScope || "visitor_qa",
      accessScopes: normalizeAccessScopes(options.accessScopes),
      tenantId: options.tenantId || "default",
      scenicArea: options.scenicArea || null,
      documentType: options.documentType || null,
      strictLanguage: options.strictLanguage === true,
      includeExpired: options.includeExpired === true
    },
    tokens: variantTokens,
    expandedTerms,
    queryPlan,
    intents,
    spotMatches,
    conflicts,
    channels,
    confidence: {
      strongestRuleScore,
      strongestBm25Score,
      topScore: results[0]?.score || 0,
      evidenceCoverage
    },
    decision: {
      answerable: decisionReason === "candidate_found",
      reason: decisionReason,
      blockedPlace: scopeDetection.place || null,
      thresholds: {
        ...thresholds
      }
    },
    total: results.length,
    results
  };
  if (cacheable) {
    if (retrievalCache.size >= MAX_RETRIEVAL_CACHE_ENTRIES) {
      const oldestKey = retrievalCache.keys().next().value;
      if (oldestKey) retrievalCache.delete(oldestKey);
    }
    retrievalCache.set(cacheKey, {
      response,
      expiresAt: Date.now() + RETRIEVAL_CACHE_TTL_MS
    });
  }
  recordRetrievalTrace({
    traceId,
    query,
    ...response,
    candidates: response.results.map((result, index) => ({
      id: result.id,
      rank: index + 1,
      score: result.score,
      channelRanks: result.channelRanks || []
    })),
    latencyMs: Date.now() - traceStartedAt
  });
  return structuredClone({ ...response, cached: false });
}

/**
 * 按 locale 与主意图读取审计过的阈值覆盖，缺失字段回退全局默认值。
 * @param {*} locale 请求语言。
 * @param {object[]} intents 检索意图。
 * @returns {{minRuleScore: number, minBm25Score: number, minQueryCoverage: number, profile: string}}
 */
function resolveDecisionThresholds(locale, intents = []) {
  const localeKey = String(locale || "default");
  const intentKey = String(intents[0]?.intent || "default");
  const profiles = config.rag.thresholdProfiles || {};
  const selected = profiles[localeKey]?.[intentKey]
    || profiles[localeKey]?.default
    || profiles.default?.[intentKey]
    || profiles.default?.default
    || {};
  return {
    minRuleScore: Math.max(0, Number(selected.minRuleScore ?? config.rag.minRuleScore)),
    minBm25Score: Math.max(0, Number(selected.minBm25Score ?? config.rag.minBm25Score)),
    minQueryCoverage: Math.min(1, Math.max(0, Number(selected.minQueryCoverage ?? config.rag.minQueryCoverage))),
    profile: Object.keys(selected).length > 0 ? `${localeKey}:${intentKey}` : "global"
  };
}

/**
 * 根据调参集中的稳定意图选择加权 RRF 主通道。
 * 精确票务、路线和演出规则拥有结构化业务权重；历史、亲子等开放问法优先 BM25。
 * @param {object[]} intents 检索意图。
 * @param {object[]} spotMatches 景点实体命中。
 * @returns {boolean} 是否让规则通道承担主排序。
 */
function shouldPreferRuleChannel(intents = [], spotMatches = []) {
  const names = new Set(intents.map((item) => item.intent));
  if (["ticket", "route", "family_route", "performance_time"].some((intent) => names.has(intent))) return true;
  if (["history", "highlight"].some((intent) => names.has(intent))) return false;
  return names.size === 0 && spotMatches.some((item) => item.confidence >= 0.9);
}

/**
 * 根据用途、启用状态、景区、语言和生效日期过滤候选，过滤发生在所有检索通道之前。
 * @private
 * @param {object} chunk 知识分块。
 * @param {object} options 检索选项。
 * @returns {boolean} 允许参与检索时为 `true`。
 */
function passesMetadataFilter(chunk, options) {
  const scope = chunk.knowledgeScope || "visitor_qa";
  if (scope !== (options.knowledgeScope || "visitor_qa")) return false;
  if ((chunk.tenantId || "default") !== (options.tenantId || "default")) return false;
  if (!normalizeAccessScopes(options.accessScopes).includes(chunk.accessScope || "public")) return false;
  if (chunk.enabled === false) return false;
  if (options.scenicArea && (chunk.scenicArea || "") !== options.scenicArea) return false;
  if (options.documentType && (chunk.documentType || chunk.fileType || "") !== options.documentType) return false;
  if (options.strictLanguage && options.locale && !languageMatchesExactly(chunk.language, options.locale)) return false;
  if (chunk.validFrom && new Date(chunk.validFrom).getTime() > Date.now()) return false;
  if (options.includeExpired !== true && chunk.validTo && new Date(chunk.validTo).getTime() < Date.now()) return false;
  return true;
}

/**
 * 返回不含原始问题的缓存统计，供测试和管理观测。
 * @returns {{size: number, keys: string[]}}
 */
export function getRetrievalCacheStats() {
  return { size: retrievalCache.size, keys: [...retrievalCache.keys()] };
}

/** 清空检索缓存。 @returns {void} */
export function clearRetrievalCache() {
  retrievalCache.clear();
}

/** @param {*} values 允许访问范围。 @returns {string[]} 规范化范围。 */
function normalizeAccessScopes(values) {
  const scopes = Array.isArray(values) ? values.map(String).filter(Boolean) : [];
  return scopes.length > 0 ? [...new Set(scopes)] : ["public"];
}

/** @param {*} query 查询。 @returns {boolean} 是否含不应进入缓存键或缓存值的个人信息。 */
function containsSensitiveQuery(query) {
  const text = String(query || "");
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(text)
    || /\b1\d{10}\b/u.test(text)
    || /\b\d{17}[\dXx]\b/u.test(text)
    || /(?:身份证|手机号|电话|邮箱)\s*[:：]?\s*[\w@.+-]{5,}/u.test(text);
}

/**
 * 判断文档语言与请求语言是否相同或属于同一语言族。
 * @private
 * @param {*} documentLanguage 分块语言。
 * @param {*} requestedLocale 请求语言。
 * @returns {boolean} 语种一致或同族时为 `true`。
 */
function languageMatches(documentLanguage, requestedLocale) {
  const documentCode = String(documentLanguage || "und").toLowerCase();
  const requestedCode = String(requestedLocale || "").toLowerCase();
  if (!requestedCode || documentCode === "und") return false;
  return documentCode === requestedCode
    || documentCode.split("-")[0] === requestedCode.split("-")[0];
}

/**
 * 严格区分简体与繁体中文，其余语言按规范化主语言码匹配。
 * @private
 * @param {*} documentLanguage 分块语言。
 * @param {*} requestedLocale 请求语言。
 * @returns {boolean} 精确语言匹配时为 `true`。
 */
function languageMatchesExactly(documentLanguage, requestedLocale) {
  const documentCode = normalizeLanguageFilter(documentLanguage);
  const requestedCode = normalizeLanguageFilter(requestedLocale);
  return Boolean(documentCode && requestedCode && documentCode === requestedCode);
}

/**
 * 将客户端 locale 转换为知识索引使用的精确语言值，供 Qdrant 元数据过滤使用。
 * @param {*} locale 客户端语言。
 * @returns {string|null} 索引语言；未指定时返回 `null`。
 */
function normalizeLanguageFilter(locale) {
  const normalized = String(locale || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/^zh-(tw|hk|mo|hant)/u.test(normalized)) return "zh-TW";
  if (normalized.startsWith("zh")) return "zh";
  return normalized.split("-")[0] || null;
}

/**
 * 按知识版本复用 BM25 索引，版本变化时自动丢弃旧统计量。
 * @private
 * @param {object} knowledge 知识快照。
 * @param {object[]} chunks 已过滤分块。
 * @returns {object} BM25索引。
 */
function getBm25Index(knowledge, chunks) {
  const version = knowledge.indexVersion || "legacy";
  const signature = chunks.map((chunk) => chunk.id).join("\u001f");
  const cacheKey = `${version}:${signature}`;
  const cached = bm25Indexes.get(cacheKey);
  if (cached) return cached;
  const index = buildBm25Index(chunks);
  bm25Indexes.clear();
  bm25Indexes.set(cacheKey, index);
  return index;
}

/**
 * 根据语种、景点实体、关键词、扩展词、意图与查询覆盖度为单个知识分块评分。
 * @private
 * @param {object} chunk 知识分块。
 * @param {object} context 查询分析上下文。
 * @returns {{chunk: object, score: number, reasons: string[]}} 分块、总分和去重后的评分理由。
 */
function scoreChunk(chunk, context) {
  const title = normalize(chunk.title);
  const content = normalize(chunk.content);
  const keywordText = normalize((chunk.keywords || []).join(" "));
  const reasons = [];
  let score = 0;

  if (context.locale && languageMatches(chunk.language, context.locale)) {
    score += 30;
    reasons.push(`语种匹配：${context.locale}`);
  }

  for (const spot of context.spotMatches) {
    if (chunk.scenicSpotId === spot.id) {
      score += context.mode === "hybrid" ? 42 : 34;
      reasons.push(`景点实体命中：${spot.name}`);
    } else if (title.includes(spot.name) || content.includes(spot.name)) {
      score += 20;
      reasons.push(`景点名称命中：${spot.name}`);
    }
  }

  for (const token of context.tokens) {
    if (!token) {
      continue;
    }

    if (title.includes(token)) {
      score += 14;
      reasons.push(`标题命中：${token}`);
    }

    if (keywordText.includes(token)) {
      score += 9;
      reasons.push(`关键词命中：${token}`);
    }

    const count = countOccurrences(content, token);
    if (count > 0) {
      score += Math.min(count * 3, 18);
      reasons.push(`正文命中：${token}`);
    }
  }

  for (const term of context.expandedTerms) {
    if (content.includes(term) || title.includes(term) || keywordText.includes(term)) {
      score += 4;
      reasons.push(`扩展词命中：${term}`);
    }
  }

  for (const intent of context.intents) {
    const intentScore = scoreIntent(chunk, { title, content, keywordText, intent });
    if (intentScore.score > 0) {
      score += intentScore.score;
      reasons.push(...intentScore.reasons);
    }
    const directScore = scoreDirectIntent(chunk, intent);
    if (directScore.score > 0) {
      score += directScore.score;
      reasons.push(...directScore.reasons);
    }
  }

  if (context.mode === "hybrid") {
    const coverage = queryCoverage(context.tokens, `${title} ${keywordText} ${content}`);
    score += Math.round(coverage * 18);
    if (coverage > 0) {
      reasons.push(`查询覆盖度：${coverage.toFixed(2)}`);
    }

    if (score > 0 && chunk.documentId === "doc_structured_lingshan_spots") {
      score += 6;
      reasons.push("结构化景点资料加权");
    }
  }

  return {
    chunk,
    score,
    reasons: [...new Set(reasons)]
  };
}

/**
 * 为景区概况、最佳季节、入园时间、餐饮、亲子和特定事实意图施加强规则加权。
 * @private
 * @param {object} chunk 知识分块。
 * @param {RetrievalIntent} intent 检索意图。
 * @returns {{score: number, reasons: string[]}} 直接意图加分及理由。
 */
function scoreDirectIntent(chunk, intent) {
  const raw = `${chunk.title} ${chunk.content}`;
  const reasons = [];
  let score = 0;

  if (intent.intent === "overview" && /(景区概况|马山镇|太湖西北部|占地面积|国家5A|30万平方米)/.test(raw)) {
    score += 70;
    reasons.push("景区概况事实信息加权");
  }

  if (intent.intent === "best_time" && /(最佳游览时间|春秋季节|3-5月|9-11月|季节选择)/.test(raw)) {
    score += 80;
    reasons.push("最佳游览时间信息加权");
  }

  if (intent.intent === "entry_time" && /(建议上午9点前入园|人流高峰|时间安排)/.test(raw)) {
    score += 90;
    reasons.push("入园时间建议信息加权");
  }

  if (intent.intent === "dining" && /(梵宫素斋|自助|50元|餐饮)/.test(raw)) {
    score += 100;
    reasons.push("餐饮信息加权");
  }

  if (intent.intent === "family_route" && /(亲子家庭路线|轻松游|百子戏弥勒|孩子|family route|가족|아이|ファミリールート|子ども|親子輕鬆路線|百子戲彌勒|เส้นทางครอบครัว|เด็ก)/iu.test(raw)) {
    score += 90;
    reasons.push("亲子轻松路线加权");
  }

  if (intent.intent === "specific_fact" && /(祥符禅钟|12\.8吨|声明|因明|内明|医方明|工巧明|1997年11月15日|赵朴初|五方五佛)/.test(raw)) {
    score += 75;
    reasons.push("具体事实信息加权");
  }

  return { score, reasons };
}

/**
 * 将内部评分项转换为对外检索结果并附加景点和引用。
 * @private
 * @param {{chunk: object, score: number, reasons: string[]}} item 评分项。
 * @param {object[]} spots 景点知识列表。
 * @returns {RetrievalResult} 对外检索结果。
 */
function formatResult(item, spots, parentLookup = new Map()) {
  const spot = spots.find((candidate) => candidate.id === item.chunk.scenicSpotId);
  const citation = createCitation(item.chunk, spot);
  const parent = parentLookup.get(item.chunk.parentId || item.chunk.id);
  return {
    id: item.chunk.id,
    score: item.score,
    title: item.chunk.title,
    content: item.chunk.content,
    contextContent: parent?.content || item.chunk.content,
    parentContent: parent?.content || item.chunk.content,
    parentChunkIds: parent?.chunkIds || [item.chunk.id],
    source: item.chunk.source,
    documentId: item.chunk.documentId,
    scenicSpotId: item.chunk.scenicSpotId,
    scenicSpotName: spot?.name || null,
    keywords: item.chunk.keywords || [],
    parentId: item.chunk.parentId || null,
    sectionPath: item.chunk.sectionPath || null,
    page: item.chunk.page || null,
    sheetName: item.chunk.sheetName || null,
    range: item.chunk.range || null,
    rowStart: item.chunk.rowStart || null,
    rowEnd: item.chunk.rowEnd || null,
    knowledgeScope: item.chunk.knowledgeScope || "visitor_qa",
    documentType: item.chunk.documentType || item.chunk.fileType || null,
    indexVersion: item.chunk.indexVersion || null,
    channelRanks: item.channels || [],
    mmrScore: item.mmrScore ?? null,
    citation,
    reasons: item.reasons
  };
}

/**
 * 从知识分块构建结构化引用。
 * @private
 * @param {object} chunk 知识分块。
 * @param {object|undefined} spot 对应景点。
 * @returns {Citation} 引用对象。
 */
function createCitation(chunk, spot) {
  return {
    citationId: `C-${chunk.id}`,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.source,
    sectionTitle: chunk.title,
    scenicSpotId: chunk.scenicSpotId,
    scenicSpotName: spot?.name || null,
    quote: summarizeCitation(chunk.content),
    page: chunk.page || null,
    sheetName: chunk.sheetName || null,
    range: chunk.range || null,
    rowStart: chunk.rowStart || null,
    rowEnd: chunk.rowEnd || null,
    indexVersion: chunk.indexVersion || null
  };
}

/**
 * 检测多个候选来源对同一类时间或价格事实给出不同值的情况。
 * 过期内容已在候选过滤阶段排除；仍然同时有效的不同来源只记录冲突，不擅自合并。
 * @param {object[]} results 已格式化候选。
 * @param {object[]} intents 当前查询意图。
 * @returns {Array<{field: string, values: string[], citations: string[]}>} 冲突审计摘要。
 */
export function detectConflictingFacts(results, intents = []) {
  const fields = [];
  if (intents.some((intent) => ["open_time", "performance_time"].includes(intent.intent))) {
    fields.push({ name: "time", pattern: /\b\d{1,2}:\d{2}\b/gu });
  }
  if (intents.some((intent) => intent.intent === "ticket")) {
    fields.push({ name: "price", pattern: /\b\d+(?:\.\d+)?\s*元\b/gu });
  }
  fields.push({
    name: "opening_status",
    pattern: /(?:临时闭园|临时关闭|暂停开放|暂停营业|正常开放|恢复开放|闭馆)/gu
  });
  return fields.flatMap(({ name, pattern }) => {
    const values = new Map();
    for (const result of results.slice(0, 8)) {
      const facts = [...new Set(String(result.content || "").match(pattern) || [])];
      for (const fact of facts) {
        const entry = values.get(fact) || [];
        entry.push(result.citation?.citationId || result.id);
        values.set(fact, entry);
      }
    }
    if (values.size <= 1) return [];
    return [{
      field: name,
      values: [...values.keys()],
      citations: [...new Set([...values.values()].flat())]
    }];
  });
}

/**
 * 对票价、开放和演出类候选施加受限时效加权，只作为相关性相近时的次级排序。
 * 已过期资料仍由元数据过滤器直接排除。
 * @param {object[]} candidates 内部候选。
 * @param {object[]} intents 查询意图。
 * @returns {object[]} 带时效理由的候选副本。
 */
export function applyFreshnessPreference(candidates, intents = []) {
  const timeSensitive = intents.some((intent) => ["ticket", "open_time", "performance_time"].includes(intent.intent));
  if (!timeSensitive || candidates.length < 2) return candidates;
  const timestamps = candidates.map((candidate) => Date.parse(
    candidate.chunk.validFrom || candidate.chunk.updatedAt || candidate.chunk.createdAt || ""
  ));
  const finite = timestamps.filter(Number.isFinite);
  if (finite.length < 2) return candidates;
  const oldest = Math.min(...finite);
  const newest = Math.max(...finite);
  if (newest <= oldest) return candidates;
  const maxScore = Math.max(...candidates.map((candidate) => Math.abs(Number(candidate.score) || 0)), 1);
  return candidates.map((candidate, index) => {
    const timestamp = timestamps[index];
    if (!Number.isFinite(timestamp)) return candidate;
    const freshness = (timestamp - oldest) / (newest - oldest);
    return {
      ...candidate,
      score: Number(candidate.score || 0) + maxScore * 0.03 * freshness,
      reasons: freshness > 0
        ? [...(candidate.reasons || []), `有效资料时效加权：${new Date(timestamp).toISOString().slice(0, 10)}`]
        : candidate.reasons || []
    };
  }).sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
}

/**
 * 合并多个子问题的规则检索结果，保留同一 child 的最高相关性与全部理由。
 * @private
 * @param {Array<Array<{chunk: object, score: number, reasons: string[], channel: string}>>} rankedLists 子问题排序列表。
 * @param {number} limit 最大候选数。
 * @returns {Array<{chunk: object, score: number, reasons: string[], channels: object[]}>} 合并候选。
 */
function mergeSubqueryScores(rankedLists, limit) {
  const merged = new Map();
  for (const list of rankedLists) {
    for (const item of list) {
      const current = merged.get(item.chunk.id) || {
        chunk: item.chunk,
        score: 0,
        reasons: [],
        channels: []
      };
      current.score = Math.max(current.score, item.score);
      current.reasons.push(...(item.reasons || []));
      current.channels.push({
        channel: item.channel,
        score: item.score
      });
      merged.set(item.chunk.id, current);
    }
  }
  return [...merged.values()]
    .map((item) => ({ ...item, reasons: [...new Set(item.reasons)] }))
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, limit);
}

/**
 * 按 parentId 聚合同一章节、页、工作表或景点的 child 分块。
 *
 * 检索排序仍然以 child 为单位，因此引用可以精确指向命中的页码、行号或
 * child ID；提示词使用 `contextContent` 回取 parent，获得完整上下文。
 * 只从已通过元数据过滤的分块构建，避免禁用或跨范围资料被带回。
 * @private
 * @param {object[]} chunks 已过滤的知识分块。
 * @returns {Map<string, {content: string, chunkIds: string[]}>} parent 内容索引。
 */
function buildParentLookup(chunks) {
  const grouped = new Map();
  for (const chunk of chunks) {
    const parentId = chunk.parentId || chunk.id;
    const entry = grouped.get(parentId) || { chunks: [] };
    entry.chunks.push(chunk);
    grouped.set(parentId, entry);
  }

  return new Map([...grouped.entries()].map(([parentId, entry]) => {
    const ordered = [...entry.chunks].sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
    const content = ordered.reduce((combined, chunk) => appendParentContent(combined, chunk.content), "").trim();
    return [parentId, {
      content: content || ordered[0]?.content || "",
      chunkIds: ordered.map((chunk) => chunk.id)
    }];
  }));
}

/**
 * 合并带重叠窗口的 child 正文，去掉相邻块之间的重复前缀。
 * @private
 * @param {string} current 已合并正文。
 * @param {*} next 下一个 child 正文。
 * @returns {string} 合并后的正文。
 */
function appendParentContent(current, next) {
  const value = String(next || "").trim();
  if (!current) return value;
  if (!value) return current;

  const normalizedCurrent = current.replace(/\s+$/u, "");
  const normalizedNext = value.replace(/^\s+/u, "");
  const maxOverlap = Math.min(160, normalizedCurrent.length, normalizedNext.length);
  for (let length = maxOverlap; length >= 24; length -= 1) {
    if (normalizedCurrent.endsWith(normalizedNext.slice(0, length))) {
      return `${normalizedCurrent}${normalizedNext.slice(length)}`;
    }
  }
  return `${normalizedCurrent}\n${normalizedNext}`;
}

/**
 * 将引用正文压缩为空白规范且不超过约 120 字符的摘要。
 * @private
 * @param {*} content 分块正文。
 * @returns {string} 引用摘要。
 */
function summarizeCitation(content) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 118)}...`;
}

/**
 * 按精确别名或排除通用词后的局部词匹配景点实体。
 * @private
 * @param {string} query 已规范化查询。
 * @param {string[]} tokens 查询词。
 * @param {object[]} spots 景点列表。
 * @returns {SpotMatch[]} 景点匹配及置信度。
 */
function matchSpots(query, tokens, spots) {
  const matches = [];

  for (const spot of spots) {
    const aliases = spot.aliases || [spot.name];
    const matchedAlias = aliases.find((alias) => query.includes(normalize(alias)));
    if (matchedAlias) {
      matches.push({
        id: spot.id,
        name: spot.name,
        alias: matchedAlias,
        confidence: matchedAlias === spot.name ? 1 : 0.86
      });
      continue;
    }

    const partial = aliases.find((alias) => {
      const normalizedAlias = normalize(alias);
      return tokens.some((token) =>
        !genericSpotTokens.has(token) &&
        (normalizedAlias.includes(token) || token.includes(normalizedAlias))
      );
    });

    if (partial) {
      matches.push({
        id: spot.id,
        name: spot.name,
        alias: partial,
        confidence: 0.58
      });
    }
  }

  return matches;
}

/**
 * 使用通用同义词、主题词和直接事实同义词扩展查询词。
 * @private
 * @param {string[]} tokens 原始查询词。
 * @returns {string[]} 去重后的检索词。
 */
function expandTerms(tokens) {
  const terms = new Set();
  for (const token of tokens) {
    terms.add(token);
    for (const [key, values] of Object.entries(querySynonyms)) {
      if (token.includes(key) || key.includes(token)) {
        for (const value of values) {
          terms.add(value);
        }
      }
    }
  }

  for (const topic of topicKeywords) {
    if (tokens.some((token) => topic.includes(token) || token.includes(topic))) {
      terms.add(topic);
    }
  }

  const queryText = tokens.join("");
  for (const [key, values] of Object.entries(directQuerySynonyms)) {
    const normalizedKey = normalize(key);
    if (queryText.includes(normalizedKey)) {
      for (const value of values) {
        terms.add(normalize(value));
      }
    }
  }

  return [...terms].filter(Boolean);
}

/**
 * 根据规范化查询和查询词识别全部业务意图。
 * @private
 * @param {string} query 规范化查询。
 * @param {string[]} tokens 查询词。
 * @returns {RetrievalIntent[]} 命中的意图及偏好字段。
 */
function detectIntents(query, tokens) {
  const intents = [];

  for (const rule of intentRules) {
    if (rule.triggers.some((trigger) => query.includes(trigger) || tokens.includes(trigger))) {
      intents.push({
        intent: rule.intent,
        preferredTerms: rule.preferredTerms,
        preferredDocuments: rule.preferredDocuments
      });
    }
  }

  for (const rule of directIntentRules) {
    if (rule.triggers.some((trigger) => query.includes(normalize(trigger)) || tokens.includes(normalize(trigger)))) {
      intents.push({
        intent: rule.intent,
        preferredTerms: rule.preferredTerms,
        preferredDocuments: rule.preferredDocuments
      });
    }
  }

  return intents;
}

/**
 * 按偏好文档、偏好字段和事实模式计算通用意图加分。
 * @private
 * @param {object} chunk 知识分块。
 * @param {{title: string, content: string, keywordText: string, intent: RetrievalIntent}} context 评分上下文。
 * @returns {{score: number, reasons: string[]}} 意图加分及理由。
 */
function scoreIntent(chunk, context) {
  const reasons = [];
  let score = 0;
  const haystack = `${context.title} ${context.keywordText} ${context.content}`;

  if (context.intent.preferredDocuments.includes(chunk.documentId)) {
    score += 8;
    reasons.push(`意图文档加权：${context.intent.intent}`);
  }

  let termHits = 0;
  for (const term of context.intent.preferredTerms) {
    if (haystack.includes(normalize(term))) {
      termHits += 1;
    }
  }

  if (termHits > 0) {
    score += Math.min(termHits * 7, 28);
    reasons.push(`意图字段命中：${context.intent.intent}`);
  }

  if (context.intent.intent === "ticket" && /(\d+元|成人票|半价|免票|门票|票价)/.test(context.content)) {
    score += 24;
    reasons.push("票价事实信息加权");
  }

  if (context.intent.intent === "performance_time" && /(\d{1,2}:\d{2}|演出|表演|时长|场)/.test(context.content)) {
    score += 18;
    reasons.push("演出时间事实信息加权");
  }

  if (context.intent.intent === "open_time" && /(\d{1,2}:\d{2}|开放|闭馆|全天)/.test(context.content)) {
    score += 18;
    reasons.push("开放时间事实信息加权");
  }

  if (context.intent.intent === "height" && /(\d+(\.\d+)?m|\d+(\.\d+)?米|通高|总高|高度)/i.test(context.content)) {
    score += 18;
    reasons.push("高度参数事实信息加权");
  }

  if (context.intent.intent === "route" && /(路线规划|小时|入园|出口|推荐|亲子|自然|历史)/.test(context.content)) {
    score += 18;
    reasons.push("路线规划信息加权");
  }

  if (context.intent.intent === "history" && /(玄奘|小灵山|灵鹫山|唐贞观|渊源|历史)/.test(context.content)) {
    score += 18;
    reasons.push("历史文化信息加权");
  }

  return {
    score,
    reasons
  };
}

/**
 * 规范化并拆分查询，同时保留主题词、同义词键和多语言景点专名。
 * @private
 * @param {*} query 查询文本。
 * @returns {string[]} 去重且长度至少为二的查询词。
 */
function tokenize(query) {
  const clean = normalize(query);
  const terms = new Set();
  const parts = clean
    .split(/[，。！？、,.!?;；:：\s]+/u)
    .map((item) => item.trim())
    .filter((item) => item && !stopWords.has(item));

  for (const part of parts) {
    terms.add(part);
  }

  for (const topic of topicKeywords) {
    if (clean.includes(topic)) {
      terms.add(topic);
    }
  }

  for (const key of Object.keys(querySynonyms)) {
    if (clean.includes(key)) {
      terms.add(key);
    }
  }

  const scenicNouns = [
    "灵山胜境", "灵山大佛", "九龙灌浴", "灵山梵宫", "五印坛城", "祥符禅寺", "大佛", "梵宫",
    "拈花湾禅意小镇", "拈花湾", "拈花广场", "五灯湖", "鹿鸣谷",
    "lingshan grand buddha", "nine dragons bathing", "brahma palace", "five mudra mandala", "xiangfu chan temple",
    "링산대불", "구룡관욕", "링산 범궁", "오인단성", "상부선사",
    "靈山大佛", "九龍灌浴", "靈山梵宮", "五印壇城", "祥符禪寺", "拈花灣禪意小鎮", "拈花灣", "拈花廣場", "五燈湖", "鹿鳴谷",
    "霊山大仏", "九龍灌浴", "霊山梵宮", "五印壇城", "祥符禅寺",
    "พระใหญ่หลิงซาน", "เก้ามังกรสรงน้ำ", "พระราชวังฝานกงหลิงซาน", "วิหารห้าตราประทับ", "วัดเซียงฝูฉาน"
  ];
  for (const noun of scenicNouns) {
    if (clean.includes(noun)) {
      terms.add(noun);
    }
  }

  return [...terms].filter((term) => term.length >= 2 && !stopWords.has(term));
}

/**
 * 计算查询词在目标文本中的覆盖比例。
 * @private
 * @param {string[]} tokens 查询词。
 * @param {string} text 已规范化目标文本。
 * @returns {number} 0 至 1 的覆盖率。
 */
function queryCoverage(tokens, text) {
  if (tokens.length === 0) {
    return 0;
  }

  const hitCount = tokens.filter((token) => text.includes(token)).length;
  return hitCount / tokens.length;
}

/**
 * 统计非重叠子串出现次数。
 * @private
 * @param {string} text 目标文本。
 * @param {string} term 子串。
 * @returns {number} 出现次数。
 */
function countOccurrences(text, term) {
  if (!term) {
    return 0;
  }

  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

/**
 * 对检索文本执行 NFKC、转小写、合并空白和首尾清理。
 * @private
 * @param {*} value 原始值。
 * @returns {string} 规范化文本。
 */
function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 将数值限制在闭区间；`NaN` 回退到下界。
 * @private
 * @param {number} value 候选数值。
 * @param {number} min 下界。
 * @param {number} max 上界。
 * @returns {number} 区间内数值。
 */
function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * 为复合检索阶段设置总预算，避免多个子问题把远程等待时间线性放大。
 * @private
 * @template T
 * @param {Promise<T>} promise 待限制的异步任务。
 * @param {number} timeoutMs 总预算毫秒数。
 * @param {string} code 稳定错误码。
 * @returns {Promise<T>} 原任务结果。
 */
async function withTimeout(promise, timeoutMs, code) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Retrieval stage exceeded ${timeoutMs}ms.`);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
