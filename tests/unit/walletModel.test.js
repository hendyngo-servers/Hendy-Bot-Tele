import test from "node:test";
import assert from "node:assert/strict";
import { createDepositRequest } from "../../backend/src/db/walletModel.js";

const unusedDb = {
  prepare() {
    throw new Error("Database must not be accessed for invalid input.");
  }
};

test("rejects deposit amounts outside the allowed VND range", async () => {
  await assert.rejects(
    createDepositRequest({ DB: unusedDb }, "123456", { amountVnd: 9999 }, "deposit-key-0001"),
    /10\.000 đến 100\.000\.000/
  );
  await assert.rejects(
    createDepositRequest({ DB: unusedDb }, "123456", { amountVnd: 100000001 }, "deposit-key-0002"),
    /10\.000 đến 100\.000\.000/
  );
});

test("requires a valid idempotency key before writing a deposit", async () => {
  await assert.rejects(
    createDepositRequest({ DB: unusedDb }, "123456", { amountVnd: 10000 }, "bad"),
    /Idempotency-Key/
  );
});
