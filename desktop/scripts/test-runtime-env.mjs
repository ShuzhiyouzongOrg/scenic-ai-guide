/**
 * @fileoverview 桌面运行环境筛选与序列化测试。
 * @description 验证白名单保留、敏感配置排除、必需字段检查和 dotenv 转义行为。
 */
import assert from "node:assert/strict";

import {
  selectServerEnvironment,
  serializeServerEnvironment,
  serverEnvKeys
} from "./runtime-env.mjs";

const selected = selectServerEnvironment([
  "LLM_API_KEY=value=with=equals",
  "XFYUN_APP_ID=app-id",
  "ADMIN_PASSWORD=must-not-be-packaged",
  "JWT_SECRET=must-not-be-packaged",
  "UNKNOWN_KEY=must-not-be-packaged"
].join("\n"));

assert.equal(selected.LLM_API_KEY, "value=with=equals");
assert.equal(selected.XFYUN_APP_ID, "app-id");
assert.equal(Object.hasOwn(selected, "ADMIN_PASSWORD"), false);
assert.equal(Object.hasOwn(selected, "JWT_SECRET"), false);
assert.equal(Object.hasOwn(selected, "UNKNOWN_KEY"), false);
assert.deepEqual(Object.keys(selected), serverEnvKeys.filter((key) => key in selected));

const serialized = serializeServerEnvironment(selected);
assert.match(serialized, /^# Managed by the desktop runtime\.\n/);
assert.match(serialized, /LLM_API_KEY=value=with=equals/);
assert.doesNotMatch(serialized, /must-not-be-packaged/);

const sanitized = selectServerEnvironment({
  LLM_API_KEY: "line-one\nline-two",
  XFYUN_API_SECRET: "secret\rvalue"
});
assert.equal(sanitized.LLM_API_KEY, "line-oneline-two");
assert.equal(sanitized.XFYUN_API_SECRET, "secretvalue");

console.log("Desktop runtime environment tests passed.");
