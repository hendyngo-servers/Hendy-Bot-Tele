const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptSecret, decryptSecret } = require('./cryptoService');

test('mã hóa và giải mã AES-256-GCM giữ nguyên dữ liệu', () => {
  process.env.APP_ENCRYPTION_KEY = 'test-only-encryption-key-which-is-long-enough';
  const plainText = 'mat-khau-test-123';
  const encrypted = encryptSecret(plainText);
  assert.notEqual(encrypted.data, plainText);
  assert.equal(decryptSecret(encrypted), plainText);
});

test('từ chối dữ liệu mã hóa bị sửa đổi', () => {
  process.env.APP_ENCRYPTION_KEY = 'test-only-encryption-key-which-is-long-enough';
  const encrypted = encryptSecret('secret');
  encrypted.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptSecret(encrypted));
});

test('yêu cầu khóa mã hóa đủ dài', () => {
  process.env.APP_ENCRYPTION_KEY = 'short';
  assert.throws(() => encryptSecret('secret'), /32 ký tự/);
});
