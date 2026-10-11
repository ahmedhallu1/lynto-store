# Test results — 11 Oct 2026

## Automated
| Suite | Where | Result |
|---|---|---|
| Typecheck (app + worker, strict TS) | local | ✅ 0 errors (56 files) |
| Unit: Cairo working hours, DST, holidays, expiry, money | `npm test` | ✅ 17/17 |
| E2E workflows + security (with mock email/WhatsApp/Meta/Gemini on :9799) | local preview (`vite preview`, workerd) | ✅ 42/42 |
| E2E workflows + security (real Cloudflare, isolated staging D1/R2, no outbound providers) | https://lynto-staging.hdml.workers.dev | ✅ 38/38 (provider tests run locally only) |

E2E coverage (`tests/e2e/run.mjs`):
- Admin/API protection: unauthenticated 401, CSRF 403, one-time setup token, cookie flags, logout invalidation, login rate limit.
- Drafts: not in public API/HTML/sitemap, not quotable/orderable, admin-only preview; publish refused with reasons; approve-without-price refused.
- Setup screen → checkout opens only when payments, hours, support, policies and the switch are complete; overlapping hours rejected; WhatsApp normalised to E.164.
- Checkout integrity: manipulated total (409 `price_changed`), client prices ignored, qty > max, missing/invalid required fields, unapproved plan, invalid WhatsApp.
- Idempotency: parallel duplicate submits → one order, same token.
- Privacy: order requires private token; another customer's token fails; HTML shell has no customer data; noindex.
- Proofs: fake PNG rejected, real upload stored, receipt only for admin (sandboxed, no-store); reject → reason visible → resubmit.
- Approval: amount mismatch guard; 3 parallel approvals → 1 transition, 1 event, 1 notification.
- Delivery: details required; 2 parallel "Send & complete" → 1 delivery; partial → external → delivered; details encrypted at rest (checked in D1); expiry = activation + 1 calendar month across the Oct 29 DST change; top-up has no expiry; refused before verification.
- Refunds: unpaid refused; over-refund refused; completion idempotent; revenue counts verified only, refunds separate, unpaid excluded.
- Manual mode: no provider → `manual_action_required` + wa.me shortcut (never "sent").
- Email (mock Resend): sent with Idempotency-Key; 400 → failed → retry → sent; 500 → pending with backoff; no bank details in email.
- WhatsApp (mock Cloud API): template sent only with opt-in; manual fallback otherwise; bad webhook signature 401; signed status → delivered; verify-token handshake.
- Meta CAPI (mock): nothing for unpaid/receipt; 2 parallel approvals → exactly 1 Purchase with `purchase_<ORDER>`; none without consent; no delivery data/tokens sent.
- Gemini (mock): disabled by default; works when enabled; provider failure → graceful 502; no customer/payment data in prompt.
- Support: verified vs unverified order link; honeypot.
- Scheduled jobs: unpaid expiry, renewal reminder once (opt-in), no duplicates.
- CSV: export, dry-run validation, invalid price reported, apply keeps published product valid.
- Security headers (CSP, nosniff, noindex on admin), robots.

## Manual / browser checks (built-in browser)
- Arabic RTL home, product, cart, checkout, order page on mobile (375×812) and desktop (1280×860).
- English LTR order page with revealed delivery details.
- Admin: sign-in, dashboard (deadline maths at 02:50 Cairo → due 12:00), order detail approve → Send & complete, products list, setup.
- Fixes made from these checks: Arabic price ordering, product title order on mobile, duplicate password note, scroll position after checkout, Arabic file picker, clearer "not started" wording, focus on first checkout error.

## Production smoke (https://lynto.store) — no test data created
- `/healthz` ok (production), TLS valid, `www` → apex 301, `http` → `https` 301.
- Public catalog empty (all products are drafts) — honest launch state.
- `robots.txt`, `sitemap.xml` (no drafts), `/api/admin/*` → 401.

## Performance (Workers Free plan, 10 ms CPU budget)
`wrangler tail` on staging: home 6 ms, products API 6 ms, product page 4 ms, login (PBKDF2 40k) 5–7 ms CPU.

## Known test caveat
Locally, one request occasionally returned 500 from the Vite preview proxy (`fetch failed` inside Miniflare) right after a fresh start;
the request never reached the Worker and the same test passes on real Cloudflare.
