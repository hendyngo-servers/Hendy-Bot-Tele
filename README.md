# Hendy Bot Telegram — Render + Cloudflare

Mã nguồn Telegram Bot chạy dưới dạng Render Web Service, Mini App được build lên Cloudflare Pages, API edge chạy trên Cloudflare Workers, dữ liệu nghiệp vụ lưu trong Cloudflare D1 và tệp/bản sao lưu lưu tại Cloudflare R2.

> Production không tự chuyển sang dữ liệu giả khi D1 lỗi. Những tích hợp nhà cung cấp chưa có API key (OTP/Proxy/game/ngân hàng) không được coi là đã hoạt động chỉ vì có giao diện.

## 1. Kiến trúc

    Telegram User
        |
        | Telegram WebApp initData (HMAC verified)
        v
    Cloudflare Pages (mini-app)
        |
        v
    Cloudflare Worker (API gateway / R2 files / Cron)
        |                         |
        |                         +---- R2: hendy-bot-assets
        |                               (application release files)
        |
        +---- Render Web Service (Express + Telegram webhook)
                   |
                   +---- Cloudflare D1 REST API
                             |
                             +---- users, wallet, orders, deposits,
                             |     giftcodes, support, referrals,
                             |     settings, audit, backup_runs

    Cloudflare Worker Cron (02:00 UTC / 09:00 Vietnam)
        |
        +---- D1 -> CSV per table -> R2: hendy-bot-backups
                                  + manifest.json (rows + SHA-256)

**Runtime ownership**

- src/server.js: Express web service, health endpoint, serves compiled Mini App and API routes.
- src/routes/productionApi.js: Telegram webhook, member endpoints and admin endpoints.
- src/security/telegramAuth.js: validates Telegram WebApp signed initData, timestamp and duplicate fields.
- src/services/productionD1.js: Cloudflare D1 REST client. Missing credentials or failed D1 queries return errors; there is no in-memory success fallback.
- cloudflare/worker.js: Worker gateway, R2 release file handling and scheduled D1 CSV export.
- mini-app/: Vietnamese Telegram Mini App and admin dashboard, including D1 metrics, maintenance controls, webhook controls and backup actions.
- migrations/: ordered D1 schema migrations.
- render.yaml: Render Blueprint.
- .github/workflows/ci.yml: migration validation, syntax checks, unit tests and frontend build.
- .github/workflows/deploy-cloudflare.yml: Cloudflare migrations, Worker and Pages deployment when changes reach main.

## 2. Security essentials — do this first

The repository is public. An earlier version of .env.example contained values that looked like live credentials. They have been replaced with blank placeholders in the working branch, but **editing the current file does not remove secrets from old Git commits**.

Before deployment:

1. Revoke the old Telegram Bot Token, Cloudflare API Token and any exposed R2 credentials. Create new credentials.
2. Review Git history and rotate any other credentials found there. If rewriting repository history, coordinate with collaborators and force-push only after the credentials have been revoked.
3. Create a Cloudflare API Token scoped to the required account and D1 database. Do not use a Global API Key.
4. Keep all tokens in GitHub Actions Secrets or Render Environment variables. Never put a real secret in wrangler.toml, .env.example, frontend variables, commits, screenshots or logs.
5. Keep hendy-bot-backups private. Backup CSVs contain user identifiers, balances and operational records.

WEBHOOK_SECRET, BACKUP_TRIGGER_SECRET and R2_UPLOAD_SECRET must be long, random values. For Telegram's webhook secret header, use only letters, digits, underscore and hyphen, within Telegram's accepted length.

## 3. Create Cloudflare resources

Install Node.js 22+ and Wrangler 4 locally:

    npm install --include=dev
    npx wrangler login

Create the D1 database:

    npx wrangler d1 create hendy-bot-db

Copy the returned database ID into wrangler.toml in place of REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID. Add the same ID as the GitHub repository variable CLOUDFLARE_D1_DATABASE_ID.

Create R2 buckets (the deployment workflow also attempts to create them):

    npx wrangler r2 bucket create hendy-bot-backups
    npx wrangler r2 bucket create hendy-bot-assets

Apply migrations manually if setting up outside GitHub Actions:

    npx wrangler d1 migrations apply hendy-bot-db --remote

The GitHub deployment workflow applies the migration directory on each qualifying production deployment; Wrangler tracks which migrations have run.

### R2 bucket purpose

- hendy-bot-backups: private CSV database backups and JSON manifests.
- hendy-bot-assets: uploaded app release files. The bucket stays private; the Worker streams release downloads.

