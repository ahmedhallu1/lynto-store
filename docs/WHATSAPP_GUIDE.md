# WhatsApp automation — full setup guide (LYnto)

## Where we are now (12 Oct 2026)
| Item | State |
|---|---|
| Meta app **LYnto Store**, Live; privacy / terms / **data-deletion** URLs set | ✅ |
| **Permanent system-user token** (never expires), stored as a Worker secret; system user has full access to both LYnto WhatsApp accounts | ✅ |
| Real number **+20 10 97293693** (phone ID 1396014003589555, account 1896785387957950): OTP **verified** | ✅ |
| Webhook `https://lynto.store/api/webhooks/whatsapp` verified; subscribed to messages, template status, account updates | ✅ |
| 7 customer-message templates (Arabic, utility) created on the real account | ⏳ Meta review (approval is picked up automatically) |
| 4 WhatsApp **Flows** (support · track order · delete my data · request a product) created, validated by Meta (Flow JSON 7.3) | ⏳ saved as **drafts** — Meta refuses to publish until the business is verified |
| Auto-reply bot (menu · browse products · order tracking · Flows · STOP) | ✅ built & tested; goes live with the number |
| **Meta business verification of "Lynto"** | ⏳ **"In review" at Meta** — the only real blocker |
| Number registration on the Cloud API | ⏳ blocked by the same verification ("Unverified WABA") — done automatically afterwards |
| Payment method on the WhatsApp account | ❌ owner (Meta billing) — needed to send templates |
| LYnto `whatsapp_enabled` | ⏸ switches on **automatically** when the number is connected, sending is allowed and the core templates are approved |

### What happens automatically once Meta approves the business
Every 5 minutes LYnto's scheduler runs a *go-live check* (at most every 30 minutes): it registers the number with the stored PIN, re-subscribes the app, creates any missing templates, retries publishing the Flows, activates every approved template, and — if sending is allowed — **switches WhatsApp notifications on** and writes an audit entry. You can also press **Admin → Setup → WhatsApp tools → Run go-live check** to see exactly which step is blocking.

### Why there is no "WhatsApp catalog"
Meta's Commerce Policy **prohibits digital subscriptions/accounts and virtual currency** and **restricts gift cards** in catalogs, shops and WhatsApp commerce features. Uploading this catalogue to WhatsApp Manager would likely get items rejected and could put your WhatsApp account's commerce features (or the account) at risk, so it was deliberately not done. Instead:
- Every product has a branded **product card image** on the website and in link previews (`/catalog/<product>.jpg`).
- The bot lets customers **browse products inside the chat** (categories → products → link with card image) without using Meta's catalog feature.
- Keep WhatsApp messages transactional (orders, payments, delivery, support). Do not run promotional campaigns for these product types through the API.

### The bot (what customers can do)
| Customer sends | Reply |
|---|---|
| Any greeting / unknown text | Menu: *Browse products · Track my order · Contact us* (at most once per 10 minutes) |
| *Browse* → category → product | Lists with prices → product card + "Open product" link |
| *Track my order* / an order number like `LY-K7M2QX` | Status (payment, delivery, due time) — **only** if the sender's number (or the email in the Flow) matches the order. No links/tokens/secrets are sent |
| *Contact us* Flow | Creates a support ticket (verified if the number matches the order) + your Admin inbox |
| *Delete my data* Flow | Creates a deletion ticket for you to review and erase from the order page |
| *Request a product* Flow | Ticket "Product request via WhatsApp" |
| `STOP` / إيقاف / إلغاء | Turns off automatic WhatsApp updates for that number |
Human chat: the bot always includes your normal support WhatsApp link for urgent cases (the API number itself has no chat inbox).

**What you get:** when a customer ticks *"I agree to receive order updates on WhatsApp"* at checkout, LYnto automatically sends
WhatsApp messages for: order received · payment reminder · receipt rejected · payment confirmed · delivered (full or partial) · renewal reminder.
Delivery details (codes/links) are **never** sent in WhatsApp — the message links to the customer's private order page.
Until this is set up, LYnto works in manual mode (you tap *Open WhatsApp with prepared text*). Nothing below is required to sell.

Time needed: ~45 minutes of your work + Meta template approval (usually minutes to a few hours, up to 24 h).
Cost: Meta's per-message pricing (see step 0). Nothing is charged until you add a payment method in Meta.

---

## Step 0 — Decide the number and understand the costs
1. **Use a number that is NOT already in the normal WhatsApp / WhatsApp Business *app*.** A phone number can be on the Cloud API *or* the phone app, not both.
   - Your public support number `+20 103 133 7325` is on the app (customers chat with it). **Recommended:** get a second SIM/eSIM for the API and keep the app number for human chat.
   - If you want the API on the same number, you must first delete the WhatsApp account of that number from the app (you lose its chats), or use Meta's coexistence onboarding if Meta offers it for your account — check on the Meta screen in step 4.
