/**
 * @fileoverview 景点一分钟口播和游客到达后的实时伴随讲解生成服务。
 *
 * @typedef {object} NarrationResult
 * @property {string|null} spotId 景点 ID；仅凭名称且未匹配知识库时为 `null`。
 * @property {string} spotName 景点名称。
 * @property {string} narration 生成的口播文本。
 * @property {Array<*>} citations 采用的知识引用。
 * @property {string} provider 大模型供应商标识。
 * @property {string} model 大模型名称。
 */

import { loadKnowledge } from "./knowledgeBuild.mjs";
import { hybridSearch } from "./retrieval.mjs";
import { llmComplete } from "./llm.mjs";
import { buildNarrationSystemPrompt, buildAccompanySystemPrompt, buildContextBlock } from "./prompts.mjs";
import { formatPublicAssistantText } from "./chat.mjs";

/**
 * 按精确 ID、精确名称或别名从知识库定位景点。
 * @private
 * @param {{spotId?: string, spotName?: string}} query 景点查询条件。
 * @returns {object|null} 景点知识记录；未找到时返回 `null`。
 * @throws {Error} 当知识库加载失败时透传底层异常。
 */
function findSpot({ spotId, spotName }) {
  const knowledge = loadKnowledge();
  const spots = knowledge?.spots || [];
  if (spotId) {
    return spots.find((spot) => spot.id === spotId) || null;
  }
  if (spotName) {
    return (
      spots.find((spot) => spot.name === spotName) ||
      spots.find((spot) => (spot.aliases || []).some((alias) => spotName.includes(alias) || alias.includes(spotName))) ||
      null
    );
  }
  return null;
}

/**
 * 为目标景点获取口播依据；检索故障时回退为空资料，允许模型按无资料策略作答。
 * @private
 * @param {object|null} spot 已定位的景点记录。
 * @param {string} fallbackQuery 未定位景点时采用的查询文本。
 * @returns {Array<object>} 最多四条混合检索结果；检索失败时为空数组。
 */
function spotContextResults(spot, fallbackQuery) {
  try {
    const query = spot ? spot.name : fallbackQuery;
    return hybridSearch(query, { limit: 4 }).results;
  } catch {
    return [];
  }
}

/**
 * 为景点生成约一分钟、200 至 400 字的口播讲解。
 * @param {{spotId?: string, spotName?: string, signal?: AbortSignal}} [input={}] 生成参数。
 * @returns {Promise<NarrationResult>} 景点信息、口播、引用和模型元数据。
 * @throws {Error & {statusCode: 400, code: "SPOT_REQUIRED"}} 未提供有效景点 ID 或名称时抛出。
 * @throws {Error} 知识库加载或大模型调用失败时透传异常。
 * @example
 * const result = await generateSpotNarration({ spotName: "灵山大佛" });
 */
export async function generateSpotNarration({ spotId, spotName, signal } = {}) {
  const spot = findSpot({ spotId, spotName });
  if (!spot && !spotName) {
    const error = new Error("spotId or spotName is required.");
    error.statusCode = 400;
    error.code = "SPOT_REQUIRED";
    throw error;
  }

  const results = spotContextResults(spot, spotName);
  const context = buildContextBlock(results);
  const targetName = spot?.name || spotName;

  const messages = [
    { role: "system", content: buildNarrationSystemPrompt() },
    {
      role: "user",
      content: `${context}\n\n请为景点“${targetName}”生成约 1 分钟(200-400 字)的口播讲解词。`
    }
  ];

  const meta = {
    scenario: "narration",
    mode: "explain",
    question: `讲解 ${targetName}`,
    spot: spot || { name: targetName },
    results
  };

  const completion = await llmComplete({ messages, meta, maxTokens: 700, signal });

  return {
    spotId: spot?.id || null,
    spotName: targetName,
    narration: formatPublicAssistantText(completion.text),
    citations: results.slice(0, 3).map((item) => item.citation),
    provider: completion.provider,
    model: completion.model
  };
}

/**
 * 为刚到达景点的游客生成结合兴趣的实时伴随讲解。
 * @param {{spotId?: string, spotName?: string, interests?: string[], signal?: AbortSignal}} [input={}] 生成参数。
 * @returns {Promise<NarrationResult & {interests: string[]}>} 伴随讲解及原始兴趣列表。
 * @throws {Error & {statusCode: 400, code: "SPOT_REQUIRED"}} 无法得到景点名称时抛出。
 * @throws {Error} 知识库加载或大模型调用失败时透传异常。
 * @example
 * const result = await generateAccompanyNarration({ spotId: "LS-001", interests: ["佛教文化"] });
 */
export async function generateAccompanyNarration({ spotId, spotName, interests = [], signal } = {}) {
  const spot = findSpot({ spotId, spotName });
  const targetName = spot?.name || spotName;
  if (!targetName) {
    const error = new Error("spotId or spotName is required.");
    error.statusCode = 400;
    error.code = "SPOT_REQUIRED";
    throw error;
  }

  const results = spotContextResults(spot, targetName);
  const context = buildContextBlock(results);
  const interestText = interests.length ? `游客兴趣:${interests.join("、")}。` : "";

  const messages = [
    { role: "system", content: buildAccompanySystemPrompt() },
    {
      role: "user",
      content: `${context}\n\n游客刚到达“${targetName}”。${interestText}请生成到达此处后的实时伴随讲解(150-300 字)。`
    }
  ];

  const meta = {
    scenario: "accompany",
    mode: "explain",
    question: `到达 ${targetName}`,
    spot: spot || { name: targetName },
    interests,
    results
  };

  const completion = await llmComplete({ messages, meta, maxTokens: 500, signal });

  return {
    spotId: spot?.id || null,
    spotName: targetName,
    interests,
    narration: formatPublicAssistantText(completion.text),
    citations: results.slice(0, 2).map((item) => item.citation),
    provider: completion.provider,
    model: completion.model
  };
}
