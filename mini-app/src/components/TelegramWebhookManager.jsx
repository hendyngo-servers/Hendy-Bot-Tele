import React, { useState } from "react";
import { Bot, RefreshCw, Send, CheckCircle2, AlertTriangle, ExternalLink, Globe } from "lucide-react";

export function TelegramWebhookManager({ webhookInfo, onRefresh, showToast }) {
  const [webhookUrl, setWebhookUrl] = useState(
    webhookInfo?.url || "https://hendy-bot-tele.onrender.com/api/telegram/webhook"
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleRegisterWebhook = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/telegram/set-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl })
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.success) {
        showToast("Đã đồng bộ Webhook thành công tới máy chủ Telegram API!");
        onRefresh();
      } else {
        showToast(data.result?.description || "Không thể đồng bộ Webhook", "error");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-4 border-indigo-500/30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Cấu Hình Telegram Bot & Webhook Render</h4>
            <p className="text-xs text-slate-400">Kết nối trực tiếp Webhook từ Telegram API về máy chủ Render</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Kiểm Tra Trạng Thái</span>
        </button>
      </div>

      {/* Webhook Status Info Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Địa chỉ Webhook Đang Đăng Ký</span>
          <span className="font-mono text-xs text-cyan-300 font-semibold truncate block">
            {webhookInfo?.url || "Chưa thiết lập"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Cập Nhật Chờ Xử Lý (Pending Updates)</span>
          <span className="text-sm font-bold text-emerald-400">
            {webhookInfo?.pending_update_count ?? 0} request
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Chứng chỉ SSL Telegram</span>
          <span className="text-xs font-semibold text-white flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Render Automatic TLS 1.3</span>
          </span>
        </div>
      </div>

      {/* Register Webhook Form */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <label className="text-xs font-semibold text-slate-300 block">
          URL Webhook Nhận Lệnh Bot (Render Web Service)
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hendy-bot-tele.onrender.com/api/telegram/webhook"
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={handleRegisterWebhook}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
          >
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Đồng Bộ Webhook Lên Telegram</span>
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={`p-3 rounded-xl text-xs font-mono ${
          syncResult.success ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300" : "bg-red-950/40 border border-red-500/30 text-red-300"
        }`}>
          {syncResult.success
            ? `✅ Webhook đã đăng ký thành công tới Telegram API: ${syncResult.targetUrl}`
            : `❌ Thất bại: ${syncResult.result?.description || "Không thể kết nối Telegram API"}`}
        </div>
      )}
    </div>
  );
}
