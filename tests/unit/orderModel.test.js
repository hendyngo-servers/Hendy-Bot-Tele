import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrderInput, canTransitionOrder, ORDER_TRANSITIONS } from "../../backend/src/db/orderModel.js";

test("normalizes a supported service order without trusting client price fields", () => {
  const normalized = normalizeOrderInput({
    module: "app_tool",
    title: "Yêu cầu thuê công cụ",
    description: "Thuê 7 ngày",
    quantity: "2",
    amount: 999999999,
    unitPrice: 1
  });
  assert.deepEqual(normalized, {
    module: "app_tool",
    title: "Yêu cầu thuê công cụ",
    description: "Thuê 7 ngày",
    quantity: 2
  });
  assert.equal(Object.hasOwn(normalized, "amount"), false);
});

test("rejects unsupported modules and invalid quantities", () => {
  assert.throws(() => normalizeOrderInput({ module: "wallet", title: "Nạp tiền", quantity: 1 }), /chưa được hỗ trợ/i);
  assert.throws(() => normalizeOrderInput({ module: "buy_code", title: "Mua mã", quantity: 0 }), /Số lượng/i);
  assert.throws(() => normalizeOrderInput({ module: "vip", title: "VIP", quantity: 51 }), /Số lượng/i);
});

test("limits order title and accepts bounded description", () => {
  assert.throws(() => normalizeOrderInput({ module: "vip", title: "ab" }), /ít nhất 3 ký tự/i);
  assert.throws(() => normalizeOrderInput({ module: "vip", title: "Yêu cầu VIP", description: "x".repeat(1001) }), /vượt quá giới hạn/i);
});


test("allows only the defined admin order state transitions", () => {
  assert.equal(canTransitionOrder("pending", "confirmed"), true);
  assert.equal(canTransitionOrder("confirmed", "processing"), true);
  assert.equal(canTransitionOrder("processing", "completed"), true);
  assert.equal(canTransitionOrder("pending", "completed"), false);
  assert.equal(canTransitionOrder("completed", "cancelled"), false);
  assert.deepEqual(ORDER_TRANSITIONS.cancelled, []);
});
