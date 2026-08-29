/**
 * @fileoverview 灵山数字人导游的系统提示、检索上下文及多轮消息构造服务。
 * @description
 * 构建数字人导游系统提示、受预算约束的检索上下文和多轮消息。
 */

/**
 * @typedef {"qa"|"explain"|"route"} PromptMode
 * @description 数字人导游支持的回答模式。
 */

/**
 * @typedef {object} ChatPromptMessage
 * @description OpenAI 兼容接口使用的对话消息。
 * @property {"system"|"user"|"assistant"} role 消息角色。
 * @property {string} content 消息正文。
 */

/**
 * @typedef {object} PromptCitation
 * @description 检索结果附带的引用标识。
 * @property {string} citationId 引用 ID。
 */

/**
 * @typedef {object} PromptRetrievalResult
 * @description 可装入模型上下文的检索结果。
 * @property {string} [source] 来源文档名称。
 * @property {string} [documentId] 来源文档 ID。
 * @property {string} [scenicSpotName] 景点名称。
 * @property {string} [title] 分块标题。
 * @property {string} [content] 分块正文。
 * @property {string} [contextContent] 所属父级上下文正文。
 * @property {string} [parentContent] 父级分块正文。
 * @property {number} [score] 检索或重排分数。
 * @property {PromptCitation} [citation] 结构化引用。
 * @property {number} [page] PDF 页码。
 * @property {string} [sheetName] XLSX 工作表名称。
 * @property {string} [range] XLSX 单元格范围。
 */

/**
 * @typedef {object} PackedPromptContext
 * @description 按 token 预算装箱后的单条模型上下文。
 * @property {PromptRetrievalResult} item 原始检索结果。
 * @property {string} context 实际装入提示的正文。
 * @property {number} tokens 正文估算 token 数。
 */

/**
 * @typedef {object} PromptConflict
 * @description 多来源事实冲突摘要。
 * @property {string} field 冲突字段。
 * @property {string[]} values 不同事实值。
 * @property {string[]} [citations] 相关引用 ID。
 */

import { estimateTextTokens } from "./knowledgeBuild.mjs";
import { localeInstruction, normalizeLocale } from "./language.mjs";

/**
 * @description
 * 检索上下文总 token 预算，避免低配置服务发送超长请求。
 * @type {number} 检索上下文总 token 预算，避免低配置服务发送超长请求。
 */
export const CONTEXT_TOKEN_BUDGET = 3200;
/**
 * @description
 * 单个来源 parent 的最大 token 预算。
 * @type {number} 单个来源 parent 的最大 token 预算。
 */
export const CONTEXT_ITEM_TOKEN_BUDGET = 900;
/**
 * @description
 * 同一文档在单次上下文中允许占用的最大 token。
 * @type {number} 同一文档在单次上下文中允许占用的最大 token。
 */
export const CONTEXT_DOCUMENT_TOKEN_BUDGET = 1400;

/**
 * @description
 * 数字人导游的人设与语言风格约束。
 * @type {string} 数字人导游的人设与语言风格约束。
 */
const PERSONA = [
  "你是“灵山胜境”景区当前启用的 AI 数字人导游。",
  "你的风格:亲切、专业、简洁,像一位熟悉灵山、懂佛教文化的资深导游,而不是百科朗读机。",
  "语气温和自然,可以用口语化的表达,但不浮夸、不卖弄、不使用表情符号。"
].join("");

/**
 * @description
 * 知识依据、范围限制与安全拒答规则。
 * @type {string} 知识依据、范围限制与安全拒答规则。
 */
const GROUNDING_RULES = [
  "只依据下面提供的【灵山胜境资料】回答,不得编造资料中没有的事实(如高度、票价、时间、地点)。",
  "如果资料中没有相关信息,要如实说明“当前资料未覆盖”,并给出可以追问的方向,绝不猜测。",
  "游客询问灵山胜境以外的景区或与景区无关的问题时,礼貌说明你只负责灵山胜境,并把话题引导回灵山胜境。",
  "涉及辱骂、政治、医疗、投资、危险行为等敏感或无关内容,礼貌拒答并引导回景区导览服务。",
  "面向现场游客,重点信息优先,不要输出资料里的原始字段名、资料编号、引用编号或类似[C-...]的内部技术标记。",
  "景区、场馆、景点和演出的开放时间属于不同对象；仅回答游客实际询问的对象，不得把建议入园时间或演出时刻当作景区开放时间。"
].join("");

/**
 * @description
 * 各回答模式的结构和长度要求。
 * @type {Record<PromptMode, string>} 各回答模式的结构和长度要求。
 */
const MODE_RULES = {
  qa: "这是普通问答:请控制在 80-180 字,直接给出要点,必要时补一句友好的建议。请只输出纯文本,不要使用 Markdown 标题、粗体、代码块或链接语法。",
  explain: "这是讲解模式:请用 200-400 字,像口播讲解词一样有层次地介绍,可包含背景、特色与亮点。请只输出纯文本,不要使用 Markdown 标题、粗体、代码块或链接语法。",
  route: "这是路线推荐模式:请完整输出一条路线,按 1. 2. 3. 的纯文本编号分步说明节点与理由,最多列出 10 个关键节点,总长度控制在 600 字以内,结尾提示可逐点讲解。不要使用 Markdown 标题、粗体、代码块或链接语法,不得在半句话或半个节点处结束。"
};

