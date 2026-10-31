const test = require('node:test');
const assert = require('node:assert/strict');
const r2 = require('./r2StorageService');

test('R2 configuration uses Cloudflare Account ID and distinct S3 credentials', () => {
  const config = r2.getConfig({
    CLOUDFLARE_ACCOUNT_ID: '918ff2f016938fc978ed23b96505b21e',
    R2_BUCKET_NAME: 'hendy-bot-assets',
    R2_ACCESS_KEY_ID: 'access-id',
    R2_SECRET_ACCESS_KEY: 'secret-key'
  });
  assert.equal(config.accountId, '918ff2f016938fc978ed23b96505b21e');
  assert.equal(config.bucket, 'hendy-bot-assets');
  assert.equal(config.accessKeyId, 'access-id');
  assert.equal(config.secretAccessKey, 'secret-key');
});

test('R2 QR uploads accept only bounded PNG JPEG and WebP files', () => {
  assert.equal(r2.validateQrImage(Buffer.from('image-bytes'), 'image/png'), true);
  assert.equal(r2.validateQrImage(Buffer.from('image-bytes'), 'image/jpeg'), true);
  assert.equal(r2.validateQrImage(Buffer.from('image-bytes'), 'image/webp'), true);
  assert.throws(() => r2.validateQrImage(Buffer.alloc(0), 'image/png'), /không có dữ liệu/);
  assert.throws(() => r2.validateQrImage(Buffer.from('x'), 'image/svg+xml'), /PNG, JPEG hoặc WebP/);
  assert.throws(() => r2.validateQrImage(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png'), /2 MB/);
});

test('R2 QR object keys must stay within the application QR prefix', () => {
  assert.equal(r2.isQrImageKey('private/qr/11111111-2222-4333-8444-555555555555.png'), true);
  assert.equal(r2.isQrImageKey('private/qr/11111111-2222-4333-8444-555555555555.jpg'), true);
  assert.equal(r2.isQrImageKey('../private/qr/file.png'), false);
  assert.equal(r2.isQrImageKey('public/qr/file.png'), false);
  assert.equal(r2.isQrImageKey('private/qr/file.svg'), false);
});

test('R2 rejects incomplete configuration without making a network request', () => {
  assert.throws(() => r2.validateConfig({ CLOUDFLARE_ACCOUNT_ID: 'abc' }), /R2_BUCKET_NAME/);
});
