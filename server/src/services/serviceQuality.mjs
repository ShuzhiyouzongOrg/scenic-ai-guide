/**
 * @fileoverview 对话满意度、人工标注、反馈聚类和服务质量报告聚合服务。
 * @description 汇总会话、反馈和人工标注，输出知识补录线索与服务质量优化建议。
 */

/**
 * @typedef {object} MessageAnnotation
 * @description 管理员对单条问答消息给出的质量标注。
 * @property {string} messageId 被标注消息的 ID。
 * @property {"correct"|"wrong"|"needs_knowledge"} label 标注类别。
 * @property {string} note 补充说明。
 * @property {string} createdAt 标注创建时间。
 */

/**
 * @typedef {object} ConversationSummary
 * @description 用于服务质量分析的会话聚合摘要。
 * @property {string} sessionId 会话 ID。
 * @property {string} startedAt 首条消息时间。
 * @property {string} updatedAt 末条消息时间。
 * @property {number} messageCount 消息总数。
 * @property {number} userQuestionCount 用户问题数。
 * @property {number|null} averageRating 会话平均评分。
 * @property {boolean} lowSatisfaction 是否包含点踩或不高于 2 分的反馈。
 * @property {string} mainFocus 对话主要关注主题。
 * @property {number} feedbackCount 反馈数。
 */
import { listAllMessages, getMessages } from "./conversation.mjs";
import { listFeedback } from "./feedback.mjs";
import { getDashboardAnalytics } from "./behaviorAnalytics.mjs";
import { getDb } from "../db/database.mjs";

/**
 * @description 获取单条消息的人工标注。
 * @private
 * @param {string} messageId 消息 ID。
 * @returns {MessageAnnotation|null} 标注对象；未标注时返回 `null`。
 * @throws {Error} 数据库查询失败时透传异常。
 */
function getAnnotation(messageId) {
  const row = getDb().prepare("SELECT * FROM message_annotations WHERE message_id = ?").get(messageId);
  return row ? { messageId: row.message_id, label: row.label, note: row.note, createdAt: row.created_at } : null;
}

/**
 * @description 列出全部消息标注。
 * @private
 * @returns {MessageAnnotation[]} 标注列表。
 * @throws {Error} 数据库查询失败时透传异常。
 */
function listAnnotations() {
  return getDb()
    .prepare("SELECT * FROM message_annotations")
    .all()
    .map((row) => ({ messageId: row.message_id, label: row.label, note: row.note, createdAt: row.created_at }));
}

/**
 * @description 聚合会话消息和反馈，生成按最近更新时间降序排列的摘要。
 * @param {{lowSatisfactionOnly?: boolean}} [options={}] 筛选选项。
 * @param {boolean} [options.lowSatisfactionOnly=false] 是否只返回低满意度会话。
 * @returns {ConversationSummary[]} 会话摘要列表。
 * @throws {Error} 消息或反馈数据库查询失败时透传异常。
 * @example
 * const lowRated = listConversationSummaries({ lowSatisfactionOnly: true });
 */
