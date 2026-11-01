import { createRelease } from "../db/appModel.js";
import { json, safeText } from "../utils/helpers.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["apk", "aab", "ipa", "exe", "msi", "dmg", "zip", "deb", "rpm"]);

export async function handleUploadApp(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Thiếu tệp phát hành." }, 400);
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return json({ error: "Tệp phải có dung lượng từ 1 byte đến 100 MB." }, 413);

  const originalName = safeText(file.name || "release.bin", 180);
  const extension = originalName.includes(".") ? originalName.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return json({ error: "Định dạng tệp không được hỗ trợ." }, 415);

  const platform = safeText(form.get("platform"), 32);
  const version = safeText(form.get("version"), 32);
  if (!platform || !version) return json({ error: "Thiếu nền tảng hoặc phiên bản." }, 400);

  const id = crypto.randomUUID();
  const key = "releases/" + id + "/" + originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  await env.STORAGE.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
      contentDisposition: "attachment; filename=\"" + originalName.replace(/"/g, "") + "\""
    },
    customMetadata: { releaseId: id, platform, version }
  });

  try {
    const release = await createRelease(env, {
      platform, version, r2Path: key, releaseNotes: form.get("releaseNotes"),
      fileName: originalName, fileSize: file.size
    });
    const { r2_path, ...publicRelease } = release;
    return json({ success: true, release: publicRelease }, 201);
  } catch (error) {
    await env.STORAGE.delete(key);
    throw error;
  }
}