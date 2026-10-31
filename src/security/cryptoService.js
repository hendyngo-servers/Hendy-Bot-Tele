const crypto = require('node:crypto');
function getKey() {
  const secret = process.env.APP_ENCRYPTION_KEY || '';
  if (secret.length < 32) throw new Error('APP_ENCRYPTION_KEY phải có tối thiểu 32 ký tự.');
  return crypto.createHash('sha256').update(secret,'utf8').digest();
}
function encryptSecret(value) {
  if (typeof value !== 'string' || !value) throw new Error('Dữ liệu cần mã hóa không hợp lệ.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm',getKey(),iv);
  const encrypted = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}
function decryptSecret(payload) {
  if (!payload || payload.version !== 1) throw new Error('Dữ liệu mã hóa không hợp lệ.');
  const decipher = crypto.createDecipheriv('aes-256-gcm',getKey(),Buffer.from(payload.iv,'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString('utf8');
}
module.exports = {encryptSecret,decryptSecret};
