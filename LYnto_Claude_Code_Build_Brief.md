# LYnto — Claude Code build and deployment brief

Prepared: 10 October 2026
Target domain: https://lynto.store
Builder: Claude Code
Runtime AI: optional Gemini API free tier; not required for the core store

## 1. Mission and execution style

Build and deploy a complete online digital store for LYnto. Take responsibility for implementation, configuration, database migrations, testing, deployment, and the operating guide. The owner wants to do as little setup and technical work as possible.

Start by inspecting the current repository, available tools/connectors, Cloudflare account capabilities, domain configuration, and provided assets. Reuse working infrastructure. Access to one service does not imply access to another.

Make routine engineering and design decisions yourself. Do not ask the owner to select libraries, write code, run migrations, or repeat information in this brief. Continue independent work when an external setup item is blocked. Collect essential missing business details in one admin setup screen and unavoidable account actions in one concise checklist.

Do not buy subscriptions, upgrade plans, or enable new chargeable usage automatically. The owner has not set a numerical monthly budget. Use free tiers where practical, verify current eligibility and limits, and keep optional paid integrations disabled unless already available or explicitly approved. Do not promise that messaging or hosting will remain free at every traffic level.

Keep a persistent implementation checklist and project instructions so work can resume across Claude Code sessions. Use actual tool results to distinguish configured, tested, and pending features. Do not claim deployment, message delivery, or integrations succeeded without evidence.

## 2. Confirmed business decisions

- Brand: LYnto. Preserve capitalization.
- Domain: lynto.store, purchased in Cloudflare; the owner reports Cloudflare is connected to Claude.
- Categories: AI tools/subscriptions; design/productivity/software licenses; entertainment subscriptions; payment/top-up services.
- Initial catalog: prepare suggested products and plan options as UNPUBLISHED DRAFTS. The owner will approve plans and selling prices.
- Currency: EGP. Mentioned price ranges are background context, not approved product prices.
- Payment methods: InstaPay, bank transfer, and mobile wallet transfers such as Vodafone Cash.
- Payment verification: manual. The owner checks the receiving account.
- Fulfillment: manual. The owner sends subscription/license/activation details.
- Automation: order capture, status updates, notifications when a real sending integration is available, expiry tracking, and reminders.
- Delivery promise: within TWO WORKING HOURS after payment verification, using the owner's stated working schedule.
- Claude is the development tool. Do not add a Claude API requirement to the deployed store.
- If runtime AI is useful later, start with an eligible Gemini free-tier model.

Implementation defaults, editable by the owner: Egypt-focused, Arabic first with an English switch, mobile-first design, guest checkout, and a protected admin dashboard.

## 3. Brand and visual direction

Use the provided assets:
- LYnto.png: wide primary brand artwork, with a blue/teal circuit-style knot, white wordmark, deep navy background, and the tagline “AUTOMATED PAYMENTS & SUBSCRIPTIONS.”
- image(20261010-183806).png: a presentation board showing a landscape social banner and square social artwork. This whole board includes labels and a light outer background; do not use it as a storefront hero.

Inspect asset files before using them. Preserve the supplied identity and proportions. Use the primary artwork tastefully; produce responsive crops/optimized derivatives without changing the brand mark. If a separate symbol is needed, derive a faithful crop from the provided primary artwork. Do not regenerate a different logo.

Use deep navy surfaces, readable white text, restrained cyan/electric-blue/teal accents, subtle gradients, and clear cards. Approximate starting tokens: background #061326, surface #0B203A, text #F5F8FF, blue #168CDD, cyan #20C7CF. Treat these as design choices to refine against the actual assets.

Make Arabic RTL and English LTR layouts work correctly, including mixed-language product names, numbers, prices, and phone numbers. Use legible Arabic and Latin typography, visible keyboard focus, accessible contrast, reduced-motion support, and touch-friendly controls.

Write professional, direct Arabic and English copy. Foreground digital products, straightforward ordering, payment options, support, and the actual delivery promise. Avoid fake reviews, fabricated sales statistics, unsupported partner badges, and claims of instant activation or automatic transfer verification.

The existing logo tagline may remain. Explain the launch process accurately in surrounding copy.

## 4. Recommended architecture

