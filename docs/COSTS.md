# Costs & free tiers (verified 10–11 Oct 2026)

Nothing paid was enabled. Prices change — re-check the linked pages before relying on them. "Free" below means
"within the stated allowance on the current plan"; it does not mean free at every traffic level.

| Service | How LYnto uses it | Plan / allowance now | Cost today | If it grows | Source |
|---|---|---|---|---|---|
| Cloudflare Workers | Site + API + cron | **Free plan** (verified via API): 100,000 requests/day, 10 ms CPU/request; static assets free & unlimited | $0 | Over the daily limit requests **fail** (no bill) until 00:00 UTC. Workers Paid: **$5/month minimum**, includes 10M requests + 30M CPU-ms/month | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (page dated 2 Oct 2026) |
| Cloudflare D1 | Orders, catalog, settings | Free: 5M rows read/day, 100k rows written/day, 5 GB | $0 | Paid plan: $0.001/M reads after 25B, $1.00/M writes after 50M, $0.75/GB-month after 5 GB | same page |
| Cloudflare R2 | Private receipts & product images | 10 GB-month, 1M Class A, 10M Class B ops/month, free egress. R2 was already enabled on this account | $0 at current volume | $0.015/GB-month, $4.50/M Class A, $0.36/M Class B | same page |
| Workers Logs | Error/ops logs | Included on Free: 200,000 events/day, 3-day retention | $0 | — | same page |
| Cron Triggers | 5-minute jobs | Included | $0 | — | same page |
| Domain lynto.store | Cloudflare Registrar | Purchased by owner | **Renewal price not verified** — check Cloudflare dashboard → Domain Registration | — | dashboard |
| Cloudflare Email Service | Not used | Sending to arbitrary recipients **requires Workers Paid** (3,000 emails/month included, then $0.35/1,000) | not enabled | — | [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) (dated 9 Jun 2026) |
| Resend (email) | **In use** — order/support/owner emails + Admin → Email | Account on Resend's plan as of 11 Oct 2026 (domain lynto.store added in Ireland region). Free-plan limits reported by third parties: 3,000 emails/month, 100/day — **verify in Resend → Settings → Billing** | $0 if on Free | Paid plans per Resend if you exceed the quota | [resend.com/pricing](https://resend.com/pricing) |
| Cloudflare Email Routing | Receiving mail at @lynto.store (not yet enabled) | Free | $0 | — | [Email Routing docs](https://developers.cloudflare.com/email-routing/) |
| WhatsApp Cloud API | Optional provider, built in | Per-message pricing for templates; utility templates inside an open 24-hour customer-service window are free; outside it they are billed by recipient country (Egypt rate in Meta's rate card — **not verified**) | not set up | Per message | [Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) |
| Google Gemini API | Optional product-copy drafts | Free tier models incl. `gemini-3.5-flash-lite` (default); free-tier content may be used to improve Google products. Daily cap in Setup (default 40) | $0 (disabled by default) | If billing is enabled on the Google project, usage may become paid — check AI Studio → billing | [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) (dated 9 Oct 2026) |
| Meta Pixel / CAPI | Optional | Free | $0 | — | — |
| GitHub | Source control (private repo) | Free | $0 | — | — |
