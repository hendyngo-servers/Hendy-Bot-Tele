const RENDER_API = "https://api.render.com/v1";
const GITHUB_API = "https://api.github.com";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error("Thiếu cấu hình tích hợp " + name + " trên Render.");
  return value;
}

function validateHttpsUrl(value, field, requireOriginOnly = false) {
  let url;
  try { url = new URL(String(value || "")); }
  catch { throw new Error(field + " phải là URL HTTPS hợp lệ."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(field + " phải sử dụng HTTPS và không được chứa thông tin đăng nhập hoặc fragment.");
  }
  if (requireOriginOnly && (url.pathname !== "/" || url.search)) {
    throw new Error(field + " chỉ được chứa origin, không có path hoặc query.");
  }
  return requireOriginOnly ? url.origin : url.toString().replace(/\/+$/, "");
}

export function validateRuntimeConfig(input = {}) {
  const result = {};
  if (input.webhookSecret !== undefined && String(input.webhookSecret).trim()) {
    const value = String(input.webhookSecret).trim();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) {
      throw new Error("WEBHOOK_SECRET phải dài 32–256 ký tự URL-safe (chữ, số, _ hoặc -).");
    }
    result.WEBHOOK_SECRET = value;
  }

  if (input.adminWebappUrl !== undefined && String(input.adminWebappUrl).trim()) {
    result.ADMIN_WEBAPP_URL = validateHttpsUrl(input.adminWebappUrl, "ADMIN_WEBAPP_URL");
  }

  if (input.allowedOrigins !== undefined && String(input.allowedOrigins).trim()) {
    const origins = String(input.allowedOrigins).split(",").map((item) => validateHttpsUrl(item.trim(), "ALLOWED_ORIGINS", true));
    const unique = [...new Set(origins)];
    if (!unique.length || unique.length > 20) throw new Error("ALLOWED_ORIGINS phải có từ 1 đến 20 origin.");
    result.ALLOWED_ORIGINS = unique.join(",");
  }

  if (input.viteApiBaseUrl !== undefined && String(input.viteApiBaseUrl).trim()) {
    result.VITE_API_BASE_URL = validateHttpsUrl(input.viteApiBaseUrl, "VITE_API_BASE_URL");
  }

  if (Object.keys(result).length === 0) {
    throw new Error("Không có biến môi trường nào được thay đổi.");
  }
  return result;
}

async function renderRequest(path, options = {}) {
  const apiKey = required("RENDER_API_KEY");
  const serviceId = required("RENDER_SERVICE_ID");
  const response = await fetch(RENDER_API + "/services/" + encodeURIComponent(serviceId) + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Render API trả về HTTP " + response.status + ": " + (payload.message || payload.error || "không rõ lỗi"));
  return payload;
}

async function upsertGitHubVariable(name, value) {
  const token = required("GITHUB_CONFIG_TOKEN");
  const owner = required("GITHUB_REPOSITORY_OWNER");
  const repository = required("GITHUB_REPOSITORY_NAME");
  const path = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repository) + "/actions/variables/" + encodeURIComponent(name);
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
  const lookup = await fetch(GITHUB_API + path, { headers, signal: AbortSignal.timeout(15000) });
  if (lookup.status === 404) {
    const create = await fetch(GITHUB_API + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repository) + "/actions/variables", {
      method: "POST", headers, body: JSON.stringify({ name, value }), signal: AbortSignal.timeout(15000)
    });
    if (!create.ok) throw new Error("Không thể tạo GitHub Actions Variable " + name + " (HTTP " + create.status + ").");
    return;
  }
  if (!lookup.ok) throw new Error("Không thể đọc trạng thái GitHub Actions Variable (HTTP " + lookup.status + ").");
  const update = await fetch(GITHUB_API + path, {
    method: "PATCH", headers, body: JSON.stringify({ name, value }), signal: AbortSignal.timeout(15000)
  });
  if (!update.ok) throw new Error("Không thể cập nhật GitHub Actions Variable " + name + " (HTTP " + update.status + ").");
}

async function dispatchCloudflareWorkflow() {
  const token = required("GITHUB_CONFIG_TOKEN");
  const owner = required("GITHUB_REPOSITORY_OWNER");
  const repository = required("GITHUB_REPOSITORY_NAME");
  const response = await fetch(
    GITHUB_API + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repository) +
      "/actions/workflows/deploy-cloudflare.yml/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!response.ok) throw new Error("Không thể kích hoạt workflow Cloudflare (HTTP " + response.status + ").");
}

export function getRuntimeConfigStatus() {
  return {
    renderApiConfigured: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID),
    githubSyncConfigured: Boolean(process.env.GITHUB_CONFIG_TOKEN && process.env.GITHUB_REPOSITORY_OWNER && process.env.GITHUB_REPOSITORY_NAME),
    renderServiceConfigured: Boolean(process.env.RENDER_SERVICE_ID),
    webhookSecretConfigured: Boolean(process.env.WEBHOOK_SECRET),
    variables: {
      ADMIN_WEBAPP_URL: Boolean(process.env.ADMIN_WEBAPP_URL),
      ALLOWED_ORIGINS: Boolean(process.env.ALLOWED_ORIGINS),
      VITE_API_BASE_URL: Boolean(process.env.VITE_API_BASE_URL)
    }
  };
}

/**
 * Updates only explicitly allowlisted deployment variables.
 * Secret values are never written to D1, GitHub Actions Variables, logs, or response payloads.
 */
export async function syncRuntimeConfig(input = {}) {
  const values = validateRuntimeConfig(input);
  const renderKeys = Object.keys(values).filter((key) => key !== "VITE_API_BASE_URL");
  const pagesKey = values.VITE_API_BASE_URL;

  if (renderKeys.length) {
    await Promise.all(renderKeys.map((key) => renderRequest("/env-vars/" + encodeURIComponent(key), {
      method: "PUT",
      body: JSON.stringify({ value: values[key] })
    })));
  }

  if (pagesKey) {
    await upsertGitHubVariable("VITE_API_BASE_URL", pagesKey);
  }

  const deployments = {};
  if (renderKeys.length) {
    deployments.render = await renderRequest("/deploys", {
      method: "POST",
      body: JSON.stringify({ clearCache: "do_not_clear", deployMode: "build_and_deploy" })
    });
  }
  if (pagesKey) {
    await dispatchCloudflareWorkflow();
    deployments.cloudflareWorkflow = "dispatched";
  }

  return {
    success: true,
    updatedKeys: Object.keys(values),
    secretsUpdated: renderKeys.includes("WEBHOOK_SECRET") ? ["WEBHOOK_SECRET"] : [],
    deployments: {
      render: deployments.render ? { id: deployments.render.id || deployments.render.deploy?.id || null, status: deployments.render.status || "queued" } : null,
      cloudflareWorkflow: deployments.cloudflareWorkflow || null
    }
  };
}
