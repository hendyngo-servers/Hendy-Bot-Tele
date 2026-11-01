import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
function getKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ENCRYPTION_KEY must be configured with at least 32 bytes.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(text) {
  if (typeof text !== "string") {
    throw new TypeError("Plaintext must be a string");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText) {
  if (typeof encryptedText !== "string" || !encryptedText.includes(":")) {
    throw new Error("Invalid encrypted payload format");
  }
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload parts");
  }
  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateHmac(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyHmac(data, signature, secret) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = generateHmac(data, secret);
  const supplied = Buffer.from(signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  return supplied.length === wanted.length && crypto.timingSafeEqual(wanted, supplied);
}
