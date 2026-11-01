import React, { useState, useEffect } from "react";
import { Settings, Save, QrCode, MessageSquare, Users, Megaphone, Headphones } from "lucide-react";

const EMPTY_FORM = {
  welcome_message: "",
  vietqr_bank: "",
  vietqr_account_no: "",
  vietqr_account_name: "",
  support_telegram: "",
  group_chat_url: "",
  news_channel_url: "",
  support_url: ""
};

export function BotSettingsCard({ settings, onSaveSettings, showToast }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setFormData(Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, settings[key] || ""])));
  }, [settings]);

  const update = (key, value) => setFormData((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings(formData);
      showToast("Đã lưu VietQR, nhóm chat, kênh thông báo và CSKH vào Cloudflare D1.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    ["group_chat_url", "Liên kết nhóm chat Telegram", "https://t.me/ten_nhom", Users],
    ["news_channel_url", "Liên kết kênh thông báo", "https://t.me/ten_kenh", Megaphone],
    ["support_url", "Liên kết liên hệ CSKH", "https://t.me/ten_ho_tro", Headphones]
  ];

  return (
    <div className="glass-panel p-6 space-y-4 border-slate-700/50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-white text-base">Cấu hình Bot, VietQR và liên kết cộng đồng</h4>
          <p className="text-xs text-slate-400">Dữ liệu công khai lưu trong D1; không nhập Bot Token hoặc secret vào biểu mẫu này.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
        <label className="md:col-span-2 text-xs font-semibold text-slate-300 space-y-1">
          <span>Lời chào khi người dùng gửi /start</span>
          <textarea rows={2} value={formData.welcome_message} onChange={(event) => update("welcome_message", event.target.value)} placeholder="Lời chào của bot…" className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white" />
        </label>

        <label className="text-xs font-semibold text-slate-300 space-y-1">
          <span>Ngân hàng VietQR (Bank ID)</span>
          <input required value={formData.vietqr_bank} onChange={(event) => update("vietqr_bank", event.target.value.toUpperCase())} placeholder="Ví dụ: MB, VCB, ACB" className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono uppercase text-white" />
        </label>
        <label className="text-xs font-semibold text-slate-300 space-y-1">
          <span>Số tài khoản nhận tiền</span>
          <input required value={formData.vietqr_account_no} onChange={(event) => update("vietqr_account_no", event.target.value.trim())} placeholder="Số tài khoản ngân hàng" className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white" />
        </label>
        <label className="md:col-span-2 text-xs font-semibold text-slate-300 space-y-1">
          <span>Tên chủ tài khoản</span>
          <input required value={formData.vietqr_account_name} onChange={(event) => update("vietqr_account_name", event.target.value.toUpperCase())} placeholder="TÊN CHỦ TÀI KHOẢN" className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono uppercase text-white" />
        </label>

        {fields.map(([key, label, placeholder, Icon]) => (
          <label key={key} className="text-xs font-semibold text-slate-300 space-y-1">
            <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</span>
            <input type="url" value={formData[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white" />
          </label>
        ))}

        <label className="md:col-span-2 text-xs font-semibold text-slate-300 space-y-1">
          <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Username hỗ trợ hiển thị cho khách</span>
          <input value={formData.support_telegram} onChange={(event) => update("support_telegram", event.target.value)} placeholder="@ten_ho_tro" className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white" />
        </label>

        <div className="md:col-span-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">URL cộng đồng phải là liên kết HTTPS thuộc t.me hoặc telegram.me. Để trống nếu muốn ẩn nút.</p>
          <button type="submit" disabled={saving} className="shrink-0 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? "Đang lưu…" : "Lưu cấu hình D1"}
          </button>
        </div>
      </form>
    </div>
  );
}
