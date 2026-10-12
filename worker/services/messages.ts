// Customer/owner notification copy (Egyptian Arabic + English) and the branded email layout.
// Messages never contain delivery credentials, receipts or bank details — only a link to the private order page.
import { formatEGP } from '../../shared/money';
import { formatInZone } from '../../shared/schedule';

export type CustomerEvent = 'order_received' | 'payment_reminder' | 'proof_rejected' | 'payment_confirmed' | 'order_delivered' | 'item_delivered' | 'renewal_reminder' | 'support_received';
export type OwnerEvent = 'owner_new_order' | 'owner_proof_submitted' | 'owner_delivery_overdue' | 'owner_support_request';
export type NotificationEvent = CustomerEvent | OwnerEvent;

export type MessageContext = {
  lang: 'ar' | 'en';
  name: string;
  number: string;
  total_piastres: number;
  link: string;
  due_at?: number | null;
  reason?: string;
  product?: string;
  expires_at?: number | null;
  store_url: string;
  admin_url?: string;
};

export type Rendered = { subject: string; preheader: string; text: string; cta: string; waParams: string[]; rows: Array<[string, string]> };

export function renderCustomer(event: CustomerEvent, m: MessageContext): Rendered {
  const ar = m.lang === 'ar';
  const total = formatEGP(m.total_piastres, m.lang);
  const due = m.due_at ? formatInZone(m.due_at, m.lang) : '';
  const exp = m.expires_at ? formatInZone(m.expires_at, m.lang, 'Africa/Cairo', false) : '';
  const L = ar
    ? { order: 'رقم الطلب', total: 'الإجمالي', due: 'موعد التسليم المتوقع (توقيت القاهرة)', product: 'المنتج', ends: 'ينتهي في', ticket: 'رقم الطلب' }
    : { order: 'Order number', total: 'Total', due: 'Expected delivery (Cairo time)', product: 'Product', ends: 'Ends on', ticket: 'Request number' };
  const orderRows: Array<[string, string]> = [[L.order, m.number], ...(m.total_piastres ? ([[L.total, total]] as Array<[string, string]>) : [])];
  const p = (subject: string, preheader: string, text: string, cta: string, waParams: string[], rows: Array<[string, string]> = orderRows): Rendered => ({ subject, preheader, text, cta, waParams, rows });
  switch (event) {
    case 'order_received':
      return ar
        ? p(`استلمنا طلبك ${m.number}`, 'حوّل المبلغ وارفع إيصال التحويل من صفحة طلبك.', `أهلاً ${m.name}،\nاستلمنا طلبك رقم ${m.number} بإجمالي ${total}.\nحوّل المبلغ بالظبط على وسيلة الدفع اللي اخترتها، وبعدين ارفع صورة إيصال التحويل من صفحة طلبك.\nطلبك دلوقتي: في انتظار تأكيد الدفع.`, 'افتح صفحة الطلب', [m.name, m.number, total, m.link])
        : p(`We received your order ${m.number}`, 'Transfer the amount and upload your receipt on your order page.', `Hi ${m.name},\nWe received order ${m.number} for ${total}.\nPlease transfer the exact amount using the payment method you chose, then upload your transfer receipt on your order page.\nStatus: awaiting payment verification.`, 'Open your order', [m.name, m.number, total, m.link]);
    case 'payment_reminder':
      return ar
        ? p(`طلبك ${m.number} لسه مستني التحويل`, 'لو حوّلت، ارفع الإيصال من صفحة طلبك.', `أهلاً ${m.name}،\nطلبك رقم ${m.number} لسه مستني التحويل بقيمة ${total}.\nلو حوّلت المبلغ، ارفع صورة الإيصال من صفحة طلبك عشان نأكد الدفع ونبدأ التجهيز.\nالطلبات اللي مفيهاش تحويل بتتلغي أوتوماتيك بعد فترة. لو غيّرت رأيك مفيش أي مشكلة.`, 'افتح صفحة الطلب', [m.name, m.number, total, m.link])
        : p(`Your order ${m.number} is still waiting for payment`, 'If you have transferred, upload the receipt on your order page.', `Hi ${m.name},\nOrder ${m.number} is still waiting for a transfer of ${total}.\nIf you have already paid, upload the receipt on your order page so we can verify it and start preparing your order.\nOrders without a transfer are cancelled automatically after a while. If you changed your mind, no problem.`, 'Open your order', [m.name, m.number, total, m.link]);
    case 'proof_rejected':
      return ar
        ? p(`محتاجين إيصال تحويل تاني لطلب ${m.number}`, 'مقدرناش نأكد الدفع — ارفع إيصال جديد.', `أهلاً ${m.name}،\nراجعنا إيصال التحويل لطلب ${m.number} ومقدرناش نأكد الدفع.\nالسبب: ${m.reason ?? ''}\nممكن ترفع إيصال جديد من صفحة طلبك.`, 'ارفع إيصال جديد', [m.name, m.number, m.reason ?? '', m.link])
        : p(`Please resubmit your payment proof for ${m.number}`, 'We could not confirm the payment — upload a new receipt.', `Hi ${m.name},\nWe reviewed the transfer receipt for order ${m.number} and could not confirm the payment.\nReason: ${m.reason ?? ''}\nYou can upload a new receipt on your order page.`, 'Upload a new receipt', [m.name, m.number, m.reason ?? '', m.link]);
    case 'payment_confirmed':
      return ar
        ? p(`تم تأكيد الدفع لطلب ${m.number}`, 'اشتراكك بيتجهز دلوقتي.', `أهلاً ${m.name}،\nتم تأكيد الدفع لطلب ${m.number}، واشتراكك بيتجهز دلوقتي.${due ? `\nهيوصلك في موعد أقصاه ${due} (بتوقيت القاهرة).` : ''}`, 'تابع طلبك', [m.name, m.number, due, m.link], due ? [...orderRows, [L.due, due]] : orderRows)
        : p(`Payment confirmed for ${m.number}`, 'Your subscription is being prepared.', `Hi ${m.name},\nPayment for order ${m.number} is confirmed. Your subscription is being prepared.${due ? `\nExpected by ${due} (Cairo time).` : ''}`, 'Track your order', [m.name, m.number, due, m.link], due ? [...orderRows, [L.due, due]] : orderRows);
    case 'order_delivered':
      return ar
        ? p(`طلبك ${m.number} جاهز`, 'تفاصيل التفعيل في صفحة طلبك الآمنة.', `أهلاً ${m.name}،\nطلبك ${m.number} اتسلّم. تفاصيل التفعيل موجودة في صفحة طلبك الآمنة.`, 'اعرض تفاصيل التفعيل', [m.name, m.number, m.link])
        : p(`Your order ${m.number} is ready`, 'Your activation details are on your private order page.', `Hi ${m.name},\nOrder ${m.number} has been delivered. Your activation details are on your private order page.`, 'View activation details', [m.name, m.number, m.link]);
    case 'item_delivered':
      return ar
        ? p(`جزء من طلبك ${m.number} جاهز`, 'والباقي جاري تجهيزه.', `أهلاً ${m.name}،\nجزء من طلبك ${m.number} اتسلّم، والباقي جاري تجهيزه. التفاصيل في صفحة طلبك الآمنة.`, 'اعرض التفاصيل', [m.name, m.number, m.link])
        : p(`Part of your order ${m.number} is ready`, 'The rest is being prepared.', `Hi ${m.name},\nPart of order ${m.number} has been delivered; the rest is being prepared. Details are on your private order page.`, 'View details', [m.name, m.number, m.link]);
    case 'renewal_reminder':
      return ar
        ? p(`اشتراك ${m.product} قرب يخلص`, 'التجديد بطلب جديد — مفيش خصم أوتوماتيك.', `أهلاً ${m.name}،\nاشتراك ${m.product} من طلب ${m.number} هينتهي يوم ${exp}.\nلو حابب تجدد، اعمل طلب جديد من المتجر. التجديد مش بيتم أوتوماتيك ومفيش خصم من غير طلب منك.`, 'جدّد من المتجر', [m.name, m.product ?? '', exp, m.store_url], [[L.product, m.product ?? ''], [L.order, m.number], [L.ends, exp]])
        : p(`Your ${m.product} subscription ends soon`, 'Renewal needs a new order — nothing is charged automatically.', `Hi ${m.name},\nYour ${m.product} subscription from order ${m.number} ends on ${exp}.\nTo renew, place a new order in the store. Renewals are never automatic and you are never charged without a new order.`, 'Renew in the store', [m.name, m.product ?? '', exp, m.store_url], [[L.product, m.product ?? ''], [L.order, m.number], [L.ends, exp]]);
    case 'support_received':
      return ar
        ? p(`وصلنا رسالتك ${m.number}`, 'هنرد عليك في أقرب وقت.', `أهلاً ${m.name}،\nوصلتنا رسالتك وسجّلناها برقم ${m.number}. هنرد عليك في أقرب وقت.\nلو الموضوع مستعجل وبخصوص طلب، ابعتلنا رقم الطلب على واتساب.`, 'افتح المتجر', [], [[L.ticket, m.number]])
        : p(`We received your message ${m.number}`, 'We will reply as soon as possible.', `Hi ${m.name},\nWe received your message and logged it as ${m.number}. We will reply as soon as possible.\nIf it is urgent and about an order, send us the order number on WhatsApp.`, 'Open the store', [], [[L.ticket, m.number]]);
  }
}

