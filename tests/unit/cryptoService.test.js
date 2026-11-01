import test from "node:test";
import assert from "node:assert/strict";
import { constantTimeEqual } from "../../backend/src/security/cryptoService.js";

test("constantTimeEqual compares equal and unequal strings", () => {
  assert.equal(constantTimeEqual("secret-value", "secret-value"), true);
  assert.equal(constantTimeEqual("secret-value", "secret-values"), false);
  assert.equal(constantTimeEqual("", ""), true);
});