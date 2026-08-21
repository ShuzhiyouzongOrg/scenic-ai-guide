import assert from "node:assert/strict";

process.env.SQLITE_PATH = ":memory:";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin123";
process.env.JWT_SECRET = "auth-test-secret";

const { startServer, stopServer, server } = await import("../src/app.mjs");
const { createAdminUser, updateAdminUser } = await import("../src/services/userAdmin.mjs");
const { getDb } = await import("../src/db/database.mjs");
const { updateRolePermissions } = await import("../src/services/roleAdmin.mjs");

createAdminUser({
  username: "operator-test",
  password: "operator123",
  displayName: "Operator Test",
  role: "operator"
});
const visitor = createAdminUser({
  username: "visitor-test",
  password: "visitor123",
  displayName: "Visitor Test",
  role: "visitor"
});

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

async function jsonRequest(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function requestLogin(origin, username, password, role) {
  return jsonRequest(origin, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, ...(role === undefined ? {} : { role }) })
  });
}

await startServer({ host: "127.0.0.1", port: 0 });
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

try {
  const missingRole = await requestLogin(origin, "admin", "admin123");
  check("login role is required", () => {
    assert.equal(missingRole.response.status, 400);
    assert.equal(missingRole.body.error.code, "LOGIN_ROLE_INVALID");
  });

  const mismatch = await requestLogin(origin, "admin", "admin123", "visitor");
  check("selected role must match account role", () => {
    assert.equal(mismatch.response.status, 403);
    assert.equal(mismatch.body.error.code, "LOGIN_ROLE_MISMATCH");
  });

  const adminLogin = await requestLogin(origin, "admin", "admin123", "admin");
  const operatorLogin = await requestLogin(origin, "operator-test", "operator123", "operator");
  const visitorLogin = await requestLogin(origin, "visitor-test", "visitor123", "visitor");
  check("all built-in roles can log in", () => {
    assert.equal(adminLogin.response.status, 200);
    assert.equal(operatorLogin.response.status, 200);
    assert.equal(visitorLogin.response.status, 200);
    assert.equal(adminLogin.body.data.user.role, "admin");
    assert.equal(operatorLogin.body.data.user.role, "operator");
    assert.equal(visitorLogin.body.data.user.role, "visitor");
  });

  const adminAuth = { authorization: `Bearer ${adminLogin.body.data.token}` };
  const operatorAuth = { authorization: `Bearer ${operatorLogin.body.data.token}` };
  const visitorAuth = { authorization: `Bearer ${visitorLogin.body.data.token}` };
  const [adminUsers, operatorKnowledge, operatorUsers, visitorKnowledge] = await Promise.all([
    jsonRequest(origin, "/api/admin/users", { headers: adminAuth }),
    jsonRequest(origin, "/api/knowledge/summary", { headers: operatorAuth }),
    jsonRequest(origin, "/api/admin/users", { headers: operatorAuth }),
    jsonRequest(origin, "/api/knowledge/summary", { headers: visitorAuth })
  ]);
  check("server enforces role permissions", () => {
    assert.equal(adminUsers.response.status, 200);
    assert.equal(operatorKnowledge.response.status, 200);
    assert.equal(operatorUsers.response.status, 403);
    assert.equal(visitorKnowledge.response.status, 403);
  });

  const operatorRoleId = getDb()
    .prepare("SELECT id FROM system_roles WHERE role_code = 'operator'")
    .get().id;
  updateRolePermissions(operatorRoleId, ["/admin/operation"]);
  const operatorAfterPermissionChange = await jsonRequest(origin, "/api/knowledge/summary", {
    headers: operatorAuth
  });
  check("role permission changes take effect immediately", () => {
    assert.equal(operatorAfterPermissionChange.response.status, 403);
  });

  updateAdminUser(visitor.id, { role: "operator" });
  const staleVisitorToken = await jsonRequest(origin, "/api/auth/me", { headers: visitorAuth });
  check("account role changes invalidate existing tokens", () => {
    assert.equal(staleVisitorToken.response.status, 401);
  });
} finally {
  await stopServer();
}

console.log(`\n${passed}/${passed} passed`);
