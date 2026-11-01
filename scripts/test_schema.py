from pathlib import Path
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
for migration in sorted(Path("packages/db-schema/migrations").glob("*.sql")):
    db.executescript(migration.read_text(encoding="utf-8"))
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
expected = {"users", "app_settings", "packages", "orders", "deposits", "linked_accounts", "audit_logs", "webhook_updates", "support_tickets"}
missing = expected - tables
if missing:
    raise SystemExit("Missing tables: " + ", ".join(sorted(missing)))
db.execute("INSERT INTO users (telegram_id,display_name) VALUES ('1001','Test User')")
db.execute("INSERT INTO packages (id,slug,name,category,price_vnd) VALUES ('p1','test-package','Gói kiểm thử','tool',10000)")
db.execute("INSERT INTO orders (id,telegram_id,package_id,total_vnd) VALUES ('o1','1001','p1',10000)")
db.execute("INSERT INTO support_tickets (id,telegram_id,subject,message) VALUES ('t1','1001','Hỗ trợ','Nội dung')")
assert db.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1
assert db.execute("SELECT COUNT(*) FROM support_tickets").fetchone()[0] == 1
print("D1 migrations: OK")
