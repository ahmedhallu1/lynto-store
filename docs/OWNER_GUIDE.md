# LYnto — owner guide

Admin: **https://lynto.store/admin** (works on your phone). Language: English UI; the storefront is Egyptian Arabic first.

## 1. What's live now
- **74 products / 207 plans** from 97 EGP to ~44,300 EGP across AI tools, software/productivity, entertainment, and gift cards/game top-ups.
  **All prices are my estimates** (≈50 EGP per USD + margin). Check them in **Pricing** before you rely on them.
- Working hours are **24/7** (Africa/Cairo). Delivery promise = **2 hours** from payment confirmation.
- Checkout is **open** (payment destinations, support contacts, policies and "accepting orders" were set by you).
- Email is connected (Resend). WhatsApp automation is not yet — see `WHATSAPP_GUIDE.md`.

## 2. Daily routine
**Dashboard** shows: receipts to review, paid orders by delivery deadline, overdue orders, notifications needing action.

**Review a transfer** (Orders → *Proofs to review*):
1. Open the order → *View receipt*.
2. **Check your bank/InstaPay/wallet app that the money actually arrived.** A screenshot is not proof.
3. *Approve payment*: enter the amount received and the transfer reference. The 2-hour clock starts.
   Or *Reject proof* with a short reason — the customer sees it and can upload a new receipt.

**Deliver** (same order page, *Items & delivery*):
- Paste the activation details (code / invite link / steps) → **Send & complete**. They are encrypted and appear on the customer's private order page; the customer is emailed a link.
- Already sent them yourself (WhatsApp etc.)? → **Mark delivered externally**.
- Several items? Tick only those you are delivering now (partial delivery).
- Later problems: *Send replacement* or *Edit dates* on the item.

**Notifications:** with email connected, customers are emailed automatically. Anything that can't be sent automatically
(no email, WhatsApp-only customers) appears as *manual action required* with an **Open WhatsApp with prepared text** button — send it, then press **I sent it manually**.

**Refunds:** *Record request* → transfer the money back yourself → *Mark refund completed* (amount + reference). The website never reverses transfers.

**Support:** Notifications & support → *Support*. "Verified via order link" means it came from the customer's private page.
Lost link? Order page → *Regenerate* → copy → send.

## 3. Email (Admin → Email)
Send from any username @lynto.store, with templates; see the sent log. Full guide: `EMAIL_GUIDE.md`.
Two things for you: **Owner alert email** in Setup, and Cloudflare **Email Routing** so replies to contact@/orders@ reach your inbox (3 minutes).

## 4. Prices & products
- **Pricing**: edit EGP prices, approve/retire plans, availability — Save. Published products are re-checked automatically.
- **Products**: bulk publish/unpublish/feature/archive, duplicate, preview, edit copy (Arabic/English), required customer data, image, CSV export/import (validate first).
- Rule of thumb: a plan is sellable only if *approved + priced + available*; a product is public only if *published + supply validated*.
- **Supply validation**: I marked every product *validated* because you asked me to put the catalogue live. Before you accept orders for a product, make sure you can actually supply it (see the checklist in each product's private notes). Mark unavailable ones *unavailable* or archive them.

## 5. Data
- Orders CSV: Orders → Export CSV. Products CSV: Products → Export CSV.
- Database backup: see `OPERATIONS.md`.

## 6. Optional integrations (Setup)
- **WhatsApp Cloud API**: `WHATSAPP_GUIDE.md` (step by step).
- **Meta Pixel**: paste Pixel ID (+ CAPI token). Purchase is reported only when you approve a payment.
- **Gemini**: tick *Enable* → "Suggest copy" in the product editor (public product info only).
