/**
 * @fileoverview 讯飞 Web 数字人的短期会话签发、校验、鉴权 URL 和启动参数构建服务。
 *
 * @typedef {object} DigitalHumanWebTokenPayload
 * @property {1} v 令牌结构版本。
 * @property {string} iss 签发者。
 * @property {string} aud 使用方。
 * @property {string} jti 唯一会话 ID。
 * @property {string} cid 数字人配置 ID。
 * @property {string} sid 游客会话 ID。
 * @property {number} iat 签发 Unix 秒时间戳。
 * @property {number} exp 过期 Unix 秒时间戳。
 * @typedef {Error & {statusCode: number, code: string}} DigitalHumanWebError
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.mjs";
import { getActiveDigitalHumanConfig, listDigitalHumanConfigs } from "./digitalHuman.mjs";

/** @type {string} Web 数字人会话令牌的固定 audience。 */
const SESSION_AUDIENCE = "scenic-digital-human-web";
/** @type {string} Web 数字人会话令牌的固定 issuer。 */
const SESSION_ISSUER = "scenic-ai-guide";
/** @type {number} 游客会话 ID 允许的最大字符数。 */
const MAX_SESSION_ID_LENGTH = 128;

/**
 * 为可用的在线讯飞数字人配置签发短期 Web 会话。
 * @param {{configId?: string, visitorSessionId?: string}} [input={}] 会话输入。
 * @returns {{token: string, configId: string, expiresAt: string, sessionUrl: string, pageUrl: string, bootstrapUrl: string}} 会话令牌和页面/API 地址。
 * @throws {DigitalHumanWebError} 配置不存在、不可用，游客会话 ID 非法或讯飞凭据未配置时抛出。
 * @throws {Error} 数字人配置数据库查询失败时透传异常。
 * @example
 * const session = createDigitalHumanWebSession({ visitorSessionId: "visitor-1" });
 */
export function createDigitalHumanWebSession({ configId = "", visitorSessionId = "" } = {}) {
  const digitalHuman = resolveOnlineXfyunConfig(configId);
  assertAvatarCredentials();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + config.digitalHumanWeb.sessionTtlSeconds;
  const payload = {
    v: 1,
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    jti: randomUUID(),
    cid: digitalHuman.id,
    sid: normalizeVisitorSessionId(visitorSessionId),
    iat: nowSeconds,
    exp: expiresAtSeconds
  };
  const token = signWebSessionPayload(payload);
  const encodedToken = encodeURIComponent(token);
  const sessionUrl = `/digital-human/?session=${encodedToken}`;

  return {
    token,
    configId: digitalHuman.id,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    sessionUrl,
    // Compatibility alias for early uni-app x clients. sessionUrl is the
    // canonical field for new integrations.
    pageUrl: sessionUrl,
    bootstrapUrl: `/api/digital-human/web/bootstrap?session=${encodedToken}`
  };
}

/**
 * 验证短期会话并构建浏览器启动讯飞数字人所需的公开配置。
 * @param {*} token 会话令牌。
 * @returns {{session: {id: string, visitorSessionId: string, expiresAt: string}, digitalHuman: object, apiInfo: object, globalParams: object, endpoints: {ask: string}}} Web 启动数据。
 * @throws {DigitalHumanWebError} 令牌无效或过期、配置不可用、凭据缺失时抛出。
 * @throws {Error} 数字人配置数据库查询失败时透传异常。
 * @example
 * const bootstrap = getDigitalHumanWebBootstrap(session.token);
 */
export function getDigitalHumanWebBootstrap(token) {
  const session = verifyWebSessionToken(token);
  const digitalHuman = resolveOnlineXfyunConfig(session.cid);
  assertAvatarCredentials();

  const signedUrl = buildXfyunAvatarSignedUrl({
    serverUrl: config.digitalHumanWeb.serverUrl,
    apiKey: config.digitalHumanWeb.apiKey,
    apiSecret: config.digitalHumanWeb.apiSecret
  });

  return {
    session: {
      id: session.jti,
      visitorSessionId: session.sid,
      expiresAt: new Date(session.exp * 1000).toISOString()
    },
    digitalHuman: publicDigitalHumanConfig(digitalHuman),
    apiInfo: {
      appId: config.digitalHumanWeb.appId,
      signedUrl,
      sceneId: config.digitalHumanWeb.sceneId,
      sceneVersion: config.digitalHumanWeb.sceneVersion
    },
    globalParams: buildAvatarGlobalParams(digitalHuman),
    endpoints: {
      ask: "/api/chat/ask"
    }
  };
}

