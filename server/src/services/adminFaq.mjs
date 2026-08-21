/**
 * @fileoverview 管理端 FAQ 的 SQLite CRUD 与问句命中服务。
 *
 * 已启用 FAQ 会在 RAG 前被对话服务优先匹配，并按优先级处理高频问题。
 *
 * @typedef {{id: string, question: string, answer: string, keywords: string[], priority: number, enabled: boolean, createdAt: string, updatedAt: string}} AdminFaq
 */
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.mjs";

/**
 * 归一化 FAQ 匹配文本，消除大小写、空白和常见标点差异。
 * @param {unknown} text 原始文本。
 * @returns {string} 适合包含关系比较的文本。
 * @private
 */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:~～]+/g, "")
    .trim();
}

/**
 * 将数据库行转换为 API FAQ 结构。
 * @param {Record<string, any>} row `admin_faqs` 数据库行。
 * @returns {AdminFaq} 规范化 FAQ。
 * @private
 */
function toFaq(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    keywords: parseKeywords(row.keywords),
    priority: row.priority,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * 安全解析关键词 JSON。
 * @param {string|null|undefined} value JSON 文本。
 * @returns {string[]} 关键词数组；格式错误时返回空数组。
 * @private
 */
function parseKeywords(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 按优先级列出全部管理 FAQ。
 * @returns {AdminFaq[]} FAQ 列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const enabledFaqs = listAdminFaqs().filter((faq) => faq.enabled);
 */
export function listAdminFaqs() {
  return getDb()
    .prepare("SELECT * FROM admin_faqs ORDER BY priority DESC, created_at ASC")
    .all()
    .map(toFaq);
}

/**
 * 创建一条管理 FAQ。
 * @param {{question?: string, answer?: string, keywords?: unknown[], priority?: number, enabled?: boolean}} [input={}] FAQ 输入。
 * @returns {AdminFaq} 已持久化的 FAQ。
 * @throws {Error & {statusCode: number, code: string}} 问题或答案为空时抛出 `FAQ_REQUIRED`。
 * @throws {Error} 数据库写入失败时透传异常。
 * @example
 * const faq = createAdminFaq({ question: "几点开园？", answer: "请以当日公告为准。" });
 */
export function createAdminFaq(input = {}) {
  const question = String(input.question || "").trim();
  const answer = String(input.answer || "").trim();
  if (!question || !answer) {
    const error = new Error("question and answer are required.");
    error.statusCode = 400;
    error.code = "FAQ_REQUIRED";
    throw error;
  }

  const now = new Date().toISOString();
  const record = {
    id: `faq_${Date.now()}_${randomBytes(4).toString("hex")}`,
    question,
    answer,
    keywords: JSON.stringify(
      Array.isArray(input.keywords) ? input.keywords.map((item) => String(item).trim()).filter(Boolean) : []
    ),
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 50,
    enabled: input.enabled === false ? 0 : 1,
    created_at: now,
    updated_at: now
  };
  getDb()
    .prepare(
      `INSERT INTO admin_faqs (id, question, answer, keywords, priority, enabled, created_at, updated_at)
       VALUES (@id, @question, @answer, @keywords, @priority, @enabled, @created_at, @updated_at)`
    )
    .run(record);
  return toFaq(record);
}

/**
 * 局部更新指定 FAQ。
 * @param {string} id FAQ ID。
 * @param {{question?: string, answer?: string, keywords?: unknown[], priority?: number, enabled?: boolean}} [input={}] 待更新字段。
 * @returns {AdminFaq} 更新后的 FAQ。
 * @throws {Error & {statusCode: number, code: string}} ID 不存在时抛出 `FAQ_NOT_FOUND`。
 * @throws {Error} 数据库查询或更新失败时透传异常。
 * @example
 * updateAdminFaq(faqId, { priority: 90, enabled: true });
 */
export function updateAdminFaq(id, input = {}) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_faqs WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("FAQ not found.");
    error.statusCode = 404;
    error.code = "FAQ_NOT_FOUND";
    throw error;
  }

  const current = toFaq(row);
  const next = {
    id,
    question: input.question !== undefined ? String(input.question || "").trim() : current.question,
    answer: input.answer !== undefined ? String(input.answer || "").trim() : current.answer,
    keywords: JSON.stringify(
      Array.isArray(input.keywords)
        ? input.keywords.map((item) => String(item).trim()).filter(Boolean)
        : current.keywords
    ),
    priority:
      input.priority !== undefined && Number.isFinite(Number(input.priority))
        ? Number(input.priority)
        : current.priority,
    enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled ? 1 : 0,
    updated_at: new Date().toISOString()
  };
  db.prepare(
    `UPDATE admin_faqs
       SET question = @question, answer = @answer, keywords = @keywords,
           priority = @priority, enabled = @enabled, updated_at = @updated_at
     WHERE id = @id`
  ).run(next);
  return toFaq(db.prepare("SELECT * FROM admin_faqs WHERE id = ?").get(id));
}

/**
 * 在已启用 FAQ 中查找可直接回答当前问句的记录。
 * @param {string} question 用户问题。
 * @returns {AdminFaq|null} 首个问题或关键词命中的 FAQ。
 * @throws {Error} FAQ 数据库查询失败时透传异常。
 * @example
 * const faq = findAdminFaqAnswer("梵宫几点开放");
 */
export function findAdminFaqAnswer(question) {
  const normalizedQuestion = normalize(question);
  if (!normalizedQuestion) {
    return null;
  }

  return (
    listAdminFaqs().find((faq) => {
      if (!faq.enabled) return false;
      if (normalizedQuestion.includes(normalize(faq.question)) || normalize(faq.question).includes(normalizedQuestion)) {
        return true;
      }
      return faq.keywords.some((keyword) => normalizedQuestion.includes(normalize(keyword)));
    }) || null
  );
}