Prefer a simple TypeScript implementation using Cloudflare's supported React + Vite setup, Tailwind CSS, a Cloudflare Worker API, D1 for structured records, and private R2 storage for receipt uploads where available. Use an existing suitable framework instead if the repository already has one; explain material deviations briefly.

Keep the frontend and API on the same origin where practical. Use official current framework/provider documentation, supported package versions, and lockfiles. Avoid unnecessary microservices, paid automation platforms, vector databases, and runtime AI dependencies.

Build real persistence. Browser localStorage can hold a temporary cart but must not be the source of truth for products, orders, payments, delivery records, or admin changes.

Include migrations, indexes, server-side validation, environment documentation, a sanitized .env.example, and repeatable deployment commands. Secrets belong in server-side secret storage, not frontend bundles, Git, logs, or ordinary editable settings.

Public category/product pages need accurate titles, descriptions, canonical URLs, and indexable content. Choose a supported prerendering/server-rendering approach if needed. Do not make admin pages, receipts, customer order pages, or draft products indexable.

## 5. Customer-facing pages

Build:
1. Home: clear proposition, category navigation, published featured products, how ordering works, actual payment methods, support, and delivery terms.
2. Catalog: search, category filters, useful sorting, published availability, and plan pricing.
3. Product detail: description, genuine features, approved plans, shared/private/license type, duration, total price, customer requirements, delivery timing, guarantee terms, and availability.
4. Cart and checkout: digital-only checkout, no shipping address or delivery fee.
5. Payment instructions and receipt submission: clear destination, exact amount, order reference, copy controls, and private upload.
6. Order confirmation and secure order-status page: payment status, delivery status, timeline, support, and owner-provided delivery details.
7. Support and FAQ: editable contact channels and a support request tied to an order.
8. About, privacy, purchase terms, and guarantee/refund information.

Use guest checkout as the primary path. Collect only necessary information: name, contact email, WhatsApp number with country code, preferred contact channel, and genuinely required product-specific fields. Request WhatsApp notification permission explicitly when needed. Do not require marketing consent to purchase.

Do not ask customers for existing account passwords as a default checkout field. Prefer invitations, activation links, license codes, or delivery instructions.

Return a private tracking link on successful order creation so the customer can save it even if no outbound channel is configured. A public order number alone must not expose customer data.

If all products are still drafts, show an honest launch/coming-soon catalog state and configured support links. Do not expose sample prices as real offers. Preview draft products only through protected admin access.

## 6. Product catalog and publishing

Create approximately 12–16 suggested product drafts across the four categories. Suitable candidate brands may include popular AI, design, office/productivity, and entertainment services, but each actual plan is a proposal requiring owner validation.

Do not assume that account sharing, resale, regional eligibility, or a named subscription tier is permitted or available. Verify public product facts from official sources; mark supply/plan validation as pending when not established. Draft creation does not establish the right or ability to supply that product.

Fields should include bilingual title/description, category, image/icon, plan type, duration, EGP selling price, supply-validation status, availability, required customer data, delivery instructions for the owner, and guarantee terms.

Unknown prices stay empty. Draft plans cannot be purchased, fetched through public product endpoints, indexed, or added to a live checkout. Publishing requires an approved real plan, price, availability, and customer-facing terms.

Provide easy bulk editing, duplicate-product actions, preview, and CSV import/export. The owner should be able to approve the catalog without editing code.

For payment/top-up services, support validated service-specific fields and fixed approved packages. Do not invent exchange rates, percentage fees, payment-processing capabilities, or access to customer financial accounts.

## 7. Manual payment and delivery workflow

Model payment and fulfillment separately; notifications have their own status.

Payment states: awaiting_transfer, proof_submitted, verified, rejected, cancelled, refund_requested, refunded.
Fulfillment states: not_started, processing, partially_delivered, delivered, cancelled.
Notification states: pending, sent/accepted_by_provider, delivered_when_confirmed, failed, manual_action_required.

Customer flow:
- Place an order; calculate and store prices on the server.
- Show valid transfer instructions and exact amount.
- Allow receipt upload and optional transaction reference.
- Label the order “Awaiting payment verification.”
- Send “Order received” if a real notification channel is configured.
- The owner verifies that money actually arrived and approves payment.
- Send “Payment confirmed. Your subscription is being prepared.”
- Begin the two-working-hour delivery clock.
- The owner prepares and sends access/activation details.
- Mark delivered only once delivery details are made available to the customer or the owner confirms delivery outside the website.
- Send a completion notice when possible.

