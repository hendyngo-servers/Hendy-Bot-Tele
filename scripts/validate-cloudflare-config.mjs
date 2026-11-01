import { readFile } from "node:fs/promises";
const paths = [
  "workers/backend-api/wrangler.toml",
  "apps/web-user/config.js",
  "apps/web-admin/config.js"
];
const contents = await Promise.all(paths.map(path => readFile(path, "utf8")));
const problems = [];
const databaseId = contents[0].match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "";
if (!databaseId) problems.push("Không tìm thấy database_id trong backend wrangler.toml.");
if (process.argv.includes("--deploy")) {
  if (!/^[0-9a-f-]{36}$/i.test(databaseId) || databaseId.includes("REPLACE")) {
    problems.push("Thay REPLACE_WITH_D1_DATABASE_ID bằng ID D1 thật trước khi deploy Workers.");
  }
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (!process.env[key]) problems.push("Thiếu GitHub Actions secret " + key + ".");
  }
  if (contents[0].includes("example.com")) problems.push("Cập nhật domain thật trong workers/backend-api/wrangler.toml.");
  for (let i = 1; i < contents.length; i++) {
    if (contents[i].includes("example.com")) problems.push("Cập nhật apiBase trong " + paths[i] + ".");
  }
}
if (problems.length) {
  console.error(problems.map(value => "✖ " + value).join("\n"));
  process.exit(1);
}
console.log("Cloudflare config check: OK");
if (!process.argv.includes("--deploy")) console.log("Placeholder chỉ được phép trong kiểm tra CI; không được deploy production.");