2. **Pricing (Meta, since 1 Jul 2025):** you pay per *delivered template message* outside a free window, by the customer's country (Egypt's rate is in Meta's rate card — check it before you start).
   Free: any message inside the 24-hour window after the customer last wrote to you, and utility templates inside that window.
   Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
3. LYnto only sends **utility** templates (order/payment/delivery updates). Do not use them for promotions.

## Step 1 — Meta Business portfolio
1. Go to https://business.facebook.com → create (or open) your **Business portfolio** named *LYnto*.
2. Business settings → **Security Center / Business verification** → start verification (company or trade documents). You can start without it, but sending limits stay low until you are verified.

## Step 2 — Create the app
1. https://developers.facebook.com/apps → **Create app**.
2. Name: `LYnto Store`. Choose the use case **"Connect with customers through WhatsApp"**.
3. Select your *LYnto* business portfolio → **Create app**.
4. You land on *Customize use case → Connect on WhatsApp → Quickstart* → click **Start using the API** (the **API Setup** page).
5. When asked, create or select a **WhatsApp Business Account (WABA)**. Write down the **WhatsApp Business account ID**.

## Step 3 — App secret (used to verify webhooks)
App dashboard → **App settings → Basic** → **App secret → Show**. Copy it (you will paste it in LYnto in step 8).

## Step 4 — Add your phone number
1. API Setup → *From* dropdown → **Add phone number** (or WhatsApp Manager → Phone numbers).
2. Enter the **display name** (`LYnto`), category (e.g. *Online retail*), and the number. Verify by SMS or voice call.
3. After it is added, open the number and copy the **Phone number ID** (a long number — *not* the phone number itself).

## Step 5 — Payment method (only when you are ready to pay Meta)
WhatsApp Manager → **Settings → Payment settings → Add payment method**. Without it, business-initiated templates beyond the free allowance will not send. This is your decision — LYnto never enables it for you.

## Step 6 — Permanent access token (system user)
The "temporary token" in API Setup expires in hours — do **not** use it.
1. Business settings → **Users → System users → Add** → name `lynto-api`, role **Admin**.
2. Select it → **Assign assets**:
   - **Apps** → `LYnto Store` → toggle **Manage app** (full control).
   - **WhatsApp accounts** → your WABA → toggle **Manage WhatsApp Business accounts** (full control).
3. **Generate token** → choose the app `LYnto Store`, token expiration **Never**, permissions:
   `whatsapp_business_messaging`, `whatsapp_business_management` (and `business_management` if Meta asks).
4. **Copy the token immediately** (shown once).

## Step 7 — Create the 7 message templates
WhatsApp Manager → **Message templates → Create template**. For each row below:
- **Category:** *Utility* · **Name:** exactly as shown (lowercase + underscores) · **Language:** *Arabic (Egypt)* `ar_EG` (if the list has no Egypt option choose *Arabic* `ar` and enter `ar` in LYnto).
- **Body:** paste the text. `{{1}}…{{4}}` are the variables. For each variable Meta asks for a **sample value** — use the sample in the last column.
- **Submit.** Wait for status **Active/Approved**.

| Name | Body (Arabic) | Variables → samples |
|---|---|---|
| `lynto_order_received` | أهلاً {{1}}، استلمنا طلبك رقم {{2}} بإجمالي {{3}}. حوّل المبلغ وارفع إيصال التحويل من صفحة طلبك: {{4}} — فريق LYnto | 1 أحمد · 2 LY-K7M2QX · 3 1,180 ج.م · 4 https://lynto.store/order/LY-K7M2QX |
| `lynto_payment_reminder` | أهلاً {{1}}، طلبك رقم {{2}} لسه مستني التحويل بقيمة {{3}}. لو حوّلت ارفع الإيصال من هنا: {{4}} — فريق LYnto | أحمد · LY-K7M2QX · 1,180 ج.م · https://lynto.store/order/LY-K7M2QX |
| `lynto_proof_rejected` | أهلاً {{1}}، مقدرناش نأكد الدفع لطلب {{2}}. السبب: {{3}}. ارفع إيصال جديد من: {{4}} — فريق LYnto | أحمد · LY-K7M2QX · المبلغ لسه موصلش · https://lynto.store/order/LY-K7M2QX |
| `lynto_payment_confirmed` | أهلاً {{1}}، تم تأكيد الدفع لطلب {{2}} واشتراكك بيتجهز. الموعد المتوقع: {{3}}. تابع طلبك: {{4}} — فريق LYnto | أحمد · LY-K7M2QX · الأحد 5:00 م · https://lynto.store/order/LY-K7M2QX |
| `lynto_order_delivered` | أهلاً {{1}}، طلبك {{2}} اتسلّم. تفاصيل التفعيل في صفحة طلبك الآمنة: {{3}} — فريق LYnto | أحمد · LY-K7M2QX · https://lynto.store/order/LY-K7M2QX |
| `lynto_item_delivered` | أهلاً {{1}}، جزء من طلبك {{2}} اتسلّم. التفاصيل: {{3}} — فريق LYnto | أحمد · LY-K7M2QX · https://lynto.store/order/LY-K7M2QX |
| `lynto_renewal_reminder` | أهلاً {{1}}، اشتراك {{2}} هينتهي يوم {{3}}. لو حابب تجدد اعمل طلب جديد من: {{4}} — فريق LYnto | أحمد · Netflix · 11 نوفمبر 2026 · https://lynto.store |

