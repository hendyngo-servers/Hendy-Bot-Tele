import type { Fetcher } from "../../../packages/shared/src/cloudflare";

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  BACKEND: Fetcher;
  HEALTH_URLS: string;
  BACKUP_SECRET: string;
  ALERT_WEBHOOK_URL?: string;
}

async function alert(env: Env, message: string) {
  if (!env.ALERT_WEBHOOK_URL) return;
  await fetch(env.ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: message, source: "hendy-self-healing", at: new Date().toISOString() })
  }).catch(() => undefined);
}

async function checkTargets(env: Env) {
  const targets = (env.HEALTH_URLS || "").split(",").map(value => value.trim()).filter(Boolean);
  const results = await Promise.all(targets.map(async target => {
    try {
      const url = new URL(target);
      if (url.protocol !== "https:") throw new Error("Chỉ chấp nhận HTTPS");
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10000) });
      return { target, ok: response.ok, status: response.status };
    } catch (error) {
      return { target, ok: false, error: error instanceof Error ? error.message : "network error" };
    }
  }));
  const failed = results.filter(result => !result.ok);
  if (failed.length) await alert(env, "Hendy health check có lỗi: " + JSON.stringify(failed));
  return { ok: failed.length === 0, checkedAt: new Date().toISOString(), results };
}

async function createBackup(env: Env) {
  if (!env.BACKUP_SECRET) throw new Error("BACKUP_SECRET chưa được cấu hình.");
  const response = await env.BACKEND.fetch(new Request("https://backend.internal/internal/backup", {
    method: "POST",
    headers: { "x-backup-secret": env.BACKUP_SECRET }
  }));
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Backup thất bại HTTP " + response.status + ": " + detail.slice(0, 200));
  }
  return response.json();
}

export default {
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil((async () => {
      const report = await checkTargets(env);
      if (controller.cron === "0 2 * * *") {
        try {
          const backup = await createBackup(env);
          console.log("database backup completed", JSON.stringify(backup));
        } catch (error) {
          await alert(env, "Hendy backup thất bại: " + (error instanceof Error ? error.message : "unknown"));
          throw error;
        }
      }
      if (!report.ok) console.error("health checks failed", JSON.stringify(report));
    })());
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname !== "/healthz") return new Response("Not found", { status: 404 });
    const report = await checkTargets(env);
    return Response.json(report, { status: report.ok ? 200 : 503 });
  }
};
