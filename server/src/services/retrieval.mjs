/**
 * @fileoverview 灵山知识库的关键词与混合检索、实体识别、意图加权和引用生成服务。
 * @description
 * 组合关键词、BM25 与远程稠密检索，执行实体识别、意图加权、冲突检测和引用生成。
 */

/**
 * @typedef {object} RetrievalIntent
 * @description 查询识别出的业务意图及其检索偏好。
 * @property {string} intent 意图标识。
 * @property {string[]} preferredTerms 优先匹配的事实词项。
 * @property {string[]} preferredDocuments 优先匹配的文档 ID。
 */

/**
 * @typedef {object} SpotMatch
 * @description 查询文本命中的景点实体。
 * @property {string} id 景点 ID。
 * @property {string} name 标准景点名称。
 * @property {string} alias 实际命中的名称或别名。
 * @property {number} confidence 实体匹配置信度。
 */

/**
 * @typedef {object} Citation
 * @description 指向知识分块及原始文档位置的结构化引用。
 * @property {string} citationId 对外引用 ID。
 * @property {string} chunkId 分块 ID。
 * @property {string} documentId 文档 ID。
 * @property {string} documentName 文档名称。
 * @property {string} sectionTitle 章节标题。
 * @property {string|null} scenicSpotId 景点 ID。
 * @property {string|null} scenicSpotName 景点名称。
 * @property {string} quote 不超过约 120 字符的引用摘要。
 * @property {number|null} page PDF 页码。
 * @property {string|null} sheetName XLSX 工作表名称。
 * @property {string|null} range XLSX 单元格范围。
 * @property {number|null} rowStart XLSX 起始行号。
 * @property {number|null} rowEnd XLSX 结束行号。
 * @property {string|null} indexVersion 索引版本。
 */

/**
 * @typedef {object} RetrievalResult
 * @description 已排序并补充上下文、实体和引用的检索结果。
 * @property {string} id 分块 ID。
 * @property {number} score 最终相关性分数。
 * @property {string} title 分块标题。
 * @property {string} content 分块正文。
 * @property {string} contextContent 所属父级上下文正文。
 * @property {string} parentContent 父级分块正文。
 * @property {string[]} parentChunkIds 父级覆盖的子分块 ID。
 * @property {string} source 来源文档名称。
 * @property {string} documentId 来源文档 ID。
 * @property {string|null} scenicArea 所属景区。
 * @property {string|null} scenicSpotId 景点 ID。
 * @property {string|null} scenicSpotName 景点名称。
 * @property {string[]} keywords 检索关键词。
 * @property {string|null} parentId 父级分块 ID。
 * @property {string|null} sectionPath 章节路径。
 * @property {number|null} page PDF 页码。
 * @property {string|null} sheetName XLSX 工作表名称。
 * @property {string|null} range XLSX 单元格范围。
 * @property {number|null} rowStart XLSX 起始行号。
 * @property {number|null} rowEnd XLSX 结束行号。
 * @property {string} knowledgeScope 知识用途范围。
 * @property {string|null} documentType 文档类型。
 * @property {string|null} indexVersion 索引版本。
 * @property {object[]} channelRanks 各检索通道的排名信息。
 * @property {number|null} mmrScore MMR 多样性分数。
 * @property {Citation} citation 结构化引用。
 * @property {string[]} reasons 评分理由。
 */

/**
 * @typedef {object} RetrievalSearchOptions
 * @description 本地与远程检索共用的过滤和排序选项。
 * @property {number} [limit] 最大结果数，最终限制在 1 至 20。
 * @property {string} [locale] 查询语言。
 * @property {string} [scenicArea] 景区过滤值。
 * @property {string} [documentType] 文档类型过滤值。
 * @property {string} [knowledgeScope] 知识用途范围，默认为 `visitor_qa`。
 * @property {boolean} [strictLanguage] 是否严格匹配文档语言。
 * @property {string} [tenantId] 租户标识，默认为 `default`。
 * @property {string[]} [accessScopes] 可访问的知识范围，默认为 `public`。
 * @property {boolean} [includeExpired] 是否包含已过期资料。
 * @property {number} [maxPerParent] MMR 每个父级允许保留的最大候选数。
 */

/**
 * @typedef {object} RetrievalSearchResponse
 * @description 一次检索的查询分析、决策、候选和追踪信息。
 * @property {string} traceId 检索追踪 ID。
 * @property {*} query 原始查询。
 * @property {"keyword"|"hybrid"|"bm25"} mode 检索模式。
 * @property {string|null} locale 查询语言。
 * @property {string} indexVersion 索引版本。
 * @property {object} filters 实际应用的元数据过滤条件。
 * @property {string[]} tokens 查询词。
 * @property {string[]} expandedTerms 同义扩展词。
 * @property {object} queryPlan 查询改写和子问题计划。
 * @property {RetrievalIntent[]} intents 识别出的业务意图。
 * @property {SpotMatch[]} spotMatches 景点实体命中。
 * @property {RetrievalConflict[]} conflicts 多来源事实冲突。
 * @property {object[]} channels 各检索通道的候选统计。
 * @property {object} confidence 检索置信度指标。
 * @property {object} decision 可回答性决策。
 * @property {number} total 返回结果数。
 * @property {RetrievalResult[]} results 排序后的检索结果。
 * @property {boolean} cached 是否命中版本化检索缓存。
 */

/**
 * @typedef {object} RetrievalConflict
 * @description 同一事实作用域内的多来源冲突。
 * @property {string} field 冲突字段。
 * @property {string[]} values 不同事实值。
 * @property {string[]} citations 相关引用 ID。
 */

/**
 * @typedef {object} RemoteRetrievalInfo
 * @description 托管向量和重排通道的运行状态。
 * @property {string} status 远程通道状态。
 * @property {boolean} dense 是否完成稠密检索。
 * @property {boolean} reranked 是否完成远程重排。
 * @property {boolean} degraded 是否发生降级。
 * @property {string|null} reason 降级或未启用原因。
 * @property {string[]} [configurationIssues] 缺失或冲突的配置项。
 * @property {object} [model] 实际使用的向量和重排模型。
 * @property {object} [latencyMs] 各远程阶段的毫秒时延。
 * @property {object|null} [usage] 向量模型用量。
 * @property {number} [queryCount] 执行的稠密子查询数量。
 */

