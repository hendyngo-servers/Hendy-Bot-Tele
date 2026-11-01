/**
 * Cloudflare Worker for Hendy Bot
 * 
 * Runs at the Cloudflare Edge, interfacing directly with:
 * - env.DB (Cloudflare D1 Database)
 * - env.BUCKET (Cloudflare R2 Object Storage)
 * 
 * Can process webhooks directly at edge or proxy requests to Render Web Service.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return new Response(JSON.stringify({
        status: "ok",
        edge: "Cloudflare Workers",
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Direct Cloudflare D1 query endpoint for edge integrations
    if (url.pathname === "/api/edge/d1-query" && request.method === "POST") {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.EDGE_SECRET_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      try {
        const { sql, params } = await request.json();
        const start = Date.now();
        const stmt = env.DB.prepare(sql);
        const bound = params && params.length ? stmt.bind(...params) : stmt;
        const res = await bound.all();
        return new Response(JSON.stringify({
          success: true,
          results: res.results,
          meta: {
            duration_ms: Date.now() - start,
            changes: res.meta?.changes || 0,
            served_by: "Cloudflare Workers Edge + D1 Native Binding"
          }
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
      }
    }

    // Direct Telegram Webhook handling at Edge
    if (url.pathname === "/webhook" || url.pathname === "/api/telegram/webhook") {
      // Validate secret token if configured
      const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (env.WEBHOOK_SECRET && secretHeader !== env.WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Invalid secret" }), { status: 403 });
      }

      // If Render backend is configured as primary processor, forward update to Render
      if (env.RENDER_BACKEND_URL) {
        const renderWebhookUrl = `${env.RENDER_BACKEND_URL}/api/telegram/webhook`;
        return fetch(renderWebhookUrl, {
          method: "POST",
          headers: request.headers,
          body: request.body
        });
      }

      // Standalone Edge response
      const update = await request.json().catch(() => ({}));
      return new Response(JSON.stringify({
        ok: true,
        handled_by: "Cloudflare Worker Edge",
        update_id: update.update_id
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Fallback: proxy to Render
    if (env.RENDER_BACKEND_URL) {
      const targetUrl = new URL(url.pathname + url.search, env.RENDER_BACKEND_URL);
      return fetch(new Request(targetUrl, request));
    }

    return new Response("Hendy Bot Cloudflare Worker Edge Active", { status: 200 });
  }
};
