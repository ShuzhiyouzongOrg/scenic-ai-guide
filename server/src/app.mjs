/**
 * @fileoverview 数智游踪 Node.js HTTP 服务入口和路由编排器。
 * @description 初始化数据库，分派 REST 与 SSE 接口，执行认证授权，并托管 Web、数字人和 Live2D 静态资源。
 *
 * 本模块负责初始化 SQLite、分派 REST/SSE 接口、执行 Bearer Token 与角色权限校验、
 * 托管 Web SPA、讯飞数字人页面和 Live2D 资源，并提供可由测试及 Electron 调用的
 * `startServer`/`stopServer` 生命周期 API。
 *
 * @example
 * import { startServer, stopServer } from "./app.mjs";
 * await startServer({ host: "127.0.0.1", port: 0 });
 * // ...执行集成请求
 * await stopServer();
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { logError, logInfo } from "./logger.mjs";
import { fail, ok, created } from "./http/response.mjs";
import { getBearerToken, readJson, readMultipartForm } from "./http/request.mjs";
import { resolveStaticFilePath } from "./http/staticPath.mjs";
import { createVisitorSession, login, register, verifyToken } from "./services/auth.mjs";
import { getProfileAvatar, MAX_PROFILE_AVATAR_BYTES, saveProfileAvatar } from "./services/profileAvatar.mjs";
import {
  createUpload,
  getUploadContent,
  getUploadPreview,
  listUploadCitations,
  listUploads,
  reindexUploads,
  reprocessUpload,
  setUploadEnabled
} from "./services/uploads.mjs";
import {
  activateKnowledgeVersion,
  buildKnowledge,
  getActiveKnowledgeVersion,
  listKnowledgeVersions,
  loadKnowledge,
  restoreBundledKnowledge
} from "./services/knowledgeBuild.mjs";
import { hybridSearchAsync, keywordSearch } from "./services/retrieval.mjs";
import {
  answerQuestion,
  answerQuestionStream,
  formatPublicAssistantText,
  formatPublicConversationMessages
} from "./services/chat.mjs";
import { generateSpotNarration, generateAccompanyNarration } from "./services/narration.mjs";
import { getRouteGraph, recommendRoute, saveRouteSelection, listSavedRoutes, narrateRouteNode } from "./services/routePlanner.mjs";
import { transcribeAudio, synthesizeSpeech, voiceAsk, getAudioClip } from "./services/voice.mjs";
import {
  deleteDigitalHumanConfig,
  getActiveDigitalHumanConfig,
  listDigitalHumanConfigs,
  preloadDigitalHumanAssets,
  updateDigitalHumanConfig
} from "./services/digitalHuman.mjs";
import {
  createDigitalHumanWebSession,
  getDigitalHumanWebBootstrap
} from "./services/digitalHumanWeb.mjs";
import { faqCacheStats } from "./services/faqCache.mjs";
import { getRetrievalTrace, listRetrievalTraces } from "./services/retrievalTrace.mjs";
import {
  exportKnowledgeGapsCsv,
  listKnowledgeGaps,
  updateKnowledgeGapStatus
} from "./services/knowledgeGaps.mjs";
import {
  getRagExperimentReport,
  recordRagCitationClick,
  resetRagExperiment
} from "./services/ragExperiment.mjs";
import { clearMessages, getMessages } from "./services/conversation.mjs";
import { listAdminAudits, recordAdminAudit } from "./services/adminAudit.mjs";
import { createFeedback, listFeedback } from "./services/feedback.mjs";
import { createAdminFaq, findAdminFaqAnswer, listAdminFaqs, updateAdminFaq } from "./services/adminFaq.mjs";
import { createScenicSpot, disableScenicSpot, listAllManagedScenicSpots, listManagedScenicSpots, updateScenicSpot } from "./services/scenicAdmin.mjs";
import { getDashboardAnalytics, loadBehaviorDataset } from "./services/behaviorAnalytics.mjs";
import { getWebVitalReport, recordWebVital } from "./services/webVitals.mjs";
import {
  annotateMessage,
  buildServiceQualityReport,
  createKnowledgeDraftFromMessage,
  getConversationDetail,
  listConversationSummaries,
  listFeedbackClusters
} from "./services/serviceQuality.mjs";
import { schema } from "./db/schema.mjs";
import { closeDb, getDb, syncKnowledgeSnapshot } from "./db/database.mjs";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAdminUserProfile,
  updateAdminUserProfile,
  changeAdminUserPassword
} from "./services/userAdmin.mjs";
import {
  listRoles,
  createRole,
  updateRole,
  updateRolePermissions,
  deleteRole,
  getRolePermissions,
  hasRolePermission
} from "./services/roleAdmin.mjs";
import { generateDemoData } from "./services/demoData.mjs";
import {
  getMapGuideBootstrap,
  getMapGuidePanoramas,
  getMapGuideRoutes,
  getMapGuideSpots,
  normalizeMapGuideArea
} from "./services/mapGuide.mjs";

// The API server persists to a SQLite file. Test / eval scripts import the
// services directly (not this module) and leave SQLITE_PATH unset, so they run
// against a fresh in-memory database. Bootstrapping here migrates and seeds.
if (!process.env.SQLITE_PATH) {
  process.env.SQLITE_PATH = resolve(config.dataDir, "scenic.sqlite");
}
getDb();

/**
 * @description 仓库根目录绝对路径。
 * @type {string}
 */
const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
/**
 * @description Vue 生产构建的静态根目录。
 * @type {string}
 */
const publicDir = resolve(process.env.WEB_DIST_DIR || join(rootDir, "web", "dist"));
/**
 * @description 受控讯飞数字人宿主页目录。
 * @type {string}
 */
const digitalHumanPageDir = resolve(join(rootDir, "server", "src", "web", "digital-human"));
// The Live2D host is intentionally kept under server/src/web so visitor-app
// can load a real Cubism canvas without changing the existing root web build.
// Unlike /digital-human, its model and texture tree is served by a bounded
// path resolver below; no credentials or API session data are exposed here.
/**
 * @description 本地 Live2D 页面及模型资源目录。
 * @type {string}
 */
const live2dPageDir = resolve(join(rootDir, "server", "src", "web", "live2d"));
/**
 * @description Vue public 目录构建后的 Live2D 共享资源根目录。
 * @type {string}
 */
const live2dPublicDir = resolve(join(publicDir, "live2d"));
/**
 * @description 管理员知识重建最短间隔记录。
 * @type {Map<string, number>}
 */
const knowledgeRebuildRateLimits = new Map();
/**
 * @description 同一管理员两次知识重建的最短间隔。
 * @type {number}
 */
const KNOWLEDGE_REBUILD_INTERVAL_MS = 60_000;
/**
 * @description 允许公开读取的讯飞 Web SDK 目录。
 * @type {string}
 */
