import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.mjs";
import { getActiveDigitalHumanConfig, listDigitalHumanConfigs } from "./digitalHuman.mjs";

const SESSION_AUDIENCE = "scenic-digital-human-web";
const SESSION_ISSUER = "scenic-ai-guide";
const MAX_SESSION_ID_LENGTH = 128;

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

function signWebSessionPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sessionSignature(encoded)}`;
}

function sessionSignature(encodedPayload) {
  return createHmac("sha256", config.digitalHumanWeb.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
}

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

function normalizeVisitorSessionId(value) {
  const text = String(value || "").trim();
  if (!text) return `avatar-${randomUUID()}`;
  if (text.length > MAX_SESSION_ID_LENGTH || !/^[a-zA-Z0-9._:-]+$/.test(text)) {
    throw serviceError(400, "VISITOR_SESSION_ID_INVALID", "The visitor session id is invalid.");
  }
  return text;
}

function serviceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
