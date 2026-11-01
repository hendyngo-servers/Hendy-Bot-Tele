interface Env {
  BACKEND: Fetcher;
  USER_PAGES_ORIGIN: string;
  ADMIN_PAGES_ORIGIN: string;
}
function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Pages origin must use HTTPS");
  return url.origin;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/telegram/") || url.pathname === "/healthz") {
      return env.BACKEND.fetch(request);
    }
    try {
      const adminHost = url.hostname.toLowerCase().startsWith("admin.");
      const origin = normalizedOrigin(adminHost ? env.ADMIN_PAGES_ORIGIN : env.USER_PAGES_ORIGIN);
      const target = new URL(url.pathname + url.search, origin);
      return await fetch(new Request(target.toString(), request));
    } catch {
      return new Response("Gateway configuration error", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
      });
    }
  }
};