/**
 * 按讯飞 WebSocket 鉴权规范生成包含 authorization、date 和 host 的签名 URL。
 * @param {{serverUrl?: *, apiKey?: string, apiSecret?: string, date?: Date}} [options={}] 签名参数。
 * @returns {string} 可用于建立 WebSocket 连接的完整 URL。
 * @throws {DigitalHumanWebError} 地址不是合法 `wss:` URL 或鉴权信息缺失时抛出。
 * @example
 * const url = buildXfyunAvatarSignedUrl({ serverUrl: "wss://example.com/avatar", apiKey: "key", apiSecret: "secret" });
 */
export function buildXfyunAvatarSignedUrl({
  serverUrl,
  apiKey,
  apiSecret,
  date = new Date()
} = {}) {
  let target;
  try {
    target = new URL(String(serverUrl || ""));
  } catch {
    throw serviceError(500, "XFYUN_AVATAR_URL_INVALID", "The iFlytek avatar server URL is invalid.");
  }
  if (target.protocol !== "wss:" || !target.hostname || !target.pathname) {
    throw serviceError(500, "XFYUN_AVATAR_URL_INVALID", "The iFlytek avatar server URL is invalid.");
  }
  if (!apiKey || !apiSecret) {
    throw serviceError(503, "XFYUN_AVATAR_UNAVAILABLE", "The iFlytek avatar service is not configured.");
  }

  const host = target.host;
  const requestPath = `${target.pathname}${target.search}`;
  const utcDate = date.toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${utcDate}\nGET ${requestPath} HTTP/1.1`;
  const signature = createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;

  target.searchParams.set("authorization", Buffer.from(authorizationOrigin, "utf8").toString("base64"));
  target.searchParams.set("date", utcDate);
  target.searchParams.set("host", host);
  return target.toString();
}

/**
 * 以恒定时间比较 HMAC，并验证会话结构、签发时间和最长有效期。
 * @param {*} token 待校验令牌。
 * @param {{now?: number}} [options={}] 可注入的当前 Unix 毫秒时间，便于测试。
 * @returns {DigitalHumanWebTokenPayload} 已验证的令牌载荷。
 * @throws {DigitalHumanWebError} 令牌格式、签名或载荷无效时抛出 `DIGITAL_HUMAN_SESSION_INVALID`，过期时抛出 `DIGITAL_HUMAN_SESSION_EXPIRED`。
 * @example
 * const payload = verifyWebSessionToken(token);
 */
export function verifyWebSessionToken(token, { now = Date.now() } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw serviceError(401, "DIGITAL_HUMAN_SESSION_INVALID", "The digital-human session is invalid.");
  }

  const expected = sessionSignature(parts[0]);
  const actual = Buffer.from(parts[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    throw serviceError(401, "DIGITAL_HUMAN_SESSION_INVALID", "The digital-human session is invalid.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw serviceError(401, "DIGITAL_HUMAN_SESSION_INVALID", "The digital-human session is invalid.");
  }

  const nowSeconds = Math.floor(now / 1000);
  const isValid = payload?.v === 1
    && payload.iss === SESSION_ISSUER
    && payload.aud === SESSION_AUDIENCE
    && typeof payload.jti === "string"
    && typeof payload.cid === "string"
    && Number.isInteger(payload.iat)
    && Number.isInteger(payload.exp)
    && payload.iat <= nowSeconds + 30
    && payload.exp > nowSeconds
    && payload.exp - payload.iat <= 300;
  if (!isValid) {
    const code = Number.isInteger(payload?.exp) && payload.exp <= nowSeconds
      ? "DIGITAL_HUMAN_SESSION_EXPIRED"
      : "DIGITAL_HUMAN_SESSION_INVALID";
    throw serviceError(401, code, "The digital-human session is invalid or expired.");
  }
  return payload;
}

/**
 * 将会话载荷编码并附加 HMAC 签名。
 * @private
 * @param {DigitalHumanWebTokenPayload} payload 会话载荷。
 * @returns {string} `base64url-payload.signature` 格式令牌。
 */
function signWebSessionPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sessionSignature(encoded)}`;
}

/**
 * 计算已编码会话载荷的 SHA-256 HMAC。
 * @private
 * @param {string} encodedPayload Base64URL 载荷。
 * @returns {string} Base64URL 签名。
 */
