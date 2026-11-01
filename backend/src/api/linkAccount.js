import { addLinkedAccount, deleteLinkedAccount, getUser } from "../db/userModel.js";
import { json, readJson } from "../utils/helpers.js";

export async function handleLinks(request, env, user, url) {
  if (request.method === "GET") {
    const profile = await getUser(env, user.id);
    return json({ links: profile?.linked_accounts || {} });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Dữ liệu không hợp lệ." }, 400);
    if ("mk" in body || "password" in body || "secret" in body || "otp" in body) {
      return json({ error: "Không chấp nhận mật khẩu, OTP hoặc thông tin bí mật. Chỉ gửi mã tài khoản." }, 400);
    }
    const links = await addLinkedAccount(env, user.id, String(body.brand || ""), body.accountLabel);
    return json({ success: true, links }, 201);
  }

  const match = url.pathname.match(/^\/api\/v1\/links\/([A-Z0-9]+)\/(\d+)$/);
  if (request.method === "DELETE" && match) {
    const links = await deleteLinkedAccount(env, user.id, match[1], Number(match[2]));
    return json({ success: true, links });
  }
  return json({ error: "Method not allowed." }, 405);
}