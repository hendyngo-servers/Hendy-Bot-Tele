import React, { useState } from "react";
import UserApp from "./components/UserApp.jsx";
import AdminApp from "./components/AdminApp.jsx";
import { resetState } from "./services/store.js";

export default function App() {
  const [viewMode, setViewMode] = useState("user"); // "user" | "admin"

  function handleReset() {
    if (window.confirm("Đặt lại dữ liệu mẫu về trạng thái ban đầu?")) {
      resetState();
      window.location.reload();
    }
  }

  return (
    <div className="hendy-root">
      {/* Top Workspace View Switcher Bar */}
      <aside className="mode-switch-bar">
        <div className="mode-tabs">
          <button
            type="button"
            className={"mode-btn " + (viewMode === "user" ? "active" : "")}
            onClick={() => setViewMode("user")}
          >
            👤 Giao diện Thành viên (User Center)
          </button>
          <button
            type="button"
            className={"mode-btn " + (viewMode === "admin" ? "active" : "")}
            onClick={() => setViewMode("admin")}
          >
            🛡️ Bảng Quản trị (Admin Console)
          </button>
        </div>
        <div className="mode-info">
          <span>Dữ liệu đồng bộ trực tiếp giữa 2 giao diện</span>
          <button
            type="button"
            className="secondary small"
            style={{ padding: "4px 8px", fontSize: "10px" }}
            onClick={handleReset}
            title="Khôi phục dữ liệu mẫu ban đầu"
          >
            ↺ Đặt lại dữ liệu
          </button>
        </div>
      </aside>

      {/* Active Application View */}
      {viewMode === "user" ? <UserApp /> : <AdminApp />}
    </div>
  );
}
