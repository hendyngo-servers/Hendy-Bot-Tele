import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { verifyTelegramWebAppData, generateTelegramInitDataMock } from "./telegramAuth.js";

describe("TelegramAuth", () => {
  const dummyToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
  const dummyUser = { id: 987654321, first_name: "Hendy", username: "hendy_admin" };

  test("verifies valid Telegram WebApp initData", () => {
    const initData = generateTelegramInitDataMock(dummyUser, dummyToken);
    const result = verifyTelegramWebAppData(initData, dummyToken);
    assert.equal(result.valid, true);
    assert.equal(result.user.id, dummyUser.id);
    assert.equal(result.user.username, dummyUser.username);
  });

  test("rejects tampered Telegram initData", () => {
    const initData = generateTelegramInitDataMock(dummyUser, dummyToken);
    const tampered = initData.replace("hendy_admin", "hacker_user");
    const result = verifyTelegramWebAppData(tampered, dummyToken);
    assert.equal(result.valid, false);
    assert.match(result.error, /Signature mismatch/);
  });

  test("rejects data with wrong bot token", () => {
    const initData = generateTelegramInitDataMock(dummyUser, dummyToken);
    const result = verifyTelegramWebAppData(initData, "wrong-bot-token");
    assert.equal(result.valid, false);
    assert.match(result.error, /Signature mismatch/);
  });

  test("rejects empty or malformed strings", () => {
    assert.equal(verifyTelegramWebAppData("", dummyToken).valid, false);
    assert.equal(verifyTelegramWebAppData("foo=bar", dummyToken).valid, false);
  });
});
