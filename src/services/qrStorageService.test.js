const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-qr-'));
process.env.DATA_DIR = dataDir;
const storage = require('./qrStorageService');

test('QR storage validates PNG, JPEG and WebP image signatures and size', () => {
  assert.equal(storage.validateQrImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(storage.validateQrImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'), true);
  assert.equal(storage.validateQrImage(Buffer.from('RIFF0000WEBP'), 'image/webp'), true);
  assert.throws(() => storage.validateQrImage(Buffer.alloc(0), 'image/png'), /không có dữ liệu/);
  assert.throws(() => storage.validateQrImage(Buffer.from('x'), 'image/svg+xml'), /PNG, JPEG hoặc WebP/);
  assert.throws(() => storage.validateQrImage(Buffer.from('not-an-image'), 'image/png'), /không khớp/);
  assert.throws(() => storage.validateQrImage(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png'), /2 MB/);
});

test('QR storage writes, reads and deletes private files using opaque filenames', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const uploaded = await storage.uploadQrImage(png, 'image/png');
  assert.match(uploaded.filename, /^[a-f0-9-]{36}\.png$/i);
  assert.equal(uploaded.url, '/uploads/qr/' + uploaded.filename);
  assert.equal(uploaded.size, png.length);
  const loaded = await storage.readQrImage(uploaded.filename);
  assert.deepEqual(loaded.buffer, png);
  assert.equal(loaded.contentType, 'image/png');
  assert.equal(await storage.deleteQrImage(uploaded.filename), true);
  assert.equal(await storage.deleteQrImage(uploaded.filename), false);
  await assert.rejects(storage.readQrImage('../secret.png'), /Không tìm thấy ảnh QR/);
});

test.after(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
