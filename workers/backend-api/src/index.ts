import { encryptSecret } from "../../../packages/crypto/src/index";
interface Env { DB: D1Database; FILES: R2Bucket; ALLOWED_ORIGINS: string; TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string; TELEGRAM_ADMIN_IDS: string; TELEGRAM_WEBAPP_URL: string; APP_ENCRYPTION_KEY: string; }
type TgUser = { id: string; username: string; first_name: string; last_name: string };
const enc = new TextEncoder();
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
function cors(req: Request, env: Env): HeadersInit { const origin = req.headers.get("Origin") || ""; const allow = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()); return allow.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type,x-telegram-init-data", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "vary": "Origin" } : {}; }
async function hmac(key: CryptoKey, value: string): Promise<ArrayBuffer> { return crypto.subtle.sign("HMAC", key, enc.encode(value)); }
const hex = (a: Uint8Array) => Array.from(a, x => x.toString(16).padStart(2, "0")).join("");
function safeEqual(a: string, b: string): boolean { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function verifyInitData(raw: string, token: string): Promise<TgUser | null> {
 if (!raw || raw.length > 8192 || !token) return null;
 const p = new URLSearchParams(raw); const hash = p.get("hash") || ""; const date = Number(p.get("auth_date") || 0); const now = Math.floor(Date.now()/1000);
 if (!hash || !Number.isFinite(date) || date > now + 60 || now - date > 86400) return null;
 p.delete("hash"); const check = Array.from(p.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + "=" + v).join("\n");
 const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
 const secret = await hmac(k1, token); const k2 = await crypto.subtle.importKey("raw", secret, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
 if (!safeEqual(hex(new Uint8Array(await hmac(k2, check))), hash)) return null;
 try { const u = JSON.parse(p.get("user") || "{}"); if (!u.id) return null; return {id:String(u.id),username:String(u.username||""),first_name:String(u.first_name||""),last_name:String(u.last_name||"")}; } catch { return null; }
}
const isAdmin = (id: string, env: Env) => (env.TELEGRAM_ADMIN_IDS || "").split(",").map(x=>x.trim()).includes(id);
async function tgSend(env: Env, chat: string, text: string, web = false) { const markup = web && env.TELEGRAM_WEBAPP_URL ? {inline_keyboard:[[{text:"Mở Hendy App",web_app:{url:env.TELEGRAM_WEBAPP_URL}}]]} : undefined; const r = await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chat,text,reply_markup:markup})}); if(!r.ok) throw new Error("Telegram sendMessage HTTP "+r.status); }
async function telegramWebhook(req: Request, env: Env) {
 const received = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || ""; if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(received,env.TELEGRAM_WEBHOOK_SECRET)) return json({ok:false},403);
 const update = await req.json() as any; const m = update?.message; if (!m?.from?.id || !m?.chat?.id) return json({ok:true});
 const u = m.from; const id = String(u.id); const name = [u.first_name,u.last_name].filter(Boolean).join(" ");
 await env.DB.prepare("INSERT INTO users (telegram_id,username,display_name,role) VALUES (?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP").bind(id,u.username||null,name,isAdmin(id,env)?"admin":"user").run();
 if (typeof m.text === "string" && m.text.startsWith("/start")) await tgSend(env,String(m.chat.id),"Chào mừng bạn đến với Hendy App Store. Nhấn nút bên dưới để mở ứng dụng.",true);
 else if (m.text === "/id") await tgSend(env,String(m.chat.id),"Telegram ID: "+id);
 return json({ok:true});
}
async function authUser(req: Request, env: Env) { return verifyInitData(req.headers.get("X-Telegram-Init-Data") || "",env.TELEGRAM_BOT_TOKEN); }
async function audit(env: Env, actor: string, action: string, type: string) { await env.DB.prepare("INSERT INTO audit_logs (id,actor_id,action,resource_type) VALUES (?,?,?,?)").bind(crypto.randomUUID(),actor,action,type).run(); }
export default { async fetch(req: Request, env: Env): Promise<Response> {
 const url = new URL(req.url); const headers = cors(req,env); if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
 try {
  if (url.pathname === "/healthz") { const db = await env.DB.prepare("SELECT 1 AS ok").first<{ok:number}>(); return json({ok:db?.ok===1,service:"hendy-backend-api",database:db?.ok===1,time:new Date().toISOString()},db?.ok===1?200:503,headers); }
  if (url.pathname === "/telegram/webhook" && req.method === "POST") return telegramWebhook(req,env);
  if (url.pathname === "/api/v1/me" && req.method === "GET") { const u = await authUser(req,env); if(!u) return json({ok:false,error:"Phiên Telegram không hợp lệ."},401,headers); await env.DB.prepare("INSERT INTO users (telegram_id,username,display_name,role) VALUES (?,?,?,?) ON CONFLICT(telegram_id) DO NOTHING").bind(u.id,u.username||null,u.first_name,isAdmin(u.id,env)?"admin":"user").run(); const row = await env.DB.prepare("SELECT telegram_id,username,display_name,role,balance_vnd,vip_level FROM users WHERE telegram_id=?").bind(u.id).first(); return json({ok:true,data:row},200,headers); }
  if (url.pathname === "/api/v1/packages" && req.method === "GET") { const rows = await env.DB.prepare("SELECT id,slug,name,description,category,price_vnd FROM packages WHERE status = ? ORDER BY created_at DESC LIMIT 100").bind("active").all(); return json({ok:true,data:rows.results||[]},200,headers); }
  if (url.pathname.startsWith("/api/v1/admin/")) { const u = await authUser(req,env); if(!u) return json({ok:false,error:"Unauthorized"},401,headers); if(!isAdmin(u.id,env)) return json({ok:false,error:"Forbidden"},403,headers);
   if(url.pathname==="/api/v1/admin/overview" && req.method==="GET"){const [a,b,c]=await Promise.all([env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{n:number}>(),env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status=?").bind("pending").first<{n:number}>(),env.DB.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status=?").bind("pending").first<{n:number}>()]);return json({ok:true,data:{users:a?.n||0,pendingOrders:b?.n||0,pendingDeposits:c?.n||0}},200,headers);}
   if(url.pathname==="/api/v1/admin/settings" && req.method==="GET"){const rows=await env.DB.prepare("SELECT setting_key,value_json,updated_at FROM app_settings ORDER BY setting_key").all<any>();return json({ok:true,data:(rows.results||[]).map(r=>({key:r.setting_key,value:JSON.parse(r.value_json),updatedAt:r.updated_at}))},200,headers);}
   if(url.pathname==="/api/v1/admin/settings" && req.method==="PUT"){const body=await req.json() as {settings?:Record<string,unknown>};if(!body.settings||typeof body.settings!=="object"||Array.isArray(body.settings))return json({ok:false,error:"Cấu hình không hợp lệ."},400,headers);const allowed=new Set(["site_name","support_username","news_channel_url","group_chat_url","maintenance_mode"]);for(const [key,value] of Object.entries(body.settings)){if(!allowed.has(key)||JSON.stringify(value).length>2000)return json({ok:false,error:"Khóa cấu hình không hợp lệ."},400,headers);await env.DB.prepare("INSERT INTO app_settings (setting_key,value_json,updated_by) VALUES (?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(key,JSON.stringify(value),u.id).run();}await audit(env,u.id,"settings.update","app_settings");return json({ok:true},200,headers);}
  }
  if(url.pathname.startsWith("/api/v1/files/")&&req.method==="GET"){const u=await authUser(req,env);if(!u)return json({ok:false,error:"Unauthorized"},401,headers);const key=decodeURIComponent(url.pathname.slice("/api/v1/files/".length));if(!key||key.includes("..")||key.startsWith("/"))return json({ok:false,error:"Tên tệp không hợp lệ."},400,headers);const obj=await env.FILES.get(key);if(!obj)return json({ok:false,error:"Không tìm thấy tệp."},404,headers);return new Response(obj.body,{headers:{"content-type":obj.httpMetadata?.contentType||"application/octet-stream","cache-control":"private,no-store","content-length":String(obj.size),"x-content-type-options":"nosniff"}});}
  return json({ok:false,error:"Không tìm thấy API."},404,headers);
 } catch(e) { console.error("backend-api",e instanceof Error?e.message:"unknown"); return json({ok:false,error:"Lỗi máy chủ."},500,headers); }
} };