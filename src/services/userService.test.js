import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getUser,
  getWallet,
  addBalance,
  deductBalance,
  createDepositRequest,
  reviewDeposit,
  getVipTiers
} from "./userService.js";

describe("UserService", () => {
  test("gets default user profile", async () => {
    const user = await getUser("99887766");
    assert.equal(user.id, "99887766");
    assert.equal(user.role, "admin");
    assert.ok(user.balance >= 1000000);
  });

  test("creates deposit request with VietQR URL", async () => {
    const { deposit, vietQrUrl } = await createDepositRequest("99887766", 200000);
    assert.ok(deposit.id.startsWith("DEP-"));
    assert.equal(deposit.amount, 200000);
    assert.equal(deposit.status, "pending");
    assert.ok(vietQrUrl.includes("img.vietqr.io"));
  });

  test("approves deposit and credits wallet", async () => {
    const { deposit } = await createDepositRequest("99887766", 150000);
    const beforeWallet = await getWallet("99887766");
    const reviewed = await reviewDeposit(deposit.id, "approved");
    assert.equal(reviewed.status, "approved");
    const afterWallet = await getWallet("99887766");
    assert.equal(afterWallet.balance, beforeWallet.balance + 150000);
  });

  test("deducts balance on order payment", async () => {
    const beforeWallet = await getWallet("99887766");
    await deductBalance("99887766", 50000, "Test checkout");
    const afterWallet = await getWallet("99887766");
    assert.equal(afterWallet.balance, beforeWallet.balance - 50000);
  });

  test("throws error if deducting more than balance", async () => {
    await assert.rejects(
      async () => {
        await deductBalance("99887766", 9999999999, "Overdraft attempt");
      },
      /Số dư ví không đủ/
    );
  });

  test("returns VIP profile and next tier targets", async () => {
    const vip = await getVipTiers("99887766");
    assert.ok(vip.currentTier.name);
    assert.ok(vip.benefits.length > 0);
  });
});
