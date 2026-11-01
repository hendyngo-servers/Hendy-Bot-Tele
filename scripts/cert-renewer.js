const target = process.env.PUBLIC_SITE_URL;
if (!target) {
  console.error("Set PUBLIC_SITE_URL to the deployed HTTPS hostname.");
  process.exit(1);
}
if (!target.startsWith("https://")) {
  console.error("Cloudflare custom domains must be checked over HTTPS.");
  process.exit(1);
}
try {
  const response = await fetch(target, { method: "HEAD", redirect: "follow" });
  console.log(JSON.stringify({
    url: target,
    status: response.status,
    tlsVerified: true,
    note: "Cloudflare manages edge certificates automatically; this script checks HTTPS availability and does not manually renew certificates."
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.error("HTTPS check failed:", error.message);
  process.exit(1);
}