const digitalHumanSdkDir = resolve(join(rootDir, "web", "src", "vm-sdk", "avatar-sdk-web_3.1.1.1011"));
/**
 * @description 数字人页面允许公开的文件白名单。
 * @type {Set<string>}
 */
const digitalHumanPageFiles = new Set(["index.html", "app.js", "styles.css", "stage-ui.js", "stage-tokens.css"]);
/**
 * @description 数字人运行所需 SDK 文件白名单。
 * @type {Set<string>}
 */
const digitalHumanSdkFiles = new Set([
  "index.js",
  "index-_37811BO.js",
  "webrtc-player-6-MVvVqH.js",
  "xrtc-player-BDn4MFE-.js"
]);

/**
 * @description 文件扩展名到 HTTP Content-Type 的映射。
 * @type {Readonly<Record<string, string>>}
 */
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".moc3": "application/octet-stream",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

/**
 * @description 允许跨域调用本地 API 的明确来源集合。
 * @type {Set<string>}
 */
const localCorsOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  ...String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
]);

/**
 * @description 当请求来源命中白名单时写入最小 CORS 响应头。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {void}
 * @private
 */
function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || "");
  if (!origin || !localCorsOrigins.has(origin)) return;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type");
  res.setHeader("access-control-max-age", "600");
  res.setHeader("vary", "Origin");
}

/**
 * @description 项目共享 HTTP Server 实例。
 *
 * 请求级异常会转成统一错误信封并写入结构化日志；实例本身需通过 `startServer` 启动。
 *
 * @type {import("node:http").Server}
 * @example
 * await startServer({ port: 0 });
 * console.log(server.address());
 */
export const server = createServer(async (req, res) => {
  const start = Date.now();
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  applyCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    await route(req, res, url);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const code = error.code || "INTERNAL_ERROR";
    logError("request failed", {
      method: req.method,
      path: url.pathname,
      statusCode,
      code,
      error: error.message
    });
    fail(res, statusCode, code, error.message);
  } finally {
    logInfo("request completed", {
      method: req.method,
      path: url.pathname,
      statusCode: res.statusCode,
      durationMs: Date.now() - start
    });
  }
});

/**
 * @description 按方法和 pathname 分派全部 API 与静态资源请求。
 *
 * 权限受控接口在进入服务层前调用 `requirePermission` 或 `requireAuthPayload`；未匹配的
 * 路径最终交给 SPA 静态托管。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {URL} url 已解析的请求 URL。
 * @returns {Promise<void>}
 * @throws {Error & {statusCode?: number, code?: string}} 请求解析或服务层调用失败时抛出，
 * 由 Server 顶层处理器转换为错误响应。
 * @private
 */
