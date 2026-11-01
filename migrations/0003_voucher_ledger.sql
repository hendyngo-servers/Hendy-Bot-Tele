CREATE TABLE IF NOT EXISTS voucher_ledger (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  amount_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_voucher_ledger_user_created ON voucher_ledger(telegram_id,created_at DESC);

DROP TRIGGER IF EXISTS trg_giftcode_credit_on_redemption;
CREATE TRIGGER IF NOT EXISTS trg_giftcode_credit_on_redemption
AFTER INSERT ON giftcode_redemptions
BEGIN
  UPDATE giftcodes
    SET used_count = used_count + 1,
        status = CASE WHEN used_count + 1 >= max_uses THEN 'depleted' ELSE status END
    WHERE code = NEW.code;
  UPDATE users
    SET voucher_balance = voucher_balance + (SELECT amount FROM giftcodes WHERE code = NEW.code),
        updated_at = datetime('now')
    WHERE telegram_id = NEW.telegram_id;
  INSERT INTO voucher_ledger(id,telegram_id,amount_delta,balance_after,entry_type,note,reference_id)
    SELECT lower(hex(randomblob(16))), u.telegram_id, g.amount, u.voucher_balance,
      'giftcode', 'Đổi Giftcode ' || g.code, g.code
    FROM users u JOIN giftcodes g ON g.code = NEW.code
    WHERE u.telegram_id = NEW.telegram_id;
END;
