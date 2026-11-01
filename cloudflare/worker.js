const BACKUP_TABLES = [
  "users",
  "bot_settings",
  "bot_events",
  "processed_updates",
  "catalog_products",
  "orders",
  "deposits",
  "wallet_ledger",
  "giftcodes",
  "giftcode_redemptions",
  "support_tickets",
  "support_messages",
  "user_links",
  "app_releases",
  "admin_audit_logs",
  "backup_runs"
];

const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Prevent spreadsheet formula execution when an operator opens a CSV backup.
  if (typeof value === "string" && /^[=+@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function toCsv(columns, rows) {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  return lines.join("\r\n") + "\r\n";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function exportTable(env, tableName, prefix) {
  const info = await env.DB.prepare("PRAGMA table_info('" + tableName + "')").all();
  const columns = (info.results || []).map((column) => column.name);
  if (!columns.length) throw new Error("Không tìm thấy cấu trúc bảng D1: " + tableName);

  const pageSize = 1000;
  let offset = 0;
  const csvParts = [columns.map(csvCell).join(",") + "\r\n"];
  let count = 0;

  while (true) {
    const result = await env.DB.prepare('SELECT * FROM "' + tableName + '" LIMIT ? OFFSET ?')
      .bind(pageSize, offset).all();
    const rows = result.results || [];
    if (!rows.length) break;
    for (const row of rows) csvParts.push(columns.map((column) => csvCell(row[column])).join(",") + "\r\n");
    count += rows.length;
    offset += rows.length;
    if (rows.length < pageSize) break;
    if (count > 1000000) throw new Error("Bảng " + tableName + " vượt giới hạn 1.000.000 dòng cho một lần sao lưu.");
  }

  const csv = csvParts.join("");
  const key = prefix + "/" + tableName + ".csv";
  await env.BACKUPS.put(key, csv, {
    httpMetadata: { contentType: "text/csv; charset=utf-8", cacheControl: "private, no-store" },
    customMetadata: { table: tableName, rowCount: String(count), sha256: await sha256(csv) }
  });
  return { table: tableName, key, rows: count, bytes: encoder.encode(csv).byteLength, sha256: await sha256(csv) };
}

async function createBackup(env, requestedBy = "scheduled") {
  if (!env.DB || !env.BACKUPS) throw new Error("Thiếu binding D1 hoặc R2.");
  const startedAt = new Date();
  const runId = crypto.randomUUID();
  const day = startedAt.toISOString().slice(0, 10).replace(/-/g, "/");
  const prefix = "d1-csv-backups/" + day + "/" + runId;
  const exported = [];
  try {
    for (const tableName of BACKUP_TABLES) {
      exported.push(await exportTable(env, tableName, prefix));
    }
    const manifest = {
      version: 1,
      backup_id: runId,
      database: env.D1_DATABASE_NAME || "hendy-bot-db",
      requested_by: requestedBy,
      exported_at: new Date().toISOString(),
      format: "CSV (UTF-8, RFC 4180 quoting)",
      tables: exported,
      totals: {
        table_count: exported.length,
        row_count: exported.reduce((sum, item) => sum + item.rows, 0),
        bytes: exported.reduce((sum, item) => sum + item.bytes, 0)
      }
    };
    const manifestKey = prefix + "/manifest.json";
    await env.BACKUPS.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" }
    });

    await env.DB.prepare(
      "INSERT INTO backup_runs(id,status,object_prefix,table_count,row_count,started_at,finished_at) VALUES(?,'success',?,?,?,?,?)"
    ).bind(runId, prefix, exported.length, manifest.totals.row_count, startedAt.toISOString(), new Date().toISOString()).run();

    return {
      backup_id: runId,
      status: "success",
      object_prefix: prefix,
      manifest_key: manifestKey,
      table_count: manifest.totals.table_count,
      row_count: manifest.totals.row_count,
      exported_at: manifest.exported_at
    };
  } catch (error) {
    await env.DB.prepare(
      "INSERT INTO backup_runs(id,status,object_prefix,table_count,row_count,error_message,started_at,finished_at) VALUES(?,'failed',?,?,?, ?,?,?)"
    ).bind(runId, prefix, exported.length, exported.reduce((sum, item) => sum + item.rows, 0),
      String(error.message || error).slice(0, 1000), startedAt.toISOString(), new Date().toISOString()).run().catch(() => {});
    throw error;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/healthz") {
      try {
        await env.DB.prepare("SELECT 1 AS ping").first();
        return json({
          status: "ok",
          service: "hendy-cloudflare-edge",
          d1: "connected",
          r2: Boolean(env.BACKUPS),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return json({ status: "degraded", d1: "unavailable", error: error.message }, 503);
      }
    }

    if (url.pathname === "/api/backups/run" && request.method === "POST") {
      const expected = env.BACKUP_TRIGGER_SECRET;
      const supplied = request.headers.get("Authorization") || "";
      if (!expected || supplied !== "Bearer " + expected) return json({ error: "Unauthorized" }, 401);
      try {
        const body = await request.json().catch(() => ({}));
        const result = await createBackup(env, String(body.requestedBy || "admin"));
        return json(result, 201);
      } catch (error) {
        return json({ error: "Sao lưu D1 sang R2 thất bại.", detail: error.message }, 500);
      }
    }

    if (url.pathname === "/webhook" || url.pathname === "/api/telegram/webhook") {
      const secret = env.WEBHOOK_SECRET;
      if (secret && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
        return json({ error: "Unauthorized webhook" }, 401);
      }
      if (!env.RENDER_BACKEND_URL) return json({ error: "RENDER_BACKEND_URL chưa được cấu hình." }, 503);
      const target = new URL("/api/telegram/webhook", env.RENDER_BACKEND_URL);
      return fetch(new Request(target, request));
    }

    if (!env.RENDER_BACKEND_URL) return json({ error: "Render backend chưa được cấu hình." }, 503);
    const target = new URL(url.pathname + url.search, env.RENDER_BACKEND_URL);
    return fetch(new Request(target, request));
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(createBackup(env, "scheduled-cron"));
  }
};