async function route(req, res, url) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    ok(res, {
      appName: config.appName,
      environment: config.nodeEnv,
      providers: config.providers,
      time: new Date().toISOString()
    });
    return;
  }

  if (url.pathname === "/api/schema" && req.method === "GET") {
    ok(res, schema);
    return;
  }

  if (url.pathname === "/api/knowledge/summary" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const knowledge = loadKnowledge();
    if (!knowledge) {
      ok(res, {
        status: "not_built",
        documents: 0,
        spots: 0,
        guideSections: 0,
        chunks: 0
      });
      return;
    }

    ok(res, {
      status: "ready",
      generatedAt: knowledge.generatedAt,
      indexVersion: knowledge.indexVersion || null,
      scope: knowledge.scope,
      documents: knowledge.documents.length,
      spots: knowledge.spots.length,
      guideSections: knowledge.guideSections.length,
      chunks: knowledge.chunks.length
    });
    return;
  }

  if (url.pathname === "/api/knowledge/rebuild" && req.method === "POST") {
    const payload = requireAdminPayload(req, res);
    if (!payload) return;
    const rateKey = `${payload.uid || payload.sub || "admin"}:knowledge_rebuild`;
    const lastRun = knowledgeRebuildRateLimits.get(rateKey) || 0;
    if (Date.now() - lastRun < KNOWLEDGE_REBUILD_INTERVAL_MS) {
      recordAdminAudit({
        actorId: payload.uid || payload.sub,
        actorRole: payload.role,
        action: "knowledge.rebuild",
        targetType: "knowledge_index",
        status: "rejected",
        details: { reason: "rate_limited" }
      });
      fail(res, 429, "KNOWLEDGE_REBUILD_RATE_LIMITED", "Knowledge rebuild is rate limited. Try again later.");
      return;
    }
    knowledgeRebuildRateLimits.set(rateKey, Date.now());
    let knowledge;
    let source = "source";
    try {
      knowledge = buildKnowledge();
    } catch (error) {
      if (error.code !== "SOURCE_FILE_NOT_FOUND") {
        throw error;
      }
      knowledge = restoreBundledKnowledge({ force: true });
      source = "bundled";
    }
    const uploads = reindexUploads();
    knowledge = loadKnowledge() || knowledge;
    syncKnowledgeSnapshot(getDb(), knowledge);
    recordAdminAudit({
      actorId: payload.uid || payload.sub,
      actorRole: payload.role,
      action: "knowledge.rebuild",
      targetType: "knowledge_index",
      targetId: knowledge.indexVersion,
      status: "success",
      details: { documents: knowledge.documents.length, chunks: knowledge.chunks.length, source }
    });
    created(res, {
      generatedAt: knowledge.generatedAt,
      indexVersion: knowledge.indexVersion || null,
      documents: knowledge.documents.length,
      spots: knowledge.spots.length,
      guideSections: knowledge.guideSections.length,
      chunks: knowledge.chunks.length,
      source,
      uploads
    });
    return;
  }

  if (url.pathname === "/api/scenic-spots" && req.method === "GET") {
    ok(res, listManagedScenicSpots());
    return;
  }

  if (url.pathname === "/api/map-guide/bootstrap" && req.method === "GET") {
    ok(res, getMapGuideBootstrap(normalizeMapGuideArea(url.searchParams.get("area"))));
    return;
  }

  if (url.pathname === "/api/map-guide/spots" && req.method === "GET") {
    ok(res, getMapGuideSpots(normalizeMapGuideArea(url.searchParams.get("area"))));
    return;
  }

  if (url.pathname === "/api/map-guide/routes" && req.method === "GET") {
    ok(res, getMapGuideRoutes(normalizeMapGuideArea(url.searchParams.get("area"))));
    return;
  }

  if (url.pathname === "/api/map-guide/panoramas" && req.method === "GET") {
    ok(res, getMapGuidePanoramas(normalizeMapGuideArea(url.searchParams.get("area"))));
    return;
  }

  if (url.pathname === "/api/admin/scenic-spots" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listAllManagedScenicSpots());
    return;
  }

  if (url.pathname === "/api/admin/scenic-spots" && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const body = await readJson(req);
    created(res, createScenicSpot(body));
    return;
  }

  const scenicAdminMatch = url.pathname.match(/^\/api\/admin\/scenic-spots\/([^/]+)$/);
  if (scenicAdminMatch && req.method === "PUT") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const body = await readJson(req);
    ok(res, updateScenicSpot(decodeURIComponent(scenicAdminMatch[1]), body));
    return;
  }

  if (scenicAdminMatch && req.method === "DELETE") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, disableScenicSpot(decodeURIComponent(scenicAdminMatch[1])));
    return;
  }

  // Admin user management (product closed-loop)
  if (url.pathname === "/api/admin/users" && req.method === "GET") {
    if (!requirePermission(req, res, "/system/user")) return;
    ok(res, listAdminUsers());
    return;
  }

  if (url.pathname === "/api/admin/users" && req.method === "POST") {
    if (!requirePermission(req, res, "/system/user")) return;
    const body = await readJson(req);
    created(res, createAdminUser(body));
    return;
  }

  const userAdminMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userAdminMatch && req.method === "PUT") {
    if (!requirePermission(req, res, "/system/user")) return;
    const body = await readJson(req);
    ok(res, updateAdminUser(decodeURIComponent(userAdminMatch[1]), body));
    return;
  }

  if (userAdminMatch && req.method === "DELETE") {
    if (!requirePermission(req, res, "/system/user")) return;
    ok(res, deleteAdminUser(decodeURIComponent(userAdminMatch[1])));
    return;
  }

  if (url.pathname === "/api/admin/roles" && req.method === "GET") {
    if (!requirePermission(req, res, "/system/role")) return;
    ok(res, listRoles(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  if (url.pathname === "/api/admin/roles" && req.method === "POST") {
    if (!requirePermission(req, res, "/system/role")) return;
    created(res, createRole(await readJson(req)));
    return;
  }

  const roleAdminMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
  if (roleAdminMatch && req.method === "PUT") {
    if (!requirePermission(req, res, "/system/role")) return;
    ok(res, updateRole(Number(decodeURIComponent(roleAdminMatch[1])), await readJson(req)));
    return;
  }

  if (roleAdminMatch && req.method === "DELETE") {
    if (!requirePermission(req, res, "/system/role")) return;
    ok(res, deleteRole(Number(decodeURIComponent(roleAdminMatch[1]))));
    return;
  }

  const rolePermissionMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/permissions$/);
  if (rolePermissionMatch && req.method === "PUT") {
    if (!requirePermission(req, res, "/system/role")) return;
    const body = await readJson(req);
    ok(res, updateRolePermissions(Number(decodeURIComponent(rolePermissionMatch[1])), body.permissions));
    return;
  }

  if (url.pathname === "/api/knowledge/chunks" && req.method === "GET") {
    if (!requireAdminPayload(req, res)) return;
    const knowledge = loadKnowledge();
    const chunks = knowledge?.chunks || [];
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    ok(res, chunks.slice(0, limit), {
      total: chunks.length,
      limit
    });
    return;
  }

  if (url.pathname === "/api/knowledge/search" && req.method === "POST") {
    if (!requireAdminPayload(req, res)) return;
    const body = await readJson(req);
    const mode = body.mode === "keyword" ? "keyword" : "hybrid";
    const result = mode === "keyword"
      ? keywordSearch(body.query, {
        limit: body.limit,
        locale: body.locale,
        accessScopes: ["public", "authenticated", "admin", "internal"],
        tenantId: body.tenantId || "default"
      })
      : await hybridSearchAsync(body.query, {
        limit: body.limit,
        locale: body.locale,
        accessScopes: ["public", "authenticated", "admin", "internal"],
        tenantId: body.tenantId || "default"
      });
    ok(res, result);
    return;
  }

  if (url.pathname === "/api/chat/ask" && req.method === "POST") {
    const body = await readJson(req);
    const fixedFaq = findAdminFaqAnswer(body.question);
    if (fixedFaq) {
      ok(res, {
        answer: formatPublicAssistantText(fixedFaq.answer),
        label: "事实问答",
        emotion: "平静",
        scenario: "grounded",
        cached: true,
        sources: [{ documentName: "后台固定问答", sectionTitle: fixedFaq.question }],
        retrieval: { results: [], intents: [], spotMatches: [] },
        digitalHuman: { expression: "calm", action: "nod", state: "speaking" },
        latency: { totalMs: 0, retrievalMs: 0, llmMs: 0, cached: true }
      });
      return;
    }
    const result = await answerQuestion({
      question: body.question,
      sessionId: body.sessionId,
      mode: body.mode,
      history: body.history,
      locale: body.locale
    });
    ok(res, result);
    return;
  }

  if (url.pathname === "/api/chat/stream" && req.method === "POST") {
    const body = await readJson(req);
    await streamChat(res, body);
    return;
  }

  if (url.pathname === "/api/chat/narrate" && req.method === "POST") {
    const body = await readJson(req);
    const result = await generateSpotNarration({
      spotId: body.spotId,
      spotName: body.spotName
    });
    ok(res, result);
    return;
  }

  if (url.pathname === "/api/chat/accompany" && req.method === "POST") {
    const body = await readJson(req);
    const result = await generateAccompanyNarration({
      spotId: body.spotId,
      spotName: body.spotName,
      interests: Array.isArray(body.interests) ? body.interests : []
    });
    ok(res, result);
    return;
  }

  if (url.pathname === "/api/voice/asr" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, await transcribeAudio({
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      transcript: body.transcript,
      locale: body.locale
    }));
    return;
  }

  if (url.pathname === "/api/voice/tts" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, await synthesizeSpeech({
      text: body.text,
      voice: body.voice,
      speed: body.speed
    }));
    return;
  }

  if (url.pathname === "/api/voice/ask" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, await voiceAsk({
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      transcript: body.transcript,
      question: body.question,
      sessionId: body.sessionId,
      mode: body.mode,
      locale: body.locale
    }));
    return;
  }

	if (url.pathname === "/api/voice/ask-upload" && req.method === "POST") {
		const { fields, files } = await readMultipartForm(req);
		const audio = files.audio || files.file || Object.values(files)[0];
		if (!audio?.buffer?.length) {
			const error = new Error("An audio file is required.");
			error.statusCode = 400;
			error.code = "AUDIO_FILE_REQUIRED";
			throw error;
		}
		ok(res, await voiceAsk({
			audioBase64: audio.buffer.toString("base64"),
			mimeType: audio.mimeType,
			transcript: fields.transcript || "",
			question: fields.question || "",
			sessionId: fields.sessionId || "",
			mode: fields.mode || "hybrid",
			locale: fields.locale || "zh-CN"
		}));
		return;
	}

  if (url.pathname === "/api/digital-human/config" && req.method === "GET") {
    ok(res, getActiveDigitalHumanConfig());
    return;
  }

  if (url.pathname === "/api/digital-human/configs" && req.method === "GET") {
    ok(res, listDigitalHumanConfigs());
    return;
  }

  const digitalHumanConfigMatch = url.pathname.match(/^\/api\/digital-human\/configs\/([^/]+)$/);
  if (digitalHumanConfigMatch && req.method === "DELETE") {
    if (!requirePermission(req, res, "/admin/digital-human")) return;
    ok(res, deleteDigitalHumanConfig(decodeURIComponent(digitalHumanConfigMatch[1])));
    return;
  }

  if (url.pathname === "/api/digital-human/config" && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/digital-human")) return;
    const body = await readJson(req);
    ok(res, updateDigitalHumanConfig(body));
    return;
  }

  if (url.pathname === "/api/digital-human/preload" && req.method === "POST") {
    ok(res, preloadDigitalHumanAssets());
    return;
  }

  if (url.pathname === "/api/digital-human/web/session" && req.method === "POST") {
    applyDigitalHumanApiHeaders(res);
    const body = await readJson(req);
    created(res, createDigitalHumanWebSession({
      configId: body.configId,
      visitorSessionId: body.visitorSessionId || body.sessionId
    }));
    return;
  }

  if (url.pathname === "/api/digital-human/web/bootstrap" && req.method === "GET") {
    applyDigitalHumanApiHeaders(res);
    const sessionToken = url.searchParams.get("session") || getBearerToken(req);
    ok(res, getDigitalHumanWebBootstrap(sessionToken));
    return;
  }

  if (url.pathname.startsWith("/api/voice/tts/audio/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/api/voice/tts/audio/".length));
    const clip = getAudioClip(id);
    if (!clip) {
      fail(res, 404, "AUDIO_NOT_FOUND", "Audio clip not found or expired.");
      return;
    }
    res.writeHead(200, {
      "content-type": clip.mimeType,
      "content-length": clip.buffer.length,
      "cache-control": "no-store"
    });
    res.end(clip.buffer);
    return;
  }

  if (url.pathname === "/api/chat/faq-cache" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, faqCacheStats());
    return;
  }

  if (url.pathname === "/api/admin/faqs" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listAdminFaqs());
    return;
  }

  if (url.pathname === "/api/admin/faqs" && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const body = await readJson(req);
    created(res, createAdminFaq(body));
    return;
  }

  const faqAdminMatch = url.pathname.match(/^\/api\/admin\/faqs\/([^/]+)$/);
  if (faqAdminMatch && req.method === "PUT") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const body = await readJson(req);
    ok(res, updateAdminFaq(decodeURIComponent(faqAdminMatch[1]), body));
    return;
  }

  if (url.pathname === "/api/routes/graph" && req.method === "GET") {
    ok(res, getRouteGraph());
    return;
  }

  if (url.pathname === "/api/routes/recommend" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, recommendRoute(body));
    return;
  }

  if (url.pathname === "/api/routes/save" && req.method === "POST") {
    const body = await readJson(req);
    created(res, saveRouteSelection({
      sessionId: body.sessionId,
      routeId: body.routeId,
      route: body.route,
      preferences: body.preferences
    }));
    return;
  }

  if (url.pathname === "/api/routes/saved" && req.method === "GET") {
    ok(res, listSavedRoutes(url.searchParams.get("sessionId") || ""));
    return;
  }

  if (url.pathname === "/api/routes/node/narrate" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, await narrateRouteNode({
      nodeId: body.nodeId,
      spotId: body.spotId,
      spotName: body.spotName
    }));
    return;
  }

  if (url.pathname === "/api/chat/history" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId") || "";
    ok(res, formatPublicConversationMessages(getMessages(sessionId)));
    return;
  }

  if (url.pathname === "/api/chat/history" && req.method === "DELETE") {
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!sessionId) {
      fail(res, 400, "SESSION_ID_REQUIRED", "A visitor session id is required.");
      return;
    }
    ok(res, clearMessages(sessionId));
    return;
  }

  if (url.pathname === "/api/feedback" && req.method === "POST") {
    const body = await readJson(req);
    created(res, createFeedback(body));
    return;
  }

  if (url.pathname === "/api/feedback" && req.method === "GET") {
    ok(res, listFeedback({ sessionId: url.searchParams.get("sessionId") || "" }));
    return;
  }

  if (url.pathname === "/api/rag/citation-click" && req.method === "POST") {
    const body = await readJson(req);
    ok(res, recordRagCitationClick({
      sessionId: body.sessionId,
      messageId: body.messageId
    }));
    return;
  }

  if (url.pathname === "/api/web-vitals" && req.method === "POST") {
    created(res, recordWebVital(await readJson(req)));
    return;
  }

  if (url.pathname === "/api/admin/knowledge/index-versions" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listKnowledgeVersions());
    return;
  }

  const knowledgeVersionActivateMatch = url.pathname.match(
    /^\/api\/admin\/knowledge\/index-versions\/([^/]+)\/activate$/
  );
  if (knowledgeVersionActivateMatch && req.method === "POST") {
    const payload = requireAdminPayload(req, res);
    if (!payload) return;
    const targetVersion = decodeURIComponent(knowledgeVersionActivateMatch[1]);
    const previousVersion = getActiveKnowledgeVersion();
    try {
      const knowledge = activateKnowledgeVersion(targetVersion);
      syncKnowledgeSnapshot(getDb(), knowledge);
      recordAdminAudit({
        actorId: payload.uid || payload.sub,
        actorRole: payload.role,
        action: "knowledge.version.activate",
        targetType: "knowledge_index",
        targetId: targetVersion,
        status: "success",
        details: { previousVersion, documents: knowledge.documents.length, chunks: knowledge.chunks.length }
      });
      ok(res, {
        activeVersion: targetVersion,
        previousVersion,
        versions: listKnowledgeVersions()
      });
    } catch (error) {
      if (previousVersion && previousVersion !== "unbuilt" && previousVersion !== targetVersion) {
        try {
          const restored = activateKnowledgeVersion(previousVersion);
          syncKnowledgeSnapshot(getDb(), restored);
        } catch {
          // Preserve the original activation error; the audit entry captures the failed target.
        }
      }
      recordAdminAudit({
        actorId: payload.uid || payload.sub,
        actorRole: payload.role,
        action: "knowledge.version.activate",
        targetType: "knowledge_index",
        targetId: targetVersion,
        status: "failed",
        details: { previousVersion, reason: error.code || "activation_failed" }
      });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/admin/conversations" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    const lowSatisfaction = url.searchParams.get("lowSatisfactionOnly") || url.searchParams.get("lowSatisfaction") || "";
    ok(res, listConversationSummaries({
      lowSatisfactionOnly: lowSatisfaction === "1" || lowSatisfaction === "true"
    }));
    return;
  }

  const conversationAdminMatch = url.pathname.match(/^\/api\/admin\/conversations\/([^/]+)$/);
  if (conversationAdminMatch && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    ok(res, getConversationDetail(decodeURIComponent(conversationAdminMatch[1])));
    return;
  }

  const messageAnnotationMatch = url.pathname.match(/^\/api\/admin\/messages\/([^/]+)\/annotation$/);
  if (messageAnnotationMatch && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    const body = await readJson(req);
    created(res, annotateMessage(decodeURIComponent(messageAnnotationMatch[1]), body));
    return;
  }

  const messageDraftMatch = url.pathname.match(/^\/api\/admin\/messages\/([^/]+)\/knowledge-draft$/);
  if (messageDraftMatch && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    created(res, createKnowledgeDraftFromMessage(decodeURIComponent(messageDraftMatch[1])));
    return;
  }

  if (url.pathname === "/api/admin/feedback/clusters" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    ok(res, listFeedbackClusters());
    return;
  }

  if (url.pathname === "/api/admin/service-quality/report" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/operation")) return;
    ok(res, buildServiceQualityReport());
    return;
  }

  if (url.pathname === "/api/admin/analytics/import" && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/analytics")) return;
    const dataset = loadBehaviorDataset({ force: true });
    created(res, {
      source: dataset.source,
      rows: dataset.rows.length
    });
    return;
  }

  if (url.pathname === "/api/admin/analytics/dashboard" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/analytics")) return;
    ok(res, getDashboardAnalytics({
      gender: url.searchParams.get("gender") || "",
      ageBand: url.searchParams.get("ageBand") || "",
      satisfactionMin: url.searchParams.get("minSatisfaction") || url.searchParams.get("satisfactionMin") || ""
    }));
    return;
  }

  if (url.pathname === "/api/admin/demo-data/generate" && req.method === "POST") {
    if (!requirePermission(req, res, "/admin/analytics")) return;
    created(res, generateDemoData());
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const result = login(body.username, body.password, body.role);
    if (!result) {
      fail(res, 401, "INVALID_CREDENTIALS", "Invalid username or password.");
      return;
    }

    ok(res, result);
    return;
  }

  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    created(res, register(await readJson(req)));
    return;
  }

  if (url.pathname === "/api/auth/avatar" && req.method === "POST") {
    const payload = requireAuthPayload(req, res);
    if (!payload) return;
    const { files } = await readMultipartForm(req, MAX_PROFILE_AVATAR_BYTES + 64 * 1024);
    const avatar = files.avatar || files.file;
    created(res, toAuthUser(saveProfileAvatar(payload.uid, avatar)));
    return;
  }

  if (url.pathname.startsWith("/api/auth/avatar/") && req.method === "GET") {
    const fileName = url.pathname.slice("/api/auth/avatar/".length);
    const avatar = getProfileAvatar(fileName);
    if (!avatar) {
      fail(res, 404, "AVATAR_NOT_FOUND", "Avatar image not found.");
      return;
    }
    res.writeHead(200, {
      "content-type": avatar.mimeType,
      "content-length": avatar.buffer.length,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    });
    res.end(avatar.buffer);
    return;
  }

  if (url.pathname === "/api/auth/profile" && req.method === "PUT") {
    const payload = requireAuthPayload(req, res);
    if (!payload) return;
    const body = await readJson(req);
    ok(res, toAuthUser(updateAdminUserProfile(payload.uid, body)));
    return;
  }

  if (url.pathname === "/api/auth/password" && req.method === "PUT") {
    const payload = requireAuthPayload(req, res);
    if (!payload) return;
    const body = await readJson(req);
    ok(res, changeAdminUserPassword(payload.uid, body.currentPassword, body.newPassword));
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const token = getBearerToken(req);
    const payload = verifyToken(token);
    if (!payload) {
      fail(res, 401, "UNAUTHORIZED", "Login is required.");
      return;
    }

    ok(res, toAuthUser(getAdminUserProfile(payload.uid), payload));
    return;
  }

  if (url.pathname === "/api/visitor/session" && req.method === "POST") {
    created(res, createVisitorSession());
    return;
  }

  if (url.pathname === "/api/uploads" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listUploads());
    return;
  }

  if (url.pathname === "/api/uploads" && req.method === "POST") {
    const payload = requireAdminPayload(req, res);
    if (!payload) return;
    const body = await readJson(req);
    const upload = createUpload(body);
    recordAdminAudit({
      actorId: payload.uid || payload.sub,
      actorRole: payload.role,
      action: "knowledge.upload",
      targetType: "knowledge_document",
      targetId: upload.id,
      status: "success",
      details: { fileType: upload.fileType, knowledgeScope: upload.knowledgeScope }
    });
    created(res, upload);
    return;
  }

  if (url.pathname === "/api/admin/analytics/web-vitals" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/analytics")) return;
    ok(res, getWebVitalReport({ limit: url.searchParams.get("limit") }));
    return;
  }

  if (url.pathname === "/api/knowledge/retrieval-traces" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const traceId = url.searchParams.get("traceId") || "";
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    ok(res, traceId ? getRetrievalTrace(traceId) : listRetrievalTraces({ limit }));
    return;
  }

  if (url.pathname === "/api/admin/knowledge-gaps/export" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    const csv = exportKnowledgeGapsCsv({
      status: url.searchParams.get("status") || "",
      limit: url.searchParams.get("limit") || 1000
    });
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-length": Buffer.byteLength(csv),
      "content-disposition": "attachment; filename=knowledge-gaps.csv",
      "cache-control": "private, no-store"
    });
    res.end(csv);
    return;
  }

  if (url.pathname === "/api/admin/knowledge-gaps" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listKnowledgeGaps({
      status: url.searchParams.get("status") || "",
      limit: url.searchParams.get("limit") || 100
    }));
    return;
  }

  if (url.pathname === "/api/admin/rag-experiment" && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, getRagExperimentReport());
    return;
  }

  if (url.pathname === "/api/admin/audit-logs" && req.method === "GET") {
    if (!requireAdminPayload(req, res)) return;
    ok(res, listAdminAudits({ limit: url.searchParams.get("limit") || 100 }));
    return;
  }

  if (url.pathname === "/api/admin/rag-experiment/reset" && req.method === "POST") {
    if (!requireAdminPayload(req, res)) return;
    ok(res, resetRagExperiment());
    return;
  }

  const knowledgeGapMatch = url.pathname.match(/^\/api\/admin\/knowledge-gaps\/([^/]+)$/);
  if (knowledgeGapMatch && req.method === "PUT") {
    if (!requireAdminPayload(req, res)) return;
    const body = await readJson(req);
    ok(res, updateKnowledgeGapStatus(decodeURIComponent(knowledgeGapMatch[1]), body.status));
    return;
  }

  const uploadReprocessMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/reprocess$/);
  if (uploadReprocessMatch && req.method === "POST") {
    if (!requireAdminPayload(req, res)) return;
    ok(res, reprocessUpload(decodeURIComponent(uploadReprocessMatch[1])));
    return;
  }

  const uploadCitationsMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/citations$/);
  if (uploadCitationsMatch && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, listUploadCitations(decodeURIComponent(uploadCitationsMatch[1])));
    return;
  }

  const uploadEnabledMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)$/);
  if (uploadEnabledMatch && req.method === "PUT") {
    if (!requireAdminPayload(req, res)) return;
    const body = await readJson(req);
    ok(res, setUploadEnabled(decodeURIComponent(uploadEnabledMatch[1]), body.enabled));
    return;
  }

  const uploadPreviewMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/preview$/);
  if (uploadPreviewMatch && req.method === "GET") {
    if (!requirePermission(req, res, "/admin/knowledge")) return;
    ok(res, getUploadPreview(decodeURIComponent(uploadPreviewMatch[1])));
    return;
  }

  const uploadContentMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)\/content$/);
  if (uploadContentMatch && req.method === "GET") {
    if (!requireAdminPayload(req, res)) return;
    const content = getUploadContent(decodeURIComponent(uploadContentMatch[1]));
    const encodedName = encodeURIComponent(content.fileName).replaceAll("'", "%27");
    res.writeHead(200, {
      "content-type": content.mimeType || "application/octet-stream",
      "content-length": content.buffer.length,
      "content-disposition": `inline; filename*=UTF-8''${encodedName}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(content.buffer);
    return;
  }

  if (url.pathname === "/digital-human" || url.pathname.startsWith("/digital-human/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      applyDigitalHumanSecurityHeaders(res);
      fail(res, 405, "METHOD_NOT_ALLOWED", "Only GET and HEAD are allowed for the digital-human runtime.");
      return;
    }
    serveDigitalHumanStatic(res, url.pathname, req.method === "HEAD");
    return;
  }

  if (url.pathname === "/live2d" || url.pathname.startsWith("/live2d/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      applyLive2dSecurityHeaders(res);
      fail(res, 405, "METHOD_NOT_ALLOWED", "Only GET and HEAD are allowed for the Live2D runtime.");
      return;
    }
    serveLive2dStatic(res, url.pathname, req.method === "HEAD");
    return;
  }

  serveStatic(req, res, url.pathname);
}

/**
 * @description 将 AI 回答增量编码为 Server-Sent Events 流。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {{question?: string, sessionId?: string, mode?: string, locale?: string}} body 对话请求体。
 * @returns {Promise<void>} 流完成或错误事件发送后结束响应。
 * @example
 * await streamChat(res, { question: "梵宫几点开放？", sessionId: "visitor-1" });
 * @private
 */
async function streamChat(res, body) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  /**
   * @description 写入一个 SSE 事件帧。
   * @param {string} event 事件名称。
   * @param {unknown} data 可 JSON 序列化的事件负载。
   * @returns {void}
   */
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    for await (const delta of answerQuestionStream({
      question: body.question,
      sessionId: body.sessionId,
      mode: body.mode,
      locale: body.locale
    })) {
      send("delta", { text: delta });
    }
    send("done", { ok: true });
  } catch (error) {
    logError("chat stream failed", { error: error.message, code: error.code });
    send("error", { code: error.code || "LLM_ERROR", message: error.message });
  } finally {
    res.end();
  }
}

/**
 * @description 校验 Bearer Token 及其当前角色是否拥有指定路径权限。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {string} permission 角色权限路径，例如 `/system/user`。
 * @returns {boolean} 校验成功时为 `true`；失败时已写入 401/403 响应并返回 `false`。
 * @private
 */
function requirePermission(req, res, permission) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload) {
    fail(res, 401, "UNAUTHORIZED", "Login is required.");
    return false;
  }
  if (!hasRolePermission(payload.role, permission)) {
    fail(res, 403, "FORBIDDEN", "This role does not have permission to access this resource.");
    return false;
  }
  return true;
}

/**
 * @description 仅允许系统管理员调用高风险知识变更或读取完整正文的接口。
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {Record<string, unknown>|null} 管理员 Token 载荷。
 * @private
 */
function requireAdminPayload(req, res) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload) {
    fail(res, 401, "UNAUTHORIZED", "Login is required.");
    return null;
  }
  if (payload.role !== "admin") {
    fail(res, 403, "ADMIN_REQUIRED", "Administrator role is required for this knowledge operation.");
    return null;
  }
  return payload;
}

/**
 * @description 验证请求 Token 并返回可信身份载荷。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {Record<string, unknown>|null} 有效 Token 载荷；无效时写入 401 并返回 `null`。
 * @private
 */
function requireAuthPayload(req, res) {
  const payload = verifyToken(getBearerToken(req));
  if (!payload) {
    fail(res, 401, "UNAUTHORIZED", "Login is required.");
    return null;
  }
  return payload;
}

/**
 * @description 将数据库账号与 Token 载荷归一化为前端用户信息结构。
 *
 * @param {Record<string, any>|null|undefined} user 数据库账号。
 * @param {Record<string, any>} [fallback={}] Token 中的备用身份字段。
 * @returns {{userId: string|number|undefined, userName: string, roles: string[], permissions: string[], buttons: string[], email: string, avatar: string, realName: string, gender: string, nickname: string, phone: string, address: string, bio: string}}
 * @private
 */
function toAuthUser(user, fallback = {}) {
  const role = user?.role || fallback.role || "operator";
  const roles = role === "admin"
    ? ["R_SUPER", "R_ADMIN"]
    : role === "operator"
      ? ["R_OPERATOR", "operator"]
      : ["R_USER", role];
  return {
    userId: user?.id || fallback.uid || fallback.sub,
    userName: user?.username || fallback.sub || "",
    roles,
    permissions: getRolePermissions(role),
    buttons: [],
    email: user?.email || "",
    avatar: user?.avatar || "",
    realName: user?.realName || "",
    gender: user?.gender || "",
    nickname: user?.nickname || user?.displayName || "",
    phone: user?.phone || "",
    address: user?.address || "",
    bio: user?.bio || ""
  };
}

/**
 * @description 从 Web 构建目录提供静态文件，并对无扩展名路由执行 SPA 回退。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {string} pathname URL pathname。
 * @returns {void}
 * @throws {Error} 文件存在但无法读取时透传文件系统异常。
 * @private
 */
function serveStatic(req, res, pathname) {
  let filePath = resolveStaticFilePath(publicDir, pathname);
  if (!filePath) {
    res.setHeader("cache-control", "no-store");
    fail(res, 400, "INVALID_PATH", "Resource path is invalid.");
    return;
  }

  // SPA fallback: unknown routes without a file extension serve index.html so
  // the Vue router can handle client-side navigation.
  if (!existsSync(filePath)) {
    if (!extname(filePath)) {
      filePath = join(publicDir, "index.html");
    }
    if (!existsSync(filePath)) {
      res.setHeader("cache-control", "no-store");
      fail(res, 404, "NOT_FOUND", "Resource not found.");
      return;
    }
  }

  const extension = extname(filePath);
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const relativePath = filePath.slice(publicDir.length).replaceAll("\\", "/");
  const cacheControl = extension === ".html"
    ? "no-cache"
    : isHashedAsset(relativePath)
      ? "public, max-age=31536000, immutable"
      : "no-cache";

  const compressedRepresentations = [
    { encoding: "br", path: `${filePath}.br` },
    { encoding: "gzip", path: `${filePath}.gz` }
  ].filter((item) => existsSync(item.path) && statSync(item.path).isFile());
  const selectedEncoding = selectStaticEncoding(
    req.headers["accept-encoding"],
    compressedRepresentations.map((item) => item.encoding)
  );
  const representationPath = compressedRepresentations.find(
    (item) => item.encoding === selectedEncoding
  )?.path || filePath;
  const representationStat = statSync(representationPath);
  const etag = createStaticEtag(representationStat, selectedEncoding || "identity");
  const headers = {
    "content-type": contentType,
    "content-length": representationStat.size,
    "cache-control": cacheControl,
    "last-modified": representationStat.mtime.toUTCString(),
    etag,
    vary: "Accept-Encoding"
  };
  if (selectedEncoding) headers["content-encoding"] = selectedEncoding;

  if (isStaticRequestFresh(req, etag, representationStat.mtimeMs)) {
    delete headers["content-length"];
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const body = readFileSync(representationPath);
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

/**
 * @description 判断主站构建资源名是否包含 Vite 内容哈希。
 *
 * @param {string} relativePath 相对 Web 构建目录的正斜杠路径。
 * @returns {boolean} 仅 `/assets/` 下带至少 8 位哈希的文件返回 `true`。
 * @private
 */
function isHashedAsset(relativePath) {
  return /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/u.test(relativePath);
}

/**
 * @description 按 RFC 9110 质量值选择可用的预压缩表示；质量相同时优先 Brotli。
 *
 * @param {string|string[]|undefined} header Accept-Encoding 请求头。
 * @param {string[]} availableEncodings 已存在的预压缩编码，按服务端偏好排序。
 * @returns {string|null} 选中的编码；没有可接受的预压缩表示时返回 `null`。
 * @private
 */
function selectStaticEncoding(header, availableEncodings) {
  const qualities = new Map();
  let wildcardQuality;
  for (const item of String(header || "").split(",")) {
    const [rawCoding, ...parameters] = item.trim().split(";");
    const coding = rawCoding.trim().toLowerCase();
    if (!coding) continue;

    let quality = 1;
    const qualityParameter = parameters.find((parameter) => /^\s*q\s*=/iu.test(parameter));
    if (qualityParameter) {
      const parsedQuality = Number(qualityParameter.split("=", 2)[1]);
      quality = Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1
        ? parsedQuality
        : 0;
    }

    if (coding === "*") wildcardQuality = quality;
    else qualities.set(coding, quality);
  }

  return availableEncodings
    .map((encoding, preference) => ({
      encoding,
      preference,
      quality: qualities.get(encoding) ?? wildcardQuality ?? 0
    }))
    .filter((item) => item.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.preference - right.preference)[0]
    ?.encoding || null;
}

/**
 * @description 根据具体传输表示生成弱 ETag，确保 br、gzip 与 identity 不共享验证器。
 *
 * @param {import("node:fs").Stats} fileStat 实际传输文件的状态。
 * @param {"br"|"gzip"|"identity"} encoding 表示使用的内容编码。
 * @returns {string} 可用于条件 GET/HEAD 的弱实体标签。
 * @private
 */
function createStaticEtag(fileStat, encoding) {
  return `W/"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}-${encoding}"`;
}

/**
 * @description 按 If-None-Match 优先、If-Modified-Since 次之的顺序判断主站静态资源是否仍新鲜。
 *
 * @param {import("node:http").IncomingMessage} req HTTP 请求。
 * @param {string} etag 当前传输表示的 ETag。
 * @param {number} modifiedTimeMs 当前传输表示的修改时间戳。
 * @returns {boolean} GET/HEAD 可直接响应 304 时返回 `true`。
 * @private
 */
function isStaticRequestFresh(req, etag, modifiedTimeMs) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch !== undefined) {
    const normalizedEtag = etag.replace(/^W\//iu, "");
    return String(ifNoneMatch)
      .split(",")
      .some((candidate) => {
        const normalizedCandidate = candidate.trim();
        return normalizedCandidate === "*"
          || normalizedCandidate.replace(/^W\//iu, "") === normalizedEtag;
      });
  }

  const ifModifiedSince = req.headers["if-modified-since"];
  if (ifModifiedSince === undefined) return false;
  const sinceTime = Date.parse(String(ifModifiedSince));
  return Number.isFinite(sinceTime)
    && Math.floor(modifiedTimeMs / 1000) <= Math.floor(sinceTime / 1000);
}

/**
 * @description 按严格文件白名单提供讯飞数字人页面和 SDK 资源。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {string} pathname `/digital-human` 命名空间内的路径。
 * @param {boolean} [headOnly=false] 是否只返回响应头。
 * @returns {void}
 * @private
 */
function serveDigitalHumanStatic(res, pathname, headOnly = false) {
  applyDigitalHumanSecurityHeaders(res);
  if (pathname === "/digital-human") {
    res.writeHead(308, {
      location: "/digital-human/",
      "cache-control": "private, no-store, no-cache, must-revalidate"
    });
    res.end();
    return;
  }

  const relativePath = pathname.slice("/digital-human/".length);
  let root;
  let fileName;
  let allowlist;
  if (relativePath.startsWith("sdk/")) {
    root = digitalHumanSdkDir;
    fileName = relativePath.slice("sdk/".length);
    allowlist = digitalHumanSdkFiles;
  } else {
    root = digitalHumanPageDir;
    fileName = relativePath || "index.html";
    allowlist = digitalHumanPageFiles;
  }

  let decodedFileName;
  try {
    decodedFileName = decodeURIComponent(fileName);
  } catch {
    fail(res, 400, "INVALID_PATH", "Resource path is invalid.");
    return;
  }
  if (!allowlist.has(decodedFileName) || decodedFileName.includes("/") || decodedFileName.includes("\\")) {
    fail(res, 404, "NOT_FOUND", "Resource not found.");
    return;
  }

  const filePath = resolveStaticFilePath(root, decodedFileName);
  if (!filePath || !existsSync(filePath)) {
    fail(res, 404, "NOT_FOUND", "Resource not found.");
    return;
  }
  const extension = extname(filePath);
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "private, no-store, no-cache, must-revalidate"
  });
  res.end(headOnly ? undefined : body);
}

/**
 * @description 提供受控 Live2D 页面及模型资源树。
 *
 * `resolveStaticFilePath` 会拒绝编码穿越、NUL 和 Windows 盘符路径；本函数进一步要求
 * 目标是普通文件，防止目录读取异常泄露文件系统信息。
 *
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @param {string} pathname `/live2d` 命名空间内的路径。
 * @param {boolean} [headOnly=false] 是否只返回响应头。
 * @returns {void}
 * @private
 */
function serveLive2dStatic(res, pathname, headOnly = false) {
  applyLive2dSecurityHeaders(res);
  if (pathname === "/live2d") {
    res.writeHead(308, {
      location: "/live2d/",
      "cache-control": "private, no-store, no-cache, must-revalidate"
    });
    res.end();
    return;
  }

  const relativePath = pathname.slice("/live2d/".length) || "index.html";
  const resourceRoot = /^(?:ui|motionsync)\//u.test(relativePath) ? live2dPublicDir : live2dPageDir;
  const filePath = resolveStaticFilePath(resourceRoot, relativePath);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(res, 404, "NOT_FOUND", "Live2D resource not found.");
    return;
  }

  const extension = extname(filePath);
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "content-length": body.length,
    // Model binaries/textures are local test assets. Keep the page fresh while
    // allowing the browser to reuse an in-flight texture during one session.
    "cache-control": extension === ".html" || extension === ".js"
      ? "private, no-store, no-cache, must-revalidate"
      : "public, max-age=3600",
    "cross-origin-resource-policy": "same-origin"
  });
  res.end(headOnly ? undefined : body);
}

/**
 * @description 为数字人相关响应设置禁止缓存和基础安全头。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {void}
 * @private
 */
function applyDigitalHumanApiHeaders(res) {
  res.setHeader("cache-control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("pragma", "no-cache");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
}

// The controlled avatar pages are embedded by production H5 and by the local
// HBuilderX preview. Keep the development origins explicit so the public page
// cannot be framed by arbitrary HTTP sites.
/**
 * @description CSP `frame-ancestors` 允许的产品域名与本地预览来源。
 * @type {string}
 */
const controlledAvatarFrameAncestors =
  "'self' https://shuzhiyouzong.cn https://*.shuzhiyouzong.cn "
  + "http://127.0.0.1:5173 http://localhost:5173";

/**
 * @description 写入讯飞 XRTC 页面所需的最小 CSP、Permissions Policy 和防嗅探响应头。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {void}
 * @private
 */
function applyDigitalHumanSecurityHeaders(res) {
  applyDigitalHumanApiHeaders(res);
  res.setHeader(
    "content-security-policy",
    // The official XRTC player currently creates a small runtime function and
    // therefore requires unsafe-eval. Scripts remain restricted to this
    // controlled same-origin allowlist; no third-party script origin is added.
    "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
      + "connect-src 'self' https://*.xf-yun.com wss://*.xf-yun.com https://*.xfyun.cn wss://*.xfyun.cn https://*.iflytek.com wss://*.iflytek.com; "
      + "media-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; child-src blob:; "
      + `object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${controlledAvatarFrameAncestors}`
  );
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("x-permitted-cross-domain-policies", "none");
}

/**
 * @description 写入自包含 Live2D 页面使用的同源 CSP 和浏览器能力限制。
 * @param {import("node:http").ServerResponse} res HTTP 响应。
 * @returns {void}
 * @private
 */
function applyLive2dSecurityHeaders(res) {
  applyDigitalHumanApiHeaders(res);
  res.setHeader(
    "content-security-policy",
    // The bundled runtime is self-contained. It needs WebGL, Web Audio and
    // same-origin model/audio resources, but it must not load arbitrary remote
    // scripts or embed a remote frame.
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
      + "connect-src 'self'; media-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; "
      + `object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${controlledAvatarFrameAncestors}`
  );
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("x-permitted-cross-domain-policies", "none");
}

/**
 * @description 并发启动调用共享的监听 Promise。
 * @type {Promise<import("node:http").Server>|null}
 */
let listenPromise = null;

/**
 * @description 启动共享 HTTP Server；并发调用会复用同一个启动 Promise。
 *
 * @param {{host?: string, port?: number}} [options={}] 监听地址；端口为 `0` 时由系统分配。
 * @param {string} [options.host=config.host] 监听主机。
 * @param {number} [options.port=config.port] 监听端口。
 * @returns {Promise<import("node:http").Server>} 成功监听后的 Server 实例。
 * @throws {Error} 端口占用、权限不足或底层监听失败时拒绝 Promise。
 * @example
 * const runningServer = await startServer({ host: "127.0.0.1", port: 0 });
 * console.log(runningServer.address());
 */
export function startServer({ host = config.host, port = config.port } = {}) {
  if (server.listening) {
    return Promise.resolve(server);
  }
  if (listenPromise) {
    return listenPromise;
  }

  listenPromise = new Promise((resolveStart, rejectStart) => {
    /**
     * @description 清理共享启动 Promise 并向调用方转发监听错误。
     * @param {Error} error Node.js Server 监听错误。
     * @returns {void}
     */
    const onError = (error) => {
      listenPromise = null;
      rejectStart(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const address = server.address();
      const actualHost = typeof address === "object" && address ? address.address : host;
      const actualPort = typeof address === "object" && address ? address.port : port;
      logInfo("server started", {
        url: `http://${actualHost}:${actualPort}`,
        visitor: `http://${actualHost}:${actualPort}/visitor`,
        admin: `http://${actualHost}:${actualPort}/admin`
      });
      resolveStart(server);
    });
  });

  return listenPromise;
}

/**
 * @description 停止 HTTP Server 并关闭 SQLite 连接；未启动时可安全重复调用。
 *
 * @returns {Promise<void>}
 * @throws {Error} Node.js Server 或 SQLite 连接关闭失败时抛出或拒绝 Promise。
 * @example
 * await stopServer();
 */
export function stopServer() {
  if (!server.listening) {
    listenPromise = null;
    closeDb();
    return Promise.resolve();
  }

  return new Promise((resolveStop, rejectStop) => {
    server.close((error) => {
      listenPromise = null;
      if (error) {
        rejectStop(error);
        return;
      }
      closeDb();
      resolveStop();
    });
  });
}

/**
 * @description 判断当前模块是否由 Node.js 直接执行，而不是被测试或 Electron 导入。
 * @returns {boolean} 当前文件等于进程入口时为 `true`。
 * @private
 */
function isMainEntry() {
  if (!process.argv[1]) {
    return false;
  }
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainEntry()) {
  startServer().catch((error) => {
    logError("server failed to start", { error: error.message });
    process.exitCode = 1;
  });
}
