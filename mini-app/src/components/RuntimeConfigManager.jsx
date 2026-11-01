import React, { useEffect, useState } from "react";
import { Activity, FileSearch, RefreshCw, Save, ShieldCheck, Workflow } from "lucide-react";
import { telegramFetch } from "../services/api.js";

const EMPTY_FORM = {
  webhookSecret: "",
  adminWebappUrl: "",
  allowedOrigins: "",
  viteApiBaseUrl: ""
};

function statusLabel(value) {
  return value ? "Đã khai báo" : "Chưa khai báo";
}

export function RuntimeConfigManager({ showToast, realtimeStatus = "disconnected", registry: registryFromSocket = null, onRescan }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [registry, setRegistry] = useState(null);
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [registryResponse, statusResponse] = await Promise.all([
        telegramFetch("/api/admin/config/registry"),
        telegramFetch("/api/admin/runtime-config/status")
      ]);
      const [registryData, statusData] = await Promise.all([
        registryResponse.json(),
        statusResponse.json()
      ]);
      if (!registryResponse.ok) throw new Error(registryData.error || "Không quét được mã nguồn.");
      if (!statusResponse.ok) throw new Error(statusData.error || "Không đọc được trạng thái tích hợp.");
      setRegistry(registryData);
      setIntegration(statusData);
      setForm((current) => ({
        ...current,
        adminWebappUrl: statusData.current?.adminWebappUrl || "",
        allowedOrigins: statusData.current?.allowedOrigins || "",
        viteApiBaseUrl: statusData.current?.viteApiBaseUrl || ""
      }));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (registryFromSocket) setRegistry(registryFromSocket);
  }, [registryFromSocket]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const apply = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => key === "webhookSecret" ? Boolean(value.trim()) : Boolean(value.trim()))
    );
    if (!Object.keys(payload).length) {
      showToast("Hãy nhập ít nhất một giá trị muốn thay đổi.", "error");
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const response = await telegramFetch("/api/admin/runtime-config/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đồng bộ biến môi trường.");
      setResult(data);
      setForm((current) => ({ ...current, webhookSecret: "" }));
      showToast("Đã gửi yêu cầu đồng bộ cấu hình. Dịch vụ sẽ deploy lại theo nền tảng tương ứng.");
      await load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-panel p-6 space-y-5 border-cyan-500/25">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Trung tâm cấu hình Render · GitHub · Cloudflare</h4>
            <p className="text-xs text-slate-400">Quét vị trí biến trong source, đồng bộ theo đúng nền tảng sở hữu và tạo deploy mới.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
          <span className={"h-2 w-2 rounded-full " + (realtimeStatus === "connected" ? "bg-emerald-400" : "bg-amber-400")} />
          WebSocket: {realtimeStatus === "connected" ? "Đã kết nối" : realtimeStatus === "connecting" ? "Đang kết nối" : "Ngoại tuyến"}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
          <span className="block text-[11px] text-slate-400">Render API</span>
          <strong className="text-sm text-white">{statusLabel(integration?.integration?.renderApiConfigured)}</strong>
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
          <span className="block text-[11px] text-slate-400">GitHub Actions API</span>
          <strong className="text-sm text-white">{statusLabel(integration?.integration?.githubSyncConfigured)}</strong>
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
          <span className="block text-[11px] text-slate-400">Tệp đã quét</span>
          <strong className="text-sm text-white">{registry?.filesScanned ?? "—"}</strong>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div>
          <h5 className="text-sm font-semibold text-white flex items-center gap-2"><FileSearch className="w-4 h-4 text-cyan-300" />Vị trí khai báo trong mã nguồn</h5>
          <p className="text-[11px] text-slate-500">Hiển thị file và dòng sử dụng. Không đọc hoặc hiển thị giá trị secret.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const sent = onRescan?.();
            if (!sent) load();
          }}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-white/5 text-xs text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={"inline h-3.5 w-3.5 mr-1 " + (loading ? "animate-spin" : "")} />Quét lại qua WebSocket
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {(registry?.variables || []).map((variable) => (
          <details key={variable.key} className="rounded-xl bg-white/[0.035] border border-white/5 p-3">
            <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-mono font-semibold text-cyan-200">{variable.key}</span>
              <span className={variable.complete ? "text-emerald-300" : "text-amber-300"}>
                {variable.locations.length} vị trí · {variable.missingLocations.length ? "Thiếu khai báo" : "Đủ vị trí"}
              </span>
            </summary>
            <div className="mt-2 space-y-1">
              {variable.locations.map((location) => (
                <div key={location.file + location.line} className="text-[11px] text-slate-400 font-mono break-all">
                  {location.file}:{location.line}
                </div>
              ))}
              {variable.missingLocations.map((file) => (
                <div key={file} className="text-[11px] text-amber-300">Chưa tìm thấy: {file}</div>
              ))}
              <p className="text-[10px] text-slate-500 pt-1">{variable.storage} · {variable.owner}</p>
            </div>
          </details>
        ))}
      </div>

      <form onSubmit={apply} className="border-t border-white/5 pt-4 space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" />Đồng bộ cấu hình runtime</h5>
          <p className="text-[11px] text-slate-500 mt-1">Secret hiện tại không được đọc ngược. Để trống trường secret nếu không cần xoay khóa.</p>
        </div>

        <label className="block text-xs text-slate-300 space-y-1">
          <span>WEBHOOK_SECRET mới (chỉ lưu tại Render)</span>
          <input type="password" autoComplete="new-password" value={form.webhookSecret} onChange={(event) => update("webhookSecret", event.target.value)} placeholder="Chuỗi ngẫu nhiên 32–256 ký tự; để trống để giữ nguyên" className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 font-mono text-xs text-white" />
        </label>

        <label className="block text-xs text-slate-300 space-y-1">
          <span>ADMIN_WEBAPP_URL (Render)</span>
          <input type="url" value={form.adminWebappUrl} onChange={(event) => update("adminWebappUrl", event.target.value)} placeholder="https://admin.example.pages.dev" className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 font-mono text-xs text-white" />
        </label>

        <label className="block text-xs text-slate-300 space-y-1">
          <span>ALLOWED_ORIGINS (Render, phân cách bằng dấu phẩy)</span>
          <input value={form.allowedOrigins} onChange={(event) => update("allowedOrigins", event.target.value)} placeholder="https://mini.example.pages.dev,https://admin.example.pages.dev" className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 font-mono text-xs text-white" />
        </label>

        <label className="block text-xs text-slate-300 space-y-1">
          <span>VITE_API_BASE_URL (GitHub Actions → Cloudflare Pages)</span>
          <input type="url" value={form.viteApiBaseUrl} onChange={(event) => update("viteApiBaseUrl", event.target.value)} placeholder="https://hendy-bot-tele-edge.example.workers.dev" className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 font-mono text-xs text-white" />
        </label>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-4 py-2 disabled:opacity-50">
            <Save className="inline h-4 w-4 mr-1" />{saving ? "Đang đồng bộ…" : "Đồng bộ và triển khai"}
          </button>
        </div>
      </form>

      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
          Đã gửi cập nhật: {result.updatedKeys.join(", ")}.
          {result.deployments?.render && <p>Render deploy: {result.deployments.render.status || "đã xếp hàng"}</p>}
          {result.deployments?.cloudflareWorkflow && <p>Cloudflare workflow: {result.deployments.cloudflareWorkflow}</p>}
        </div>
      )}
    </section>
  );
}
