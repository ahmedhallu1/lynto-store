# Email — how it works and how to use it

## Status (set up on 11 Oct 2026)
| Item | State |
|---|---|
| Sending domain `lynto.store` in Resend (Ireland / eu-west-1) | ✅ verified |
| DNS in Cloudflare: `resend._domainkey` (DKIM), `rsend` + `send` CNAMEs (SPF/return-path), `_dmarc` (policy `none`) | ✅ added, DNS-only |
| Resend API key (sending access) stored as a Worker secret | ✅ |
| Delivery/bounce webhook → `https://lynto.store/api/webhooks/resend` (delivered, bounced, complained, failed) | ✅ signing secret stored |
| Real automated email from the store (order received) → Resend "Delivered" | ✅ verified live |
| **Receiving** mail at `@lynto.store` (so replies reach you) | ⏳ needs 1 step from you — see below |

## 1. Send from ANY username — Admin → Email
- Pick `orders@`, `support@`, `contact@`, `info@`, `hello@`, `billing@`, `noreply@` or type any other username → it sends as `<username>@lynto.store`.
- Display name, Reply-To, language (Arabic RTL / English LTR), optional order number (logs the email on the order timeline).
- Templates (need info · activation steps · replacement · refund · general) in Arabic and English.
- **Sent mail** tab shows status: *accepted by provider* → *delivered* (or *failed*, with the reason) from Resend's webhook.
- Limits: 10 recipients per message, 60 messages/hour. Resend free plan: 100 emails/day, 3,000/month (verify current limits at resend.com/pricing).

## 2. Automatic emails (no action needed)
| Trigger | Email | From |
|---|---|---|
| Customer places an order | Order received + amount + link to order page | `orders@lynto.store` |
| 6 h after, if still unpaid (once) | Payment reminder | `orders@` |
| You reject a receipt | Reason + upload a new one | `orders@` |
| You approve payment | Payment confirmed + expected delivery time | `orders@` |
| You deliver (full / partial) | Delivered — details on the private order page | `orders@` |
| 3 days before expiry (opt-in only) | Renewal reminder (never auto-charges) | `orders@` |
| Customer sends a support request with an email | Acknowledgement with ticket number | `support@lynto.store` |
| New order / receipt uploaded / delivery overdue / support request | Alert to **you** | `orders@` → *Owner alert email* |
Every automatic email: one send per event (de-duplicated), retries with back-off on provider errors, failures visible in **Admin → Notifications & support** with a Retry button.
Delivery codes/links are never put in emails — only a link to the customer's private page.

**One thing to fill in:** Admin → Setup → *Customer notifications* → **Owner alert email** (where you want new-order alerts). It is empty on purpose.

## 3. Receive mail at orders@ / contact@ / info@ (Cloudflare Email Routing — free)
Your site shows `contact@lynto.store` as the support email, so receiving must work:
1. Cloudflare dashboard → `lynto.store` → **Email → Email Routing → Get started**.
2. **Destination addresses → Add** → your own inbox (Gmail etc.) → open the verification email Cloudflare sends and confirm.
3. **Routing rules → Catch-all address → Edit** → Action *Send to an email* → pick that destination → **Save**. (A catch-all means *any* username works: orders@, contact@, info@, hello@ …)
4. When Cloudflare offers to **add the required MX and SPF records**, accept. (These don't touch the Resend records.)
5. Test: send an email to `contact@lynto.store` from another account.

## 4. Reply from your Gmail *as* orders@ / contact@ (optional)
Gmail → Settings (⚙) → **See all settings → Accounts → Send mail as → Add another email address**:
- Name `LYnto`, email `orders@lynto.store`, untick *Treat as an alias* only if you want it separate.
- SMTP server `smtp.resend.com`, port `465` (SSL) or `587` (TLS), username `resend`, password = a Resend API key with *Sending access*.
- Gmail sends a confirmation code to `orders@lynto.store` — it arrives through step 3's forwarding. Enter it.
Repeat for `contact@`, `info@`, etc. Create a *separate* Resend key for Gmail (Resend → API keys) so you can revoke it independently.

## 5. Good practice
- Keep DMARC `p=none` for the first 2–4 weeks, check Resend's reports, then tighten to `p=quarantine` (Cloudflare DNS → edit `_dmarc`).
- Don't send promotional bulk mail from this setup; it is for order/support mail.
- Security: the Resend key was shared in a chat — create a new key in Resend (Sending access, domain `lynto.store`) and replace it in `.secrets/production.env` (`RESEND_API_KEY`), redeploy (`npm run deploy:prod`), then delete the old key.
