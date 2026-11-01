from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "packages" / "db-schema" / "migrations"

def main():
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        raise SystemExit("No SQL migrations found")
    for migration in files:
        try:
            database.executescript(migration.read_text(encoding="utf-8"))
        except sqlite3.Error as error:
            raise SystemExit(f"Migration failed: {migration.name}: {error}") from error
    tables = database.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchone()[0]
    print(f"Validated {len(files)} migrations; {tables} tables created.")
    database.close()

if __name__ == "__main__":
    main()
