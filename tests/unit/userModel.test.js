import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLinkedAccounts } from "../../backend/src/db/userModel.js";

test("sanitizeLinkedAccounts strips password and unknown fields", () => {
  const safe = sanitizeLinkedAccounts({
    QQ88: [{ tk: "demo-user", mk: "plaintext-password", miniCode: "code", otp: "123456" }],
    UNKNOWN: [{ tk: "x" }]
  });
  assert.deepEqual(safe.QQ88, [{ tk: "demo-user", miniCode: "code" }]);
  assert.deepEqual(safe["78WIN"], []);
  assert.equal("UNKNOWN" in safe, false);
  assert.equal("mk" in safe.QQ88[0], false);
});