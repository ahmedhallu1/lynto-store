// Customer/owner notification copy (Egyptian Arabic + English).
// Messages never contain delivery credentials, receipts or bank details — only a link to the private order page.
import { formatEGP } from '../../shared/money';
import { formatInZone } from '../../shared/schedule';

export type CustomerEvent = 'order_received' | 'proof_rejected' | 'payment_confirmed' | 'order_delivered' | 'item_delivered' | 'renewal_reminder';
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

export type Rendered = { subject: string; text: string; cta: string; waParams: string[] };

export function renderCustomer(event: CustomerEvent, m: MessageContext): Rendered {
  const total = formatEGP(m.total_piastres, m.lang);
  const due = m.due_at ? formatInZone(m.due_at, m.lang) : '';
  const exp = m.expires_at ? formatInZone(m.expires_at, m.lang, 'Africa/Cairo', false) : '';
  const ar = m.lang === 'ar';
  switch (event) {
    case 'order_received':
      return ar
        ? { subject: `استلمنا طلبك ${m.number}`, cta: 'افتح صفحة الطلب', waParams: [m.name, m.number, total, m.link],
            text: `أهلاً ${m.name}،\nاستلمنا طلبك رقم ${m.number} بإجمالي ${total}.\nحوّل المبلغ بالظبط على وسيلة الدفع اللي اخترتها، وبعدين ارفع صورة إيصال التحويل من صفحة طلبك.\nطلبك دلوقتي: في انتظار تأكيد الدفع.` }
        : { subject: `We received your order ${m.number}`, cta: 'Open your order', waParams: [m.name, m.number, total, m.link],
            text: `Hi ${m.name},\nWe received order ${m.number} for ${total}.\nPlease transfer the exact amount using the payment method you chose, then upload your transfer receipt on your order page.\nStatus: awaiting payment verification.` };
    case 'proof_rejected':
      return ar
        ? { subject: `محتاجين إيصال تحويل تاني لطلب ${m.number}`, cta: 'ارفع إيصال جديد', waParams: [m.name, m.number, m.reason ?? '', m.link],
            text: `أهلاً ${m.name}،\nراجعنا إيصال التحويل لطلب ${m.number} ومقدرناش نأكد الدفع.\nالسبب: ${m.reason ?? ''}\nممكن ترفع إيصال جديد من صفحة طلبك.` }
        : { subject: `Please resubmit your payment proof for ${m.number}`, cta: 'Upload a new receipt', waParams: [m.name, m.number, m.reason ?? '', m.link],
            text: `Hi ${m.name},\nWe reviewed the transfer receipt for order ${m.number} and could not confirm the payment.\nReason: ${m.reason ?? ''}\nYou can upload a new receipt on your order page.` };
    case 'payment_confirmed':
      return ar
        ? { subject: `تم تأكيد الدفع لطلب ${m.number}`, cta: 'تابع طلبك', waParams: [m.name, m.number, due, m.link],
            text: `أهلاً ${m.name}،\nتم تأكيد الدفع لطلب ${m.number}، واشتراكك بيتجهز دلوقتي.${due ? `\nهيوصلك في موعد أقصاه ${due} (بتوقيت القاهرة).` : ''}` }
        : { subject: `Payment confirmed for ${m.number}`, cta: 'Track your order', waParams: [m.name, m.number, due, m.link],
            text: `Hi ${m.name},\nPayment for order ${m.number} is confirmed. Your subscription is being prepared.${due ? `\nExpected by ${due} (Cairo time).` : ''}` };
    case 'order_delivered':
      return ar
        ? { subject: `طلبك ${m.number} جاهز`, cta: 'اعرض تفاصيل التفعيل', waParams: [m.name, m.number, m.link],
            text: `أهلاً ${m.name}،\nطلبك ${m.number} اتسلّم. تفاصيل التفعيل موجودة في صفحة طلبك الآمنة.` }
        : { subject: `Your order ${m.number} is ready`, cta: 'View activation details', waParams: [m.name, m.number, m.link],
            text: `Hi ${m.name},\nOrder ${m.number} has been delivered. Your activation details are on your private order page.` };
    case 'item_delivered':
      return ar
        ? { subject: `جزء من طلبك ${m.number} جاهز`, cta: 'اعرض التفاصيل', waParams: [m.name, m.number, m.link],
            text: `أهلاً ${m.name}،\nجزء من طلبك ${m.number} اتسلّم، والباقي جاري تجهيزه. التفاصيل في صفحة طلبك الآمنة.` }
        : { subject: `Part of your order ${m.number} is ready`, cta: 'View details', waParams: [m.name, m.number, m.link],
            text: `Hi ${m.name},\nPart of order ${m.number} has been delivered; the rest is being prepared. Details are on your private order page.` };
    case 'renewal_reminder':
      return ar
        ? { subject: `اشتراك ${m.product} قرب يخلص`, cta: 'جدّد من المتجر', waParams: [m.name, m.product ?? '', exp, m.store_url],
            text: `أهلاً ${m.name}،\nاشتراك ${m.product} من طلب ${m.number} هينتهي يوم ${exp}.\nلو حابب تجدد، اعمل طلب جديد من المتجر. التجديد مش بيتم أوتوماتيك ومفيش خصم من غير طلب منك.` }
        : { subject: `Your ${m.product} subscription ends soon`, cta: 'Renew in the store', waParams: [m.name, m.product ?? '', exp, m.store_url],
            text: `Hi ${m.name},\nYour ${m.product} subscription from order ${m.number} ends on ${exp}.\nTo renew, place a new order in the store. Renewals are never automatic and you are never charged without a new order.` };
  }
}

