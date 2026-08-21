/**
 * @fileoverview 灵山数字人导游的系统提示、检索上下文及多轮消息构造服务。
 *
 * @typedef {"qa"|"explain"|"route"} PromptMode
 * @typedef {{role: "system"|"user"|"assistant", content: string}} ChatPromptMessage
 * @typedef {{source?: string, scenicSpotName?: string, title?: string, content?: string}} PromptRetrievalResult
 */

import { localeInstruction, normalizeLocale } from "./language.mjs";

/** @type {string} 数字人导游的人设与语言风格约束。 */
const PERSONA = [
  "你是“灵山胜境”景区当前启用的 AI 数字人导游。",
  "你的风格:亲切、专业、简洁,像一位熟悉灵山、懂佛教文化的资深导游,而不是百科朗读机。",
  "语气温和自然,可以用口语化的表达,但不浮夸、不卖弄、不使用表情符号。"
].join("");

/** @type {string} 知识依据、范围限制与安全拒答规则。 */
const GROUNDING_RULES = [
  "只依据下面提供的【灵山胜境资料】回答,不得编造资料中没有的事实(如高度、票价、时间、地点)。",
  "如果资料中没有相关信息,要如实说明“当前资料未覆盖”,并给出可以追问的方向,绝不猜测。",
  "游客询问灵山胜境以外的景区或与景区无关的问题时,礼貌说明你只负责灵山胜境,并把话题引导回灵山胜境。",
  "涉及辱骂、政治、医疗、投资、危险行为等敏感或无关内容,礼貌拒答并引导回景区导览服务。",
  "面向现场游客,重点信息优先,不要输出资料里的原始字段名或编号。"
].join("");

/** @type {Record<PromptMode, string>} 各回答模式的结构和长度要求。 */
const MODE_RULES = {
  qa: "这是普通问答:请控制在 80-180 字,直接给出要点,必要时补一句友好的建议。请只输出纯文本,不要使用 Markdown 标题、粗体、代码块或链接语法。",
  explain: "这是讲解模式:请用 200-400 字,像口播讲解词一样有层次地介绍,可包含背景、特色与亮点。请只输出纯文本,不要使用 Markdown 标题、粗体、代码块或链接语法。",
  route: "这是路线推荐模式:请完整输出一条路线,按 1. 2. 3. 的纯文本编号分步说明节点与理由,最多列出 10 个关键节点,总长度控制在 600 字以内,结尾提示可逐点讲解。不要使用 Markdown 标题、粗体、代码块或链接语法,不得在半句话或半个节点处结束。"
};

/**
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

  const items = results.slice(0, 5).map((item, index) => {
    const spot = item.scenicSpotName ? `[${item.scenicSpotName}]` : "";
    return `资料${index + 1} 《${item.source}》${spot}${item.title}:\n${item.content}`;
  });

  return `【灵山胜境资料】\n${items.join("\n\n")}`;
}

/**
 * 构建完整对话消息：系统提示、最近六轮有效历史以及带检索资料的当前问题。
 * @param {{mode?: PromptMode|string, question: *, results?: PromptRetrievalResult[], history?: ChatPromptMessage[], locale?: *}} input 构建参数。
 * @returns {ChatPromptMessage[]} 可传给 OpenAI 兼容接口的消息数组。
 * @example
 * const messages = buildMessages({ mode: "qa", question: "开放时间？", results: [] });
 */
export function buildMessages({ mode, question, results, history = [], locale = "zh" }) {
  const normalizedLocale = normalizeLocale(locale, question);
  const messages = [{ role: "system", content: buildSystemPrompt({ mode, locale: normalizedLocale }) }];

  for (const turn of history.slice(-6)) {
    if (turn.role === "user" || turn.role === "assistant") {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  const context = buildContextBlock(results);
  messages.push({
    role: "user",
    content: `${context}\n\n游客问题:${question}\n\n请依据以上资料回答。${localeInstruction(normalizedLocale)}`
  });

  return messages;
}