/**
 * @typedef {object} RankedRetrievalCandidate
 * @description 排序流程内部使用的知识分块候选。
 * @property {object} chunk 知识分块。
 * @property {number} score 当前排序分数。
 * @property {string[]} reasons 评分理由。
 * @property {object[]} [channels] 各检索通道分数。
 * @property {number} [mmrScore] MMR 多样性分数。
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

/**
 * @description
 * 按知识版本缓存的 BM25 统计量。
 * @type {Map<string, object>} 按知识版本缓存的 BM25 统计量。
 */
const bm25Indexes = new Map();
/**
 * @description
 * 版本化检索结果缓存。
 * @type {Map<string, object>} 版本化检索结果缓存。
 */
const retrievalCache = new Map();
/**
 * @description
 * 检索缓存上限。
 * @type {number} 检索缓存上限。
 */
const MAX_RETRIEVAL_CACHE_ENTRIES = 500;
/**
 * @description
 * 检索缓存有效期。
 * @type {number} 检索缓存有效期。
 */
const RETRIEVAL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * @description
 * 常见问题词到检索扩展词的多语言映射。
 * @type {Record<string, string[]>} 常见问题词到检索扩展词的多语言映射。
 */
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

/**
 * @description
 * 识别开放时间、票价、交通等通用问法，并配置相应的检索词与文档加权。
 * @type {(RetrievalIntent & {triggers: string[]})[]} 通用问法的触发词与检索加权规则列表。
 */
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

/**
 * @description
 * 面向特定事实问题的直接检索扩展词。
 * @type {Record<string, string[]>} 面向特定事实问题的直接检索扩展词。
 */
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

/**
 * @description
 * 识别景区概况、游览季节、入园时间、餐饮和亲子等精确事实问法。
 * @type {(RetrievalIntent & {triggers: string[]})[]} 精确事实问法的触发词与检索加权规则列表。
 */
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

/**
 * @description
 * 分词阶段主动保留的中英日韩繁体主题词。
 * @type {string[]} 分词阶段主动保留的中英日韩繁体主题词。
 */
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

/**
 * @description
 * 英文检索停用词。
 * @type {Set<string>} 英文检索停用词。
 */
const stopWords = new Set([
  "a", "an", "and", "are", "at", "for", "how", "in", "is", "me", "of", "on", "please", "the", "to", "what", "when",
  "about", "does", "recommend", "tell", "you", "your"
]);

/**
 * @description
 * 不足以进行景点局部匹配的通用灵山名称。
 * @type {Set<string>} 不足以进行景点局部匹配的通用灵山名称。
 */
const genericSpotTokens = new Set(["灵山", "靈山", "霊山", "lingshan", "링산", "หลิงซาน"]);

/**
 * @description
 * 景区或景点营业时间相关的多语言词汇。
 * @type {RegExp} 景区或景点营业时间相关的多语言词汇。
 */
const OPEN_TIME_TERMS = /(开放时间|開放時間|营业时间|營業時間|运营时间|運營時間|开园|開園|闭园|閉園|闭馆|閉館|开放|開放|全天开放|opening\s*hours?|open(?:ing)?|clos(?:e|es|ing)|운영\s*시간|개장|폐장|営業時間|開園|閉園|เวลาเปิด|เวลาปิด)/iu;

/**
 * @description
 * 可确认正在描述营业时段而非“建成开放”等历史事件的模式。
 * @type {RegExp} 可确认正在描述营业时段而非“建成开放”等历史事件的模式。
 */
const OPENING_HOURS_FACT = /(?:\d{1,2}:\d{2}\s*(?:[-–—~～至到]|to)\s*\d{1,2}:\d{2}\s*(?:开放|開放|营业|營業|运营|運營|open)?|(?:开放时间|開放時間|营业时间|營業時間|运营时间|運營時間|开园|開園|闭园|閉園|闭馆|閉館|opening\s*hours?|closes?|closing|운영\s*시간|개장|폐장|営業時間|開園|閉園|เวลาเปิด|เวลาปิด)[^。；;\n]{0,32}\d{1,2}:\d{2}|全天开放|全天開放|open\s+all\s+day)/iu;

/**
 * @description
 * 从问题中推断景区范围。AI 导游默认服务灵山胜境，只有明确提及拈花湾时切换范围。
 * @param {string} query 规范化问题。
 * @returns {string|null} 知识元数据中的景区名称。
 */
function inferScenicAreaFromQuery(query) {
  const text = normalize(query);
  if (/(拈花湾|拈花灣|nianhua\s*bay|녠화완|ニェンホワワン|เหนียนฮวาวาน)/iu.test(text)) {
    return "拈花湾禅意小镇";
  }
  if (/(灵山胜境|靈山勝境|霊山|lingshan|링산|หลิงซาน)/iu.test(text)) {
    return "灵山胜境";
  }
  if (/(景区|景區|园区|園區|scenic\s*area|tourist\s*area|관광지|観光地|เขตท่องเที่ยว)/iu.test(text)
    && OPEN_TIME_TERMS.test(text)) {
    return "灵山胜境";
  }
  return null;
}

/**
 * @description
 * 排除景区公共别名命中，仅保留具体景点候选。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {SpotMatch[]} 排除景区公共别名后的具体景点命中。
 */
function specificSpotMatches(spotMatches) {
  const areaAliases = new Set([
    "灵山", "靈山", "霊山", "lingshan", "링산", "หลิงซาน",
    "拈花湾", "拈花灣", "nianhua bay", "녠화완", "ニェンホワワン", "เหนียนฮวาวาน"
  ].map(normalize));
  return spotMatches.filter((spot) => !areaAliases.has(normalize(spot.alias || "")));
}

/**
 * @description
 * 为景区级时间、票价和路线问题确定事实范围；未点名景区时按当前导游默认的灵山胜境处理。
 * @param {string} query 规范化问题。
 * @param {RetrievalIntent[]} intents 业务意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @param {string|null} inferredArea 显式推断景区。
 * @returns {string|null} 事实作用域景区。
 */
function resolveFactScenicArea(query, intents, spotMatches, inferredArea) {
  if (inferredArea) return inferredArea;
  if (specificSpotMatches(spotMatches).length > 0) return null;
  if (intents.some((intent) => ["open_time", "ticket", "route"].includes(intent.intent))) {
    return "灵山胜境";
  }
  return inferScenicAreaFromQuery(query);
}