function sessionSignature(encodedPayload) {
  return createHmac("sha256", config.digitalHumanWeb.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
}

/**
 * 解析指定或活动的在线讯飞配置，并验证启动所需资源字段。
 * @private
 * @param {*} [configId=""] 可选配置 ID。
 * @returns {import("./digitalHuman.mjs").DigitalHumanConfig|object} 可启动的数字人配置。
 * @throws {DigitalHumanWebError} ID 过长、配置不存在或配置不可用于讯飞 Web 会话时抛出。
 * @throws {Error} 数据库查询失败时透传异常。
 */
function resolveOnlineXfyunConfig(configId = "") {
  const requestedId = String(configId || "").trim();
  if (requestedId.length > 128) {
    throw serviceError(400, "DIGITAL_HUMAN_CONFIG_INVALID", "The digital-human config id is invalid.");
  }
  const digitalHuman = requestedId
    ? listDigitalHumanConfigs().find((item) => item.id === requestedId)
    : getActiveDigitalHumanConfig();
  if (!digitalHuman) {
    throw serviceError(404, "DIGITAL_HUMAN_CONFIG_NOT_FOUND", "The digital-human config was not found.");
  }
  if (
    digitalHuman.engine !== "xfyun"
    || digitalHuman.serviceStatus !== "online"
    || !digitalHuman.assetAvailable
    || !digitalHuman.avatarId
    || !digitalHuman.vcn
  ) {
    throw serviceError(
      409,
      "DIGITAL_HUMAN_CONFIG_UNAVAILABLE",
      "Only an online iFlytek digital-human config can start a web session."
    );
  }
  return digitalHuman;
}

/**
 * 过滤后台专用字段，生成可返回浏览器的数字人配置。
 * @private
 * @param {object} digitalHuman 完整数字人配置。
 * @returns {{id: string, name: string, engine: "xfyun", avatarId: string, vcn: string, speechRate: number, welcomeText: string, emotionStyle: string, serviceStatus: string}} 公开配置。
 */
function publicDigitalHumanConfig(digitalHuman) {
  return {
    id: digitalHuman.id,
    name: digitalHuman.name,
    engine: "xfyun",
    avatarId: digitalHuman.avatarId,
    vcn: digitalHuman.vcn,
    speechRate: digitalHuman.speechRate,
    welcomeText: digitalHuman.welcomeText,
    emotionStyle: digitalHuman.emotionStyle,
    serviceStatus: digitalHuman.serviceStatus
  };
}

/**
 * 将后台数字人配置转换为讯飞 SDK 的全局流、形象、TTS、动作和字幕参数。
 * @private
 * @param {object} digitalHuman 数字人配置。
 * @returns {object} 讯飞互动数字人 SDK 全局参数。
 */
function buildAvatarGlobalParams(digitalHuman) {
  const speed = Math.max(0, Math.min(100, Math.round(Number(digitalHuman.speechRate || 1) * 50)));
  return {
    stream: { protocol: "xrtc", fps: 25, bitrate: 1_000_000, alpha: 0 },
    avatar: {
      avatar_id: digitalHuman.avatarId,
      width: 1080,
      height: 960,
      mask_region: "[0,0,1080,1080]",
      scale: 1,
      move_h: 0,
      move_v: 0,
      audio_format: 1
    },
    tts: {
      vcn: digitalHuman.vcn,
      speed,
      pitch: 50,
      volume: 100
    },
    avatar_dispatch: { interactive_mode: 1, enable_action_status: 1 },
    subtitle: { subtitle: 1, font_color: "#FFFFFF" }
  };
}

/**
 * 校验讯飞 Web 数字人凭据和至少 32 字符的会话签名密钥。
 * @private
 * @returns {void}
 * @throws {DigitalHumanWebError} 任一必要配置缺失时抛出 `XFYUN_AVATAR_UNAVAILABLE`。
 */
function assertAvatarCredentials() {
  if (
    !config.digitalHumanWeb.appId
    || !config.digitalHumanWeb.apiKey
    || !config.digitalHumanWeb.apiSecret
    || !config.digitalHumanWeb.sessionSecret
    || config.digitalHumanWeb.sessionSecret.length < 32
  ) {
    throw serviceError(503, "XFYUN_AVATAR_UNAVAILABLE", "The iFlytek avatar service is not configured.");
  }
}

/**
 * 规范化游客会话 ID；空值自动生成随机 ID。
 * @private
 * @param {*} value 候选会话 ID。
 * @returns {string} 合法会话 ID。
 * @throws {DigitalHumanWebError} ID 超过 128 字符或包含白名单外字符时抛出 `VISITOR_SESSION_ID_INVALID`。
 */
function normalizeVisitorSessionId(value) {
  const text = String(value || "").trim();
  if (!text) return `avatar-${randomUUID()}`;
  if (text.length > MAX_SESSION_ID_LENGTH || !/^[a-zA-Z0-9._:-]+$/.test(text)) {
    throw serviceError(400, "VISITOR_SESSION_ID_INVALID", "The visitor session id is invalid.");
  }
  return text;
}

/**
 * 创建携带 HTTP 状态码和业务错误码的 Web 数字人异常。
 * @private
 * @param {number} statusCode HTTP 状态码。
 * @param {string} code 业务错误码。
 * @param {string} message 错误说明。
 * @returns {DigitalHumanWebError} 服务异常。
 */
function serviceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
