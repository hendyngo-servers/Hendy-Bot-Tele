import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, generateHmac, verifyHmac } from "./cryptoService.js";

const TEST_ENCRYPTION_KEY = "test-only-encryption-key-not-for-production-1234567890";

describe("CryptoService", () => {
  test("encrypts and decrypts strings correctly", () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const original = "Hendy-Telegram-Token-Sensitive-123456";
    const encrypted = encrypt(original);
    assert.notEqual(encrypted, original);
    assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  test("generates unique ciphertexts for identical inputs (IV uniqueness)", () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const text = "repeatable-text";
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    assert.notEqual(enc1, enc2);
    assert.equal(decrypt(enc1), text);
    assert.equal(decrypt(enc2), text);
  });

  test("throws error when decrypting tampered data", () => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    const enc = encrypt("secret-data");
    const [iv, tag, data] = enc.split(":");
    const tampered = `${iv}:${tag}:ff${data.slice(2)}`;
    assert.throws(() => decrypt(tampered));
  });

  test("refuses to encrypt when an environment key is missing or too short", () => {
    const previous = process.env.ENCRYPTION_KEY;
    try {
      delete process.env.ENCRYPTION_KEY;
      assert.throws(() => encrypt("must not use a hard-coded key"), /ENCRYPTION_KEY/);
      process.env.ENCRYPTION_KEY = "too-short";
      assert.throws(() => encrypt("must not use a hard-coded key"), /ENCRYPTION_KEY/);
    } finally {
      if (previous === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = previous;
    }
  });

  test("computes and verifies HMAC signatures", () => {
    const data = "render-cloudflare-payload";
    const secret = "super-secret-key";
    const sig = generateHmac(data, secret);
    assert.equal(typeof sig, "string");
    assert.equal(verifyHmac(data, sig, secret), true);
    assert.equal(verifyHmac(data + "tampered", sig, secret), false);
    assert.equal(verifyHmac(data, "short-signature", secret), false);
  });
});