export function renderOwner(event: OwnerEvent, m: MessageContext & { extra?: string }): Rendered {
  const total = formatEGP(m.total_piastres, 'en');
  switch (event) {
    case 'owner_new_order':
      return { subject: `New order ${m.number} — ${total}`, cta: 'Open in admin', waParams: [], text: `New order ${m.number} from ${m.name} for ${total}. Awaiting transfer.` };
    case 'owner_proof_submitted':
      return { subject: `Payment proof submitted — ${m.number}`, cta: 'Review payment', waParams: [], text: `${m.name} uploaded a transfer receipt for ${m.number} (${total}). Check your receiving account before approving.` };
    case 'owner_delivery_overdue':
      return { subject: `Delivery overdue — ${m.number}`, cta: 'Deliver now', waParams: [], text: `Order ${m.number} passed its delivery deadline${m.due_at ? ` (${formatInZone(m.due_at, 'en')})` : ''}.` };
    case 'owner_support_request':
      return { subject: `Support request ${m.number}`, cta: 'Open support inbox', waParams: [], text: m.extra ?? `New support request ${m.number}.` };
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function emailHtml(r: Rendered, link: string, lang: 'ar' | 'en', storeUrl: string): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const body = r.text.split('\n').map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('');
  const footer = lang === 'ar' ? 'الرسالة دي اتبعتت بخصوص طلبك من LYnto. لو مش إنت اللي طلبت، تجاهلها.' : 'You received this message about your LYnto order. If you did not place it, you can ignore this email.';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#061326;padding:24px;font-family:Tahoma,Arial,sans-serif;color:#F5F8FF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:#0B203A;border-radius:14px;padding:28px" cellspacing="0" cellpadding="0"><tr><td dir="${dir}" style="text-align:${lang === 'ar' ? 'right' : 'left'};font-size:15px;line-height:1.7">
<img src="${storeUrl}/brand/lynto-lockup.png" alt="LYnto" width="150" style="display:block;margin:0 0 20px">
${body}
<p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#168CDD;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">${esc(r.cta)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#9FB3D1">${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Suggested WhatsApp template bodies to create in Meta Business Manager (variables in order). */
export const WHATSAPP_TEMPLATE_GUIDE: Record<CustomerEvent, { category: string; ar: string; en: string }> = {
  order_received: { category: 'UTILITY', ar: 'أهلاً {{1}}، استلمنا طلبك رقم {{2}} بإجمالي {{3}}. حوّل المبلغ وارفع إيصال التحويل من صفحة طلبك: {{4}}', en: 'Hi {{1}}, we received order {{2}} for {{3}}. Transfer the amount and upload your receipt on your order page: {{4}}' },
  proof_rejected: { category: 'UTILITY', ar: 'أهلاً {{1}}، مقدرناش نأكد الدفع لطلب {{2}}. السبب: {{3}}. ارفع إيصال جديد من: {{4}}', en: 'Hi {{1}}, we could not confirm payment for order {{2}}. Reason: {{3}}. Upload a new receipt: {{4}}' },
  payment_confirmed: { category: 'UTILITY', ar: 'أهلاً {{1}}، تم تأكيد الدفع لطلب {{2}} واشتراكك بيتجهز. الموعد المتوقع: {{3}}. تابع طلبك: {{4}}', en: 'Hi {{1}}, payment for order {{2}} is confirmed and your subscription is being prepared. Expected by: {{3}}. Track: {{4}}' },
  order_delivered: { category: 'UTILITY', ar: 'أهلاً {{1}}، طلبك {{2}} اتسلّم. تفاصيل التفعيل في صفحة طلبك الآمنة: {{3}}', en: 'Hi {{1}}, order {{2}} is delivered. Activation details are on your private order page: {{3}}' },
  item_delivered: { category: 'UTILITY', ar: 'أهلاً {{1}}، جزء من طلبك {{2}} اتسلّم. التفاصيل: {{3}}', en: 'Hi {{1}}, part of order {{2}} is delivered. Details: {{3}}' },
  renewal_reminder: { category: 'UTILITY', ar: 'أهلاً {{1}}، اشتراك {{2}} هينتهي يوم {{3}}. لو حابب تجدد اعمل طلب جديد من: {{4}}', en: 'Hi {{1}}, your {{2}} subscription ends on {{3}}. To renew, place a new order: {{4}}' },
};
