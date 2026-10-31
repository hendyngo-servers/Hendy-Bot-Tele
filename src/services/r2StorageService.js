const crypto = require('node:crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
let client = null;
let clientFingerprint = '';

function getConfig(env = process.env) {
  return {
    accountId: String(env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || '').trim(),
    bucket: String(env.R2_BUCKET_NAME || '').trim(),
    accessKeyId: String(env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || '').trim()
  };
}

function hasAnyConfig(env = process.env) {
  const config = getConfig(env);
  return Boolean(config.accountId || config.bucket || config.accessKeyId || config.secretAccessKey);
}

function validateConfig(env = process.env) {
  const config = getConfig(env);
  const missing = [];
  for (const [key, value] of Object.entries({
    CLOUDFLARE_ACCOUNT_ID: config.accountId,
    R2_BUCKET_NAME: config.bucket,
    R2_ACCESS_KEY_ID: config.accessKeyId,
    R2_SECRET_ACCESS_KEY: config.secretAccessKey
  })) {
    if (!value) missing.push(key);
  }
  if (missing.length) throw new Error('Thiếu cấu hình Cloudflare R2: ' + missing.join(', '));
  if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID phải gồm 32 ký tự hex.');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) {
    throw new Error('R2_BUCKET_NAME không hợp lệ.');
  }
  return config;
}

function getClient() {
  const config = validateConfig();
  const fingerprint = [
    config.accountId,
    config.bucket,
    config.accessKeyId,
    config.secretAccessKey
  ].join(':');
  if (!client || clientFingerprint !== fingerprint) {
    client?.destroy();
    client = new S3Client({
      region: 'auto',
      endpoint: 'https://' + config.accountId + '.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      maxAttempts: 3
    });
    clientFingerprint = fingerprint;
  }
  return { client, bucket: config.bucket };
}

function validateQrImage(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Tệp QR không có dữ liệu.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Ảnh QR tối đa 2 MB.');
  }
  const type = String(contentType || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    throw new Error('Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP.');
  }
  const isPng = type === 'image/png' &&
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = type === 'image/jpeg' &&
    buffer.length >= 3 &&
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = type === 'image/webp' &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) {
    throw new Error('Nội dung ảnh không khớp với định dạng PNG/JPEG/WebP đã khai báo.');
  }
  return true;
}

function isQrImageKey(key) {
  return typeof key === 'string' &&
    /^private\/qr\/[a-f0-9-]{36}\.(?:png|jpg|webp)$/.test(key);
}

async function uploadQrImage(buffer, contentType) {
  validateQrImage(buffer, contentType);
  const { client: s3, bucket } = getClient();
  const extension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
  }[contentType.toLowerCase()];
  const key = 'private/qr/' + crypto.randomUUID() + '.' + extension;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: contentType.toLowerCase(),
    CacheControl: 'private, max-age=300',
    Metadata: {
      purpose: 'hendy-payment-qr'
    }
  }));

  return { key, contentType: contentType.toLowerCase(), size: buffer.length };
}

async function getReadUrl(key, expiresIn = 3600) {
  if (!isQrImageKey(key)) throw new Error('R2 object key không hợp lệ.');
  const { client: s3, bucket } = getClient();
  const ttl = Math.max(60, Math.min(604800, Number(expiresIn) || 3600));
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttl }
  );
}

async function deleteObject(key) {
  if (!isQrImageKey(key)) throw new Error('R2 object key không hợp lệ.');
  const { client: s3, bucket } = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

async function checkBucket() {
  const { client: s3, bucket } = getClient();
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  return true;
}

function close() {
  client?.destroy();
  client = null;
  clientFingerprint = '';
}

module.exports = {
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_TYPES,
  getConfig,
  hasAnyConfig,
  validateConfig,
  validateQrImage,
  isQrImageKey,
  uploadQrImage,
  getReadUrl,
  deleteObject,
  checkBucket,
  close
};