/**
 * @description
 * 构建普通问答、景点讲解或路线推荐的系统提示。
 * @param {{mode?: PromptMode|string, locale?: *}} [options={}] 提示配置。
 * @returns {string} 包含人设、依据规则、回答语言和模式要求的系统提示。
 * @example
 * const prompt = buildSystemPrompt({ mode: "route", locale: "zh-CN" });
 */
export function buildSystemPrompt({ mode = "qa", locale = "zh" } = {}) {
  const modeRule = MODE_RULES[mode] || MODE_RULES.qa;
  return [
    PERSONA,
    "",
    "服务规则:",
    GROUNDING_RULES,
    localeInstruction(normalizeLocale(locale)),
    "",
    "本次回答要求:",
    modeRule
  ].join("\n");
}

/**
 * @description
 * 构建约一分钟景点口播所使用的系统提示。
 * @returns {string} 景点口播的人设、字数和依据约束。
 * @example
 * const prompt = buildNarrationSystemPrompt();
 */
export function buildNarrationSystemPrompt() {
  return [
    PERSONA,
    "",
    "现在请为指定景点生成一段可直接口播的讲解词,时长约 1 分钟(200-400 字)。",
    "要求:只依据提供的景点资料,自然流畅,有导游的临场感,开头点出所在景点,结尾邀请游客提问;不使用表情符号。"
  ].join("\n");
}

/**
 * @description
 * 构建游客到达景点后实时伴随讲解所使用的系统提示。
 * @returns {string} 伴随讲解的人设、字数和依据约束。
 * @example
 * const prompt = buildAccompanySystemPrompt();
 */
export function buildAccompanySystemPrompt() {
  return [
    PERSONA,
    "",
    "游客刚刚到达某个景点,请生成一段“到达此处后”的实时伴随讲解(150-300 字)。",
    "结合景点资料和游客兴趣,像现场陪同一样自然;只依据提供的资料,不编造;不使用表情符号。"
  ].join("\n");
}

/**
 * @description
 * 将检索结果渲染为紧凑的大模型知识上下文，最多取前五项。
 * @param {PromptRetrievalResult[]} [results=[]] 已按相关性排序的检索结果。
 * @returns {string} 带资料编号、来源、景点名、标题和正文的上下文文本。
 * @example
 * const context = buildContextBlock([{ source: "guide.md", title: "开放时间", content: "07:00 开放" }]);
 */
export function buildContextBlock(results = []) {
  if (results.length === 0) {
    return "【灵山胜境资料】(无匹配资料)";
  }

  const packed = packContextResults(results);
  const items = packed.map(({ item, context }, index) => {
    const spot = item.scenicSpotName ? `[${item.scenicSpotName}]` : "";
    const citationId = item.citation?.citationId || `C${index + 1}`;
    return `资料${index + 1} [${citationId}] 《${item.source}》${spot}${item.title}:\n${context}`;
  });

  return `【灵山胜境资料】\n${items.join("\n\n")}`;
}

/**
 * @description
 * 按相关性顺序装箱检索资料，分别限制单来源和总 token，并在句子边界截断。
 * @param {PromptRetrievalResult[]} results 检索结果。
 * @param {object} [options={}] 预算参数。
 * @param {number} [options.maxTokens] 上下文总 token 预算。
 * @param {number} [options.perItemTokens] 单个检索结果的 token 预算。
 * @param {number} [options.perDocumentTokens] 单一来源文档的累计 token 预算。
 * @returns {PackedPromptContext[]} 已装箱资料。
 * @example
 * const packed = packContextResults(results, { maxTokens: 1600, perItemTokens: 500 });
 */
export function packContextResults(results = [], options = {}) {
  const maxTokens = Math.max(128, Math.floor(Number(options.maxTokens || CONTEXT_TOKEN_BUDGET)));
  const perItemTokens = Math.max(64, Math.min(
    maxTokens,
    Math.floor(Number(options.perItemTokens || CONTEXT_ITEM_TOKEN_BUDGET))
  ));
  const perDocumentTokens = Math.max(64, Math.min(
    maxTokens,
    Math.floor(Number(options.perDocumentTokens || CONTEXT_DOCUMENT_TOKEN_BUDGET))
  ));
  const packed = [];
  const documentTokens = new Map();
  let used = 0;
  for (const item of prioritizeContextResults(results).slice(0, 8)) {
    const remaining = maxTokens - used;
    if (remaining < 64) break;
    const documentKey = String(item.documentId || item.source || "unknown");
    const documentRemaining = perDocumentTokens - (documentTokens.get(documentKey) || 0);
    if (documentRemaining < 64) continue;
    const budget = Math.min(perItemTokens, remaining, documentRemaining);
    const source = String(item.contextContent || item.parentContent || item.content || "").trim();
    const context = truncateAtSentenceBoundary(source, budget);
    if (!context) continue;
    const tokens = estimateTextTokens(context);
    packed.push({ item, context, tokens });
    used += tokens;
    documentTokens.set(documentKey, (documentTokens.get(documentKey) || 0) + tokens);
  }
  return packed;
}

