# Implementation status (persistent checklist)

Last updated: 11 Oct 2026 (second pass: catalogue, Resend, 24/7, fonts). Legend: ✅ built & tested · 🟡 built, needs owner input/credentials · ⏳ pending (owner-only).

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
| Source control: private GitHub repo https://github.com/ahmedhallu1/lynto-store (main) | ✅ | pushed 11 Oct 2026 |

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

## Added 11 Oct 2026 (second pass)
| Item | Status | Evidence |
|---|---|---|
| Launch catalogue: 74 products / 207 plans, 97–44,300 EGP, published with **estimated** prices | ✅ live (prices to be reviewed by owner) | migration 0003 |
| 24/7 working hours (Africa/Cairo), storefront copy adapts ("within 2 hours, around the clock") | ✅ | production settings merged; unit tests incl. DST |
| Arabic fonts: Cairo (headings) + Tajawal (body) replace IBM Plex Sans Arabic | ✅ | screenshots |
| Resend domain lynto.store verified; DKIM/SPF/DMARC records in Cloudflare; webhook for delivery/bounce | ✅ | Resend dashboard + live "Delivered" |
| Automated order email via production pipeline | ✅ | test order → Resend "Delivered" (order cancelled) |
| Admin → Email: send from any username@lynto.store, templates, sent log | ✅ | E2E (mock Resend) |
| Automations: payment reminder, support acknowledgement, branded emails | ✅ | E2E |
| Receiving mail at @lynto.store (Cloudflare Email Routing) | ⏳ owner: 3 minutes (EMAIL_GUIDE.md §3) | — |
| Owner alert email address | ⏳ owner: Setup | — |
| WhatsApp Cloud API | ⏳ owner accounts (WHATSAPP_GUIDE.md) | — |

## Added 12 Oct 2026 (WhatsApp + privacy)
| Item | Status |
|---|---|
| Data deletion policy page `/data-deletion` (AR/EN) + support topic + admin erase action (tested) | ✅ live |
| Meta app: privacy/terms/deletion URLs saved, app Live | ✅ |
| WhatsApp webhook verified + subscribed; 7 templates submitted | ✅ / ⏳ approval |
| Setup → WhatsApp tools: Check connection · Create templates · Use approved templates | ✅ |
| Real WhatsApp number (OTP), payment method, business verification, permanent token | ⏳ owner |

## Added 12 Oct 2026 (WhatsApp build-out)
| Item | Status |
|---|---|
| Permanent token + real account/number wired; webhook fields extended | ✅ |
| WhatsApp auto-reply bot: menu, browse, tracking, Flows, STOP (E2E tested with signed webhooks) | ✅ |
| 4 Flows (Flow JSON 7.3) created & validated; publish blocked by Meta integrity (business verification) | ⏳ |
| Go-live automation (register → templates → flows → sync → enable) in cron | ✅ |
| Product card images (74) for site + link previews | ✅ |
| WhatsApp *catalog* | ⛔ intentionally not created (Meta Commerce Policy) |
| Meta business verification of Lynto | ⏳ Meta review |

## Added 12 Oct 2026 (brand, themes, product detail)
- [x] Platform logos on every product (cards, product page, WhatsApp browse images): `scripts/lib/logos.mjs` (simple-icons CC0 glyphs + official/Wikimedia logo files cached in `brand-source/logos`), rendered by `scripts/product-cards.mjs`.
- [x] Detailed platform text, feature lists and per-plan notes for all 74 products / 207 plans (migration 0007, generator `scripts/product-details.mjs`; guarded so owner edits are never overwritten).
- [x] Light / dark theme follows the device (CSS `prefers-color-scheme`), with a header toggle (auto → light → dark). Light-theme logo variants via `scripts/brand-light.mjs`.
- [x] Language follows the device on a first visit (non-Arabic devices go to /en once; choice is remembered; bots are never redirected).
- [x] Facebook (page "LYnto") and Instagram (@lynto.store) icon links in the website footer and in every customer email (settings → support.socials; emails use `/brand/social-*.png`).

## Owner decisions still open
Receiving accounts, working hours, support contacts, final guarantee/refund terms, plan list + EGP prices + supply validation per product,
email/WhatsApp providers, Pixel ID. All are entered in Admin → Setup / Products / Pricing.

## 8 November 2026 — SEO/GEO and reliability branch

- Source changes: targeted product queries; lightweight catalog/bootstrap projections; reused money formatters; shared server/client metadata; index-state recovery; localized plan Offer markup and plan deep links; real policy/FAQ snapshots; crawlable public rendering dependencies; manifest/404/analytics corrections; optional plain-text llms document.
- Content/assets: two original bilingual guides with sources and internal links; 89 missing product cards and thumbnails added using the existing design. Product data/prices/approvals and production orders were not modified.
- Local validation: typecheck, production build, 33 unit/DOM/SQLite tests and 10 isolated Worker integration checks passed. Full browser preview was blocked by this environment's network-interface enumeration; live deployment and runtime performance verification remain pending Cloudflare access.
- Detailed evidence, limitations and measurement plan: `docs/SEO_GEO_2026-11-08.md`.
