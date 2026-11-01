import { test } from "node:test";
import assert from "node:assert/strict";
import { executeD1Query } from "./productionD1.js";

test("production D1 client fails closed when credentials are missing", async () => {
  const names = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    await assert.rejects(
      executeD1Query("SELECT 1"),
      (error) => error.code === "D1_NOT_CONFIGURED" && error.status === 503
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("production D1 client rejects non-array bound parameters", async () => {
  await assert.rejects(
    executeD1Query("SELECT 1", "not-an-array"),
    (error) => error instanceof TypeError
  );
});