Do not enable public bucket listing or expose backup object URLs. The Worker download route only serves keys in the releases/ namespace.

## 4. Configure GitHub Actions

Open **Settings → Secrets and variables → Actions**.

### Repository Secrets

| Secret | Purpose |
|---|---|
| CLOUDFLARE_API_TOKEN | Cloudflare API token for D1, R2 and Worker/Pages deployment |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare account ID |
| BACKUP_TRIGGER_SECRET | Protects manual backup requests |
| R2_UPLOAD_SECRET | Protects release file uploads to R2 |
| WEBHOOK_SECRET | Shared Telegram webhook secret used by the Worker proxy |

Use a Cloudflare API Token with minimum required permissions for the target account, D1 database, Workers Scripts and Pages projects, plus R2 bucket management/object access needed by the workflow. The Worker itself uses D1/R2 bindings; it does not need the Render D1 REST token.

### Repository Variables

| Variable | Example | Purpose |
|---|---|---|
| CLOUDFLARE_D1_DATABASE_ID | ID returned by wrangler d1 create | Binds the production D1 database |
| VITE_API_BASE_URL | https://your-worker.workers.dev | Worker origin used by the Pages frontend |

The workflow .github/workflows/deploy-cloudflare.yml runs on main when Worker, Mini App, migration or Wrangler files change. It applies D1 migrations, deploys the Worker, builds the Mini App with VITE_API_BASE_URL and publishes mini-app/dist to Pages project hendy-bot-miniapp.

Set the account-specific Worker hostname or custom domain in VITE_API_BASE_URL. Do not assume the example hostname is yours.

## 5. Deploy the Render service through GitHub

1. Push/merge the approved source into GitHub main.
2. In Render, choose **New → Blueprint**, connect hendyngo-servers/Hendy-Bot-Tele, and select the branch containing render.yaml.
3. Review the hendy-bot-tele Web Service and create it.
4. Enter the environment variables below in Render. Do not commit these values.

### Required Render environment variables

| Variable | Value |
|---|---|
| NODE_ENV | production |
| PORT | Set automatically by Render; app defaults to 3000 |
| BOT_TOKEN | New token from BotFather |
| WEBHOOK_SECRET | Same value configured as GitHub Secret / Worker secret |
| ADMIN_TELEGRAM_IDS | Comma-separated numeric Telegram IDs allowed to administer the bot |
| BOT_USERNAME | Bot username without @, used for referral links |
| BASE_URL | Public HTTPS Render URL, e.g. https://hendy-bot-tele.onrender.com |
| WEBAPP_URL | Pages URL for the Mini App, e.g. https://hendy-bot-miniapp.pages.dev |
| ALLOWED_ORIGINS | Comma-separated exact frontend origins; include Pages/custom domain |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare account ID |
| CLOUDFLARE_D1_DATABASE_ID | Same D1 database ID used in Wrangler |
| CLOUDFLARE_API_TOKEN | Restricted D1 REST API token |
| BACKUP_WORKER_URL | Deployed Worker base URL |
| BACKUP_TRIGGER_SECRET | Same secret used by the Worker |
| R2_UPLOAD_WORKER_URL | Deployed Worker base URL |
| R2_UPLOAD_SECRET | Same secret used by the Worker |

Optional settings:

- ADMIN_WEBAPP_URL: defaults to WEBAPP_URL for the /admin bot command.
- GROUP_CHAT_URL, NEWS_CHANNEL_URL, SUPPORT_URL: configure real Telegram/community destinations. Unconfigured buttons are not shown.
- VIETQR_BANK_ID, VIETQR_ACCOUNT_NO, VIETQR_ACCOUNT_NAME: bank details used to generate transfer QR instructions.
- TELEGRAM_AUTH_MAX_AGE_SECONDS: accepted age for signed Telegram Mini App data; default 86400.
- SET_WEBHOOK_ON_START: set true only if you want Render to register the Telegram webhook on startup. The admin dashboard also provides webhook setup/status controls.

The render.yaml Blueprint installs development dependencies during build because Vite compiles the Mini App; the runtime starts with npm start.

After the first successful Render deploy, verify https://<your-render-host>/health. It should report D1 as connected. If it returns 503, inspect Render logs and correct the D1 account/database/token configuration before using the bot.

## 6. Connect Telegram

