/**
 * @fileoverview 数字人配置持久化、活动配置选择、回答状态映射与资源预热信息服务。
 *
 * @description 活动配置决定游客端加载讯飞云端交互数字人还是本地 Live2D，以及使用的形象、发音人和欢迎词。
 */

/**
 * @typedef {"xfyun"|"live2d"} DigitalHumanEngine
 * @description 数字人渲染引擎。
 */

/**
 * @typedef {"online"|"maintenance"|"text_only"} DigitalHumanServiceStatus
 * @description 数字人服务状态。
 */

/**
 * @typedef {object} DigitalHumanConfig
 * @description 客户端可使用的数字人配置。
 * @property {string} id 配置 ID。
 * @property {string} name 配置名称。
 * @property {DigitalHumanEngine} engine 渲染引擎。
 * @property {string} avatarId 讯飞形象 ID。
 * @property {string} vcn 讯飞发音人代码。
 * @property {string} modelId Live2D 角色目录名。
 * @property {string} characterAsset 角色资源说明。
 * @property {string} appearance 外观说明。
 * @property {string} outfit 服装说明。
 * @property {string} theme 主题说明。
 * @property {string} voiceId 语音标识。
 * @property {number} speechRate 语速倍率。
 * @property {string} welcomeText 欢迎语。
 * @property {string} emotionStyle 情感风格。
 * @property {DigitalHumanServiceStatus} serviceStatus 服务状态。
 * @property {boolean} enabled 是否为活动配置。
 * @property {string} updatedAt 更新时间。
 * @property {boolean} assetAvailable 当前引擎是否具备可渲染资源。
 * @property {{type: string, reason: string}} fallback 客户端降级策略。
 */

/**
 * @typedef {object} DigitalHumanState
 * @description 回答分类映射得到的数字人表情、动作和播报状态。
 * @property {string} expression 表情标识。
 * @property {string} action 动作标识。
 * @property {string} state 播报状态。
 * @property {string} ttsEmotion 语音情感标识。
 */

import { getDb } from "../db/database.mjs";

/**
 * @description 定义讯飞交互数字人形象 ID 的合法格式。
 * @type {RegExp} 讯飞交互数字人形象 ID 的允许格式。
 */
const XFYUN_AVATAR_ID_PATTERN = /^[a-z0-9]{16,64}$/i;

/**
 * @description 将数据库行转换为客户端配置，并计算资源可用性和降级策略。
 * @private
 * @param {Record<string, *>} row 数字人配置数据库行。
 * @returns {DigitalHumanConfig} 对外数字人配置。
 */
function toConfig(row) {
  const config = {
    id: row.id,
    name: row.name,
    // Rendering engine: 'xfyun' (iFlytek cloud stream) or 'live2d' (local canvas).
    engine: row.engine === "live2d" ? "live2d" : "xfyun",
    avatarId: row.avatar_id || "",
    vcn: row.vcn || "",
    // Live2D character folder name (only meaningful when engine === 'live2d').
    modelId: row.model_id || "",
    characterAsset: row.character_asset || "",
    appearance: row.appearance || "",
    outfit: row.outfit || "",
    theme: row.theme || "",
    voiceId: row.voice_id || row.vcn || "",
    speechRate: row.speech_rate ?? 1,
    welcomeText: row.welcome_text || "",
    emotionStyle: row.emotion_style || "warm",
    serviceStatus: row.service_status || "online",
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at
  };
  // Whether the visitor client can render this avatar at all. The iFlytek avatar
  // streams from the cloud (needs a valid avatarId); the Live2D avatar renders a
  // local canvas (needs a model_id). Text-only service mode disables both on
  // purpose. When the active engine can't render, the client degrades to text —
  // and an admin can switch to the other engine as a redundancy path.
  if (config.engine === "live2d") {
    config.assetAvailable = Boolean(config.modelId) && config.serviceStatus !== "text_only";
    config.fallback = config.assetAvailable
      ? { type: "live2d", reason: "Local Live2D canvas avatar; audio comes from backend TTS." }
      : { type: "text_only", reason: "Avatar disabled; visitor client should degrade to text + audio." };
  } else {
    config.assetAvailable = Boolean(config.avatarId) && config.serviceStatus !== "text_only";
    config.fallback = config.assetAvailable
      ? { type: "xfyun-avatar", reason: "iFlytek interactive avatar is streamed from the cloud." }
      : { type: "text_only", reason: "Avatar disabled; visitor client should degrade to text + audio." };
  }
  return config;
}

/**
 * @description 获取活动数字人配置；没有启用项时回退到最近更新的配置。
 * @returns {DigitalHumanConfig|null} 当前配置；数据库无记录时返回 `null`。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const active = getActiveDigitalHumanConfig();
 */
export function getActiveDigitalHumanConfig() {
  const db = getDb();
  const row =
    db.prepare("SELECT * FROM digital_human_configs WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1").get() ||
    db.prepare("SELECT * FROM digital_human_configs ORDER BY updated_at DESC LIMIT 1").get();
  return row ? toConfig(row) : null;
}