export function renderOwner(event: OwnerEvent, m: MessageContext & { extra?: string }): Rendered {
  const total = formatEGP(m.total_piastres, 'en');
  const rows: Array<[string, string]> = m.number ? [['Order', m.number], ...(m.total_piastres ? ([['Total', total]] as Array<[string, string]>) : [])] : [];
  switch (event) {
    case 'owner_new_order':
      return { subject: `New order ${m.number} — ${total}`, preheader: 'Awaiting transfer.', cta: 'Open in admin', waParams: [], rows, text: `New order ${m.number} from ${m.name} for ${total}. Awaiting transfer.` };
    case 'owner_proof_submitted':
      return { subject: `Payment proof submitted — ${m.number}`, preheader: 'Check your receiving account before approving.', cta: 'Review payment', waParams: [], rows, text: `${m.name} uploaded a transfer receipt for ${m.number} (${total}). Check your receiving account before approving.` };
    case 'owner_delivery_overdue':
      return { subject: `Delivery overdue — ${m.number}`, preheader: 'This order passed its delivery deadline.', cta: 'Deliver now', waParams: [], rows, text: `Order ${m.number} passed its delivery deadline${m.due_at ? ` (${formatInZone(m.due_at, 'en')})` : ''}.` };
    case 'owner_support_request':
      return { subject: `Support request ${m.number}`, preheader: 'A customer needs help.', cta: 'Open support inbox', waParams: [], rows: [], text: m.extra ?? `New support request ${m.number}.` };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#7cc4ff">${u}</a>`);

type Support = { whatsapp?: string; email?: string; facebook?: string; instagram?: string };
type Layout = { lang: 'ar' | 'en'; storeUrl: string; preheader?: string; supportWhatsapp?: string; supportEmail?: string; facebook?: string; instagram?: string };
const httpsUrl = (u?: string) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');

/** Branded email shell. `bodyHtml` must already be escaped/trusted HTML. */
export function emailShell(inner: string, o: Layout): string {
  const ar = o.lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const align = ar ? 'right' : 'left';
  const font = ar ? "Tahoma,'Segoe UI',Arial,sans-serif" : "'Segoe UI',Arial,sans-serif";
  const footer = ar ? 'الرسالة دي من LYnto بخصوص طلبك أو استفسارك. لو مش إنت، تجاهلها.' : 'This message is from LYnto about your order or enquiry. If it is not for you, you can ignore it.';
  const help = ar ? 'محتاج مساعدة؟' : 'Need help?';
  const contact = [o.supportWhatsapp ? `<a href="https://wa.me/${o.supportWhatsapp.replace(/\D/g, '')}" style="color:#7cc4ff">WhatsApp</a>` : '', o.supportEmail ? `<a href="mailto:${esc(o.supportEmail)}" style="color:#7cc4ff">${esc(o.supportEmail)}</a>` : '', `<a href="${o.storeUrl}/support" style="color:#7cc4ff">${ar ? 'صفحة الدعم' : 'Support page'}</a>`].filter(Boolean).join(' · ');
  const links = [
    { url: httpsUrl(o.facebook), name: 'Facebook', icon: 'social-facebook.png' },
    { url: httpsUrl(o.instagram), name: 'Instagram', icon: 'social-instagram.png' },
  ].filter((l) => l.url);
  const social = links.length
    ? `<p style="margin:10px 0 12px">${links.map((l) => `<a href="${esc(l.url)}" style="display:inline-block;margin-${ar ? 'left' : 'right'}:10px;text-decoration:none"><img src="${o.storeUrl}/brand/${l.icon}" alt="${l.name}" width="32" height="32" style="display:block;border:0;border-radius:16px"></a>`).join('')}</p>`
    : '';
  return `<!doctype html><html lang="${o.lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;background:#061326;padding:24px 12px;font-family:${font};color:#F5F8FF">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader ?? '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:580px;background:#0B203A;border:1px solid #1c3a60;border-radius:16px" cellspacing="0" cellpadding="0">
<tr><td style="padding:22px 26px 0;text-align:${align}"><a href="${o.storeUrl}"><img src="${o.storeUrl}/brand/lynto-lockup.png" alt="LYnto" width="140" style="display:block;border:0;height:auto"></a></td></tr>
<tr><td dir="${dir}" style="padding:18px 26px 8px;text-align:${align};font-size:16px;line-height:1.85">${inner}</td></tr>
<tr><td dir="${dir}" style="padding:14px 26px 22px;text-align:${align};border-top:1px solid #1c3a60;font-size:12.5px;line-height:1.8;color:#9FB3D1">
<p style="margin:0 0 6px">${help} ${contact}</p>${social}<p style="margin:0">${esc(footer)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function emailHtml(r: Rendered, link: string, lang: 'ar' | 'en', storeUrl: string, support?: Support): string {
  const para = r.text.split('\n').map((l) => `<p style="margin:0 0 12px">${linkify(l)}</p>`).join('');
  const rows = r.rows.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 16px;background:#0f2a4a;border-radius:12px">${r.rows
        .map(([k, v]) => `<tr><td style="padding:10px 14px;color:#9FB3D1;font-size:13px;width:42%">${esc(k)}</td><td style="padding:10px 14px;font-weight:bold;font-size:15px" dir="auto">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const cta = `<p style="margin:18px 0 10px"><a href="${esc(link)}" style="display:inline-block;background:linear-gradient(90deg,#1a7fe0,#20c7cf);background-color:#168CDD;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:12px;font-weight:bold">${esc(r.cta)}</a></p>`;
  return emailShell(para + rows + cta, { lang, storeUrl, preheader: r.preheader, supportWhatsapp: support?.whatsapp, supportEmail: support?.email, facebook: support?.facebook, instagram: support?.instagram });
}

/** Free-form message composed by the owner (plain text → branded HTML). */
export function composedHtml(body: string, lang: 'ar' | 'en', storeUrl: string, support?: Support): string {
  const blocks = body.trim().split(/\n{2,}/).map((b) => `<p style="margin:0 0 14px">${linkify(b).replace(/\n/g, '<br>')}</p>`).join('');
  return emailShell(blocks, { lang, storeUrl, preheader: body.trim().slice(0, 90), supportWhatsapp: support?.whatsapp, supportEmail: support?.email, facebook: support?.facebook, instagram: support?.instagram });
}

/** Suggested WhatsApp template bodies to create in Meta Business Manager (variables in order). */
export const WHATSAPP_TEMPLATE_GUIDE: Record<Exclude<CustomerEvent, 'support_received'>, { category: string; ar: string; en: string }> = {
  order_received: { category: 'UTILITY', ar: 'أهلاً {{1}}، استلمنا طلبك رقم {{2}} بإجمالي {{3}}. حوّل المبلغ وارفع إيصال التحويل من صفحة طلبك: {{4}} — فريق LYnto', en: 'Hi {{1}}, we received order {{2}} for {{3}}. Transfer the amount and upload your receipt on your order page: {{4}} — LYnto team' },
  payment_reminder: { category: 'UTILITY', ar: 'أهلاً {{1}}، طلبك رقم {{2}} لسه مستني التحويل بقيمة {{3}}. لو حوّلت ارفع الإيصال من هنا: {{4}} — فريق LYnto', en: 'Hi {{1}}, order {{2}} is still waiting for a transfer of {{3}}. If you paid, upload the receipt here: {{4}} — LYnto team' },
  proof_rejected: { category: 'UTILITY', ar: 'أهلاً {{1}}، مقدرناش نأكد الدفع لطلب {{2}}. السبب: {{3}}. ارفع إيصال جديد من: {{4}} — فريق LYnto', en: 'Hi {{1}}, we could not confirm payment for order {{2}}. Reason: {{3}}. Upload a new receipt: {{4}} — LYnto team' },
  payment_confirmed: { category: 'UTILITY', ar: 'أهلاً {{1}}، تم تأكيد الدفع لطلب {{2}} واشتراكك بيتجهز. الموعد المتوقع: {{3}}. تابع طلبك: {{4}} — فريق LYnto', en: 'Hi {{1}}, payment for order {{2}} is confirmed and your subscription is being prepared. Expected by: {{3}}. Track: {{4}} — LYnto team' },
  order_delivered: { category: 'UTILITY', ar: 'أهلاً {{1}}، طلبك {{2}} اتسلّم. تفاصيل التفعيل في صفحة طلبك الآمنة: {{3}} — فريق LYnto', en: 'Hi {{1}}, order {{2}} is delivered. Activation details are on your private order page: {{3}} — LYnto team' },
  item_delivered: { category: 'UTILITY', ar: 'أهلاً {{1}}، جزء من طلبك {{2}} اتسلّم. التفاصيل: {{3}} — فريق LYnto', en: 'Hi {{1}}, part of order {{2}} is delivered. Details: {{3}} — LYnto team' },
  renewal_reminder: { category: 'UTILITY', ar: 'أهلاً {{1}}، اشتراك {{2}} هينتهي يوم {{3}}. لو حابب تجدد اعمل طلب جديد من: {{4}} — فريق LYnto', en: 'Hi {{1}}, your {{2}} subscription ends on {{3}}. To renew, place a new order: {{4}} — LYnto team' },
};