A screenshot, OCR result, browser action, or AI judgment is not payment confirmation. Never auto-approve transfers based on a receipt image.

Admin actions:
- Approve payment with amount/reference and an audit record.
- Reject proof with a customer-facing reason and allow resubmission.
- Paste delivery instructions and click “Send & complete.”
- Offer a WhatsApp chat shortcut with prepared text for manual sending when API sending is unavailable. A link opening WhatsApp is not automatic delivery.
- Offer a separate “Mark delivered externally” action for details sent outside the dashboard.
- Handle partial fulfillment for multi-item orders.
- Record refund requests and mark refunds completed only after the owner confirms an actual refund. Do not imply the website reverses a bank transfer.

When completion stores details in the protected customer portal, notification failure must be visible separately and retryable. Do not label a message sent when an integration is missing or the provider rejected it.

## 8. Delivery schedule, guarantees, and renewals

Use the IANA timezone Africa/Cairo, with timezone-aware calendar calculations. Store timestamps consistently and avoid a fixed UTC offset.

Working days, hours, breaks, and holidays are unknown. Make them configurable in the admin setup screen. Do not invent a public schedule.

Calculate delivery_due_at by adding two working hours from payment verification, skipping closed periods. If approval happens outside working hours, start counting at the next opening. Display the correct due time to the customer and overdue alerts to the owner.

The background overview mentions full-period guarantees. Draft clear terms reflecting that intent, but leave exact remedies, eligibility, exclusions, and refund rules for owner confirmation. Do not publish an invented unconditional refund promise.

Store actual activation/start date and expiry per subscription item. Begin subscription/guarantee dates from actual activation, not automatically from order placement. Top-ups or perpetual licenses should not receive a fabricated expiry.

Provide renewal reminders when a valid channel is configured and the customer has the required permission. Renewals require a new manual payment/order; do not auto-charge customers or imply recurring debit support.

## 9. Admin dashboard and owner setup

Build a practical mobile-usable dashboard:
- Payment proofs awaiting review.
- Approved orders awaiting delivery, sorted by delivery deadline.
- Failed notifications and overdue delivery alerts.
- Product/plan editing, drafts, approval, availability, and publishing.
- Searchable order history, customer contact, notes, and audit timeline.
- Delivery entry, support/replacement records, and refund tracking.
- Revenue based on verified payments, with refunds shown separately; avoid counting unpaid orders as sales.
- CSV exports for orders/products.
- Business settings and integration health.

Use a single setup checklist for remaining information:
- Real receiving InstaPay/bank/wallet destinations and enabled methods.
- Working days, hours, and holidays.
- Support WhatsApp number, email, and actual social URLs.
- Owner/admin identity.
- Product plans, selling prices, and supply validation.
- Final guarantee/refund terms.
- Available outbound email/WhatsApp credentials and sender verification.
- Actual Meta Pixel/Dataset ID if connected.

Discover these from authorized existing tools/settings where possible. Never invent payment numbers, contact details, API credentials, Pixel IDs, bank names, or verified business status.

Separate ordinary business settings from secrets. Enable checkout only when required payment, scheduling, product, and policy settings are valid. Do not force optional Gemini or WhatsApp API setup to enable an otherwise functional manual store.

Protect both admin pages AND admin API routes using an appropriate authenticated identity flow. Prefer an existing Cloudflare Access setup if available, with backend token validation. Do not leave an unauthenticated bootstrap admin screen public.

## 10. Notifications and optional AI

Inspect real outbound capabilities before choosing a provider.

Email: use an existing verified transactional sender, or a suitable available free-tier provider after checking current limits and account setup. Cloudflare Email Routing by itself is not a general free customer-email sender; current Cloudflare outbound customer email requires the appropriate plan. Configure sender DNS with existing authorized Cloudflare tools when possible.

WhatsApp: inspect whether the reported reserved number is registered for Cloud API, what sending capabilities are available, and applicable messaging/permission requirements. Use current official Meta guidance rather than assuming a particular messaging feature is enabled.