/**
 * @description 列出全部数字人配置，活动配置优先，其余按更新时间降序排列。
 * @returns {DigitalHumanConfig[]} 数字人配置列表。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const configs = listDigitalHumanConfigs();
 */
export function listDigitalHumanConfigs() {
  return getDb()
    .prepare("SELECT * FROM digital_human_configs ORDER BY enabled DESC, updated_at DESC")
    .all()
    .map(toConfig);
}

/**
 * @description 创建或更新数字人配置；显式启用新配置时先停用其他配置。
 * @param {Partial<DigitalHumanConfig>} [input={}] 配置字段。
 * @returns {DigitalHumanConfig} 保存后的配置。
 * @throws {Error & {statusCode: 400, code: "AVATAR_ID_INVALID"}} 在线讯飞配置缺少合法形象 ID 时抛出。
 * @throws {Error} 数据库写入或约束校验失败时透传异常。
 * @example
 * const config = updateDigitalHumanConfig({ id: "guide-main", engine: "live2d", modelId: "Haru", enabled: true });
 */
export function updateDigitalHumanConfig(input = {}) {
  const db = getDb();
  const active = input.id
    ? db.prepare("SELECT * FROM digital_human_configs WHERE id = ?").get(String(input.id))
    : null;
  const base = active ? toConfig(active) : getActiveDigitalHumanConfig() || {};
  const id = stringOr(input.id, base.id || `dh_${Date.now()}`);

  const next = {
    id,
    name: stringOr(input.name, base.name),
    engine: normalizeEngine(input.engine || base.engine),
    avatar_id: stringOr(input.avatarId, base.avatarId),
    vcn: stringOr(input.vcn, base.vcn),
    model_id: stringOr(input.modelId, base.modelId),
    character_asset: stringOr(input.characterAsset, base.characterAsset),
    appearance: stringOr(input.appearance, base.appearance),
    outfit: stringOr(input.outfit, base.outfit),
    theme: stringOr(input.theme, base.theme),
    voice_id: stringOr(input.voiceId, base.voiceId),
    speech_rate: numberOr(input.speechRate, base.speechRate ?? 1),
    welcome_text: stringOr(input.welcomeText, base.welcomeText),
    emotion_style: stringOr(input.emotionStyle, base.emotionStyle),
    service_status: normalizeServiceStatus(input.serviceStatus || base.serviceStatus),
    enabled: (input.enabled ?? base.enabled) ? 1 : 0,
    updated_at: new Date().toISOString()
  };

  if (next.engine === "xfyun" && next.service_status !== "text_only" && !XFYUN_AVATAR_ID_PATTERN.test(next.avatar_id)) {
    const error = new Error("A valid iFlytek avatar_id is required.");
    error.code = "AVATAR_ID_INVALID";
    error.statusCode = 400;
    throw error;
  }

  if (input.enabled === true) {
    db.prepare("UPDATE digital_human_configs SET enabled = 0").run();
  }

  db.prepare(
    `INSERT INTO digital_human_configs
       (id, name, engine, avatar_id, vcn, model_id, character_asset, appearance, outfit, theme, voice_id,
        speech_rate, welcome_text, emotion_style, service_status, enabled, updated_at)
     VALUES
       (@id, @name, @engine, @avatar_id, @vcn, @model_id, @character_asset, @appearance, @outfit, @theme, @voice_id,
        @speech_rate, @welcome_text, @emotion_style, @service_status, @enabled, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, engine = @engine, avatar_id = @avatar_id, vcn = @vcn, model_id = @model_id,
       character_asset = @character_asset, appearance = @appearance, outfit = @outfit, theme = @theme,
       voice_id = @voice_id, speech_rate = @speech_rate, welcome_text = @welcome_text,
       emotion_style = @emotion_style, service_status = @service_status, enabled = @enabled,
       updated_at = @updated_at`
  ).run(next);

  return toConfig(db.prepare("SELECT * FROM digital_human_configs WHERE id = ?").get(id));
}

/**
 * @description 删除非活动数字人配置。
 * @param {*} id 配置 ID。
 * @returns {{id: string, name: string}} 被删除配置的标识和名称。
 * @throws {Error & {statusCode: 404, code: "DIGITAL_HUMAN_CONFIG_NOT_FOUND"}} 配置不存在时抛出。
 * @throws {Error & {statusCode: 409, code: "DIGITAL_HUMAN_CONFIG_ACTIVE"|"DIGITAL_HUMAN_CONFIG_CHANGED"}} 配置仍活动或并发变化时抛出。
 * @throws {Error} 数据库查询或事务执行失败时透传异常。
 * @example
 * const deleted = deleteDigitalHumanConfig("guide-backup");
 */
