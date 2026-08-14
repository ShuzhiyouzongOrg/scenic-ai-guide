import assert from "node:assert";

process.env.SQLITE_PATH = ":memory:";
process.env.CONFIG_ENV_FILE = "./data/nonexistent-digital-human-test.env";
process.env.JWT_SECRET = "unit-jwt-secret-that-is-not-used-as-avatar-secret";
process.env.XFYUN_AVATAR_APP_ID = "unit-avatar-app-id";
process.env.XFYUN_AVATAR_API_KEY = "unit-avatar-api-key";
process.env.XFYUN_AVATAR_API_SECRET = "unit-avatar-api-secret";
process.env.XFYUN_AVATAR_SESSION_SECRET = "unit-avatar-session-secret-with-sufficient-length";
process.env.XFYUN_AVATAR_SESSION_TTL_SECONDS = "120";
process.env.XFYUN_AVATAR_SERVER_URL = "wss://avatar.cn-huadong-1.xf-yun.com/v1/interact";

const {
  getActiveDigitalHumanConfig,
  listDigitalHumanConfigs,
  mapAnswerToDigitalHumanState,
  preloadDigitalHumanAssets,
  updateDigitalHumanConfig
} = await import("../src/services/digitalHuman.mjs");
const { getDb, seedReferenceData } = await import("../src/db/database.mjs");
const {
  buildXfyunAvatarSignedUrl,
  createDigitalHumanWebSession,
  getDigitalHumanWebBootstrap,
  verifyWebSessionToken
} = await import("../src/services/digitalHumanWeb.mjs");

const active = getActiveDigitalHumanConfig();
assert.equal(active.enabled, true);
assert.equal(active.id, "dh_xf_daolan_female_a");
assert.equal(active.name, "云觉·大佛文化使（女）");
assert.equal(active.engine, "xfyun");
assert.equal(active.avatarId, "cnrmkf0e2000000006");
assert.equal(active.vcn, "x6_jingqudaolannvsheng_mini");
assert.equal(active.voiceId, "x6_jingqudaolannvsheng_mini");
assert.ok(active.avatarId, "active config exposes an iFlytek avatarId");
assert.ok(active.assetAvailable, "avatar is streamable when avatarId is set");

const webSession = createDigitalHumanWebSession({
  configId: active.id,
  visitorSessionId: "visitor-unit-1"
});
assert.equal(webSession.configId, active.id);
assert.match(webSession.sessionUrl, /^\/digital-human\/\?session=/);
assert.equal(webSession.pageUrl, webSession.sessionUrl);
assert.match(webSession.bootstrapUrl, /^\/api\/digital-human\/web\/bootstrap\?session=/);
const verifiedSession = verifyWebSessionToken(webSession.token);
assert.equal(verifiedSession.cid, active.id);
assert.equal(verifiedSession.sid, "visitor-unit-1");
assert.throws(
  () => verifyWebSessionToken(`${webSession.token.slice(0, -1)}x`),
  (error) => error.code === "DIGITAL_HUMAN_SESSION_INVALID"
);
assert.throws(
  () => verifyWebSessionToken(webSession.token, { now: Date.now() + 301_000 }),
  (error) => error.code === "DIGITAL_HUMAN_SESSION_EXPIRED"
);

const webBootstrap = getDigitalHumanWebBootstrap(webSession.token);
assert.equal(webBootstrap.digitalHuman.id, active.id);
assert.equal(webBootstrap.digitalHuman.avatarId, active.avatarId);
assert.equal(webBootstrap.globalParams.avatar.avatar_id, active.avatarId);
assert.equal(webBootstrap.globalParams.tts.vcn, active.vcn);
assert.equal(webBootstrap.apiInfo.appId, "unit-avatar-app-id");
assert.ok(webBootstrap.apiInfo.signedUrl.startsWith("wss://avatar.cn-huadong-1.xf-yun.com/v1/interact?"));
assert.equal("apiKey" in webBootstrap.apiInfo, false);
assert.equal("apiSecret" in webBootstrap.apiInfo, false);
assert.equal(JSON.stringify(webBootstrap).includes("unit-avatar-api-secret"), false);

const signedUrl = new URL(buildXfyunAvatarSignedUrl({
  serverUrl: "wss://avatar.cn-huadong-1.xf-yun.com/v1/interact",
  apiKey: "unit-avatar-api-key",
  apiSecret: "unit-avatar-api-secret",
  date: new Date("2026-08-14T10:00:00.000Z")
}));
assert.equal(signedUrl.searchParams.get("host"), "avatar.cn-huadong-1.xf-yun.com");
assert.equal(signedUrl.searchParams.get("date"), "Fri, 14 Aug 2026 10:00:00 GMT");
assert.match(
  Buffer.from(signedUrl.searchParams.get("authorization"), "base64").toString("utf8"),
  /api_key="unit-avatar-api-key".*algorithm="hmac-sha256".*signature="[^"]+"/
);

const catalog = listDigitalHumanConfigs();
for (const id of ["dh_l2d_kei", "dh_l2d_hibiki"]) {
  const live2d = catalog.find((item) => item.id === id);
  assert.ok(live2d, `${id} is present in the digital-human catalog`);
  assert.equal(live2d.vcn, "x6_zhantingnanjiedai_pro");
  assert.equal(live2d.voiceId, "x6_zhantingnanjiedai_pro");
}