Build event-based order, payment-confirmation, delivery, and renewal notifications. Record provider responses and delivery webhooks where supported. Include retries with bounded backoff and duplicate protection. Missing sending credentials should produce an honest manual mode, not fake success or a broken checkout.

Optional Gemini: disabled by default and unnecessary for launch. Useful later for owner-reviewed bilingual draft descriptions or answers grounded in the public published catalog/FAQ. Select a currently eligible free-tier model at implementation time; make it configurable. Enforce limits, timeouts, and deterministic fallbacks, with no silent upgrade to paid usage.

Do not send receipts, customer personal data, bank details, account credentials, license codes, or private order histories to the Gemini free API. Keep it limited to public content. AI must not verify payments, alter prices, approve refunds, or change fulfillment status.

Do not add an AI chatbot, OCR pipeline, or recommendation engine just to satisfy the branding.

## 11. Security and tracking

Keep receipts in private storage, with authenticated/time-limited retrieval and file type/size validation. Use high-entropy customer access tokens, store them safely, and prevent customers from viewing another order. Protect delivery secrets at rest and in logs; restrict access to the intended customer and authorized owner.

Use server-side price validation, integer piastres for money, prepared database statements, abuse limits, and appropriate browser/session protection. Admin approval and fulfillment must be atomic and idempotent. Repeated clicks must not create duplicate orders, sales events, or notifications.

Add essential operational monitoring, useful error messages, and backup/export/restore instructions without exposing customer information in telemetry.

Configure Meta tracking only with actual identifiers and applicable consent settings. Track genuine catalog/cart/checkout activity. For manual transfers, emit Purchase only once payment is verified. If using browser and server events, deduplicate them. An unpaid order or uploaded screenshot is not a paid purchase.

Never send delivery credentials or receipt contents to analytics. Document the exact conversion trigger for the owner.

## 12. Verification, deployment, and handoff

Run relevant build/type checks and meaningful workflow/security tests. Verify at least:
- Arabic RTL and English layouts on mobile and desktop.
- Draft exclusion and publication validation.
- Server rejection of manipulated checkout prices.
- Checkout, proof submission, rejection/resubmission, approval, partial/full delivery.
- Duplicate order requests and repeated approval/delivery clicks.
- Working-hour deadlines across closing time, weekends/holidays, and Cairo clock changes.
- Admin/API protection, receipt privacy, and access to another customer's order.
- Correct behavior when email/WhatsApp/Gemini is unavailable or fails.
- No duplicate notifications/conversions.
- Refund and expiry handling appropriate to each product.

Use isolated test records and controlled recipient addresses/numbers; do not send test messages to real customers.

Deploy a functional preview, fix observed issues, then deploy the verified store to lynto.store using available Cloudflare tools. Preserve unrelated DNS and mail settings. Keep live purchasing disabled for incomplete products/settings; a polished public launch page can be deployed while drafts await approval.

Configure repeatable deployment/source control using already available access. Do not assume GitHub is connected; retain the complete project and deployment instructions if a remote repository cannot be configured.

Handoff must include:
- Actual live/preview URL and protected admin entry.
- Implemented and verified functionality.
- A concise list of unavailable integrations and owner-only setup actions.
- A real cost/free-tier table with source links and the verification date; do not describe unknown costs as zero.
- A short owner guide: approve catalog, review transfers, send details, update prices, handle support, and export data.
- Complete source, migrations, environment variable names, backup instructions, and test results.

Proceed through implementation now. Do not stop after presenting another plan, a landing-page mockup, or a nonpersistent demo.

## Official references for the builder

Reviewed 10 October 2026. Recheck current limits, capabilities, and terms before implementation.

- Cloudflare Claude Code setup: https://developers.cloudflare.com/agent-setup/claude-code/
- Cloudflare React + Vite guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare Workers pricing (page updated 2 October 2026): https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 documentation: https://developers.cloudflare.com/d1/
- Cloudflare R2 documentation: https://developers.cloudflare.com/r2/
- Cloudflare Email Service pricing (page updated 9 June 2026): https://developers.cloudflare.com/email-service/platform/pricing/
- Meta's official WhatsApp Cloud API collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google Gemini API additional terms: https://ai.google.dev/gemini-api/terms

