# LYnto — owner guide

Admin: **https://lynto.store/admin** (works on your phone).

## 0. First sign-in (once)
1. Open the private file `.admin-setup-link.txt` in the project folder and open the link inside it.
2. Choose your sign-in email and a password (12+ characters). The link stops working once your account exists.
3. Delete `.admin-setup-link.txt`. In **Account**, turn on two-step verification (authenticator app) — recommended.

## 1. Finish setup (Admin → Setup)
The launch checklist at the top shows what is missing. Checkout opens automatically once these are done:
- **Payment destinations** — your real InstaPay address/number, wallet number(s), bank account. Tick *enabled*.
- **Working days & hours** — Cairo time. Use two ranges for a break. Add holidays as closed dates.
- **Support contacts** — WhatsApp (with +20) and/or email; social links optional.
- **Guarantee & refund terms** — edit the draft text, then tick *I confirm these terms are final*.
- **Store status** — tick *Accepting orders*.

## 2. Approve the catalog (Products / Pricing)
All 16 suggested products are **drafts with no prices**. For each product you want to sell:
1. Open it → check the plan names, durations, plan type and the *Required customer data* (never passwords).
2. Set each plan's **price (EGP)**, **guarantee** (full period / N days / none) and change status to **approved**.
   (Faster: **Pricing** shows every plan in one table.)
3. Set **Supply status = validated** only after you confirmed you can legitimately supply it and how you deliver it.
4. Click **Preview**, then **Publish**. If something is missing, the page lists exactly what.
Bulk actions (publish, feature, supply status, category) are on the Products list. CSV export → edit in a spreadsheet → Import (Validate, then Apply).

## 3. Daily routine
**Dashboard** shows: receipts to review, paid orders by delivery deadline, overdue orders, notifications needing action.

**Review a transfer** (Orders → *Proofs to review*):
1. Open the order → *View receipt*.
2. **Check your bank/InstaPay/wallet app that the money actually arrived.** A screenshot is not proof.
3. *Approve payment*: enter the amount received and the transfer reference. The 2-working-hour clock starts.
   Or *Reject proof* with a short reason in Arabic — the customer sees it and can upload a new receipt.

**Deliver** (same order page, *Items & delivery*):
- Paste the activation details (code / invite link / steps) → **Send & complete**. They are encrypted and appear on the customer's private order page.
- Already sent them on WhatsApp yourself? → **Mark delivered externally**.
- Multiple items? Tick only the ones you are delivering now (partial delivery).
- Later problems: *Send replacement* or *Edit dates* on the item.

**Notifications**: until email/WhatsApp sending is connected, each update appears as *manual action required*.
Click **Open WhatsApp with prepared text**, send it, then **I sent it manually**.

**Refunds**: *Record request* → transfer the money back yourself → *Mark refund completed* with the amount and reference.
The website never reverses transfers.

**Support**: Notifications & support → *Support*. "Verified via order link" means the request came from the customer's private page.
For unverified requests, confirm identity before sharing anything. To resend a lost link: order page → *Regenerate* (old link stops working) → copy → send.

## 4. Prices & products later
Change a price in **Pricing** → Save. Published products are re-checked automatically; anything that becomes invalid is unpublished and listed.

## 5. Export your data
- Orders: Orders → **Export CSV**. Products: Products → **Export CSV**.
- Full database backup: see `docs/OPERATIONS.md` (one command; Cloudflare D1 also keeps 30 days of point-in-time history).

## 6. Optional integrations (Setup → Customer notifications / Tracking / Gemini)
- **Email (Resend, free tier)**: create a Resend account, verify `lynto.store` (add the DNS records Resend shows in Cloudflare DNS), create an API key, paste it in Setup, set *From address* (e.g. orders@lynto.store), send a test to yourself.
- **WhatsApp Cloud API**: Meta app + WhatsApp Business number, permanent access token, phone number ID, and approved *utility* templates (suggested texts are shown in Setup). Webhook URL and verify token are in Setup. Meta charges per template message outside the 24-hour window.
- **Meta Pixel**: paste your Pixel/Dataset ID; optional CAPI token. Purchase is reported only when you approve a payment.
- **Gemini**: tick *Enable* to get suggested product copy in the editor (public info only). Optional.
