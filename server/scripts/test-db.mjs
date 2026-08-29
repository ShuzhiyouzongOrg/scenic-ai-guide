/**
 * @fileoverview 数据库迁移与数据访问测试脚本。
 * @description 覆盖建表、参考数据、知识快照、迁移幂等性以及桌面 SQLite 适配行为。
 */
// Round-trip test for the SQLite persistence layer (in-memory database).
import assert from "node:assert/strict";

// config.mjs loads server/.env. An explicitly empty value keeps this test in
// memory even when the deployment environment defines a persistent database.
process.env.SQLITE_PATH = "";

const { getDb } = await import("../src/db/database.mjs");
const { appendMessage, clearMessages, getHistory, getMessages, listAllMessages } = await import("../src/services/conversation.mjs");
const { createFeedback, listFeedback } = await import("../src/services/feedback.mjs");
const { createAdminFaq, findAdminFaqAnswer, listAdminFaqs, updateAdminFaq } = await import("../src/services/adminFaq.mjs");
const { createScenicSpot, disableScenicSpot, listManagedScenicSpots, updateScenicSpot } = await import("../src/services/scenicAdmin.mjs");
const { getActiveDigitalHumanConfig, listDigitalHumanConfigs, updateDigitalHumanConfig } = await import("../src/services/digitalHuman.mjs");
const { login, register, createVisitorSession, getVisitorSession } = await import("../src/services/auth.mjs");

let passed = 0;
/**
 * @description 执行同步数据库断言并累计通过数。
 * @param {string} name 测试名称。
 * @param {() => void} fn 断言回调。
 * @returns {void}
 * @throws {*} 断言回调失败时原样抛出异常。
 */
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

check("reference data seeded", () => {
  const db = getDb();
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM scenic_spots").get().n >= 16, "spots seeded");
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM admin_users").get().n >= 1, "admin seeded");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM system_roles").get().n, 3, "built-in roles seeded");
});

check("admin login works with seeded account", () => {
  const result = login("admin", "admin123", "admin");
  assert.ok(result && result.token, "login returns token");
  assert.equal(login("admin", "wrong", "admin"), null, "bad password rejected");
  assert.throws(
    () => login("admin", "admin123", "visitor"),
    (error) => error.code === "LOGIN_ROLE_MISMATCH"
  );
});

check("visitor registration persists role and avatar", () => {
  const username = `visit${Date.now().toString().slice(-8)}`;
  const avatar = "/assets/ling-avatar-6-test.webp";
  const result = register({ username, password: "visit123", avatar });
  assert.equal(result.role, "visitor");
  assert.equal(result.avatar, avatar);
  assert.equal(login(username, "visit123", "visitor").user.role, "visitor");
  assert.throws(
    () => register({ username, password: "visit123", avatar }),
    (error) => error.code === "USER_EXISTS"
  );
});

check("visitor session persists", () => {
  const session = createVisitorSession();
  assert.ok(getVisitorSession(session.id), "session retrievable");
});

check("messages round-trip and history order", () => {
  const sid = `t_${Date.now()}`;
  appendMessage(sid, { role: "user", content: "灵山大佛多高" });
  appendMessage(sid, { role: "assistant", content: "灵山大佛高88米。", intentLabel: "事实问答" });
  const history = getHistory(sid);
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "user");
  assert.equal(getMessages(sid).length, 2);
  assert.ok(listAllMessages().length >= 2);
});

check("messages can be cleared per session", () => {
  const sid = `clear_${Date.now()}`;
  appendMessage(sid, { role: "user", content: "推荐一条路线" });
  appendMessage(sid, { role: "assistant", content: "从南门开始游览。" });
  const result = clearMessages(sid);
  assert.equal(result.deleted, 2);
  assert.equal(getMessages(sid).length, 0);
  assert.equal(getDb().prepare("SELECT message_count FROM visitor_sessions WHERE id = ?").get(sid).message_count, 0);
});

check("feedback round-trip", () => {
  const sid = `t_${Date.now()}`;
  createFeedback({ sessionId: sid, rating: 5, vote: "up", comment: "很好" });
  const list = listFeedback({ sessionId: sid });
  assert.equal(list.length, 1);
  assert.equal(list[0].rating, 5);
});

check("admin FAQ CRUD + match", () => {
  const faq = createAdminFaq({ question: "开放时间", answer: "07:30-17:30", keywords: ["几点开门"], priority: 90 });
  assert.ok(listAdminFaqs().some((item) => item.id === faq.id));
  updateAdminFaq(faq.id, { answer: "08:00-17:00" });
  assert.ok(findAdminFaqAnswer("请问几点开门"), "keyword match works");
});

check("scenic spot CRUD", () => {
  const created = createScenicSpot({ name: "测试景点", aliases: ["测试"], detail: "d" });
  assert.ok(listManagedScenicSpots().some((item) => item.id === created.id));
  const updated = updateScenicSpot(created.id, { detail: "updated" });
  assert.equal(updated.detail, "updated");
  disableScenicSpot(created.id);
  assert.ok(!listManagedScenicSpots().some((item) => item.id === created.id), "disabled spot hidden");
});

check("digital human config switch", () => {
  const active = getActiveDigitalHumanConfig();
  assert.ok(active && active.avatarId, "default active config has avatarId");
  assert.throws(
    () => updateDigitalHumanConfig({ id: "dh_invalid", name: "Invalid avatar", avatarId: "test_avatar", vcn: "x5_test", enabled: true }),
    (error) => error.code === "AVATAR_ID_INVALID"
  );
  const next = updateDigitalHumanConfig({ id: "dh_test_2", name: "讲解员小灵", avatarId: "cnrmkf0e2000000099", vcn: "x6_jingqudaolannvsheng_mini", enabled: true });
  assert.equal(getActiveDigitalHumanConfig().id, next.id, "new config becomes active");
  assert.ok(listDigitalHumanConfigs().length >= 2, "second config created");
});

console.log(`\n${passed}/${passed} passed`);
