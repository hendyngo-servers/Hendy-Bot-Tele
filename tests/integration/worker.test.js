import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../backend/src/index.js";

test("health endpoint works without storage credentials", async () => {
  const request = new Request("https://worker.example/healthz");
  const response = await worker.fetch(request, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.platform, "cloudflare-workers");
});

test("unknown routes return 404", async () => {
  const request = new Request("https://worker.example/not-found");
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 404);
});

test("admin order queue is forbidden without admin credentials", async () => {
  const request = new Request("https://worker.example/api/v1/admin/orders");
  const response = await worker.fetch(request, { DB: {}, STORAGE: {} });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.match(body.error, /quyền quản trị/i);
});
