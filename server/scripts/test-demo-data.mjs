/**
 * @fileoverview 演示数据生成与接口测试脚本。
 * @description 验证演示数据的生成、聚合、数据库持久化和管理端 HTTP 调用。
 */
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

process.env.SQLITE_PATH = ":memory:";

const { getDb } = await import("../src/db/database.mjs");
const { generateDemoData } = await import("../src/services/demoData.mjs");
const {
  getDashboardAnalytics,
  invalidateBehaviorDatasetCache,
  loadBehaviorDataset
} = await import("../src/services/behaviorAnalytics.mjs");
const { buildServiceQualityReport, listFeedbackClusters } = await import("../src/services/serviceQuality.mjs");

const db = getDb();
seedRealRows(db);
invalidateBehaviorDatasetCache();

const cachedBefore = loadBehaviorDataset();
const before = tableCounts(db);
const first = generateDemoData();

assert.match(first.batchId, /^demo_/);
assert.ok(first.generatedAt);
assert.ok(first.counts.visitorSessions >= 36);
assert.ok(first.counts.touristBehavior >= 240);
assert.ok(first.counts.messages >= first.counts.visitorSessions * 2);
assert.equal(first.counts.feedback, first.counts.visitorSessions);
assert.equal(first.counts.routeSelections, first.counts.visitorSessions);
assert.equal(first.counts.messageAnnotations, first.counts.visitorSessions);
assert.equal(
  first.counts.total,
  Object.entries(first.counts)
    .filter(([key]) => key !== "total")
    .reduce((sum, [, value]) => sum + value, 0)
);
assertCountDeltas(db, before, first.counts);
assert.equal(
  loadBehaviorDataset().rows.length,
  cachedBefore.rows.length + first.counts.touristBehavior,
  "dashboard cache should be invalidated after the transaction"
);
assertBatchCoverage(db, first);

const dashboard = getDashboardAnalytics();
assert.ok(dashboard.metrics.behaviorRows >= first.counts.touristBehavior);
assert.ok(dashboard.metrics.totalQuestions >= first.counts.visitorSessions);
assert.ok(dashboard.routePreference.length >= 7);
assert.ok(Object.values(dashboard.consumption).every((value) => value > 0));
assert.ok(dashboard.persona.ageBands.length >= 5);
assert.ok(dashboard.stayRelation.every((item) => item.count > 0));
assert.ok(dashboard.emotionTrend.length >= 5);

const clusters = listFeedbackClusters();
assert.ok(clusters.some((item) => item.label === "演出时间不清楚"));
assert.ok(clusters.some((item) => item.label === "路线长度与体力不匹配"));
assert.ok(clusters.some((item) => item.label === "票务与消费信息"));
assert.ok(clusters.some((item) => item.label === "回答准确性与表达"));
const quality = buildServiceQualityReport();
assert.ok(quality.lowSatisfactionCount > 0);
assert.ok(quality.wrongAnswerCount > 0);
assert.ok(quality.optimizationSuggestions.length > 0);

const second = generateDemoData();
assert.notEqual(second.batchId, first.batchId);
assertCountDeltas(db, before, second.counts);
assert.equal(countByPrefix(db, "visitor_sessions", "id", first.batchId), 0, "previous demo sessions should be replaced");
assert.equal(countByPrefix(db, "tourist_behavior", "id", first.batchId), 0, "previous demo behavior should be replaced");
assertBatchCoverage(db, second);
assertRealRowsPreserved(db);

await testHttpEndpoint();
console.log("Demo data tests passed.");

/**
 * @description 插入一组不带演示批次前缀的真实业务基准记录。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @returns {void}
 * @throws {Error} 任一基准记录写入失败时透传数据库异常。
 */