> The same texts (and English versions) are shown inside **Admin → Setup → Customer notifications** when WhatsApp is enabled.
> Variables must be filled in this exact order — LYnto sends them in this order.
> If Meta rejects a template for a variable at the start/end or "too many variables for the text length", add a few words of plain text around it and re-submit; keep the variable *order* unchanged.

## Step 8 — Webhook (delivery confirmations)
1. In LYnto **Admin → Setup → Customer notifications**: tick **Enable WhatsApp Cloud API**, and in **Webhook verify token** type any long random phrase you invent (e.g. `lynto-wa-7Hq2-verify-91xK`). Paste the **Meta app secret** from step 3. **Save the section** *before* the next step.
2. Meta App dashboard → **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://lynto.store/api/webhooks/whatsapp`
   - **Verify token:** the same phrase you typed in LYnto.
   - Click **Verify and save**.
3. Under *Webhook fields* click **Manage** and **Subscribe** to `messages` (this carries delivery/read/failed status).

## Step 9 — Connect LYnto
Admin → Setup → **Customer notifications → WhatsApp**:
| Field | Value |
|---|---|
| Phone number ID | from step 4 |
| Graph API version | leave `v23.0` (or the version shown in Meta's docs) |
| WhatsApp access token | the permanent token from step 6 |
| Meta app secret | from step 3 |
| Webhook verify token | your phrase from step 8 |
| Template per event | the 7 template names from step 7 + language `ar_EG` (or `ar`) |
Press **Save**, then use **Test WhatsApp** with your own number.
A test returns *"accepted by whatsapp_cloud"* — that means Meta accepted it; real delivery is confirmed when the phone receives it.

## Step 10 — Go live
1. Meta App dashboard top bar: switch the app mode **Development → Live** (needs a Privacy Policy URL: `https://lynto.store/privacy`, and category *Business and pages*).
2. Place a real test order on lynto.store with *WhatsApp updates* ticked and your own number. In **Admin → Orders → (the order) → Notifications** you should see `order received · whatsapp · sent`, and a moment later **delivered** (from the webhook).
3. Approve the test order's payment and deliver it to see the other messages. Cancel/refund the test order afterwards.

## Troubleshooting
| You see in LYnto | Meaning | Fix |
|---|---|---|
| `failed · WhatsApp 401 / code 190` | token invalid/expired | regenerate the system-user token (step 6) |
| `… 132001 template does not exist` | template name/language mismatch or not approved | copy the exact name + language from WhatsApp Manager |
| `… 132000 / 100 number of parameters` | template has a different number of variables | recreate with the table above |
| `… 131030 recipient not in allowed list` | app still in Development mode or test number | go live (step 10) / use the real number |
| `… 131047 re-engagement` | template required but a free-form message was sent | LYnto always uses templates; check the template is selected for that event |
| `… 131042 / payment` | no payment method on the WABA | step 5 |
| status stays `sent` and never `delivered` | webhook not subscribed or app secret wrong | step 8; check **Verify token** and **App secret** |
| `manual action required` | customer did not tick the opt-in box, or the event has no template | expected — use *Open WhatsApp with prepared text* |

## Rules that keep your number safe
- Send only to customers who ticked the opt-in (LYnto enforces this).
- Only order/payment/delivery/renewal utility messages. No promotions through these templates.
- If many customers block/report you, Meta lowers your quality rating and sending limits (WhatsApp Manager → Insights).
- Never put passwords or full card/bank numbers in WhatsApp.

Official docs used: Get started · Message templates · Pricing — https://developers.facebook.com/documentation/business-messaging/whatsapp/
