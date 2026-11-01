import express from "express";
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
} from "../services/appDataService.js";
import {
  getUser,
  getWallet,
  createDepositRequest,
  getDepositsList,
  reviewDeposit,
  getVipTiers
} from "../services/userService.js";
import { handleTelegramWebhook, getBotStatus } from "../controllers/botController.js";

const router = express.Router();

// Public Catalog (App Store)
router.get("/catalog", async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const items = await getCatalogItems(category, search);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Admin Packaging & Deploy to Cloudflare R2 / Store
router.post("/admin/catalog/package-deploy", async (req, res, next) => {
  try {
    const deployed = await packageAndDeployProduct(req.body);
    res.status(201).json({ success: true, product: deployed });
  } catch (err) {
    next(err);
  }
});

// User Home & Profile
router.get("/home", async (req, res, next) => {
  try {
    const user = await getUser("99887766");
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Wallet Balance & Ledger
router.get("/wallet", async (req, res, next) => {
  try {
    const wallet = await getWallet("99887766");
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

// Create VietQR Deposit
router.post("/deposits", async (req, res, next) => {
  try {
    const { amountVnd } = req.body;
    if (!amountVnd || Number(amountVnd) < 10000) {
      return res.status(400).json({ error: "Số tiền nạp tối thiểu là 10.000 VNĐ." });
    }
    const result = await createDepositRequest("99887766", amountVnd);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Get Deposits List (Admin)
router.get("/deposits", async (req, res, next) => {
  try {
    const deposits = await getDepositsList(req.query.filter);
    res.json({ deposits });
  } catch (err) {
    next(err);
  }
});

// Review Deposit (Admin: approve/reject)
router.post("/deposits/:id/review", async (req, res, next) => {
  try {
    const { decision } = req.body;
    const updated = await reviewDeposit(req.params.id, decision, "admin");
    res.json({ success: true, deposit: updated });
  } catch (err) {
    next(err);
  }
});

// Orders (User & Admin)
router.get("/orders", async (req, res, next) => {
  try {
    const orders = await getOrders("99887766");
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/orders", async (req, res, next) => {
  try {
    const orders = await getOrders();
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const order = await createOrder("99887766", req.body);
    res.status(201).json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:id/pay", async (req, res, next) => {
  try {
    const result = await payOrder(req.params.id, "99887766");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:id/status", async (req, res, next) => {
  try {
    const updated = await updateOrderStatus(req.params.id, req.body.status);
    res.json({ success: true, order: updated });
  } catch (err) {
    next(err);
  }
});

// VIP Profile
router.get("/vip", async (req, res, next) => {
  try {
    const vip = await getVipTiers("99887766");
    res.json(vip);
  } catch (err) {
    next(err);
  }
});

// Giftcodes
router.get("/giftcodes", async (req, res, next) => {
  try {
    const giftcodes = await getGiftCodesList();
    res.json({ giftcodes });
  } catch (err) {
    next(err);
  }
});

router.post("/giftcodes", async (req, res, next) => {
  try {
    const gc = await issueGiftCode(req.body);
    res.status(201).json(gc);
  } catch (err) {
    next(err);
  }
});

router.post("/giftcodes/redeem", async (req, res, next) => {
  try {
    const result = await redeemGiftCode("99887766", req.body.code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Support Tickets
router.get("/support/tickets", async (req, res, next) => {
  try {
    const tickets = await getTickets();
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.post("/support/tickets", async (req, res, next) => {
  try {
    const ticket = await createTicket("99887766", req.body);
    res.status(201).json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});

router.post("/support/tickets/:id/reply", async (req, res, next) => {
  try {
    const updated = await replyTicket(req.params.id, req.body.message, req.body.sender || "support");
    res.json({ success: true, ticket: updated });
  } catch (err) {
    next(err);
  }
});

// Admin Stats
router.get("/admin/stats", async (req, res, next) => {
  try {
    const stats = await getAdminStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// Telegram Bot Webhook & Status
router.post("/telegram/webhook", handleTelegramWebhook);
router.get("/telegram/status", getBotStatus);

export default router;