function seedRealRows(instance) {
  const now = new Date().toISOString();
  instance.prepare(
    `INSERT INTO visitor_sessions (id, started_at, ended_at, channel, satisfaction_score, message_count)
     VALUES ('real_session', ?, ?, 'web', 5, 1)`
  ).run(now, now);
  instance.prepare(
    `INSERT INTO messages (id, session_id, role, content, intent_label, emotion_label, latency_ms, created_at)
     VALUES ('real_message', 'real_session', 'user', '真实游客数据', '事实问答', '满意', NULL, ?)`
  ).run(now);
  instance.prepare(
    `INSERT INTO feedback (id, session_id, message_id, rating, vote, emotion, comment, created_at)
     VALUES ('real_feedback', 'real_session', 'real_message', 5, 'up', '满意', '真实反馈', ?)`
  ).run(now);
  instance.prepare(
    `INSERT INTO tourist_behavior
       (id, tourist_id, age, gender, attraction_name, visit_date, stay_duration,
        ticket_cost, food_cost, shopping_cost, transport_cost, entertainment_cost,
        total_cost, group_size, satisfaction)
     VALUES
       ('real_behavior', 'real_tourist', 30, 'female', '灵山胜境', ?, 120,
        180, 40, 20, 15, 25, 280, 2, 5)`
  ).run(now.slice(0, 10));
  instance.prepare(
    `INSERT INTO route_selections
       (id, session_id, route_id, route_name, route_type, duration_minutes, node_ids, tags, preferences, created_at)
     VALUES
       ('real_route', 'real_session', 'classic_150', '真实路线', 'classic', 150, '[]', '[]', '{}', ?)`
  ).run(now);
  instance.prepare(
    `INSERT INTO message_annotations (message_id, label, note, created_at, updated_at)
     VALUES ('real_message', 'correct', '真实标注', ?, ?)`
  ).run(now, now);
}

/**
 * @description 统计演示数据涉及的六张业务表记录数。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @returns {Record<string, number>} 各业务表记录数。
 * @throws {Error} 数据库查询失败时透传异常。
 */
function tableCounts(instance) {
  return {
    visitorSessions: countTable(instance, "visitor_sessions"),
    messages: countTable(instance, "messages"),
    feedback: countTable(instance, "feedback"),
    touristBehavior: countTable(instance, "tourist_behavior"),
    routeSelections: countTable(instance, "route_selections"),
    messageAnnotations: countTable(instance, "message_annotations")
  };
}

/**
 * @description 读取指定表的总记录数。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @param {string} table 已知业务表名。
 * @returns {number} 表记录数。
 * @throws {Error} SQL 准备或查询失败时透传异常。
 */
