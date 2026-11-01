import type { BackendEnv, D1Database } from "../../../packages/shared/src/cloudflare";
import type { TelegramUser } from "./auth";

export async function upsertTelegramUser(db: D1Database, user: TelegramUser, admin: boolean) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 160);
  await db.prepare(
    "INSERT INTO users (telegram_id, username, display_name, role) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, " +
    "role=CASE WHEN users.role='admin' OR excluded.role='admin' THEN 'admin' ELSE users.role END, updated_at=CURRENT_TIMESTAMP"
  ).bind(user.id, user.username || null, name, admin ? "admin" : "user").run();
}

export async function consumeRateLimit(env: BackendEnv, key: string, maximum = 90): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60000);
  const result = await env.DB.prepare(
    "INSERT INTO api_rate_limits (key, bucket, hits) VALUES (?, ?, 1) " +
    "ON CONFLICT(key, bucket) DO UPDATE SET hits=hits+1 RETURNING hits"
  ).bind(key.slice(0, 180), bucket).first<{ hits: number }>();
  return Number(result?.hits || 0) <= maximum;
}

export async function audit(
  env: BackendEnv,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string | null = null,
  details: Record<string, unknown> = {}
) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, details_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), actorId, action, resourceType, resourceId, JSON.stringify(details)).run();
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function asEnv(value: unknown): BackendEnv {
  return value as BackendEnv;
}