/**
 * @description
 * 先按检索/重排分，再以事实型内容和来源轮换作为稳定次级排序。
 * @param {PromptRetrievalResult[]} results 检索结果。
 * @returns {PromptRetrievalResult[]} 装箱顺序。
 */
function prioritizeContextResults(results) {
  const ranked = results.map((item, index) => ({ item, index }))
    .sort((left, right) => (
      Number(right.item.score || 0) - Number(left.item.score || 0)
      || factPriority(right.item) - factPriority(left.item)
      || left.index - right.index
    ));
  const buckets = new Map();
  for (const entry of ranked) {
    const key = String(entry.item.documentId || entry.item.source || "unknown");
    const bucket = buckets.get(key) || [];
    bucket.push(entry.item);
    buckets.set(key, bucket);
  }
  const output = [];
  while (output.length < ranked.length) {
    let added = false;
    for (const bucket of buckets.values()) {
      if (bucket.length > 0) {
        output.push(bucket.shift());
        added = true;
      }
    }
    if (!added) break;
  }
  return output;
}

/**
 * @description
 * 评估检索候选中数字、时间和地点等事实内容的优先级。
 * @param {PromptRetrievalResult} item 候选。
 * @returns {number} 数字、时间、地点等事实内容优先级。
 */
function factPriority(item) {
  const text = `${item.title || ""} ${item.content || ""}`;
  let score = 0;
  if (/\d+(?:\.\d+)?(?:米|m|吨|元|分钟|小时|年|月|日|:\d{2})/iu.test(text)) score += 3;
  if (/(位于|地址|开放|闭园|闭馆|票价|演出|路线)/u.test(text)) score += 2;
  if (item.page || item.sheetName || item.range) score += 1;
  return score;
}

/**
 * @description
 * 在 token 预算内按句子边界截断正文。
 * @param {string} text 正文。
 * @param {number} maxTokens 最大 token 数。
 * @returns {string} 截断正文。
 */
function truncateAtSentenceBoundary(text, maxTokens) {
  if (!text || estimateTextTokens(text) <= maxTokens) return text;
  const units = text.split(/(?<=[。！？；.!?])\s*|\n+/u).map((unit) => unit.trim()).filter(Boolean);
  let output = "";
  for (const unit of units) {
    const candidate = output ? `${output}\n${unit}` : unit;
    if (estimateTextTokens(candidate) > maxTokens) break;
    output = candidate;
  }
  if (output) return output;
  return Array.from(text).slice(0, Math.max(1, maxTokens)).join("").trim();
}

/**
 * @description
 * 构建完整对话消息：系统提示、最近六轮有效历史以及带检索资料的当前问题。
 * @param {{mode?: PromptMode|string, question: *, results?: PromptRetrievalResult[], conflicts?: PromptConflict[], history?: ChatPromptMessage[], locale?: *}} input 构建参数。
 * @returns {ChatPromptMessage[]} 可传给 OpenAI 兼容接口的消息数组。
 * @example
 * const messages = buildMessages({ mode: "qa", question: "开放时间？", results: [] });
 */
export function buildMessages({ mode, question, results, conflicts = [], history = [], locale = "zh" }) {
  const normalizedLocale = normalizeLocale(locale, question);
  const messages = [{ role: "system", content: buildSystemPrompt({ mode, locale: normalizedLocale }) }];

  for (const turn of history.slice(-6)) {
    if (turn.role === "user" || turn.role === "assistant") {
      messages.push({ role: turn.role, content: stripInternalCitationMarkers(turn.content) });
    }
  }

  const context = buildContextBlock(results);
  const conflictNotice = conflicts.length > 0
    ? `\n\n【资料冲突提示】当前资料对${conflicts.map((item) => `${item.field}:${item.values.join("、")}`).join("；")}存在不同口径。请不要自行拼接或选择一个作为确定事实，应明确告知游客以现场公告或官方最新信息为准。`
    : "";
  messages.push({
    role: "user",
    content: `${context}${conflictNotice}\n\n游客问题:${question}\n\n请依据以上资料回答。系统会在服务端核验事实并通过独立的来源字段展示出处；正文只输出自然语言，不得复述资料编号、引用编号或任何方括号技术标记。${localeInstruction(normalizedLocale)}`
  });

  return messages;
}

/**
 * @description
 * 清除历史回答中的内部引用编号，防止旧会话把技术标记再次带入模型输出。
 * @param {*} value 历史消息正文。
 * @returns {string} 面向模型的自然语言正文。
 */
function stripInternalCitationMarkers(value) {
  return String(value || "")
    .replace(/\s*\[(?:C-[^\]\r\n]+|C\d+)\]/giu, "")
    .trim();
}
