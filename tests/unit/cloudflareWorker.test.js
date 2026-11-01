import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../../cloudflare/worker.js";

test("Cloudflare Worker health checks D1 binding", async () => {
  const env = {
    DB: {
      prepare() {
        return { first: async () => ({ ping: 1 }) };
      }
    },
    BACKUPS: {}
  };
  const response = await worker.fetch(new Request("https://worker.test/health"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.d1, "connected");
});

test("Cloudflare Worker rejects manual backup without trigger secret", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/api/backups/run", { method: "POST", body: "{}" }),
    { BACKUP_TRIGGER_SECRET: "secret-value" }
  );
  assert.equal(response.status, 401);
});

test("Cloudflare Worker rejects R2 upload without uploader secret", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/api/storage/upload", { method: "POST" }),
    { R2_UPLOAD_SECRET: "another-secret" }
  );
  assert.equal(response.status, 401);
});