export function listConversationSummaries({ lowSatisfactionOnly = false } = {}) {
  const messages = listAllMessages();
  const feedback = listFeedback();
  const grouped = groupBy(messages, (item) => item.sessionId);
  const summaries = [...grouped.entries()].map(([sessionId, items]) => {
    const sessionFeedback = feedback.filter((item) => item.sessionId === sessionId);
    const ratingValues = sessionFeedback.map((item) => Number(item.rating)).filter(Number.isFinite);
    const averageRating = ratingValues.length
      ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length
      : null;
    return {
      sessionId,
      startedAt: items[0]?.createdAt || "",
      updatedAt: items.at(-1)?.createdAt || "",
      messageCount: items.length,
      userQuestionCount: items.filter((item) => item.role === "user").length,
      averageRating,
      lowSatisfaction: sessionFeedback.some((item) => item.vote === "down" || Number(item.rating) <= 2),
      mainFocus: topFocus(items.map((item) => item.content).join(" ")),
      feedbackCount: sessionFeedback.length
    };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  return lowSatisfactionOnly ? summaries.filter((item) => item.lowSatisfaction) : summaries;
}

/**
 * @description 获取会话消息、逐消息标注、反馈和摘要。
 * @param {string} sessionId 会话 ID。
 * @returns {{sessionId: string, messages: Array<object>, feedback: Array<object>, summary: ConversationSummary|null}} 会话质量详情。
 * @throws {Error} 任一底层数据库查询失败时透传异常。
 * @example
 * const detail = getConversationDetail("session-1");
 */
export function getConversationDetail(sessionId) {
  const messages = getMessages(sessionId);
  const feedback = listFeedback({ sessionId });
  return {
    sessionId,
    messages: messages.map((item) => ({
      ...item,
      annotation: getAnnotation(item.id)
    })),
    feedback,
    summary: listConversationSummaries().find((item) => item.sessionId === sessionId) || null
  };
}

/**
 * @description 新增或覆盖一条消息的人工质量标注。
 * @param {string} messageId 消息 ID。
 * @param {object} [input={}] 标注输入；未知标签归一化为 `needs_knowledge`。
 * @param {*} [input.label] 人工质量标签。
 * @param {*} [input.note] 人工标注备注。
 * @returns {MessageAnnotation} 保存后的标注。
 * @throws {Error} 数据库写入失败或消息外键无效时透传异常。
 * @example
 * const annotation = annotateMessage("msg-1", { label: "wrong", note: "开放时间有误" });
 */
export function annotateMessage(messageId, input = {}) {
  const label = ["correct", "wrong", "needs_knowledge"].includes(input.label) ? input.label : "needs_knowledge";
  const note = String(input.note || "").trim();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO message_annotations (message_id, label, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET label = excluded.label, note = excluded.note, updated_at = excluded.updated_at`
    )
    .run(messageId, label, note, now, now);
  return { messageId, label, note, createdAt: now };
}

/**
 * @description 根据消息正文和已有标注生成待补充知识草稿。
 * @param {string} messageId 来源消息 ID。
 * @returns {{id: string, title: string, question: string, suggestedAnswer: string, sourceMessageId: string, createdAt: string}} 知识草稿。
 * @throws {Error} 消息或标注数据库查询失败时透传异常。
 * @example
 * const draft = createKnowledgeDraftFromMessage("msg-1");
 */
export function createKnowledgeDraftFromMessage(messageId) {
  const message = listAllMessages().find((item) => item.id === messageId);
  const annotation = getAnnotation(messageId);
  const draft = {
    id: `draft_${messageId}`,
    title: `待补充知识：${String(message?.content || "游客问题").slice(0, 24)}`,
    question: message?.content || "",
    suggestedAnswer: annotation?.note || "请补充标准答案、适用景点和引用来源。",
    sourceMessageId: messageId,
    createdAt: new Date().toISOString()
  };
  return draft;
}

/**
 * @description 按问题主题聚合反馈，并给出计数、平均评分和最近样本。
 * @returns {Array<{label: string, count: number, averageRating: number, samples: Array<object>}>} 按数量降序排列的反馈聚类。
 * @throws {Error} 反馈数据库查询失败时透传异常。
 * @example
 * const clusters = listFeedbackClusters();
 */
export function listFeedbackClusters() {
  const feedback = listFeedback();
  const buckets = new Map();
  for (const item of feedback) {
    const label = clusterFeedback(item);
    if (!buckets.has(label)) {
      buckets.set(label, []);
    }
    buckets.get(label).push(item);
  }
  return [...buckets.entries()]
    .map(([label, items]) => ({
      label,
      count: items.length,
      averageRating: average(items.map((item) => item.rating)),
      samples: items.slice(-3)
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

/**
 * @description 汇总满意度、错误标注、常见问题和数据看板建议，生成服务质量报告。
 * @returns {{generatedAt: string, conversationCount: number, lowSatisfactionCount: number, averageSatisfaction: number, commonIssues: Array<object>, wrongAnswerCount: number, optimizationSuggestions: string[]}} 服务质量报告。
 * @throws {Error} 任一底层数据库或分析数据加载失败时透传异常。
 * @example
 * const report = buildServiceQualityReport();
 */
export function buildServiceQualityReport() {
  const conversations = listConversationSummaries();
  const feedback = listFeedback();
  const clusters = listFeedbackClusters();
  const dashboard = getDashboardAnalytics();
  const wrongAnnotations = listAnnotations().filter((item) => item.label !== "correct");
  return {
    generatedAt: new Date().toISOString(),
    conversationCount: conversations.length,
    lowSatisfactionCount: conversations.filter((item) => item.lowSatisfaction).length,
    averageSatisfaction: average(feedback.map((item) => item.rating)),
    commonIssues: clusters.slice(0, 5),
    wrongAnswerCount: wrongAnnotations.length,
    optimizationSuggestions: [
      ...dashboard.suggestions,
      ...clusters.slice(0, 3).map((item) => `反馈集中在“${item.label}”，建议补充对应 FAQ 和景点讲解话术。`)
    ].slice(0, 6)
  };
}

/**
 * @description 按派生键对数组元素分组，忽略空键。
 * @private
 * @template T
 * @param {T[]} items 输入数组。
 * @param {(item: T) => string} getKey 分组键提取函数。
 * @returns {Map<string, T[]>} 分组映射。
 */
function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/**
 * @description 从会话文本中识别首个重点景点或咨询类型。
 * @private
 * @param {string} text 会话拼接文本。
 * @returns {string} 主题名称；未命中时为 `综合咨询`。
 */
function topFocus(text) {
  const rules = ["灵山大佛", "九龙灌浴", "梵宫", "五印坛城", "祥符禅寺", "路线", "门票", "开放时间"];
  return rules.find((rule) => text.includes(rule)) || "综合咨询";
}

/**
 * @description 根据评论、情绪、投票和评分划分反馈主题。
 * @private
 * @param {object} item 反馈对象。
 * @returns {string} 聚类标签。
 */
function clusterFeedback(item) {
  const text = `${item.comment || ""} ${item.emotion || ""}`;
  if (/演出|九龙|时间|几点/.test(text)) return "演出时间不清楚";
  if (/路线|太长|走不动|累/.test(text)) return "路线长度与体力不匹配";
  if (/门票|价格|收费|消费/.test(text)) return "票务与消费信息";
  if (/讲解|回答|不准|错误|听不懂/.test(text)) return "回答准确性与表达";
  if (item.vote === "down" || Number(item.rating) <= 2) return "低满意度体验";
  return item.emotion || "正向反馈";
}

/**
 * @description 计算有限数值的平均值并保留一位小数。
 * @private
 * @param {Array<*>} values 候选数值。
 * @returns {number} 平均值；无有效数值时为 `0`。
 */
function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(1)) : 0;
}
