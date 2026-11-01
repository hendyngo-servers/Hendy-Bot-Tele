import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getCatalogItems,
  packageAndDeployProduct,
  createOrder,
  getOrders,
  payOrder,
  updateOrderStatus,
  issueGiftCode,
  redeemGiftCode,
  getGiftCodesList,
  getTickets,
  createTicket,
  replyTicket,
  getAdminStats
} from "./appDataService.js";

describe("AppDataService", () => {
  test("returns seeded catalog items", async () => {
    const items = await getCatalogItems();
    assert.ok(items.length >= 5);
    const item1 = items.find((i) => i.id === "app-1");
    assert.ok(item1);
    assert.equal(item1.price, 350000);
    assert.equal(typeof item1.price, "number");
  });

  test("packages and deploys new product to catalog", async () => {
    const deployed = await packageAndDeployProduct({
      title: "Test Telegram Bot Package",
      category: "tools",
      price: 250000,
      version: "1.0.0",
      tagline: "Test bot deployment",
      r2Bucket: "hendy-bot-assets"
    });
    assert.ok(deployed.id.startsWith("app-"));
    assert.equal(deployed.price, 250000);

    const items = await getCatalogItems("tools");
    const found = items.find((i) => i.id === deployed.id);
    assert.ok(found);
  });

  test("creates, lists, and pays order from wallet", async () => {
    const order = await createOrder("99887766", {
      title: "Test Order Item",
      amountVnd: 50000,
      module: "tools"
    });
    assert.ok(order.id.startsWith("ORD-"));
    assert.equal(order.status, "pending");

    const userOrders = await getOrders("99887766");
    assert.ok(userOrders.some((o) => o.id === order.id));

    const payResult = await payOrder(order.id, "99887766");
    assert.equal(payResult.success, true);
    assert.equal(payResult.order.paymentStatus, "paid");
  });

  test("issues and redeems giftcodes", async () => {
    const issued = await issueGiftCode({
      codePrefix: "TESTPROMO",
      amountVnd: 75000,
      maxUses: 2
    });
    assert.ok(issued.code.startsWith("TESTPROMO-"));
    assert.equal(issued.amount, 75000);

    const redeem = await redeemGiftCode("99887766", issued.code);
    assert.equal(redeem.success, true);
    assert.equal(redeem.amount, 75000);
  });

  test("creates and replies to support tickets", async () => {
    const ticket = await createTicket("99887766", {
      subject: "Test support request",
      message: "Please help check my order"
    });
    assert.ok(ticket.id.startsWith("TCK-"));
    assert.equal(ticket.messages.length, 1);

    const updated = await replyTicket(ticket.id, "Resolved promptly!", "support");
    assert.equal(updated.messages.length, 2);
  });

  test("computes admin stats", async () => {
    const stats = await getAdminStats();
    assert.ok(typeof stats.totalRevenue === "number");
    assert.ok(stats.activeProducts > 0);
  });
});
