import { describe, expect, it } from "vitest";
import { buildMainMenu, isHttpsUrl, parseBotCommand } from "./telegram";

describe("Telegram bot menu and command compatibility", () => {
  const env = {
    TELEGRAM_ADMIN_IDS: "123456,987654",
    WEB_APP_URL: "https://app.example.com",
    WEB_USER_URL: "https://app.example.com",
    WEB_ADMIN_URL: "https://admin.example.com"
  };

  it("shows member functions and admin web app only to configured administrators", () => {
    const admin = buildMainMenu("123456", env);
    const member = buildMainMenu("222222", env);
    const adminButtons = admin.inline_keyboard.flat();
    const memberButtons = member.inline_keyboard.flat();
    expect(adminButtons.some(item => item.callback_data === "member:wallet")).toBe(true);
    expect(adminButtons.some(item => item.web_app?.url === "https://admin.example.com")).toBe(true);
    expect(memberButtons.some(item => item.web_app?.url === "https://app.example.com")).toBe(true);
    expect(memberButtons.some(item => item.callback_data === "member:support")).toBe(true);
  });

  it("parses commands with an optional bot username and arguments", () => {
    expect(parseBotCommand("/start@HendyBot ref_123")).toEqual({ name: "start", args: "ref_123" });
    expect(parseBotCommand("/broadcast Hello everyone")).toEqual({ name: "broadcast", args: "Hello everyone" });
    expect(parseBotCommand("hello")).toBeNull();
  });

  it("accepts only credential-free HTTPS URLs", () => {
    expect(isHttpsUrl("https://admin.example.com")).toBe(true);
    expect(isHttpsUrl("http://admin.example.com")).toBe(false);
    expect(isHttpsUrl("https://user:password@example.com")).toBe(false);
  });
});
