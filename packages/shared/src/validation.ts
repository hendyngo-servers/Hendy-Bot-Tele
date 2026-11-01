export function cleanText(value: unknown, max = 160): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function safeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return null;
  return number;
}

export function safeObjectKey(value: string): boolean {
  return value.length > 0 && value.length <= 512 &&
    !value.startsWith("/") && !value.includes("..") &&
    /^[a-zA-Z0-9/_ .-]+$/.test(value);
}

export function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9_]{5,32}$/.test(value.replace(/^@/, ""));
}