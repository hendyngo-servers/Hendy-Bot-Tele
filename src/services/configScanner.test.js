import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scanConfigurationLocations } from "./configScanner.js";

describe("configuration source scanner", () => {
  test("finds deployment variables and reports their exact source locations", async () => {
    const result = await scanConfigurationLocations();
    assert.ok(result.filesScanned > 0);
    const webhook = result.variables.find((item) => item.key === "WEBHOOK_SECRET");
    const vite = result.variables.find((item) => item.key === "VITE_API_BASE_URL");
    assert.ok(webhook.locations.some((location) => location.file === "src/server.js"));
    assert.ok(vite.locations.some((location) => location.file === "mini-app/src/services/api.js"));
  });
});
