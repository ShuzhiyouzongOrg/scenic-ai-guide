/**
 * @fileoverview 灵山知识库的关键词与混合检索、实体识别、意图加权和引用生成服务。
 *
 * @typedef {{intent: string, preferredTerms: string[], preferredDocuments: string[]}} RetrievalIntent
 * @typedef {{id: string, name: string, alias: string, confidence: number}} SpotMatch
 * @typedef {{chunkId: string, documentId: string, documentName: string, sectionTitle: string, scenicSpotId: string|null, scenicSpotName: string|null, quote: string}} Citation
 * @typedef {{id: string, score: number, title: string, content: string, source: string, documentId: string, scenicSpotId: string|null, scenicSpotName: string|null, keywords: string[], citation: Citation, reasons: string[]}} RetrievalResult
 */
import { loadKnowledge } from "./knowledgeBuild.mjs";

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
  "見どころ": ["特徴", "体験", "名所"],
  "幾點": ["時間", "開放", "表演", "時段"],
  "門票": ["票價", "費用", "成人票", "半價票"],
  "路線": ["遊覽路線", "推薦路線", "時長"],
  "看點": ["亮點", "特色", "最佳體驗"]
};

/** @type {Array<RetrievalIntent & {triggers: string[]}>} 通用业务意图识别与加权规则。 */
const intentRules = [
  {
    intent: "height",
    triggers: ["多高", "高度", "通高", "总高", "几米", "how tall", "height", "tall", "높이", "몇 미터", "高さ", "何メートル", "幾公尺"],
    preferredTerms: ["高", "高度", "通高", "总高", "建筑/景观参数", "米", "m", "88 meters", "88미터", "88メートル", "88 公尺"],
    preferredDocuments: ["doc_structured_lingshan_spots"]
  },
  {
    intent: "open_time",
    triggers: ["开放", "开放时间", "几点开", "几点关", "闭馆", "营业", "opening hours", "open", "close", "운영 시간", "개장", "폐장", "営業時間", "開園", "閉園", "開放時間"],
    preferredTerms: ["开放", "开放时间", "闭馆", "运营", "演艺/开放信息", "opening", "closing", "운영 시간", "営業時間", "開放時間"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "performance_time",
    triggers: ["演出", "几点", "表演", "吉祥颂", "场次", "时长", "show", "performance", "start", "공연", "몇 시", "시작", "上演", "何時", "開始", "表演", "幾點"],
    preferredTerms: ["演出", "表演", "时间", "时长", "10:35", "11:30", "14:00", "16:00", "吉祥颂", "show", "performance", "공연", "上演", "表演"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "ticket",
    triggers: ["门票", "票价", "多少钱", "费用", "成人票", "半价", "免票", "ticket", "admission", "price", "입장권", "요금", "入場券", "料金", "門票", "票價"],
    preferredTerms: ["门票", "票价", "费用", "成人票", "半价", "免票", "210", "105", "ticket", "admission", "입장권", "入場券", "門票"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "route",
    triggers: ["路线", "游览", "推荐", "几小时", "半日", "route", "itinerary", "recommend", "관람 경로", "경로", "추천", "ルート", "提案", "路線", "推薦"],
    preferredTerms: ["路线", "路线规划", "推荐", "历史文化爱好者路线", "自然风光爱好者路线", "亲子家庭路线", "小时", "route", "itinerary", "경로", "ルート", "路線"],
    preferredDocuments: ["doc_lingshan_guide"]
  },
  {
    intent: "highlight",
    triggers: ["看点", "亮点", "特色", "怎么玩", "拍照", "打卡", "highlight", "highlights", "what to see", "볼거리", "특징", "見どころ", "特徴", "看點", "亮點"],
    preferredTerms: ["看点", "亮点", "特色", "游玩亮点", "最佳体验", "拍照", "打卡", "highlights", "볼거리", "見どころ", "看點"],
    preferredDocuments: ["doc_structured_lingshan_spots", "doc_lingshan_guide"]
  },
  {
    intent: "history",
    triggers: ["历史", "玄奘", "小灵山", "灵鹫山", "起源", "渊源", "关系", "history", "origin", "Xuanzang", "역사", "현장", "歴史", "玄奘", "歷史", "淵源"],
    preferredTerms: ["历史", "玄奘", "小灵山", "灵鹫山", "佛教缘起", "渊源", "唐贞观", "history", "Xuanzang", "역사", "歴史", "歷史"],
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
    triggers: ["孩子", "亲子", "轻松"],
    preferredTerms: ["亲子家庭路线", "轻松游", "百子戏弥勒", "孩子"],
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
  "歷史"
];

/** @type {Set<string>} 英文检索停用词。 */
const stopWords = new Set([
  "a", "an", "and", "are", "at", "for", "how", "in", "is", "me", "of", "on", "please", "the", "to", "what", "when",
  "about", "does", "recommend", "tell", "you", "your"
]);

/** @type {Set<string>} 不足以进行景点局部匹配的通用灵山名称。 */
const genericSpotTokens = new Set(["灵山", "靈山", "霊山", "lingshan", "링산"]);

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
 * 执行共享检索流程：加载知识、规范化、分词、扩展、意图和实体识别、评分与格式化。
 * @private
 * @param {*} query 查询文本。
 * @param {{mode: "keyword"|"hybrid", limit?: number, locale?: string}} options 检索选项。
 * @returns {{query: *, mode: string, locale: string|null, tokens: string[], expandedTerms: string[], intents: RetrievalIntent[], spotMatches: SpotMatch[], total: number, results: RetrievalResult[]}} 检索响应。
 * @throws {Error} 知识库未构建、查询为空或知识数据读取失败时抛出。
 */
function searchKnowledge(query, options) {
  const knowledge = loadKnowledge();
  if (!knowledge) {
    const error = new Error("Knowledge base has not been built.");
    error.statusCode = 409;
    error.code = "KNOWLEDGE_NOT_BUILT";
    throw error;
  }

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    const error = new Error("Query is required.");
    error.statusCode = 400;
    error.code = "QUERY_REQUIRED";
    throw error;
  }

  const limit = clamp(Number(options.limit || 5), 1, 20);
  const tokens = tokenize(normalizedQuery);
  const expandedTerms = expandTerms(tokens);
  const intents = detectIntents(normalizedQuery, tokens);
  const spotMatches = matchSpots(normalizedQuery, tokens, knowledge.spots);
  const scored = knowledge.chunks
    .map((chunk) => scoreChunk(chunk, {
      query: normalizedQuery,
      tokens,
      expandedTerms,
      intents,
      spotMatches,
      locale: options.locale,
      mode: options.mode
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.chunk.id.localeCompare(right.chunk.id);
    })
    .slice(0, limit)
    .map((item) => formatResult(item, knowledge.spots));

  return {
    query,
    mode: options.mode,
    locale: options.locale || null,
    tokens,
    expandedTerms,
    intents,
    spotMatches,
    total: scored.length,
    results: scored
  };
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

  if (context.locale && chunk.language === context.locale) {
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

  if (intent.intent === "family_route" && /(亲子家庭路线|轻松游|百子戏弥勒|孩子)/.test(raw)) {
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
function formatResult(item, spots) {
  const spot = spots.find((candidate) => candidate.id === item.chunk.scenicSpotId);
  const citation = createCitation(item.chunk, spot);
  return {
    id: item.chunk.id,
    score: item.score,
    title: item.chunk.title,
    content: item.chunk.content,
    source: item.chunk.source,
    documentId: item.chunk.documentId,
    scenicSpotId: item.chunk.scenicSpotId,
    scenicSpotName: spot?.name || null,
    keywords: item.chunk.keywords || [],
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
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.source,
    sectionTitle: chunk.title,
    scenicSpotId: chunk.scenicSpotId,
    scenicSpotName: spot?.name || null,
    quote: summarizeCitation(chunk.content)
  };
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
    "lingshan grand buddha", "nine dragons bathing", "brahma palace", "five mudra mandala", "xiangfu chan temple",
    "링산대불", "구룡관욕", "링산 범궁", "오인단성", "상부선사",
    "靈山大佛", "九龍灌浴", "靈山梵宮", "五印壇城", "祥符禪寺",
    "霊山大仏", "九龍灌浴", "霊山梵宮", "五印壇城", "祥符禅寺"
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
