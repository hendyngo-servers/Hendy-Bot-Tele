interface Env {
  HEALTH_TARGETS: string;
  ALERT_WEBHOOK_URL?: string;
  SELF_HEALING_TOKEN?: string;
}
type CheckResult = { target: string; ok: boolean; status?: number; error?: string };
function constantTimeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function checkTargets(env: Env) {
  const targets = (env.HEALTH_TARGETS || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 20);
  const results: CheckResult[] = await Promise.all(targets.map(async target => {
    try {
      const parsed = new URL(target);
      if (parsed.protocol !== "https:") return { target, ok: false, error: "Only HTTPS health targets are allowed" };
      const response = await fetch(parsed.toString(), {
        method: "GET", signal: AbortSignal.timeout(8000), redirect: "manual"
      });
      return { target, ok: response.ok, status: response.status };
    } catch {
      return { target, ok: false, error: "Health target unreachable" };
    }
  }));
  const failed = results.filter(result => !result.ok);
  if (failed.length && env.ALERT_WEBHOOK_URL) {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Hendy health check failed", checkedAt: new Date().toISOString(), failed })
    }).catch(() => undefined);
  }
  return { ok: failed.length === 0, checkedAt: new Date().toISOString(), results };
}
export default {
  async scheduled(_event: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(checkTargets(env));
  },
  async fetch(request: Request, env: Env) {
    if (request.method !== "GET") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    const supplied = request.headers.get("Authorization") || "";
    if (!env.SELF_HEALING_TOKEN || !constantTimeEqual(supplied, "Bearer " + env.SELF_HEALING_TOKEN)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return Response.json(await checkTargets(env));
  }
};
