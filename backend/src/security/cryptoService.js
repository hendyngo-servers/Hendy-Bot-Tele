const encoder = new TextEncoder();

export function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left ?? ""));
  const b = encoder.encode(String(right ?? ""));
  let mismatch = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

export async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export function toHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}