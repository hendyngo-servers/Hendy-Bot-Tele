import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { executeD1Query, getD1Health } from "./d1Client.js";

describe("Cloudflare D1 Client", () => {
  test("executes SELECT query against D1 tables", async () => {
    const res = await executeD1Query("SELECT * FROM bot_settings");
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.results));
    assert.ok(res.results.length > 0);
    assert.ok(res.meta.duration_ms >= 0);
    assert.ok(res.meta.served_by);
  });

  test("filters D1 query with WHERE clause", async () => {
    const res = await executeD1Query("SELECT * FROM bot_settings WHERE key = 'maintenance_mode'");
    assert.equal(res.success, true);
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].key, "maintenance_mode");
  });

  test("runs D1 health check and returns latency", async () => {
    const health = await getD1Health();
    assert.equal(health.status, "connected");
    assert.ok(typeof health.latency_ms === "number");
    assert.ok(health.total_queries > 0);
  });
});
