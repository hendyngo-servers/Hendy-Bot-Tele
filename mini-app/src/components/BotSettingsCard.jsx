import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle2, QrCode, MessageSquare, ShieldCheck } from "lucide-react";

export function BotSettingsCard({ settings, onSaveSettings, showToast }) {
  const [formData, setFormData] = useState({
    welcome_message: "",
    vietqr_bank: "",
    vietqr_account_no: "",
    vietqr_account_name: "",
    support_telegram: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        welcome_message: settings.welcome_message || "",
        vietqr_bank: settings.vietqr_bank || "",
        vietqr_account_no: settings.vietqr_account_no || "",
        vietqr_account_name: settings.vietqr_account_name || "",
        support_telegram: settings.support_telegram || ""
      });
    }
  }, [settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings(formData);
      showToast("Đã lưu cấu hình Bot & VietQR vào Cloudflare D1 thành công!");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-4 border-slate-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Cài Đặt Hệ Thống Bot & Thanh Toán VietQR</h4>
            <p className="text-xs text-slate-400">
              Cấu hình các tham số vận hành được lưu trữ trực tiếp trong bảng bot_settings trên Cloudflare D1
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Lời Chào Khởi Đầu Bot (/start Welcome Message)
          </label>
          <textarea
            rows={2}
            value={formData.welcome_message}
            onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
            placeholder="Lời chào hiển thị khi người dùng gõ /start..."
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Ngân Hàng VietQR (Bank Code)
          </label>
          <input
            type="text"
            required
            value={formData.vietqr_bank}
            onChange={(e) => setFormData({ ...formData, vietqr_bank: e.target.value.toUpperCase() })}
            placeholder="Nhập mã ngân hàng đã xác minh"
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono uppercase text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Số Tài Khoản Nhận Nạp Tiền
          </label>
          <input
            type="text"
            required
            value={formData.vietqr_account_no}
            onChange={(e) => setFormData({ ...formData, vietqr_account_no: e.target.value })}
            placeholder="Nhập số tài khoản nhận tiền"
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Tên Chủ Tài Khoản VietQR
          </label>
          <input
            type="text"
            required
            value={formData.vietqr_account_name}
            onChange={(e) => setFormData({ ...formData, vietqr_account_name: e.target.value.toUpperCase() })}
            placeholder="Nhập tên chủ tài khoản"
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono uppercase text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Kênh / Telegram Hỗ Trợ Kỹ Thuật
          </label>
          <input
            type="text"
            value={formData.support_telegram}
            onChange={(e) => setFormData({ ...formData, support_telegram: e.target.value })}
            placeholder="@ten_kenh_ho_tro"
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="md:col-span-2 flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Đang lưu D1..." : "Lưu Cài Đặt Vào Cloudflare D1"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
