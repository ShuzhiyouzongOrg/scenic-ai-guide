import assert from "node:assert";

process.env.SQLITE_PATH = ":memory:";

const {
  getActiveDigitalHumanConfig,
  listDigitalHumanConfigs,
  mapAnswerToDigitalHumanState,
  preloadDigitalHumanAssets,
  updateDigitalHumanConfig
} = await import("../src/services/digitalHuman.mjs");
const { getDb, seedReferenceData } = await import("../src/db/database.mjs");

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

console.log("Digital human tests passed.");
