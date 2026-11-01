import React, { useEffect, useState } from "react";
import { Palette, Save, GripVertical } from "lucide-react";

const DEFAULT_BUTTONS = [
  ["mini_game_live", "🎮 MINI GAME LIVE"],
  ["app_tool", "🧰 THUÊ TOOL"],
  ["buy_code", "💻 MUA CODE"],
  ["wallet", "💳 NẠP TIỀN"],
  ["otp_proxy", "🛡️ OTP & PROXY"],
  ["vip_tools", "👑 KHO VIP"],
  ["support", "💎 TRUNG TÂM KHÁCH HÀNG"],
  ["pairing", "💞 GHÉP ĐÔI"],
  ["referral", "🤝 GIỚI THIỆU REF"],
  ["giftcode", "🎟️ GIFTCODE"]
];

const DEFAULT_THEME = {
  primary: "#2563eb",
  accent: "#22d3ee",
  background: "#0a0e17",
  panel: "#111827"
};

export function MenuAppearanceCard({ settings, onSaveSettings, showToast }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [buttons, setButtons] = useState(DEFAULT_BUTTONS.map(([module, label]) => ({ module, label, enabled: true })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTheme({ ...DEFAULT_THEME, ...(settings.ui_theme || {}) });
    const stored = Array.isArray(settings.menu_config) ? settings.menu_config : [];
    setButtons(DEFAULT_BUTTONS.map(([module, label]) => {
      const saved = stored.find((item) => item.module === module);
      return { module, label: saved?.label || label, enabled: saved?.enabled !== false };
    }));
  }, [settings]);

  const updateButton = (module, patch) => {
    setButtons((current) => current.map((item) => item.module === module ? { ...item, ...patch } : item));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({ ui_theme: theme, menu_config: buttons });
      showToast("Đã cập nhật màu giao diện và menu bot. Các phiên đang mở sẽ nhận thay đổi qua WebSocket.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-5 border-cyan-500/20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-white text-base">Màu giao diện và nút menu Telegram</h4>
          <p className="text-xs text-slate-400">Màu áp dụng cho Mini App; nhãn và trạng thái bật/tắt được đồng bộ vào menu /start của bot.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["primary", "Màu nút chính"],
          ["accent", "Màu nhấn"],
          ["background", "Màu nền"],
          ["panel", "Màu thẻ"]
        ].map(([key, label]) => (
          <label key={key} className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
            <span className="block text-xs text-slate-300">{label}</span>
            <input
              type="color"
              value={theme[key]}
              onChange={(event) => setTheme((current) => ({ ...current, [key]: event.target.value }))}
              className="w-full h-9 cursor-pointer rounded-lg bg-transparent"
            />
            <span className="text-[10px] font-mono text-slate-500">{theme[key]}</span>
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-slate-200">10 nút chức năng chính</h5>
          <span className="text-[10px] text-slate-500">Nhãn tối đa 48 ký tự</span>
        </div>
        {buttons.map((button, index) => (
          <div key={button.module} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-white/[0.035] border border-white/5 p-3">
            <span className="text-xs text-slate-500 font-mono">{String(index + 1).padStart(2, "0")}</span>
            <input
              value={button.label}
              maxLength={48}
              onChange={(event) => updateButton(button.module, { label: event.target.value })}
              className="min-w-0 w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-xs text-white"
              aria-label={"Nhãn menu " + button.module}
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={button.enabled}
                onChange={(event) => updateButton(button.module, { enabled: event.target.checked })}
                className="accent-cyan-500"
              />
              Hiện
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button disabled={saving} className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: theme.primary }}>
          <Save className="w-4 h-4" />
          {saving ? "Đang lưu…" : "Lưu màu và menu"}
        </button>
      </div>
    </form>
  );
}
