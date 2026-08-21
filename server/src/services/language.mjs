/**
 * @fileoverview 用户问题语言识别、区域语言代码归一化及回答语言提示服务。
 * @typedef {"zh"|"en"|"ko"|"zh-TW"|"ja"|"th"} SupportedLocale
 */

/** @type {Set<SupportedLocale>} 系统能够生成回答的标准语言代码集合。 */
const supportedLocales = new Set(["zh", "en", "ko", "zh-TW", "ja", "th"]);

/**
 * 将浏览器或客户端传入的区域语言代码归一化为受支持代码。
 * 无法识别时根据问题文本自动推断。
 * @param {*} value 待归一化的语言代码，例如 `zh-CN` 或 `en-US`。
 * @param {*} [question=""] 用于回退识别的用户问题。
 * @returns {SupportedLocale} 标准语言代码。
 * @example
 * normalizeLocale("zh-Hant"); // "zh-TW"
 */
export function normalizeLocale(value, question = "") {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (lower === "zh-tw" || lower === "zh_hant" || lower === "zh-hant")
    return "zh-TW";
  if (
    lower === "zh" ||
    lower === "zh-cn" ||
    lower === "zh_hans" ||
    lower === "zh-hans"
  )
    return "zh";
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "ko" || lower.startsWith("ko-")) return "ko";
  if (lower === "ja" || lower.startsWith("ja-")) return "ja";
  if (lower === "th" || lower.startsWith("th-")) return "th";
  if (supportedLocales.has(raw)) return raw;

  return detectQuestionLocale(question);
}

/**
 * 根据字符范围启发式识别用户问题的主要语言。
 * @param {*} question 用户问题；非字符串值会先转换为字符串。
 * @returns {SupportedLocale} 推断出的标准语言代码，无法确定时为 `zh`。
 * @example
 * detectQuestionLocale("How do I get there?"); // "en"
 */
export function detectQuestionLocale(question) {
  const text = String(question || "");
  if (/[\uac00-\ud7af]/u.test(text)) return "ko";
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\u0e00-\u0e7f]/u.test(text)) return "th";
  if (/[靈灣宮點開間覽價線體與於臺龍門歷]/u.test(text)) return "zh-TW";
  if (/[a-z]/iu.test(text) && !/[\u3400-\u9fff]/u.test(text)) return "en";
  return "zh";
}

/**
 * 生成要求大模型使用指定语言回答的系统提示。
 * @param {*} locale 语言代码或可归一化的区域语言代码。
 * @returns {string} 对应语言编写的回答约束；未知语言回退为简体中文。
 * @example
 * localeInstruction("ko"); // "항상 자연스러운 한국어로 답변하세요."
 */
export function localeInstruction(locale) {
  const instructions = {
    zh: "请始终使用简体中文回答。",
    en: "Always answer in natural English.",
    ko: "항상 자연스러운 한국어로 답변하세요.",
    "zh-TW": "請始終使用繁體中文回答。",
    ja: "常に自然な日本語で回答してください。",
    th: "ตอบเป็นภาษาไทยที่เป็นธรรมชาติเสมอ",
  };
  return instructions[normalizeLocale(locale)] || instructions.zh;
}
