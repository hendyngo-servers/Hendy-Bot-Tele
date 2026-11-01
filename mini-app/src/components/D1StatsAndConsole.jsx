import React, { useState } from "react";
import { telegramFetch } from "../services/api.js";
import { Database, Play, Clock, Terminal, Archive, RefreshCw } from "lucide-react";

const SAMPLE_QUERIES = [
  { label: "bot_settings", sql: "SELECT * FROM bot_settings;" },
  { label: "bot_events", sql: "SELECT * FROM bot_events ORDER BY created_at DESC LIMIT 20;" },
  { label: "users", sql: "SELECT * FROM users LIMIT 10;" },
  { label: "catalog_products", sql: "SELECT * FROM catalog_products LIMIT 5;" },
  { label: "sqlite_master", sql: "SELECT name, type FROM sqlite_master WHERE type='table';" }
];

export function D1StatsAndConsole({ adminStats, showToast }) {
  const [sqlInput, setSqlInput] = useState("SELECT * FROM bot_settings;");
  const [loading, setLoading] = useState(false);
  const [queryOutput, setQueryOutput] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  const handleRunQuery = async () => {
    if (!sqlInput.trim()) return;
    setLoading(true);
    setQueryOutput(null);
    try {
      const res = await telegramFetch("/api/admin/d1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data);
        showToast(`Truy vấn D1 thành công (${data.meta?.duration_ms || 1} ms)`);
      } else {
        setQueryOutput({ error: data.error || "Lỗi truy vấn SQL" });
        showToast(data.error || "Lỗi truy vấn SQL", "error");
      }
    } catch (err) {
      setQueryOutput({ error: err.message });
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const response = await telegramFetch("/api/admin/backup", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể tạo bản sao lưu.");
      setBackupResult(result.backup || result);
      showToast("Đã hoàn tất sao lưu D1 sang Cloudflare R2.");
    } catch (error) {
      setBackupResult({ error: error.message });
      showToast(error.message, "error");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-4 border-cyan-500/30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Thống Kê Thời Gian Thực & Console Cloudflare D1</h4>
            <p className="text-xs text-slate-400">
              Cơ sở dữ liệu Serverless SQLite phân tán trên mạng lưới toàn cầu Cloudflare
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>D1 {adminStats?.d1Status || "Chưa xác định"}</span>
          </span>
          <span className="text-xs font-mono text-cyan-300 font-semibold px-2.5 py-1 rounded-xl bg-white/5 border border-white/5">
            {adminStats?.d1Latency || "—"}
          </span>
        </div>
      </div>

      {/* D1 Infrastructure Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Độ Trễ Phản Hồi (Latency)</span>
          <span className="text-base font-bold text-emerald-400 block">
            {adminStats?.d1Latency || "—"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Cơ Sở Dữ Liệu D1</span>
          <span className="text-xs font-mono font-bold text-cyan-300 block truncate">
            {adminStats?.d1Database || "Chưa cấu hình"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Tổng Lượng Truy Vấn D1</span>
          <span className="text-base font-bold text-white block">
            {adminStats?.d1Queries ?? "—"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Hạ Tầng Vận Hành</span>
          <span className="text-xs font-semibold text-indigo-300 block truncate">
            {adminStats?.d1ServedBy || "—"}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Archive className="w-4 h-4 text-amber-300" />
            Sao lưu D1 sang Cloudflare R2
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tạo CSV cho từng bảng và manifest; lịch tự động chạy hằng ngày lúc 02:00 UTC trên Worker.
          </p>
          {backupResult && (
            <p className={`mt-2 text-xs ${backupResult.error ? "text-red-300" : "text-emerald-300"}`}>
              {backupResult.error || `Bản sao lưu: ${backupResult.backup_id || "hoàn tất"} · ${backupResult.table_count || 0} bảng · ${backupResult.row_count || 0} dòng`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleBackup}
          disabled={backupLoading}
          className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {backupLoading ? <><RefreshCw className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Đang sao lưu…</> : "Sao lưu ngay"}
        </button>
      </div>

      {/* SQL Query Console */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Thực Thi Lệnh SQL Trực Tiếp (Cloudflare D1 Query Console)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setSqlInput(q.sql)}
                className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 text-[11px] font-mono transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            rows={2}
            value={sqlInput}
            onChange={(e) => setSqlInput(e.target.value)}
            placeholder="SELECT * FROM bot_settings WHERE key = 'maintenance_mode';"
            className="flex-1 px-3.5 py-2 rounded-xl bg-[#0b0f19] border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleRunQuery}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
          >
            {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Chạy Truy Vấn SQL</span>
          </button>
        </div>
      </div>

      {/* Query Result View */}
      {queryOutput && (
        <div className="p-3.5 rounded-xl bg-[#060a12] border border-cyan-500/20 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-white/5 pb-1.5">
            <span>
              Thời gian thực thi: <strong className="text-emerald-400">{queryOutput.meta?.duration_ms || 1} ms</strong>
            </span>
            <span>
              Bản ghi: <strong className="text-cyan-300">{queryOutput.results?.length ?? 0}</strong>
            </span>
          </div>

          {queryOutput.error ? (
            <div className="text-red-400 p-2 bg-red-950/30 rounded-lg">
              ❌ {queryOutput.error}
            </div>
          ) : queryOutput.results && queryOutput.results.length > 0 ? (
            <div className="max-h-56 overflow-y-auto space-y-1">
              <pre className="text-slate-300 whitespace-pre-wrap text-[11px] leading-relaxed">
                {JSON.stringify(queryOutput.results, null, 2)}
              </pre>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px]">Truy vấn đã thực thi xong (0 bản ghi).</span>
          )}
        </div>
      )}
    </div>
  );
}
