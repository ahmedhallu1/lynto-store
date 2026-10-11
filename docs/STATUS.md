# Implementation status (persistent checklist)

Last updated: 11 Oct 2026. Legend: ✅ built & tested · 🟡 built, needs owner input/credentials · ⏳ pending (owner-only).

## Infrastructure
| Item | Status | Evidence |
|---|---|---|
| Worker `lynto` on https://lynto.store + www → apex 301, http → https 301 | ✅ | deploy log, curl checks |
| Staging Worker https://lynto-staging.hdml.workers.dev (separate D1 `lynto-db-staging`, R2 `lynto-private-staging`, noindex) | ✅ | 38/38 E2E on staging |
| D1 `lynto-db` (WEUR) migrations 0001–0002 applied | ✅ | `wrangler d1 migrations apply` |
| Private R2 `lynto-private` (receipts, product images) — no public bucket access | ✅ | receipts served only via authenticated admin route |
| Cron `*/5 * * * *` (notification retries, unpaid expiry, overdue alerts, renewal reminders, cleanup) | ✅ | deploy log; jobs tested via `/api/admin/system/run-jobs` |
| Secrets via `--secrets-file` (DATA_KEY, TOKEN_SECRET, SETUP_TOKEN, GEMINI_API_KEY) | ✅ | wrangler bindings list |
| Workers Free plan CPU budget | ✅ | measured 4–7 ms CPU per page/API/login request |
| Source control | 🟡 | local git; GitHub push — see handoff |

## Storefront (Arabic RTL default, English LTR at /en)
| Item | Status |
|---|---|
| Home, catalog (search/filter/sort), category, product, cart, checkout, order tracking, support/FAQ, about, privacy, terms, guarantee | ✅ |
| Honest launch state while all products are drafts | ✅ (live now) |
| SEO: per-page title/description/canonical/hreflang/OG/JSON-LD, prerendered content, sitemap, robots; noindex for admin/order/cart/checkout/drafts/staging | ✅ |
| Guest checkout; WhatsApp opt-in explicit (unchecked); renewal reminders opt-in; no marketing consent required | ✅ |
| Private tracking link (`/order/LY-XXXXXX#k=token`), token hashed at rest, number alone exposes nothing | ✅ |
| Receipt upload (JPG/PNG/WEBP/PDF ≤ 6 MB, magic-byte check, client-side compression) | ✅ |
| Meta Pixel (consent banner only when a Pixel ID is set) | 🟡 needs Pixel ID |

## Orders, payments, fulfilment
| Item | Status |
|---|---|
| Separate payment / fulfilment / notification state machines (brief §7 states) | ✅ |
| Server-side pricing, manipulated totals rejected, qty/field validation | ✅ |
| Idempotent order creation (duplicate submit → same order) | ✅ |
| Approve (amount + reference + audit; mismatch needs confirmation), reject with reason + resubmission | ✅ |
| Atomic & idempotent approve/deliver/refund (parallel clicks tested) | ✅ |
| 2-working-hour deadline in Africa/Cairo, breaks/holidays/DST aware | ✅ (unit-tested incl. both DST transitions) |
| Send & complete (encrypted details), mark delivered externally, partial delivery, replacements, date edits | ✅ |
| Activation/expiry/guarantee dates from actual activation; no expiry for codes/top-ups | ✅ |
| Refund request → refund completed (owner-confirmed, amount ≤ verified) | ✅ |
| Overdue alerts, unpaid-order expiry, renewal reminders (opt-in only, never auto-charge) | ✅ |

## Notifications & integrations
| Item | Status |
|---|---|
| Honest manual mode (manual_action_required + WhatsApp chat shortcut + "I sent it manually") | ✅ active now |
| Email via Resend (Idempotency-Key, retries with backoff, Svix-signed delivery webhooks) | 🟡 needs Resend account, API key, DNS verification |
| Email via Cloudflare Email Service | ⏳ requires Workers Paid + domain onboarding (account is on Free) |
| WhatsApp Cloud API (templates, opt-in only, signed webhooks, delivery status) | 🟡 needs Meta app, phone number ID, token, approved templates |
| Meta Conversions API Purchase (once, after verification, consent only) | 🟡 needs Pixel ID + CAPI token |
| Gemini drafting (owner-triggered, public data only, daily cap, graceful failure) | 🟡 key stored as Worker secret; disabled until owner enables |

## Admin
| Item | Status |
|---|---|
| One-time setup link (SETUP_TOKEN) → owner account; login rate limits; optional TOTP; sign out others; audit log | ✅ |
| Dashboard (proof queue, deadline queue, overdue, failed/manual notifications, verified revenue vs refunds) | ✅ |
| Orders search/views, detail with all actions, CSV export | ✅ |
| Products: drafts, bulk publish/unpublish/feature/supply/category/archive, duplicate, preview, editor, image upload, CSV import (dry-run) / export | ✅ |
| Pricing grid (all plans, EGP prices, approve, availability) | ✅ |
| Setup screen (payments, hours/holidays, support, policies, notifications, tracking, AI, health) | ✅ |
| Cloudflare Access on /admin | ⏳ optional; OAuth scope here cannot configure Access |

## Owner decisions still open (none block the launch page)
Receiving accounts, working hours, support contacts, final guarantee/refund terms, plan list + EGP prices + supply validation per product,
email/WhatsApp providers, Pixel ID. All are entered in Admin → Setup / Products / Pricing.