const db = getDb();
const originalKei = db.prepare("SELECT * FROM digital_human_configs WHERE id = ?").get("dh_l2d_kei");
db.prepare(
  "UPDATE digital_human_configs SET vcn = ?, voice_id = ?, welcome_text = ? WHERE id = ?"
).run("x4_pengfei", "guide_male", "管理员自定义欢迎语", "dh_l2d_kei");
seedReferenceData(db);
const customizedKei = db.prepare("SELECT * FROM digital_human_configs WHERE id = ?").get("dh_l2d_kei");
assert.equal(customizedKei.vcn, "x4_pengfei", "customized built-in rows are not overwritten");

db.prepare(
  `UPDATE digital_human_configs
   SET name = ?, engine = ?, avatar_id = ?, vcn = ?, model_id = ?, character_asset = ?,
       appearance = ?, outfit = ?, theme = ?, voice_id = ?, speech_rate = ?, welcome_text = ?,
       emotion_style = ?, service_status = ?
   WHERE id = ?`
).run(
  originalKei.name,
  originalKei.engine,
  originalKei.avatar_id,
  "x4_pengfei",
  originalKei.model_id,
  originalKei.character_asset,
  originalKei.appearance,
  originalKei.outfit,
  originalKei.theme,
  "guide_male",
  originalKei.speech_rate,
  originalKei.welcome_text,
  originalKei.emotion_style,
  originalKei.service_status,
  originalKei.id
);
seedReferenceData(db);
const migratedKei = db.prepare("SELECT * FROM digital_human_configs WHERE id = ?").get("dh_l2d_kei");
assert.equal(migratedKei.vcn, "x6_zhantingnanjiedai_pro");
assert.equal(migratedKei.voice_id, "x6_zhantingnanjiedai_pro");

const routeState = mapAnswerToDigitalHumanState({ label: "路线推荐", emotion: "微笑" });
assert.equal(routeState.expression, "smile");
assert.equal(routeState.action, "point");

const refusalState = mapAnswerToDigitalHumanState({ scenario: "no_data" });
assert.equal(refusalState.expression, "apology");

const updated = updateDigitalHumanConfig({ name: "灵山导游", outfit: "festival-guide", voiceId: "guide_soft" });
assert.equal(updated.name, "灵山导游");
assert.equal(updated.voiceId, "guide_soft");

const added = updateDigitalHumanConfig({
  id: "dh_test_text_only",
  name: "测试数字人",
  characterAsset: "/missing/model.json",
  voiceId: "guide_test",
  welcomeText: "欢迎来到灵山胜境。",
  serviceStatus: "text_only",
  enabled: true
});
assert.equal(added.enabled, true);
assert.equal(added.serviceStatus, "text_only");
assert.equal(added.assetAvailable, false);
assert.equal(getActiveDigitalHumanConfig().id, "dh_test_text_only");
assert.ok(listDigitalHumanConfigs().some((item) => item.id === "dh_test_text_only"));

const preload = preloadDigitalHumanAssets();
assert.equal(preload.ok, true);

assert.throws(
  () => createDigitalHumanWebSession({ configId: "dh_l2d_kei" }),
  (error) => error.code === "DIGITAL_HUMAN_CONFIG_UNAVAILABLE"
);

const { startServer, stopServer } = await import("../src/app.mjs");
const httpServer = await startServer({ host: "127.0.0.1", port: 0 });
const address = httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
try {
  const sessionResponse = await fetch(`${origin}/api/digital-human/web/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ configId: active.id, visitorSessionId: "visitor-http-1" })
  });
  assert.equal(sessionResponse.status, 201);
  assert.match(sessionResponse.headers.get("cache-control"), /no-store/);
  const sessionPayload = await sessionResponse.json();
  assert.equal(sessionPayload.success, true);

  const bootstrapResponse = await fetch(
    `${origin}/api/digital-human/web/bootstrap?session=${encodeURIComponent(sessionPayload.data.token)}`
  );
  assert.equal(bootstrapResponse.status, 200);
  assert.match(bootstrapResponse.headers.get("cache-control"), /no-store/);
  const bootstrapPayload = await bootstrapResponse.json();
  assert.equal(bootstrapPayload.data.digitalHuman.id, active.id);
  assert.equal("apiSecret" in bootstrapPayload.data.apiInfo, false);

  const pageResponse = await fetch(`${origin}/digital-human/`);
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-type"), /^text\/html/);
  assert.match(pageResponse.headers.get("cache-control"), /no-store/);
  assert.match(pageResponse.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(pageResponse.headers.get("content-security-policy"), /script-src 'self' 'unsafe-eval'/);
  assert.match(await pageResponse.text(), /启动动态数字人/);

  const pageHeadResponse = await fetch(`${origin}/digital-human/`, { method: "HEAD" });
  assert.equal(pageHeadResponse.status, 200);
  assert.match(pageHeadResponse.headers.get("content-type"), /^text\/html/);
  assert.equal(await pageHeadResponse.text(), "");

  const sdkResponse = await fetch(`${origin}/digital-human/sdk/index.js`);
  assert.equal(sdkResponse.status, 200);
  assert.match(sdkResponse.headers.get("content-type"), /^text\/javascript/);
  assert.match(await sdkResponse.text(), /index-_37811BO\.js/);

  const forbiddenSdkResponse = await fetch(`${origin}/digital-human/sdk/index.d.ts`);
  assert.equal(forbiddenSdkResponse.status, 404);
} finally {
  await stopServer();
}

console.log("Digital human tests passed.");
