/**
 * @fileoverview Web Vitals 采集与报表测试脚本。
 * @description 验证性能指标记录、分位数、评级分布、版本和设备维度聚合。
 */
import assert from "node:assert/strict";

process.env.SQLITE_PATH = ":memory:";

const { getDb } = await import("../src/db/database.mjs");
const { getWebVitalReport, recordWebVital } = await import("../src/services/webVitals.mjs");

recordWebVital({ metric: "LCP", value: 1000, rating: "good", version: "1.0.0", deviceClass: "desktop" });
recordWebVital({ metric: "LCP", value: 2000, rating: "good", version: "1.0.0", deviceClass: "desktop" });
recordWebVital({ metric: "LCP", value: 3000, rating: "needs-improvement", version: "1.0.0", deviceClass: "desktop" });
recordWebVital({ metric: "LCP", value: 4000, rating: "poor", version: "1.0.0", deviceClass: "desktop" });

const report = getWebVitalReport();
assert.equal(report.sampleCount, 4);
assert.equal(report.groups[0].p75, 3000);
assert.equal(report.groups[0].ratings.good, 2);
assert.deepEqual(
  Object.keys(getDb().prepare("SELECT * FROM web_vital_events LIMIT 1").get()).sort(),
  ["app_version", "created_at", "device_class", "id", "metric", "rating", "value"]
);
assert.throws(
  () => recordWebVital({ metric: "LCP", value: 1, rating: "good", version: "1", deviceClass: "mobile", url: "/private" }),
  (error) => error.code === "WEB_VITAL_FIELDS_INVALID"
);
assert.throws(
  () => recordWebVital({ metric: "TOKEN", value: 1, rating: "good", version: "1", deviceClass: "mobile" }),
  (error) => error.code === "WEB_VITAL_METRIC_INVALID"
);

console.log("PASS  anonymous Web Vitals validation and P75 aggregation");

const { login } = await import("../src/services/auth.mjs");
const { startServer, stopServer } = await import("../src/app.mjs");
const server = await startServer({ host: "127.0.0.1", port: 0 });
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

try {
  const accepted = await fetch(`${origin}/api/web-vitals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ metric: "CLS", value: 0.01, rating: "good", version: "1.0.0", deviceClass: "mobile" })
  });
  assert.equal(accepted.status, 201);

  const rejected = await fetch(`${origin}/api/web-vitals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ metric: "CLS", value: 0.01, rating: "good", version: "1.0.0", deviceClass: "mobile", url: "/private" })
  });
  assert.equal(rejected.status, 400);

  const token = login("admin", "admin123", "admin").token;
  const reportResponse = await fetch(`${origin}/api/admin/analytics/web-vitals`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(reportResponse.status, 200);
  const body = await reportResponse.json();
  assert.ok(body.data.sampleCount >= 5);
  console.log("PASS  Web Vitals HTTP write, field rejection and authorized report");
} finally {
  await stopServer();
}
