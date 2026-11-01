import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, generateHmac, verifyHmac } from "./cryptoService.js";

describe("CryptoService", () => {
  test("encrypts and decrypts strings correctly", () => {
    const original = "Hendy-Telegram-Token-Sensitive-123456";
    const encrypted = encrypt(original);
    assert.notEqual(encrypted, original);
    assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  test("generates unique ciphertexts for identical inputs (IV uniqueness)", () => {
    const text = "repeatable-text";
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    assert.notEqual(enc1, enc2);
    assert.equal(decrypt(enc1), text);
    assert.equal(decrypt(enc2), text);
  });

  test("throws error when decrypting tampered data", () => {
    const enc = encrypt("secret-data");
    const [iv, tag, data] = enc.split(":");
    const tampered = `${iv}:${tag}:ff${data.slice(2)}`;
    assert.throws(() => decrypt(tampered));
  });

  test("computes and verifies HMAC signatures", () => {
    const data = "render-cloudflare-payload";
    const secret = "super-secret-key";
    const sig = generateHmac(data, secret);
    assert.equal(typeof sig, "string");
    assert.equal(verifyHmac(data, sig, secret), true);
    assert.equal(verifyHmac(data + "tampered", sig, secret), false);
  });
});
