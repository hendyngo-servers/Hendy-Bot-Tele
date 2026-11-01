import { randomId, safeText } from "../utils/helpers.js";

export async function listReleases(env, limit = 50) {
  const result = await env.DB.prepare(
    "SELECT id, platform, version, file_name, file_size, release_notes, released_at FROM app_releases ORDER BY released_at DESC LIMIT ?"
  ).bind(Math.min(Math.max(Number(limit) || 50, 1), 100)).all();
  return result.results || [];
}

export async function getRelease(env, id) {
  return env.DB.prepare(
    "SELECT id, platform, version, r2_path, file_name, file_size, release_notes, released_at FROM app_releases WHERE id = ?"
  ).bind(id).first();
}

export async function createRelease(env, data) {
  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO app_releases (id, platform, version, r2_path, release_notes, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    safeText(data.platform, 32),
    safeText(data.version, 32),
    data.r2Path,
    safeText(data.releaseNotes, 500),
    safeText(data.fileName, 180),
    Number(data.fileSize) || 0
  ).run();
  return getRelease(env, id);
}

export async function getReleaseStats(env) {
  const [users, releases] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM app_releases").first()
  ]);
  return { users: Number(users?.total || 0), releases: Number(releases?.total || 0) };
}