import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateRuntimeConfig } from "./runtimeConfigSync.js";

describe("runtime config validation", () => {
  test("accepts valid origin, Pages API URL, admin URL and webhook secret", () => {
    const result = validateRuntimeConfig({
      webhookSecret: "a".repeat(48),
      adminWebappUrl: "https://admin.example.pages.dev",
      allowedOrigins: "https://admin.example.pages.dev,https://mini.example.pages.dev",
      viteApiBaseUrl: "https://edge.example.workers.dev"
    });
    assert.equal(result.WEBHOOK_SECRET.length, 48);
    assert.equal(result.ALLOWED_ORIGINS.split(",").length, 2);
    assert.equal(result.VITE_API_BASE_URL, "https://edge.example.workers.dev");
  });

  test("rejects weak webhook secrets and non-HTTPS origins", () => {
    assert.throws(() => validateRuntimeConfig({ webhookSecret: "weak" }), /WEBHOOK_SECRET/);
    assert.throws(() => validateRuntimeConfig({ allowedOrigins: "http://example.com" }), /HTTPS/);
  });

  test("does not accept a browser-supplied environment variable name", () => {
    assert.throws(() => validateRuntimeConfig({ arbitraryEnvName: "value" }), /Không có biến/);
  });
});