1. Open BotFather and set the bot's Mini App domain to your Cloudflare Pages domain.
2. Configure Render BASE_URL, BOT_TOKEN and WEBHOOK_SECRET.
3. Open the Mini App from Telegram using the account listed in ADMIN_TELEGRAM_IDS.
4. In the admin dashboard, check Telegram webhook status and use webhook setup. This points Telegram directly to https://<render-host>/api/telegram/webhook and sends the configured secret header.
5. Send /start to the bot and verify the menu. Commands currently handled by the webhook include /start, /help, /id, /wallet, /admin and /status.

Telegram Mini App API calls must include signed initData in the Authorization: tma ... header. initDataUnsafe and browser-provided Telegram IDs are not proof of identity.

## 7. D1 data model

| Area | Tables |
|---|---|
| Users and settings | users, bot_settings, bot_events, processed_updates |
| Store and orders | catalog_products, orders, app_releases |
| Cash wallet and deposits | wallet_ledger, deposits |
| Voucher giftcodes | giftcodes, giftcode_redemptions, voucher_ledger |
| Customer support | support_tickets, support_messages, user_links |
| Referral | referral_profiles, referral_commissions |
| Security / operations | admin_audit_logs, backup_runs |

Database triggers maintain wallet entries for approved deposits, order payments, voucher giftcode redemption and paid referral commission payouts. User endpoints only read/write the authenticated Telegram user's records. Administrative routes additionally require membership in ADMIN_TELEGRAM_IDS.

## 8. Automatic CSV backup to R2

cloudflare/worker.js exports the allowlisted D1 tables using the Worker D1 binding. Wrangler schedule is:

    [triggers]
    crons = ["0 2 * * *"]

This means **02:00 UTC / 09:00 in Vietnam** every day.

Each run writes one CSV per table plus manifest.json under:

    d1-csv-backups/YYYY/MM/DD/<backup-id>/
        users.csv
        bot_settings.csv
        ...
        manifest.json

The manifest records table names, row counts, file sizes and SHA-256 checksums. The service writes success/failure metadata into D1 backup_runs, displayed in the admin dashboard. The dashboard also has a **Sao lưu ngay** action; it calls the Worker endpoint protected by BACKUP_TRIGGER_SECRET.

The export is paginated by table and is not a transactionally consistent point-in-time snapshot across every table. Large tables are capped at 1,000,000 rows per table per run. Test the backup process and define a retention policy for your own data volume. There is not yet an automated restore command; preserve and test a separate restore procedure before relying on backups for disaster recovery.

## 9. Local checks

    npm install --include=dev
    npm run lint
    npm test
    npm run build

CI validates every SQL migration against SQLite, checks JavaScript syntax, runs tests and builds the Mini App. These checks do not replace a deployment test against your own Cloudflare and Render resources.

## 10. Current scope and integrations still required

The backend provides real D1-backed user, order, wallet, deposit request, giftcode, support, referral, catalog, app-release, settings, audit and backup paths. The admin dashboard can inspect D1 stats, toggle maintenance, edit supported settings, manage available records, configure Telegram webhook and trigger backups.

The following are **not yet end-to-end vendor integrations** and must not be advertised as fully automated until provider APIs and credentials are integrated and tested:

- OTP and proxy provider fulfilment.
- Live game / gaming platform account operations.
- External pairing/matching provider workflow.
- Automatic bank statement/payment callback reconciliation. VietQR creates transfer instructions; an administrator reviews and approves a pending deposit.
- Automated fulfilment, stock allocation, licence issuance and expiry for every catalog product.
- Automated disaster recovery/restore from CSV.
- Malware scanning of release files. Release uploads enforce size and file-extension restrictions, but those checks are not a malware scan.

The older services/render-bot bridge and unconfigured standalone frontend folders are not the production runtime. The active Render entry point is src/server.js; the deployed Pages app is mini-app/.

## 11. Operational checklist

- [ ] Revoke old credentials and clean exposed secrets from Git history.
- [ ] Create D1 database and both R2 buckets.
- [ ] Configure GitHub Actions Secrets and Variables.
- [ ] Configure Render environment variables.
- [ ] Deploy Worker, run D1 migrations and deploy Pages.
- [ ] Deploy Render Web Service and verify /health.
- [ ] Configure BotFather Mini App domain and webhook.
- [ ] Verify user login uses Telegram-signed initData.
- [ ] Verify admin authorization with an allowlisted Telegram ID.
- [ ] Toggle maintenance mode and confirm member endpoints are blocked.
- [ ] Run a manual backup and verify CSVs plus manifest in the private R2 bucket.
- [ ] Verify backup_runs shows the run result.
- [ ] Test a restore procedure before depending on backup for production recovery.
