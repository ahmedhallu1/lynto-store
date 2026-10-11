# Operations: deployment, configuration, backups, monitoring

## Environments
| | Production | Staging |
|---|---|---|
| URL | https://lynto.store (www → apex) | https://lynto-staging.hdml.workers.dev |
| Worker | `lynto` | `lynto-staging` |
| D1 | `lynto-db` (7c36d721-…) | `lynto-db-staging` (4ae3d0fc-…) |
| R2 | `lynto-private` | `lynto-private-staging` |
| Cron | `*/5 * * * *` | none |
| Secrets file | `.secrets/production.env` | `.secrets/staging.env` |
| Indexing | robots allow (except private paths) | `noindex` everywhere |

Cloudflare account: `288fc421913fa0ab49242367a82dad5b` (Workers **Free** plan, verified 11 Oct 2026). Zone `lynto.store` (Free plan).

## Deploy
```
export PATH=~/.local/share/lynto-node/node-v24.21.0-darwin-arm64/bin:$PATH   # Node 24 (wrangler needs ≥22)
npm ci
npm run typecheck && npm test
npm run deploy:staging            # build with CLOUDFLARE_ENV=staging + deploy + secrets
BASE=https://lynto-staging.hdml.workers.dev SETUP_TOKEN=<staging token> NO_MOCK=1 \
  D1_TARGET=--remote D1_DB=lynto-db-staging D1_ENV=staging node tests/e2e/run.mjs
npm run db:migrate:prod           # only when migrations/ changed
npm run deploy:prod
```
Rollback: `npx wrangler rollback --name lynto` (previous Worker version; database changes are not rolled back).

## Configuration
- Worker vars (wrangler.jsonc): `APP_ENV`, `PUBLIC_BASE_URL`.
- Worker secrets (`--secrets-file`): `DATA_KEY`, `TOKEN_SECRET`, `SETUP_TOKEN`, optional `GEMINI_API_KEY`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`. See `.env.example`.
- Business settings: D1 `settings` table, edited in Admin → Setup.
- Integration credentials (Resend, WhatsApp, Meta CAPI, optional Gemini override): D1 `secrets` table, AES-GCM encrypted with `DATA_KEY`, write-only in the UI.

## Secrets hygiene
- Keep a copy of `.secrets/production.env` in your password manager. **Losing `DATA_KEY` makes stored delivery details and integration credentials unreadable.**
- Rotating `TOKEN_SECRET` invalidates all customer order links (regenerate per order in admin). Rotating `DATA_KEY` requires re-encrypting data — don't rotate casually.
- The Gemini key you shared in chat is stored only as a Worker secret. Consider creating a new key in Google AI Studio and replacing it (Admin → Setup → Gemini, or update `.secrets/production.env` and redeploy).

## Backups & restore
```
# Full SQL export of production D1 (store the file safely — it contains customer data)
npx wrangler d1 export lynto-db --remote --output backups/lynto-db-$(date +%F).sql
# Point-in-time restore (D1 Time Travel, last 30 days)
npx wrangler d1 time-travel info lynto-db
npx wrangler d1 time-travel restore lynto-db --timestamp=2026-10-11T10:00:00Z
# Restore an export into a fresh database
npx wrangler d1 create lynto-db-restore && npx wrangler d1 execute lynto-db-restore --remote --file backups/<file>.sql
```
R2 receipts/images: `npx wrangler r2 object get lynto-private/<key> --remote --file <out>` (keys are listed in `payment_proofs.file_key` / `media.file_key`).
`backups/` is gitignored — still store exports somewhere safe and private (they contain customer data).

## Monitoring
- `GET /healthz` → `{ ok, env }` (checks D1).
- Workers Logs (observability enabled; Free plan: 200,000 events/day, 3-day retention): Cloudflare dashboard → Workers → lynto → Logs, or `npx wrangler tail lynto`.
- Logged errors contain path/method/message only — no request bodies or customer data.
- Admin dashboard surfaces overdue deliveries and failed notifications; owner email alerts once an email provider is configured.

## Security model
- Admin: PBKDF2-SHA256 (40k iterations, sized for the Free-plan CPU budget) + login rate limits + optional TOTP; `__Host-` HttpOnly Secure SameSite=Strict session (12 h idle / 7 days max); CSRF header + Origin check on mutations; optional Cloudflare Access JWT validation.
- Customers: 256-bit order tokens (HMAC-hashed at rest), URL fragment (not sent in Referer/logs), uniform 404 for wrong token/number.
- Receipts: private R2, magic-byte validation, served only to the admin with `Content-Security-Policy: sandbox`, `no-store`.
- Delivery details: AES-256-GCM with per-record AAD; never put in notifications or analytics.
- Abuse: D1 rate limits (orders 30/h/IP, proofs 20/h/IP, support 6/h/IP, login 10/15 min/IP + 6/15 min/email), support honeypot.
- CSP `default-src 'self'` (Meta domains added only when a Pixel ID is set), HSTS, frame-ancestors none.

## Known limitations
- Workers Free plan: 100,000 requests/day; beyond that requests fail until 00:00 UTC (no charge). Upgrade = Workers Paid.
- Customer email/WhatsApp sending needs owner accounts (see handoff). Until then everything works in manual mode.
- `RATE_LIMIT_MULTIPLIER` / `TEST_PROVIDER_BASE` are honoured only outside production.
