const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const qrDir = path.join(dataDir, 'qr');

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

function isQrImageFileName(filename) {
  return typeof filename === 'string' &&
    /^[a-f0-9-]{36}\.(?:png|jpg|webp)$/i.test(filename);
}

function getReadUrl(filename) {
  if (!isQrImageFileName(filename)) throw new Error('Tên tệp ảnh QR không hợp lệ.');
  return '/uploads/qr/' + encodeURIComponent(filename);
}

function getContentType(filename) {
  if (/\.png$/i.test(filename)) return 'image/png';
  if (/\.jpe?g$/i.test(filename)) return 'image/jpeg';
  if (/\.webp$/i.test(filename)) return 'image/webp';
  throw new Error('Định dạng ảnh QR không hợp lệ.');
}

async function uploadQrImage(buffer, contentType) {
  validateQrImage(buffer, contentType);
  const extension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
  }[String(contentType).toLowerCase()];
  const filename = crypto.randomUUID() + '.' + extension;
  await fs.mkdir(qrDir, { recursive: true, mode: 0o700 });
  const target = path.join(qrDir, filename);
  const temporary = target + '.tmp';
  await fs.writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, target);
  return {
    filename,
    url: getReadUrl(filename),
    contentType: String(contentType).toLowerCase(),
    size: buffer.length
  };
}

async function readQrImage(filename) {
  if (!isQrImageFileName(filename)) {
    const error = new Error('Không tìm thấy ảnh QR.');
    error.code = 'ENOENT';
    throw error;
  }
  const buffer = await fs.readFile(path.join(qrDir, filename));
  return { buffer, contentType: getContentType(filename) };
}

async function deleteQrImage(filename) {
  if (!isQrImageFileName(filename)) throw new Error('Tên tệp ảnh QR không hợp lệ.');
  try {
    await fs.unlink(path.join(qrDir, filename));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_TYPES,
  validateQrImage,
  isQrImageFileName,
  getReadUrl,
  uploadQrImage,
  readQrImage,
  deleteQrImage
};
