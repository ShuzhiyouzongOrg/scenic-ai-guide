/**
 * @fileoverview 检索查询规划模块。
 * @description
 * 对原始问题执行不依赖外部模型的规范化、受控同义改写、特征提取和复合问题拆分，
 * 避免数字、否定词及景区专名在查询规划阶段发生语义漂移。
 */

/**
 * @typedef {object} QueryFeatures
 * @description 从规范化查询中提取的检索约束特征。
 * @property {string[]} negations 去重后的否定词。
 * @property {string[]} numbers 去重后的数字及其单位。
 * @property {string[]} entities 去重后的景区或景点实体。
 * @property {string[]} intents 去重后的用户意图词。
 */

/**
 * @typedef {object} QueryPlan
 * @description 保留原始语义并可直接供多通道检索使用的查询计划。
 * @property {string} original 去除首尾空白后的原始问题。
 * @property {string} normalized 统一标点、空白和大小写后的问题。
 * @property {string[]} variants 去重后的原问题、规范化问题和受控改写变体。
 * @property {QueryFeatures} features 查询约束特征。
 * @property {string[]} subQueries 最多三个局部子问题；简单问题为空数组。
 */

/**
 * @description
 * 构建保留原问题语义的轻量查询计划，不调用外部模型，
 * 并提取否定、数字、实体、意图和可选子问题。
 * @param {*} query 原始问题。
 * @returns {QueryPlan} 可供检索通道消费的查询计划。
 * @example
 * const plan = buildQueryPlan("请问灵山大佛多高，并且几点开放？");
 */
export function buildQueryPlan(query) {
  const original = String(query || "").trim();
  const normalized = original
    .normalize("NFKC")
    .replace(/[“”‘’]/gu, "")
    .replace(/[？！，。；、]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
  const stripped = normalized
    .replace(/^(请问|请告诉我|能否|可以帮我|麻烦|please|could you|can you)\s*/iu, "")
    .trim();
  const rewritten = applyControlledRewrites(stripped);
  const variants = [...new Set([original, normalized, rewritten].filter(Boolean))].slice(0, 3);
  const features = {
    negations: [...new Set(normalized.match(/不|没有|无|不是|未|不要|not|never|without/giu) || [])],
    numbers: [...new Set(normalized.match(/\d+(?:\.\d+)?(?:米|m|元|分钟|小时|年|月|日)?/giu) || [])],
    entities: [...new Set(normalized.match(/(?:灵山胜境|灵山大佛|九龙灌浴|灵山梵宫|五印坛城|祥符禅寺|拈花湾|禅意小镇)/gu) || [])],
    intents: [...new Set(normalized.match(/(?:高度|多高|开放时间|几点|门票|票价|路线|推荐|看点|特色|历史|文化|拍照|亲子|演出)/gu) || [])]
  };
  return {
    original,
    normalized,
    variants,
    features,
    subQueries: splitComplexQuery(stripped, features)
  };
}

/**
 * @description 对有限的高频表达执行确定性同义改写，不扩展原问题事实范围。
 * @param {string} value 已规范化的问题。
 * @returns {string} 受控改写后的查询文本。
 */
function applyControlledRewrites(value) {
  return value
    .replace(/多高/gu, "高度")
    .replace(/几点(?:开|关)?/gu, "开放时间")
    .replace(/哪儿|哪裡/gu, "哪里")
    .replace(/怎么去|如何游览/gu, "路线")
    .replace(/好玩不|值得去吗/gu, "有什么看点")
    .trim();
}

/**
 * @description
 * 将包含多个独立意图的复合问题拆成最多三个局部问题。
 * 只有检测到连接词且意图数至少为两个时才拆分，避免普通问句被过度切碎。
 * @param {string} value 已去除礼貌前缀的问题。
 * @param {Pick<QueryFeatures, "entities"|"intents">} features 查询特征。
 * @returns {string[]} 子问题列表；简单问题返回空数组。
 */
function splitComplexQuery(value, features) {
  const hasJoiner = /(?:并且|以及|同时|另外|还要|顺便|然后|；|;|\band\b|\balso\b)/iu.test(value);
  if (!hasJoiner || features.intents.length < 2) return [];
  const sharedEntity = features.entities[0] || "";
  const segments = value
    .split(/(?:并且|以及|同时|另外|还要|顺便|然后|；|;|\band\b|\balso\b)/iu)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2)
    .slice(0, 3);
  if (segments.length < 2) return [];
  return segments.map((segment) => (
    sharedEntity && !segment.includes(sharedEntity) ? `${sharedEntity} ${segment}` : segment
  ));
}