/**
 * @description
 * 判断问题是否询问整个景区的开放时间，而不是已识别出的具体景点。
 * @param {string} query 规范化问题。
 * @param {RetrievalIntent[]} intents 业务意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否属于景区级开放时间问题。
 */
function isAreaOpeningHoursQuery(query, intents, spotMatches) {
  if (specificSpotMatches(spotMatches).length > 0
    || !intents.some((intent) => intent.intent === "open_time")
    || !OPEN_TIME_TERMS.test(query)) return false;
  const text = normalize(query);
  if (/(景区|景區|园区|園區|灵山胜境|靈山勝境|拈花湾|拈花灣|scenic\s*area|tourist\s*area|nianhua\s*bay|관광지|観光地|เขตท่องเที่ยว)/iu.test(text)) {
    return true;
  }
  const residual = text
    .replace(/(开放时间|開放時間|营业时间|營業時間|运营时间|運營時間|几点开|幾點開|几点关|幾點關|开园|開園|闭园|閉園|闭馆|閉館|opening\s*hours?|open|close|closing|운영\s*시간|개장|폐장|営業時間|開園|閉園|เวลาเปิด|เวลาปิด)/giu, "")
    .replace(/(请问|請問|一下|是什么|是什麼|多少|几点|幾點|when|what|time|please|は|ですか|나요|니까|กี่โมง|คือ)/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return residual.length === 0;
}

/**
 * @description
 * 判断当前意图是否询问景区整体票务。
 * @param {RetrievalIntent[]} intents 意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否询问景区整体票务。
 */
function isAreaTicketQuery(intents, spotMatches) {
  return specificSpotMatches(spotMatches).length === 0
    && intents.some((intent) => intent.intent === "ticket");
}

/**
 * @description
 * 判断当前意图是否询问景区整体游览路线。
 * @param {RetrievalIntent[]} intents 意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否询问景区整体路线。
 */
function isAreaRouteQuery(intents, spotMatches) {
  return specificSpotMatches(spotMatches).length === 0
    && intents.some((intent) => ["route", "family_route"].includes(intent.intent));
}

/**
 * @description
 * 判断当前意图是否询问具体景点或演出的场次。
 * @param {RetrievalIntent[]} intents 意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否询问具体景点或演出的场次。
 */
function isSpecificPerformanceQuery(intents, spotMatches) {
  return specificSpotMatches(spotMatches).length > 0
    && intents.some((intent) => intent.intent === "performance_time");
}

/**
 * @description
 * 判断当前意图是否询问具体景点的开放时间。
 * @param {RetrievalIntent[]} intents 意图。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否询问具体景点开放时间。
 */
function isSpecificOpeningHoursQuery(intents, spotMatches) {
  return specificSpotMatches(spotMatches).length > 0
    && intents.some((intent) => intent.intent === "open_time")
    && !intents.some((intent) => intent.intent === "performance_time");
}

/**
 * @description
 * 景区级开放时间只允许使用明确描述整个景区/小镇营业安排的资料。
 * @param {object} chunk 知识分块。
 * @param {string|null} scenicArea 已确定的景区范围。
 * @returns {boolean} 分块是否能回答景区级开放时间。
 */
function isAreaOpeningHoursEvidence(chunk, scenicArea) {
  if (!matchesRequestedScenicArea(chunk, scenicArea)) return false;
  return extractAreaOpeningEvidence(chunk, scenicArea).length > 0;
}

/**
 * @description
 * 判断候选元数据或正文是否属于请求景区。
 * @param {object} item 分块或结果。
 * @param {string|null} scenicArea 请求景区。
 * @returns {boolean} 元数据或文本能否确认属于请求景区。
 */
function matchesRequestedScenicArea(item, scenicArea) {
  if (!scenicArea) return true;
  if (item.scenicArea) return normalize(item.scenicArea) === normalize(scenicArea);
  const text = normalize(`${item.documentId || ""} ${item.source || ""} ${item.title || ""} ${item.content || ""}`);
  if (scenicArea === "拈花湾禅意小镇") {
    return /(拈花湾|拈花灣|nianhua\s*bay|녠화완|ニェンホワワン|เหนียนฮวาวาน)/iu.test(text);
  }
  if (scenicArea === "灵山胜境") {
    return !/(拈花湾|拈花灣|nianhua\s*bay|녠화완|ニェンホワワン|เหนียนฮวาวาน)/iu.test(text);
  }
  return true;
}

/**
 * @description
 * 判断知识分块是否构成景区整体票务证据。
 * @param {object} chunk 知识分块。
 * @param {string|null} scenicArea 景区范围。
 * @returns {boolean} 是否为景区整体票务证据。
 */
function isAreaTicketEvidence(chunk, scenicArea) {
  if (!matchesRequestedScenicArea(chunk, scenicArea)) return false;
  const text = `${chunk.title || ""}\n${chunk.content || ""}`;
  const ticketTerms = /(门票|門票|票价|票價|优惠票|優惠票|免票|ticket|admission|입장권|入場券|บัตรเข้าชม|ค่าเข้า)/iu;
  if (!ticketTerms.test(text)) return false;
  if (!chunk.scenicSpotId) return true;
  const aliases = scenicArea === "拈花湾禅意小镇"
    ? /(拈花湾|拈花灣|nianhua\s*bay|녠화완|ニェンホワワン|เหนียนฮวาวาน)/iu
    : /(灵山胜境|靈山勝境|lingshan\s*scenic|링산\s*관광지|霊山|หลิงซาน)/iu;
  return String(chunk.content || "").split(/[。；;\n]+/u).some((clause) => aliases.test(clause) && ticketTerms.test(clause));
}

/**
 * @description
 * 判断知识分块是否构成景区整体路线证据。
 * @param {object} chunk 知识分块。
 * @param {string|null} scenicArea 景区范围。
 * @returns {boolean} 是否为景区整体路线证据。
 */
function isAreaRouteEvidence(chunk, scenicArea) {
  if (!matchesRequestedScenicArea(chunk, scenicArea)) return false;
  if (chunk.scenicSpotId) return false;
  return /(路线规划|推荐路线|游览路线|路线|route|itinerary|경로|ルート|路線|เส้นทาง)/iu.test(`${chunk.title || ""}\n${chunk.content || ""}`);
}

/**
 * @description
 * 判断知识分块是否包含目标演出的有效证据。
 * @param {object} chunk 分块。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否含目标演出证据。
 */
function isTargetPerformanceEvidence(chunk, spotMatches) {
  return extractPerformanceEvidence(chunk, spotMatches).length > 0;
}

/**
 * @description
 * 判断知识分块是否包含目标景点开放时间证据。
 * @param {object} chunk 分块。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {boolean} 是否含目标景点开放时间证据。
 */
function isTargetOpeningHoursEvidence(chunk, spotMatches) {
  return extractTargetOpeningHoursEvidence(chunk, spotMatches).length > 0;
}

/**
 * @description
 * 对景区级开放时间查询应用事实作用域过滤，避免混入场馆、演出和建议入园时间。
 * @param {object[]} chunks 候选分块。
 * @param {{query: string, intents: RetrievalIntent[], spotMatches: SpotMatch[], scenicArea: string|null}} context 查询上下文。
 * @returns {object[]} 作用域一致的候选。
 */
function filterChunksByFactScope(chunks, context) {
  if (isAreaOpeningHoursQuery(context.query, context.intents, context.spotMatches)) {
    return chunks.filter((chunk) => isAreaOpeningHoursEvidence(chunk, context.scenicArea));
  }
  if (isAreaTicketQuery(context.intents, context.spotMatches)) {
    return chunks.filter((chunk) => isAreaTicketEvidence(chunk, context.scenicArea));
  }
  if (isAreaRouteQuery(context.intents, context.spotMatches)) {
    return chunks.filter((chunk) => isAreaRouteEvidence(chunk, context.scenicArea));
  }
  if (isSpecificOpeningHoursQuery(context.intents, context.spotMatches)) {
    return chunks.filter((chunk) => isTargetOpeningHoursEvidence(chunk, context.spotMatches));
  }
  if (isSpecificPerformanceQuery(context.intents, context.spotMatches)) {
    return chunks.filter((chunk) => isTargetPerformanceEvidence(chunk, context.spotMatches));
  }
  return chunks;
}

/**
 * @description
 * 按问题的景区、景点和事实类型约束过滤排序候选。
 * @param {object[]} candidates 带 `chunk` 的排序候选。
 * @param {object} context 查询上下文。
 * @returns {object[]} 作用域一致的候选。
 */
function filterCandidatesByFactScope(candidates, context) {
  if (isAreaOpeningHoursQuery(context.query, context.intents, context.spotMatches)) {
    return candidates.filter((candidate) => isAreaOpeningHoursEvidence(candidate.chunk, context.scenicArea));
  }
  if (isAreaTicketQuery(context.intents, context.spotMatches)) {
    return candidates.filter((candidate) => isAreaTicketEvidence(candidate.chunk, context.scenicArea));
  }
  if (isAreaRouteQuery(context.intents, context.spotMatches)) {
    return candidates.filter((candidate) => isAreaRouteEvidence(candidate.chunk, context.scenicArea));
  }
  if (isSpecificOpeningHoursQuery(context.intents, context.spotMatches)) {
    return candidates.filter((candidate) => isTargetOpeningHoursEvidence(candidate.chunk, context.spotMatches));
  }
  if (isSpecificPerformanceQuery(context.intents, context.spotMatches)) {
    return candidates.filter((candidate) => isTargetPerformanceEvidence(candidate.chunk, context.spotMatches));
  }
  return candidates;
}

/**
 * @description
 * 将景区级开放时间候选收敛为直接相关语句，避免完整景点分块把演出时刻带入回答。
 * @param {RetrievalResult[]} results 已格式化结果。
 * @param {{query: string, intents: RetrievalIntent[], spotMatches: SpotMatch[], scenicArea: string|null}} context 查询上下文。
 * @returns {RetrievalResult[]} 面向提示词与引用校验的聚焦结果。
 */
function focusResultsByFactScope(results, context) {
  if (isSpecificOpeningHoursQuery(context.intents, context.spotMatches)) {
    const focusedResults = results.map((result) => {
      const content = extractTargetOpeningHoursEvidence(result, context.spotMatches).join("；");
      if (!content) return null;
      return {
        ...result,
        content,
        contextContent: content,
        parentContent: content,
        citation: { ...result.citation, quote: summarizeCitation(content) }
      };
    }).filter(Boolean);
    return deduplicateFocusedResults(focusedResults);
  }
  if (isSpecificPerformanceQuery(context.intents, context.spotMatches)) {
    const focusedResults = results.map((result) => {
      const content = extractPerformanceEvidence(result, context.spotMatches).join("；");
      if (!content) return null;
      return {
        ...result,
        content,
        contextContent: content,
        parentContent: content,
        citation: { ...result.citation, quote: summarizeCitation(content) }
      };
    }).filter(Boolean);
    return deduplicateFocusedResults(focusedResults);
  }
  if (!isAreaOpeningHoursQuery(context.query, context.intents, context.spotMatches)) return results;
  const focusedResults = results.map((result) => {
    const focused = extractAreaOpeningEvidence(result, context.scenicArea).join("；");
    if (!focused) return result;
    const areaName = context.scenicArea || result.scenicArea || "景区";
    return {
      ...result,
      title: `${areaName}开放时间`,
      content: focused,
      contextContent: focused,
      parentContent: focused,
      scenicSpotId: null,
      scenicSpotName: null,
      citation: {
        ...result.citation,
        sectionTitle: `${areaName}开放时间`,
        scenicSpotId: null,
        scenicSpotName: null,
        quote: summarizeCitation(focused)
      }
    };
  });
  return deduplicateFocusedResults(focusedResults);
}

/**
 * @description
 * 按标题和正文去除聚焦检索结果中的重复项。
 * @param {RetrievalResult[]} results 聚焦结果。
 * @returns {RetrievalResult[]} 按标题和正文去重的结果。
 */
function deduplicateFocusedResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${normalize(result.title)}\u0000${normalize(result.content)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @description
 * 提取与目标景点关联的演出场次语句，排除同一父分块中的其他演出。
 * @param {object} item 分块或检索结果。
 * @param {SpotMatch[]} spotMatches 目标景点命中。
 * @returns {string[]} 目标演出证据。
 */
function extractPerformanceEvidence(item, spotMatches) {
  const targets = specificSpotMatches(spotMatches);
  const targetIds = new Set(targets.map((spot) => spot.id));
  const targetNames = targets.flatMap((spot) => [spot.name, spot.alias]).filter(Boolean);
  const allowedEvents = new Set(targetNames);
  const eventBySpot = {
    "LS-006": ["九龙灌浴", "九龍灌浴"],
    "LS-013": ["灵山吉祥颂", "靈山吉祥頌", "吉祥颂", "吉祥頌"],
    "NH-001": ["开园仪式", "開園儀式"],
    "NH-005": ["禅行", "禪行", "水上禅舞", "水上禪舞"]
  };
  for (const id of targetIds) {
    for (const event of eventBySpot[id] || []) allowedEvents.add(event);
  }
  const exactSpot = targetIds.has(item.scenicSpotId);
  const targetPerformanceSection = exactSpot
    && /(演出|表演|场次|場次|上演|公演|show|performance|공연|การแสดง)/iu.test(String(item.title || ""));
  const eventPattern = /(九龙灌浴|九龍灌浴|灵山吉祥颂|靈山吉祥頌|吉祥颂|吉祥頌|禅行|禪行|水上禅舞|水上禪舞|开园仪式|開園儀式)/gu;
  return String(item.content || "").split(/[。；;\n]+/u).map((clause) => clause.trim()).filter((clause) => {
    if (!clause) return false;
    const hasPerformanceTerm = /(演出|表演|场次|場次|上演|公演|时长|時長|show|performance|공연|การแสดง)/iu.test(clause);
    const hasScheduleCue = /(?:\d[^。；;\n]{0,12}(?:回|場|场|รอบ)|開始時刻|固定時刻|当日の[^。；;\n]{0,12}時刻|演出時間|演出时间|表演時間|表演时间|schedule|start\s*time|minutes?|회|시각|時間|時刻|分間|เวลา|นาที|以[^。]{0,16}公告)/iu.test(clause);
    if (!hasPerformanceTerm && !(targetPerformanceSection && hasScheduleCue)) return false;
    if (!/\d/u.test(clause) && !hasScheduleCue) return false;
    const namedEvents = [...clause.matchAll(eventPattern)].map((match) => match[1]);
    if (namedEvents.length > 0 && !namedEvents.some((event) => allowedEvents.has(event))) return false;
    if (targetNames.some((name) => clause.includes(name))) return true;
    return exactSpot;
  });
}

/**
 * @description
 * 提取与目标景点一致的营业时间语句。
 * @param {object} item 分块或检索结果。
 * @param {SpotMatch[]} spotMatches 目标景点。
 * @returns {string[]} 目标景点营业时间语句。
 */
function extractTargetOpeningHoursEvidence(item, spotMatches) {
  const targets = specificSpotMatches(spotMatches);
  const targetIds = new Set(targets.map((spot) => spot.id));
  const targetNames = targets.flatMap((spot) => [spot.name, spot.alias]).filter(Boolean);
  const exactSpot = targetIds.has(item.scenicSpotId);
  const content = String(item.content || "");
  const structuredRowMatches = Boolean(item.sheetName || item.rowStart || item.range)
    && targetNames.some((name) => content.includes(name));
  return content.split(/[。；;\n]+/u).map((clause) => clause.trim()).filter((clause) => {
    if (!clause || !OPENING_HOURS_FACT.test(clause)) return false;
    if (targetNames.some((name) => clause.includes(name))) return true;
    return exactSpot || structuredRowMatches;
  });
}

/**
 * @description
 * 提取与请求景区一致的整体开放时间语句。
 * @param {object} item 分块或格式化结果。
 * @param {string|null} scenicArea 景区范围。
 * @returns {string[]} 景区开放时间证据语句。
 */
function extractAreaOpeningEvidence(item, scenicArea) {
  const title = String(item.title || "");
  const content = String(item.content || "");
  const titleDeclaresHours = !item.scenicSpotId && OPEN_TIME_TERMS.test(title);
  const areaAliases = scenicArea === "拈花湾禅意小镇"
    ? ["拈花湾", "拈花灣", "Nianhua Bay", "녠화완", "ニェンホワワン", "เหนียนฮวาวาน"]
    : ["灵山胜境", "靈山勝境", "Lingshan", "링산", "霊山", "หลิงซาน"];
  return content.split(/[。；;\n]+/u).map((clause) => clause.trim()).filter((clause) => {
    if (!clause || !OPEN_TIME_TERMS.test(clause)) return false;
    const disclaimer = /(?:(没有|沒有|未提供|does\s+not|no\s+single|없습니다|ありません|ไม่ได้ระบุ)[^。\n]{0,100}(开放|開放|开园|開園|opening|운영|営業時間|เวลาเปิด)|(开放|開放|开园|開園|opening|운영|営業時間|เวลาเปิด)[^。\n]{0,100}(没有|沒有|未提供|does\s+not|no\s+single|없습니다|ありません|ไม่ได้ระบุ))/iu.test(clause);
    if (titleDeclaresHours && (OPENING_HOURS_FACT.test(clause) || disclaimer)) return true;
    const normalizedClause = normalize(clause);
    const aliasSchedule = areaAliases.some((alias) => {
      const index = normalizedClause.indexOf(normalize(alias));
      return index >= 0 && OPEN_TIME_TERMS.test(normalizedClause.slice(index, index + 64));
    });
    const areaSchedule = /(景区|景區|园区|園區|小镇|小鎮|scenic\s*area|tourist\s*area|town|관광지|観光地|เขตท่องเที่ยว)[^。；;\n]{0,32}(开放时间|開放時間|营业时间|營業時間|运营时间|運營時間|开园|開園|闭园|閉園|opening\s*hours?|opening\s+and\s+closing|운영\s*시간|개장|폐장|営業時間|開園|閉園|เวลาเปิด|เวลาปิด)/iu.test(clause);
    return (aliasSchedule || areaSchedule) && (OPENING_HOURS_FACT.test(clause) || disclaimer);
  });
}

/**
 * @description
 * 使用关键词匹配、实体和意图权重检索知识库。
 * @param {*} query 查询文本。
 * @param {RetrievalSearchOptions} [options={}] 检索选项。
 * @returns {RetrievalSearchResponse} 查询分析与排序后的检索结果。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @throws {Error|SyntaxError} SQLite、知识快照或追踪记录读取失败时透传异常。
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
 * @description
 * 使用关键词、查询覆盖度、语种及结构化资料权重执行混合检索。
 * @param {*} query 查询文本。
 * @param {RetrievalSearchOptions} [options={}] 检索选项。
 * @returns {RetrievalSearchResponse} 查询分析与排序后的检索结果。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @throws {Error|SyntaxError} SQLite、知识快照或追踪记录读取失败时透传异常。
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
 * @description
 * 仅使用 BM25 通道检索，主要用于离线消融评测和回归门禁。
 * @param {*} query 查询文本。
 * @param {RetrievalSearchOptions} [options={}] 检索选项。
 * @returns {RetrievalSearchResponse} 标准检索响应。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @throws {Error|SyntaxError} SQLite、知识快照或追踪记录读取失败时透传异常。
 * @example
 * const result = bm25Search("灵山胜境门票", { limit: 5 });
 */
export function bm25Search(query, options = {}) {
  return searchKnowledge(query, {
    ...options,
    mode: "bm25"
  });
}

/**
 * @description
 * 执行可降级的企业级混合检索。
 *
 * 远程配置完整时使用“规则/BM25 + Dense + RRF + Reranker”；缺少密钥、
 * Qdrant 未同步、超时或限流时返回现有本地混合检索，不中断问答服务。
 *
 * @param {*} query 查询文本。
 * @param {RetrievalSearchOptions} [options={}] 检索选项。
 * @param {object} [dependencies={}] 可注入远程配置和网络请求实现。
 * @param {object} [dependencies.config] 远程 RAG 配置；缺省时从环境变量构建。
 * @param {typeof fetch} [dependencies.fetchImpl] 可替换的 Fetch 实现。
 * @returns {Promise<RetrievalSearchResponse & {remote: RemoteRetrievalInfo}>} 带远程通道状态的检索响应。
 * @throws {Error & {statusCode: 409, code: "KNOWLEDGE_NOT_BUILT"}} 本地知识库尚未构建时抛出。
 * @throws {Error & {statusCode: 400, code: "QUERY_REQUIRED"}} 查询为空时抛出。
 * @throws {Error|SyntaxError} 本地 SQLite、知识快照或追踪记录读取失败时透传异常；远程通道异常会降级并写入 `remote` 状态。
 * @example
 * const result = await hybridSearchAsync("灵山大佛高度", { limit: 5 });
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
  const effectiveOptions = {
    ...options,
    scenicArea: options.scenicArea || local.filters?.scenicArea || undefined
  };
  const queryScenicArea = effectiveOptions.scenicArea || inferScenicAreaFromQuery(normalize(query));
  const factScenicArea = resolveFactScenicArea(
    normalize(query),
    local.intents || [],
    local.spotMatches || [],
    queryScenicArea
  );
  const knowledge = loadKnowledgeFromSqlite();
  const activeIndexVersion = local.indexVersion || knowledge?.indexVersion || getActiveKnowledgeVersion();
  const chunkById = new Map((knowledge?.chunks || [])
    .filter((chunk) => passesMetadataFilter(chunk, effectiveOptions))
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
        scenicArea: effectiveOptions.scenicArea || null,
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
    const factScoped = filterCandidatesByFactScope(fused, {
      query: normalize(query),
      intents: local.intents || [],
      spotMatches: local.spotMatches || [],
      scenicArea: factScenicArea || null
    });
    const ranked = maximalMarginalRelevance(applyFreshnessPreference(factScoped, local.intents || []), {
      limit: finalLimit,
      maxPerParent: options.maxPerParent || 2
    });
    const parentLookup = buildParentLookup(
      (knowledge.chunks || []).filter((chunk) => passesMetadataFilter(chunk, effectiveOptions))
    );
    const results = focusResultsByFactScope(
      ranked.map((item) => formatResult(item, knowledge.spots || [], parentLookup)),
      {
        query: normalize(query),
        intents: local.intents || [],
        spotMatches: local.spotMatches || [],
        scenicArea: factScenicArea || null
      }
    );
    return {
      ...local,
      total: results.length,
      results,
      conflicts: detectConflictingFacts(results, local.intents || [], {
        query: normalize(query),
        spotMatches: local.spotMatches || []
      }),
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
 * @description
 * 执行共享检索流程：加载知识、规范化、分词、扩展、意图和实体识别、评分与格式化。
 * @private
 * @param {*} query 查询文本。
 * @param {{mode: "keyword"|"hybrid", limit?: number, locale?: string}} options 检索选项。
 * @returns {RetrievalSearchResponse} 检索响应。
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
  const resolvedScenicArea = options.scenicArea || null;
  const queryScenicArea = resolvedScenicArea || inferScenicAreaFromQuery(normalizedQuery);
  const effectiveOptions = { ...options, scenicArea: resolvedScenicArea || undefined };
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
    scenicArea: resolvedScenicArea,
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
  const factScenicArea = resolveFactScenicArea(normalizedQuery, intents, spotMatches, queryScenicArea);
  const scopeDetection = detectOutOfScope(query);
  const metadataEligibleChunks = scopeDetection.outOfScope
    ? []
    : (knowledge.chunks || []).filter((chunk) => passesMetadataFilter(chunk, effectiveOptions));
  const eligibleChunks = filterChunksByFactScope(metadataEligibleChunks, {
    query: normalizedQuery,
    intents,
    spotMatches,
    scenicArea: factScenicArea
  });
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
  const results = focusResultsByFactScope(
    ranked.map((item) => formatResult(item, knowledge.spots, parentLookup)),
    { query: normalizedQuery, intents, spotMatches, scenicArea: factScenicArea }
  );
  const conflicts = detectConflictingFacts(results, intents, { query: normalizedQuery, spotMatches });
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
      scenicArea: resolvedScenicArea,
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
 * @description
 * 按 locale 与主意图读取审计过的阈值覆盖，缺失字段回退全局默认值。
 * @param {*} locale 请求语言。
 * @param {object[]} intents 检索意图。
 * @returns {{minRuleScore: number, minBm25Score: number, minQueryCoverage: number, profile: string}} 当前语言和意图对应的检索阈值。
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
 * @description
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
 * @description
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
 * @description
 * 返回不含原始问题的缓存统计，供测试和管理观测。
 * @returns {{size: number, keys: string[]}} 缓存条目数及脱敏缓存键。
 * @example
 * const stats = getRetrievalCacheStats();
 */
export function getRetrievalCacheStats() {
  return { size: retrievalCache.size, keys: [...retrievalCache.keys()] };
}

/**
 * @description
 * 清空版本化检索结果缓存。
 * @returns {void} 无返回值。
 * @example
 * clearRetrievalCache();
 */
export function clearRetrievalCache() {
  retrievalCache.clear();
}

/**
 * @description
 * 归一化检索请求允许访问的知识范围。
 * @param {*} values 允许访问范围。
 * @returns {string[]} 规范化范围。
 */
function normalizeAccessScopes(values) {
  const scopes = Array.isArray(values) ? values.map(String).filter(Boolean) : [];
  return scopes.length > 0 ? [...new Set(scopes)] : ["public"];
}

/**
 * @description
 * 检测查询是否包含不应进入缓存的个人敏感信息。
 * @param {*} query 查询。
 * @returns {boolean} 是否含不应进入缓存键或缓存值的个人信息。
 */
function containsSensitiveQuery(query) {
  const text = String(query || "");
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(text)
    || /\b1\d{10}\b/u.test(text)
    || /\b\d{17}[\dXx]\b/u.test(text)
    || /(?:身份证|手机号|电话|邮箱)\s*[:：]?\s*[\w@.+-]{5,}/u.test(text);
}

/**
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
 * 将内部评分项转换为对外检索结果并附加景点和引用。
 * @private
 * @param {{chunk: object, score: number, reasons: string[]}} item 评分项。
 * @param {object[]} spots 景点知识列表。
 * @param {Map<string, object>} [parentLookup=new Map()] 父分块 ID 到上下文分块的映射。
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
    scenicArea: item.chunk.scenicArea || null,
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
 * @description
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
 * @description
 * 检测多个候选来源对同一类时间或价格事实给出不同值的情况。
 * 过期内容已在候选过滤阶段排除；仍然同时有效的不同来源只记录冲突，不擅自合并。
 * @param {RetrievalResult[]} results 已格式化候选。
 * @param {RetrievalIntent[]} intents 当前查询意图。
 * @param {object} [context={}] 查询实体上下文。
 * @param {string} [context.query=""] 原始查询文本。
 * @param {SpotMatch[]} [context.spotMatches=[]] 景点实体命中。
 * @returns {RetrievalConflict[]} 冲突审计摘要。
 * @example
 * const conflicts = detectConflictingFacts(results, [{ intent: "ticket", preferredTerms: [], preferredDocuments: [] }]);
 */
export function detectConflictingFacts(results, intents = [], context = {}) {
  const conflicts = [];
  const selected = selectConflictResults(results, context.spotMatches || []);
  if (intents.some((intent) => intent.intent === "open_time")) {
    conflicts.push(...collectScopedConflicts(
      selected.flatMap((result) => extractOpeningTimeFacts(result)),
      "time"
    ));
  }
  if (intents.some((intent) => intent.intent === "performance_time")) {
    conflicts.push(...collectScopedConflicts(
      selected.flatMap((result) => extractPerformanceTimeFacts(result)),
      "time"
    ));
  }
  if (intents.some((intent) => intent.intent === "ticket")) {
    conflicts.push(...collectScopedConflicts(
      selected.flatMap((result) => extractPriceFacts(result)),
      "price"
    ));
  }
  conflicts.push(...collectScopedConflicts(
    selected.flatMap((result) => extractPatternFacts(
      result,
      /(?:临时闭园|临时关闭|暂停开放|暂停营业|正常开放|恢复开放|闭馆)/gu
    )),
    "opening_status"
  ));
  return conflicts;
}

/**
 * @description
 * 选择与明确景点命中一致的事实冲突候选。
 * @param {object[]} results 候选结果。
 * @param {SpotMatch[]} spotMatches 景点命中。
 * @returns {object[]} 与明确景点一致的冲突候选。
 */
function selectConflictResults(results, spotMatches) {
  const ids = new Set(spotMatches.map((spot) => spot.id));
  if (ids.size === 0) return results.slice(0, 8);
  const exact = results.filter((result) => ids.has(result.scenicSpotId));
  return (exact.length > 0 ? exact : results).slice(0, 8);
}

/**
 * @description
 * 提取开放/闭馆语句中的营业时刻，忽略演出时间、建议入园时间和开园仪式。
 * @param {object} result 检索结果。
 * @returns {Array<{scope: string, value: string, citation: string}>} 带实体与季节作用域的时刻事实。
 */
function extractOpeningTimeFacts(result) {
  const facts = [];
  const clauses = String(result.content || "").split(/[。；;，,\n]+/u).map((item) => item.trim()).filter(Boolean);
  for (const rawClause of clauses) {
    const clause = rawClause.replace(/开园仪式|開園儀式/gu, "");
    if (!OPEN_TIME_TERMS.test(clause) || !OPENING_HOURS_FACT.test(clause)) continue;
    const condition = /(冬季|winter|겨울|冬期|ฤดูหนาว)/iu.test(clause) ? "winter" : "general";
    const scope = `${resolveFactEntity(result, clause)}:${condition}`;
    const citation = result.citation?.citationId || result.id;
    const ranges = [...clause.matchAll(/\b(\d{1,2}:\d{2})\s*(?:[-–—~～至到]|to)\s*(\d{1,2}:\d{2})\b/giu)];
    if (ranges.length > 0) {
      for (const match of ranges) facts.push({ scope, value: `${match[1]}-${match[2]}`, citation });
      continue;
    }
    if (/(全天开放|全天開放|open\s+all\s+day)/iu.test(clause)) {
      facts.push({ scope, value: "全天开放", citation });
      continue;
    }
    for (const time of [...new Set(clause.match(/\b\d{1,2}:\d{2}\b/gu) || [])]) {
      facts.push({ scope, value: time, citation });
    }
  }
  return facts;
}

/**
 * @description
 * 提取按演出实体分组的场次时间事实。
 * @param {object} result 检索结果。
 * @returns {Array<{scope: string, value: string, citation: string}>} 演出时刻事实。
 */
function extractPerformanceTimeFacts(result) {
  const facts = [];
  const clauses = String(result.content || "").split(/[。；;\n]+/u).map((item) => item.trim()).filter(Boolean);
  for (const clause of clauses) {
    if (!/(演出|表演|场次|上演|show|performance|공연|การแสดง)/iu.test(clause)) continue;
    const citation = result.citation?.citationId || result.id;
    const scope = `${resolvePerformanceEntity(result, clause)}:performance`;
    for (const time of [...new Set(clause.match(/\b\d{1,2}:\d{2}\b/gu) || [])]) {
      facts.push({ scope, value: time, citation });
    }
  }
  return facts;
}

/**
 * @description
 * 从检索结果和语句中确定演出实体作用域。
 * @param {object} result 检索结果。
 * @param {string} clause 演出语句。
 * @returns {string} 演出实体作用域。
 */
function resolvePerformanceEntity(result, clause) {
  const namedEvents = [
    [/(九龙灌浴|九龍灌浴)/u, "九龙灌浴"],
    [/(灵山吉祥颂|靈山吉祥頌|吉祥颂|吉祥頌)/u, "灵山吉祥颂"],
    [/(禅行|禪行)/u, "禅行"],
    [/(水上禅舞|水上禪舞)/u, "水上禅舞"],
    [/(开园仪式|開園儀式)/u, "开园仪式"]
  ];
  const named = namedEvents.find(([pattern]) => pattern.test(clause));
  if (named) return `event:${named[1]}`;
  return resolveFactEntity(result, clause);
}

/**
 * @description
 * 按指定模式提取带实体作用域的事实。
 * @param {object} result 检索结果。
 * @param {RegExp} pattern 事实模式。
 * @returns {Array<{scope: string, value: string, citation: string}>} 作用域事实。
 */
function extractPatternFacts(result, pattern) {
  const citation = result.citation?.citationId || result.id;
  return [...new Set(String(result.content || "").match(pattern) || [])].map((value) => ({
    scope: resolveFactEntity(result, String(result.content || "")),
    value,
    citation
  }));
}

/**
 * @description
 * 提取按票种类别归一化的价格事实。
 * @param {object} result 检索结果。
 * @returns {Array<{scope: string, value: string, citation: string}>} 按票种分类的价格事实。
 */
function extractPriceFacts(result) {
  const facts = [];
  const citation = result.citation?.citationId || result.id;
  const lines = String(result.content || "").split(/[\n。；;]/u).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matches = [...line.matchAll(/\b\d+(?:\.\d+)?\s*元\b/gu)];
    if (matches.length === 0) continue;
    for (const match of matches) {
      const labelContext = `${lines[index - 1] || ""} ${line.slice(0, match.index)}`.slice(-64);
      const category = priceCategory(labelContext);
      const entity = resolveFactEntity(result, labelContext);
      facts.push({ scope: `${entity}:${category}`, value: match[0], citation });
    }
  }
  return facts;
}

/**
 * @description
 * 将价格邻近标签归一化为稳定票种类别。
 * @param {string} value 价格邻近标签。
 * @returns {string} 稳定票种类别。
 */
function priceCategory(value) {
  const categories = [
    ["adult", /(成人|adult)/giu],
    ["concession", /(半价|半價|优惠|優惠|学生|學生|concession|student|割引)/giu],
    ["free", /(免票|免费|免費|free)/giu],
    ["bundle", /(联票|聯票|套票|package|bundle)/giu],
    ["shuttle", /(观光车|觀光車|接驳|接駁|shuttle)/giu],
    ["dining", /(素斋|素齋|餐饮|餐飲|套餐|自助|面|麵|dining|buffet)/giu]
  ];
  let selected = "general";
  let selectedIndex = -1;
  for (const [category, pattern] of categories) {
    for (const match of String(value || "").matchAll(pattern)) {
      if (match.index > selectedIndex) {
        selected = category;
        selectedIndex = match.index;
      }
    }
  }
  return selected;
}

/**
 * @description
 * 根据检索结果和事实语句生成实体作用域键。
 * @param {object} result 检索结果。
 * @param {string} clause 事实所在语句。
 * @returns {string} 实体作用域键。
 */
function resolveFactEntity(result, clause) {
  const explicitArea = inferScenicAreaFromQuery(clause);
  if (explicitArea) return `area:${explicitArea}`;
  if (/(景区|景區|园区|園區|scenic\s*area|tourist\s*area|관광지|観光地|เขตท่องเที่ยว)/iu.test(clause)) {
    return `area:${result.scenicArea || "global"}`;
  }
  return `entity:${result.scenicSpotId || result.scenicSpotName || result.scenicArea || "global"}`;
}

/**
 * @description
 * 汇总同一实体作用域内取值不一致的事实。
 * @param {Array<{scope: string, value: string, citation: string}>} facts 事实记录。
 * @param {string} field 字段名。
 * @returns {Array<{field: string, values: string[], citations: string[]}>} 冲突摘要。
 */
function collectScopedConflicts(facts, field) {
  const groups = new Map();
  for (const fact of facts) {
    const group = groups.get(fact.scope) || new Map();
    const citations = group.get(fact.value) || [];
    citations.push(fact.citation);
    group.set(fact.value, citations);
    groups.set(fact.scope, group);
  }
  const conflicts = [];
  for (const values of groups.values()) {
    const citations = [...new Set([...values.values()].flat())];
    if (values.size <= 1 || citations.length <= 1) continue;
    conflicts.push({ field, values: [...values.keys()], citations });
  }
  return conflicts;
}

/**
 * @description
 * 对票价、开放和演出类候选施加受限时效加权，只作为相关性相近时的次级排序。
 * 已过期资料仍由元数据过滤器直接排除。
 * @param {RankedRetrievalCandidate[]} candidates 内部候选。
 * @param {RetrievalIntent[]} intents 查询意图。
 * @returns {RankedRetrievalCandidate[]} 带时效理由的候选副本。
 * @example
 * const ranked = applyFreshnessPreference(candidates, [{ intent: "open_time", preferredTerms: [], preferredDocuments: [] }]);
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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

  if (context.intent.intent === "open_time" && OPENING_HOURS_FACT.test(context.content)) {
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
 * @description
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
