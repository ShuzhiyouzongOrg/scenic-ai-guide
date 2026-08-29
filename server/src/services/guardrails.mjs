/**
 * @fileoverview 用户问题的敏感内容、服务范围和情绪分类规则。
 *
 * @description 所有判断均为确定性的关键词匹配，可在知识检索前短路拒答、话题引导及数字人情绪选择。
 */

/**
 * @typedef {object} SensitiveDetection
 * @description 敏感内容检测结果。
 * @property {boolean} sensitive 是否命中敏感内容。
 * @property {string|null} category 首个命中的敏感类别。
 */

/**
 * @typedef {object} ScopeDetection
 * @description 景区服务范围检测结果。
 * @property {boolean} outOfScope 是否超出服务范围。
 * @property {string|null} place 命中的范围外景区名称。
 */

/**
 * @typedef {"negative"|"confused"|"tired"|"happy"} DetectedEmotion
 * @description 可用于数字人反馈策略的游客情绪。
 */

/**
 * @description 定义敏感内容类别及其触发词。
 * @type {Array<{category: string, terms: string[]}>} 敏感内容类别及触发词。
 */
const SENSITIVE_RULES = [
  {
    category: "abuse",
    terms: ["傻", "笨蛋", "白痴", "滚", "垃圾", "废物", "去死", "神经病", "shit", "fuck"]
  },
  {
    category: "politics",
    terms: ["政治", "选举", "政府", "领导人", "主席", "总统", "政党", "示威", "游行"]
  },
  {
    category: "medical",
    terms: ["吃什么药", "怎么治疗", "确诊", "病情", "诊断", "药方", "手术", "抑郁症", "怎么减肥"]
  },
  {
    category: "investment",
    terms: ["股票", "基金", "买房", "理财", "炒币", "比特币", "投资", "涨停", "买什么赚钱"]
  },
  {
    category: "danger",
    terms: ["自杀", "炸药", "制毒", "怎么翻墙", "攀爬大佛", "翻越围栏", "危险动作"]
  }
];

/**
 * @description 明确不属于灵山服务范围的其他景区名称。
 * 拈花湾是灵山子区域，故不在此列表中。
 * @type {string[]}
 */
const OTHER_PLACES = [
  "鼋头渚",
  "西湖",
  "故宫",
  "黄山",
  "泰山",
  "峨眉山",
  "普陀山",
  "九华山",
  "少林寺",
  "兵马俑",
  "长城",
  "颐和园",
  "天坛",
  "迪士尼",
  "环球影城"
];

/**
 * @description 表示问题属于灵山或拈花湾服务范围的关键词；比较问题只要命中其中之一也视为范围内。
 * @type {string[]}
 */
const LINGSHAN_SIGNALS = [
  "灵山",
  "大佛",
  "九龙灌浴",
  "梵宫",
  "五印坛城",
  "祥符禅寺",
  "胜境",
  "吉祥颂",
  "花开见佛",
  "抱佛脚",
  // 拈花湾禅意小镇 sub-area
  "拈花湾",
  "拈花",
  "禅意小镇",
  "拈花广场",
  "梵天花海",
  "香月花街",
  "拈花堂",
  "五灯湖",
  "鹿鸣谷",
  "禅行"
];

/**
 * @description 将待匹配值转换为小写文本。
 * @private
 * @param {*} value 任意输入值。
 * @returns {string} 小写字符串。
 */
function normalize(value) {
  return String(value || "").toLowerCase();
}

/**
 * @description 检测问题是否命中辱骂、政治、医疗、投资或危险行为规则。
 * @param {*} question 用户问题。
 * @returns {SensitiveDetection} 敏感标记及首个命中的类别。
 * @example
 * detectSensitive("该买什么股票？"); // { sensitive: true, category: "investment" }
 */
export function detectSensitive(question) {
  const text = normalize(question);
  for (const rule of SENSITIVE_RULES) {
    if (rule.terms.some((term) => text.includes(normalize(term)))) {
      return { sensitive: true, category: rule.category };
    }
  }
  return { sensitive: false, category: null };
}

/**
 * @description 检测问题是否明确询问服务范围外的其他景区。
 * @param {*} question 用户问题。
 * @returns {ScopeDetection} 范围外标记及命中的景区名称。
 * @example
 * detectOutOfScope("西湖有什么景点？"); // { outOfScope: true, place: "西湖" }
 */
export function detectOutOfScope(question) {
  const text = String(question || "");
  const mentionsLingshan = LINGSHAN_SIGNALS.some((signal) => text.includes(signal));
  if (mentionsLingshan) {
    return { outOfScope: false, place: null };
  }

  const place = OTHER_PLACES.find((item) => text.includes(item));
  if (place) {
    return { outOfScope: true, place };
  }

  return { outOfScope: false, place: null };
}

/**
 * @description 定义情绪类别及其触发词。
 * @type {Array<{emotion: DetectedEmotion, terms: string[]}>} 情绪类别及触发词。
 */
const EMOTION_RULES = [
  { emotion: "negative", terms: ["失望", "太差", "不好玩", "坑", "浪费", "生气", "投诉", "退票"] },
  { emotion: "confused", terms: ["看不懂", "不明白", "怎么走", "迷路", "找不到", "搞不清"] },
  { emotion: "tired", terms: ["好累", "走不动", "太热", "累了", "腿疼"] },
  { emotion: "happy", terms: ["太美了", "好看", "喜欢", "开心", "震撼", "值得"] }
];

/**
 * @description 检测问题中可用于安抚策略和数字人表情的情绪信号。
 * @param {*} question 用户问题。
 * @returns {DetectedEmotion|null} 首个命中的情绪；无匹配时返回 `null`。
 * @example
 * detectEmotion("我迷路了，怎么走？"); // "confused"
 */
export function detectEmotion(question) {
  const text = normalize(question);
  for (const rule of EMOTION_RULES) {
    if (rule.terms.some((term) => text.includes(normalize(term)))) {
      return rule.emotion;
    }
  }
  return null;
}
