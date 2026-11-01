import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const database = process.env.D1_DATABASE_NAME || "hendy_bot_db";
const bucket = process.env.R2_BUCKET || "hendy-bot-assets";
const prefix = process.env.BACKUP_PREFIX || "backups/d1";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const folder = mkdtempSync(join(tmpdir(), "hendy-d1-backup-"));
const output = join(folder, database + "-" + stamp + ".sql");

try {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "export", database, "--remote", "--output", output, "--config", "backend/wrangler.toml"], { stdio: "inherit" });
  const key = prefix + "/" + database + "-" + stamp + ".sql";
  execFileSync("pnpm", ["exec", "wrangler", "r2", "object", "put", bucket + "/" + key, "--file", output], { stdio: "inherit" });
  console.log("D1 backup uploaded to R2:", key);
} finally {
  rmSync(folder, { recursive: true, force: true });
}