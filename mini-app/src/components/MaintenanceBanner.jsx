import React, { useState } from "react";
import { AlertCircle, CheckCircle2, ShieldAlert, Power, Edit3, Save } from "lucide-react";

export function MaintenanceBanner({ isMaintenance, message, onToggle, onUpdateMessage, isAdmin = false }) {
  const [editingMessage, setEditingMessage] = useState(false);
  const [customMsg, setCustomMsg] = useState(message || "");

  if (!isMaintenance && !isAdmin) return null;

  return (
    <div className={`rounded-2xl p-4 transition-all duration-300 border ${
      isMaintenance
        ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
        : "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
    }`}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl mt-0.5 ${
            isMaintenance ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
          }`}>
            {isMaintenance ? <ShieldAlert className="w-5 h-5 animate-pulse" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">
                Chế Độ Bảo Trì Hệ Thống (Maintenance Mode)
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isMaintenance ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              }`}>
                {isMaintenance ? "🔴 Đang Bật" : "🟢 Đang Tắt (Online)"}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {isMaintenance
                ? message || "Hệ thống đang bảo trì kỹ thuật để nâng cấp Cloudflare D1. Người dùng thông thường sẽ nhận được thông báo này khi gửi lệnh tới Telegram Bot."
                : "Hệ thống đang hoạt động bình thường, phục vụ người dùng Telegram Bot và Mini App liên tục 24/7."}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {isMaintenance && (
              <button
                type="button"
                onClick={() => setEditingMessage(!editingMessage)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{editingMessage ? "Đóng" : "Sửa thông điệp"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggle(!isMaintenance, customMsg)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all ${
                isMaintenance
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isMaintenance ? "Tắt Bảo Trì (Mở Cửa Bot)" : "Bật Chế Độ Bảo Trì"}</span>
            </button>
          </div>
        )}
      </div>

      {isAdmin && isMaintenance && editingMessage && (
        <div className="mt-3 pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="Nhập thông điệp bảo trì người dùng sẽ nhận được trên Telegram..."
            className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-amber-500/30 text-xs text-white focus:outline-none focus:border-amber-400"
          />
          <button
            type="button"
            onClick={() => {
              onUpdateMessage(customMsg);
              setEditingMessage(false);
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-1 shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Lưu Thông Điệp</span>
          </button>
        </div>
      )}
    </div>
  );
}
