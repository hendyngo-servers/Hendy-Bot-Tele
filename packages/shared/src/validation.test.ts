import { describe, expect, it } from "vitest";
import { cleanText, safeInteger, safeObjectKey, isValidUsername } from "./validation";

describe("bộ kiểm tra dữ liệu", () => {
  it("loại bỏ ký tự điều khiển và giới hạn độ dài", () => expect(cleanText("  A\nB  ", 3)).toBe("AB"));
  it("chỉ chấp nhận số nguyên an toàn trong khoảng", () => {
    expect(safeInteger("100", 10, 200)).toBe(100);
    expect(safeInteger("-1", 0, 200)).toBeNull();
    expect(safeInteger("1.5")).toBeNull();
  });
  it("chặn object key traversal", () => {
    expect(safeObjectKey("applications/app.apk")).toBe(true);
    expect(safeObjectKey("../secret")).toBe(false);
  });
  it("xác thực Telegram username", () => {
    expect(isValidUsername("@hendy_bot")).toBe(true);
    expect(isValidUsername("x")).toBe(false);
  });
});