export function deleteDigitalHumanConfig(id) {
  const normalizedId = String(id || "").trim();
  const db = getDb();
  const row = db.prepare("SELECT id, name, enabled FROM digital_human_configs WHERE id = ?").get(normalizedId);

  if (!row) {
    const error = new Error("Digital-human configuration not found.");
    error.statusCode = 404;
    error.code = "DIGITAL_HUMAN_CONFIG_NOT_FOUND";
    throw error;
  }

  if (row.enabled) {
    const error = new Error("The active digital-human configuration cannot be deleted.");
    error.statusCode = 409;
    error.code = "DIGITAL_HUMAN_CONFIG_ACTIVE";
    throw error;
  }

  const remove = db.transaction(() => {
    const result = db
      .prepare("DELETE FROM digital_human_configs WHERE id = ? AND enabled = 0")
      .run(normalizedId);
    if (result.changes !== 1) {
      const error = new Error("The digital-human configuration changed before it could be deleted.");
      error.statusCode = 409;
      error.code = "DIGITAL_HUMAN_CONFIG_CHANGED";
      throw error;
    }
  });
  remove();

  return { id: row.id, name: row.name || "" };
}

/**
 * @description 回答质量标签到数字人动作和 TTS 情绪的映射。
 * @type {Record<string, DigitalHumanState>} 回答质量标签到数字人动作和 TTS 情绪的映射。
 */
const labelMap = {
  路线推荐: { expression: "smile", action: "point", state: "guiding", ttsEmotion: "happy" },
  拒答: { expression: "apology", action: "nod", state: "finished", ttsEmotion: "sorry" },
  情感安抚: { expression: "thanks", action: "nod", state: "speaking", ttsEmotion: "gentle" },
  闲聊: { expression: "smile", action: "wave", state: "speaking", ttsEmotion: "happy" },
  事实问答: { expression: "calm", action: "nod", state: "speaking", ttsEmotion: "neutral" }
};

/**
 * @description 显式情绪标签到数字人状态的映射。
 * @type {Record<string, DigitalHumanState>} 显式情绪标签到数字人状态的映射。
 */
const emotionMap = {
  微笑: { expression: "smile", action: "point", state: "guiding", ttsEmotion: "happy" },
  抱歉: { expression: "apology", action: "nod", state: "finished", ttsEmotion: "sorry" },
  安抚: { expression: "thanks", action: "nod", state: "speaking", ttsEmotion: "gentle" },
  平静: { expression: "calm", action: "nod", state: "speaking", ttsEmotion: "neutral" }
};

/**
 * @description 根据回答标签、情绪和场景选择数字人的表情、动作、状态及语音情感。
 * @param {{label?: string, emotion?: string, scenario?: string}} [input={}] 回答分类信息。
 * @returns {DigitalHumanState} 客户端可执行的数字人状态。
 * @example
 * const state = mapAnswerToDigitalHumanState({ label: "路线推荐" });
 */
export function mapAnswerToDigitalHumanState({ label = "", emotion = "", scenario = "" } = {}) {
  if (scenario === "sensitive" || scenario === "no_data" || scenario === "out_of_scope") {
    return { expression: "apology", action: "nod", state: "finished", ttsEmotion: "sorry" };
  }
  return (
    emotionMap[emotion] ||
    labelMap[label] || { expression: "calm", action: "idle", state: "speaking", ttsEmotion: "neutral" }
  );
}

/**
 * @description 读取活动配置并生成客户端资源预热检查结果。
 * @returns {{ok: boolean, engine: DigitalHumanEngine, avatarId: string, modelId: string, vcn: string, fallback: object|undefined, warmedAt: string}} 资源标识与预热时间。
 * @throws {Error} 数据库查询失败时透传异常。
 * @example
 * const status = preloadDigitalHumanAssets();
 */
export function preloadDigitalHumanAssets() {
  const active = getActiveDigitalHumanConfig();
  // "ok" means an avatar identifier is configured for the active engine
  // (avatarId for iFlytek, modelId for Live2D). Text-only service mode still
  // reports ok=true here; whether the client actually renders is decided by
  // assetAvailable on the config itself.
  const hasIdentifier =
    active?.engine === "live2d" ? Boolean(active?.modelId) : Boolean(active?.avatarId);
  return {
    ok: hasIdentifier,
    engine: active?.engine || "xfyun",
    avatarId: active?.avatarId || "",
    modelId: active?.modelId || "",
    vcn: active?.vcn || "",
    fallback: active?.fallback,
    warmedAt: new Date().toISOString()
  };
}

/**
 * @description 规范化非空文本，否则采用回退值。
 * @private
 * @param {*} value 候选值。
 * @param {*} fallback 回退值。
 * @returns {string} 去除首尾空白后的文本。
 */
function stringOr(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback || "";
}

/**
 * @description 规范化正数，否则采用回退值。
 * @private
 * @param {*} value 候选数值。
 * @param {number} fallback 回退值。
 * @returns {number} 有限正数或回退值。
 */
function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * @description 将服务状态限制为受支持值。
 * @private
 * @param {*} value 候选状态。
 * @returns {DigitalHumanServiceStatus} 合法状态；未知值回退为 `online`。
 */
function normalizeServiceStatus(value) {
  return ["online", "maintenance", "text_only"].includes(value) ? value : "online";
}

/**
 * @description 将渲染引擎限制为讯飞或 Live2D。
 * @private
 * @param {*} value 候选引擎。
 * @returns {DigitalHumanEngine} `live2d` 或默认的 `xfyun`。
 */
function normalizeEngine(value) {
  return value === "live2d" ? "live2d" : "xfyun";
}
