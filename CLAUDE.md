# LYnto — project instructions (for Claude Code and developers)

LYnto is a bilingual (Egyptian Arabic first, English) digital-goods store at https://lynto.store.
Manual transfer payments (InstaPay / bank / wallet), manual verification and manual fulfilment, with
automated order capture, status tracking, deadlines, reminders and (optional) notifications.

Read `docs/STATUS.md` first — it is the persistent implementation checklist (configured / tested / pending).

## Stack
- React 19 + Vite 8 + Tailwind 4 (SPA in `src/`), custom tiny router (`src/lib/router.tsx`).
- Cloudflare Worker API with Hono (`worker/`), D1 (`DB`), private R2 bucket (`FILES`), static assets (`ASSETS`).
- Shared pure logic in `shared/` (money in integer piastres, Cairo working-hours engine, types, defaults).
- Server-side SEO: `worker/lib/seo.ts` injects title/meta/canonical/hreflang/JSON-LD + prerendered content.

## Commands (Node ≥ 22 required — this Mac has Node 20 on PATH)
```
export PATH=~/.local/share/lynto-node/node-v24.21.0-darwin-arm64/bin:$PATH
npm run typecheck            # app + worker
npm test                     # unit tests (schedule/DST, money)
npx vite build               # production build → dist/
./scripts/reset-local.sh     # wipe LOCAL D1/R2 state and re-migrate
# local preview: .claude/launch.json "lynto-preview" (vite preview on :4173, uses .dev.vars)
node tests/e2e/run.mjs       # E2E against local preview with mock providers
npm run deploy:staging       # https://lynto-staging.hdml.workers.dev (isolated D1/R2)
npm run deploy:prod          # https://lynto.store
npm run db:migrate:prod      # apply new migrations to production D1
```
Git: `/usr/bin/git` is blocked until the Xcode license is accepted; use `/Library/Developer/CommandLineTools/usr/bin/git`.
`python3` (system) is blocked for the same reason — use Node for scripts.

## Non-negotiable business rules
- Suggested products stay `draft`; never publish or price products without the owner's approval.
- Never auto-approve payments (no OCR/AI/screenshot approval). Only the owner's explicit approve action verifies.
- Prices are computed server-side; the client total is only a consistency check (`price_changed`).
- Notifications must never claim "sent" unless a provider accepted them; missing integrations → `manual_action_required`.
- Meta `Purchase` only after verification, once, with consent (`event_id = purchase_<ORDER>`).
- Gemini: optional, owner-triggered, public catalog content only; never customer/payment data.
- Delivery details are AES-GCM encrypted (`DATA_KEY`); notifications link to the private order page, never include secrets.
- Admin and admin APIs are protected (session cookie + CSRF header; optional TOTP; optional Cloudflare Access).
- Workers Free plan: keep per-request CPU < 10 ms (PBKDF2 is 40k iterations for this reason).

## Secrets
Never commit secrets. Worker secrets live in `.secrets/{staging,production}.env` (gitignored, mode 600) and are
uploaded with `wrangler deploy --secrets-file`. Integration credentials entered in Admin → Setup are stored
encrypted in D1 (`secrets` table). Losing `DATA_KEY` makes stored delivery details and credentials unreadable.
