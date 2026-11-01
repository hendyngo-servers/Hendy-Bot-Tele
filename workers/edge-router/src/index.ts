import type { Fetcher } from "../../../packages/shared/src/cloudflare";

interface Env {
  BACKEND: Fetcher;
  USER_PAGES_ORIGIN: string;
  ADMIN_PAGES_ORIGIN: string;
}

function isSafeOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    const pathname = incoming.pathname;

    if (pathname.startsWith("/api/") || pathname.startsWith("/telegram/") ||
        pathname.startsWith("/internal/") || pathname === "/healthz") {
      return env.BACKEND.fetch(request);
    }

    const adminHost = incoming.hostname.toLowerCase().startsWith("admin.");
    const origin = adminHost ? env.ADMIN_PAGES_ORIGIN : env.USER_PAGES_ORIGIN;
    if (!isSafeOrigin(origin)) return new Response("Pages origin chưa được cấu hình HTTPS.", { status: 503 });

    const destination = new URL(pathname + incoming.search, origin);
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set("x-forwarded-host", incoming.host);
    return fetch(new Request(destination, { method: request.method, headers, body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body, redirect: "manual" }));
  }
};