function countTable(instance, table) {
  return instance.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

/**
 * @description 断言当前各表记录数等于基线与本批新增数之和。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @param {Record<string, number>} baseline 生成前基线计数。
 * @param {Record<string, number>} counts 当前演示批次计数。
 * @returns {void}
 * @throws {AssertionError|Error} 计数不符或数据库查询失败时抛出。
 */
function assertCountDeltas(instance, baseline, counts) {
  const current = tableCounts(instance);
  for (const key of Object.keys(baseline)) {
    assert.equal(current[key], baseline[key] + counts[key], `${key} should contain one current demo batch`);
  }
}

/**
 * @description 断言演示批次覆盖性别、景点、满意度、年龄、停留时长、路线和标注维度。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @param {{batchId: string, counts: Record<string, number>}} result 演示数据生成结果。
 * @returns {void}
 * @throws {AssertionError|Error} 覆盖断言或数据库查询失败时抛出。
 */
function assertBatchCoverage(instance, result) {
  const pattern = `${result.batchId}*`;
  const behavior = instance.prepare(
    `SELECT
       COUNT(DISTINCT gender) AS genders,
       COUNT(DISTINCT attraction_name) AS attractions,
       COUNT(DISTINCT satisfaction) AS satisfaction_scores,
       COUNT(DISTINCT CASE
         WHEN age < 25 THEN '18-24'
         WHEN age < 35 THEN '25-34'
         WHEN age < 45 THEN '35-44'
         WHEN age < 60 THEN '45-59'
         ELSE '60+'
       END) AS age_bands,
       COUNT(DISTINCT CASE
         WHEN stay_duration <= 60 THEN '0-1'
         WHEN stay_duration <= 120 THEN '1-2'
         WHEN stay_duration <= 240 THEN '2-4'
         ELSE '4+'
       END) AS stay_bands
     FROM tourist_behavior WHERE id GLOB ?`
  ).get(pattern);
  assert.equal(behavior.genders, 2);
  assert.ok(behavior.attractions >= 8);
  assert.equal(behavior.satisfaction_scores, 5);
  assert.equal(behavior.age_bands, 5);
  assert.equal(behavior.stay_bands, 4);

  const feedback = instance.prepare(
    "SELECT COUNT(DISTINCT rating) AS ratings, COUNT(DISTINCT vote) AS votes, COUNT(DISTINCT emotion) AS emotions FROM feedback WHERE id GLOB ?"
  ).get(pattern);
  assert.equal(feedback.ratings, 5);
  assert.ok(feedback.votes >= 3);
  assert.ok(feedback.emotions >= 5);

  const routeTypes = instance.prepare(
    "SELECT COUNT(DISTINCT route_type) AS count FROM route_selections WHERE id GLOB ?"
  ).get(pattern).count;
  assert.equal(routeTypes, 7);

  const annotationLabels = instance.prepare(
    "SELECT COUNT(DISTINCT label) AS count FROM message_annotations WHERE message_id GLOB ?"
  ).get(pattern).count;
  assert.equal(annotationLabels, 3);

  const pairedSessions = instance.prepare(
    `SELECT COUNT(*) AS count FROM (
       SELECT session_id FROM messages WHERE id GLOB ? GROUP BY session_id
       HAVING SUM(role = 'user') >= 1 AND SUM(role = 'assistant') >= 1
     )`
  ).get(pattern).count;
  assert.equal(pairedSessions, result.counts.visitorSessions);
}

/**
 * @description 断言重新生成演示数据后真实业务基准记录仍然存在。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @returns {void}
 * @throws {AssertionError|Error} 记录缺失或数据库查询失败时抛出。
 */
function assertRealRowsPreserved(instance) {
  const checks = [
    ["visitor_sessions", "id", "real_session"],
    ["messages", "id", "real_message"],
    ["feedback", "id", "real_feedback"],
    ["tourist_behavior", "id", "real_behavior"],
    ["route_selections", "id", "real_route"],
    ["message_annotations", "message_id", "real_message"]
  ];
  for (const [table, column, value] of checks) {
    const row = instance.prepare(`SELECT 1 AS found FROM ${table} WHERE ${column} = ?`).get(value);
    assert.equal(row?.found, 1, `${table} real row should be preserved`);
  }
}

/**
 * @description 统计指定列以批次前缀开头的记录数。
 * @param {import("better-sqlite3").Database} instance SQLite 数据库。
 * @param {string} table 已知业务表名。
 * @param {string} column 已知 ID 列名。
 * @param {string} prefix 批次前缀。
 * @returns {number} 匹配记录数。
 * @throws {Error} SQL 准备或查询失败时透传异常。
 */
function countByPrefix(instance, table, column, prefix) {
  return instance.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} GLOB ?`).get(`${prefix}*`).count;
}

/**
 * @description 启动独立服务进程，验证演示数据生成及管理端查询接口。
 * @returns {Promise<void>} 接口断言和临时文件清理完成后兑现。
 * @throws {AssertionError|Error|TypeError|SyntaxError} 服务启动、网络请求、JSON 解析或接口断言失败时抛出。
 */
async function testHttpEndpoint() {
  const serverDir = fileURLToPath(new URL("..", import.meta.url));
  const port = randomInt(20_000, 30_000);
  const sqlitePath = join(tmpdir(), `scenic-demo-data-${process.pid}-${Date.now()}.sqlite`);
  const child = spawn(process.execPath, ["src/app.mjs"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: sqlitePath,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let childOutput = "";
  child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });

  try {
    await waitForServer(port, child);
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/admin/demo-data/generate`, { method: "POST" });
    assert.equal(unauthorized.status, 401);

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123", role: "admin" })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const authorization = `Bearer ${loginBody.data.token}`;

    const generatedResponse = await fetch(`http://127.0.0.1:${port}/api/admin/demo-data/generate`, {
      method: "POST",
      headers: { authorization }
    });
    assert.equal(generatedResponse.status, 201);
    const generatedBody = await generatedResponse.json();
    assert.equal(generatedBody.success, true);
    assert.ok(generatedBody.data.counts.touristBehavior >= 240);

    const dashboardResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/analytics/dashboard?minSatisfaction=4`,
      { headers: { authorization } }
    );
    assert.equal(dashboardResponse.status, 200);
    const dashboardBody = await dashboardResponse.json();
    assert.ok(dashboardBody.data.metrics.behaviorRows > 0);

    const conversationsResponse = await fetch(
      `http://127.0.0.1:${port}/api/admin/conversations?lowSatisfactionOnly=true`,
      { headers: { authorization } }
    );
    assert.equal(conversationsResponse.status, 200);
    const conversationsBody = await conversationsResponse.json();
    assert.ok(conversationsBody.data.length > 0);
    assert.ok(conversationsBody.data.every((item) => item.lowSatisfaction));
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${childOutput}`;
    throw error;
  } finally {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    for (const path of [sqlitePath, `${sqlitePath}-wal`, `${sqlitePath}-shm`]) {
      rmSync(path, { force: true });
    }
  }
}

/**
 * @description 轮询健康检查，直至子进程可用、提前退出或超时。
 * @param {number} port 服务端口。
 * @param {import("node:child_process").ChildProcess} child 服务子进程。
 * @returns {Promise<void>} 健康检查成功时兑现。
 * @throws {Error} 子进程提前退出或十二秒内未启动时抛出。
 */
async function waitForServer(port, child) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start before timeout");
}
