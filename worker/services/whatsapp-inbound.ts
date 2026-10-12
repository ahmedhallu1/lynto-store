// Inbound WhatsApp handling: menu, product browsing, order tracking, support/deletion/request Flows, opt-out.
// All replies are sent inside the customer-service window opened by the customer's own message (free-form messages).
// No payment confirmation, price change or refund is ever decided here — Flows only create tickets / read order status.
import type { Env } from '../env';
import type { BusinessSettings } from '../../shared/types';
import { loadSettings } from '../lib/settings';
import { baseUrl, now, rateLimit } from '../lib/util';
import { formatEGP } from '../../shared/money';
import { formatInZone } from '../../shared/schedule';
import { FLOW_DEFS, type FlowKind } from './flows';
import { syncApprovedTemplates, waSend } from './whatsapp';
import { createSupportRequest } from './support';
import { dispatchPending } from './notifications';

type Lang = 'ar' | 'en';
type Msg = {
  id: string; from: string; name: string; type: string; text: string;
  buttonId?: string; listId?: string; flow?: { token: string; data: Record<string, any> };
};

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const OPT_OUT = new Set(['stop', 'unsubscribe', 'cancel', 'optout', 'opt out', 'ايقاف', 'إيقاف', 'وقف', 'الغاء', 'إلغاء', 'الغاء الاشتراك', 'إلغاء الاشتراك']);
const ORDER_RE = /\bLY-[A-HJ-NP-Z2-9]{6}\b/i;
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function parseInbound(payload: any, phoneNumberId: string): { messages: Msg[]; templateUpdate: boolean } {
  const out: Msg[] = [];
  let templateUpdate = false;
  for (const entry of payload?.entry ?? []) {
    for (const ch of entry?.changes ?? []) {
      if (ch?.field === 'message_template_status_update') templateUpdate = true;
      const v = ch?.value;
      if (!v?.messages?.length) continue;
      if (phoneNumberId && v?.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== String(phoneNumberId)) continue;
      const name = v?.contacts?.[0]?.profile?.name ?? '';
      for (const m of v.messages) {
        const msg: Msg = { id: String(m.id), from: String(m.from), name, type: String(m.type), text: '' };
        if (m.type === 'text') msg.text = String(m.text?.body ?? '');
        else if (m.type === 'button') { msg.text = String(m.button?.text ?? ''); }
        else if (m.type === 'interactive') {
          const i = m.interactive ?? {};
          if (i.type === 'button_reply') { msg.buttonId = String(i.button_reply?.id ?? ''); msg.text = String(i.button_reply?.title ?? ''); }
          else if (i.type === 'list_reply') { msg.listId = String(i.list_reply?.id ?? ''); msg.text = String(i.list_reply?.title ?? ''); }
          else if (i.type === 'nfm_reply') {
            let data: Record<string, any> = {};
            try { data = JSON.parse(i.nfm_reply?.response_json ?? '{}'); } catch { /* ignore */ }
            msg.flow = { token: String(data.flow_token ?? ''), data };
          }
        }
        out.push(msg);
      }
    }
  }
  return { messages: out, templateUpdate };
}

const STATUS_AR: Record<string, string> = {
  awaiting_transfer: 'في انتظار التحويل', proof_submitted: 'الإيصال اترفع وبيتراجع', verified: 'تم تأكيد الدفع', rejected: 'محتاجين إيصال تاني',
  cancelled: 'ملغي', refund_requested: 'طلب استرجاع قيد المراجعة', refunded: 'تم الاسترجاع',
};
const FUL_AR: Record<string, string> = { not_started: 'هيبدأ بعد تأكيد الدفع', processing: 'جاري التجهيز', partially_delivered: 'اتسلّم جزء منه', delivered: 'اتسلّم', cancelled: 'ملغي' };
const STATUS_EN: Record<string, string> = {
  awaiting_transfer: 'Awaiting transfer', proof_submitted: 'Receipt uploaded, under review', verified: 'Payment confirmed', rejected: 'New receipt needed',
  cancelled: 'Cancelled', refund_requested: 'Refund under review', refunded: 'Refunded',
};
const FUL_EN: Record<string, string> = { not_started: 'Starts after payment', processing: 'Being prepared', partially_delivered: 'Partially delivered', delivered: 'Delivered', cancelled: 'Cancelled' };

class Ctx {
  constructor(public env: Env, public s: BusinessSettings, public m: Msg, public lang: Lang) {}
  t(ar: string, en: string) { return this.lang === 'ar' ? ar : en; }
  text(body: string) { return waSend(this.env, this.s, this.m.from, { type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }); }
  buttons(body: string, buttons: Array<{ id: string; title: string }>) {
    return waSend(this.env, this.s, this.m.from, { type: 'interactive', interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: trunc(b.title, 20) } })) } } });
  }
  list(body: string, button: string, rows: Array<{ id: string; title: string; description?: string }>, title = '') {
    return waSend(this.env, this.s, this.m.from, { type: 'interactive', interactive: { type: 'list', body: { text: body.slice(0, 1024) }, footer: { text: 'LYnto' },
      action: { button: trunc(button, 20), sections: [{ title: trunc(title || 'LYnto', 24), rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: trunc(r.title, 24), ...(r.description ? { description: trunc(r.description, 72) } : {}) })) }] } } });
  }
  async flow(kind: FlowKind) {
    const id = this.s.notifications.whatsapp_flows[kind];
    const def = FLOW_DEFS[kind];
    if (!id) return false;
    const r = await waSend(this.env, this.s, this.m.from, { type: 'interactive', interactive: { type: 'flow', body: { text: def.body_ar }, footer: { text: 'LYnto' },
      action: { name: 'flow', parameters: { flow_message_version: '3', flow_token: `lynto:${kind}:${this.m.id.slice(-8)}`, flow_id: id, flow_cta: def.cta, flow_action: 'navigate', flow_action_payload: { screen: def.screen } } } } });
    return r.ok;
  }
}

async function menu(c: Ctx) {
  const hasFlows = !!c.s.notifications.whatsapp_flows.track || !!c.s.notifications.whatsapp_flows.support;
  void hasFlows;
  await c.buttons(
    c.t('أهلاً بيك في LYnto 👋\nاشتراكات وكروت رقمية بتسليم خلال ساعتين.\nتحب نساعدك في إيه؟', 'Welcome to LYnto 👋\nDigital subscriptions and cards, delivered within two hours.\nHow can we help?'),
    [{ id: 'menu_browse', title: c.t('تصفّح المنتجات', 'Browse products') }, { id: 'menu_track', title: c.t('تتبع طلبي', 'Track my order') }, { id: 'menu_support', title: c.t('كلّمنا', 'Contact us') }],
  );
}

async function humanLine(c: Ctx) {
  const wa = c.s.support.whatsapp.replace(/\D/g, '');
  return wa ? c.t(`\nلو مستعجل كلّمنا مباشرة: https://wa.me/${wa}`, `\nIf it is urgent, chat with us directly: https://wa.me/${wa}`) : '';
}

async function browse(c: Ctx) {
  const rows = (await c.env.DB.prepare(`SELECT cat.slug, cat.name_ar, cat.name_en, COUNT(DISTINCT p.id) AS n FROM categories cat
    JOIN products p ON p.category_id = cat.id AND p.status = 'published' AND p.supply_status = 'validated'
    JOIN plans pl ON pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres IS NOT NULL
    GROUP BY cat.id ORDER BY cat.sort`).all<any>()).results;
  if (!rows.length) { await c.text(c.t('المنتجات هتتنشر قريب. تابعنا على lynto.store', 'Products are coming soon at lynto.store')); return; }
  await c.list(c.t('اختار القسم:', 'Choose a category:'), c.t('الأقسام', 'Categories'), rows.map((r) => ({ id: `cat:${r.slug}`, title: c.lang === 'ar' ? r.name_ar : r.name_en, description: c.t(`${r.n} منتج`, `${r.n} products`) })), c.t('الأقسام', 'Categories'));
}

async function category(c: Ctx, slug: string) {
  const cat = await c.env.DB.prepare('SELECT id, name_ar, name_en FROM categories WHERE slug = ?').bind(slug).first<any>();
  if (!cat) return menu(c);
  const rows = (await c.env.DB.prepare(`SELECT p.slug, p.title_ar, p.title_en, MIN(pl.price_piastres) AS minp FROM products p
    JOIN plans pl ON pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres IS NOT NULL AND pl.availability = 'available'
    WHERE p.category_id = ? AND p.status = 'published' AND p.supply_status = 'validated'
    GROUP BY p.id ORDER BY p.featured DESC, p.sort LIMIT 9`).bind(cat.id).all<any>()).results;
  const items = rows.map((r) => ({ id: `p:${r.slug}`, title: c.lang === 'ar' ? r.title_ar : r.title_en, description: c.t(`يبدأ من ${formatEGP(r.minp, 'ar')}`, `From ${formatEGP(r.minp, 'en')}`) }));
  items.push({ id: `all:${slug}`, title: c.t('كل المنتجات على الموقع', 'See all on the website'), description: 'lynto.store' });
  await c.list(c.t(`اختار منتج من ${cat.name_ar}:`, `Pick a product from ${cat.name_en}:`), c.t('المنتجات', 'Products'), items, c.lang === 'ar' ? cat.name_ar : cat.name_en);
}

async function product(c: Ctx, slug: string) {
  const p = await c.env.DB.prepare(`SELECT p.slug, p.title_ar, p.title_en, p.summary_ar, p.summary_en, MIN(pl.price_piastres) AS minp, COUNT(pl.id) AS plans FROM products p
    JOIN plans pl ON pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres IS NOT NULL AND pl.availability = 'available'
    WHERE p.slug = ? AND p.status = 'published' AND p.supply_status = 'validated' GROUP BY p.id`).bind(slug).first<any>();
  const store = baseUrl(c.env);
  if (!p) { await c.text(c.t('المنتج ده مش متاح دلوقتي.', 'This product is not available right now.')); return; }
  const title = c.lang === 'ar' ? p.title_ar : p.title_en;
  const summary = c.lang === 'ar' ? p.summary_ar : p.summary_en;
  const url = `${store}${c.lang === 'en' ? '/en' : ''}/p/${p.slug}`;
  const body = `*${title}*\n${summary}\n${c.t(`يبدأ من ${formatEGP(p.minp, 'ar')} — ${p.plans} باقة`, `From ${formatEGP(p.minp, 'en')} — ${p.plans} plan(s)`)}`;
  const header = await imageHeader(c.env, `${store}/catalog/${p.slug}.jpg`);
  await waSend(c.env, c.s, c.m.from, { type: 'interactive', interactive: { type: 'cta_url', ...(header ? { header } : {}), body: { text: body.slice(0, 1024) }, footer: { text: 'LYnto' },
    action: { name: 'cta_url', parameters: { display_text: c.t('افتح المنتج', 'Open product'), url } } } });
}

async function imageHeader(env: Env, url: string) {
  try {
    const r = await env.ASSETS.fetch(new Request(url, { method: 'HEAD' }));
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) return { type: 'image', image: { link: url } };
  } catch { /* no image */ }
  return null;
}

async function orderStatus(c: Ctx, number: string, email?: string) {
  const o = await c.env.DB.prepare('SELECT * FROM orders WHERE number = ? AND anonymized_at IS NULL').bind(number.toUpperCase()).first<any>();
  const fromDigits = c.m.from.replace(/\D/g, '');
  const verified = !!o && (String(o.customer_whatsapp).replace(/\D/g, '') === fromDigits || (!!email && String(o.customer_email).toLowerCase() === email.trim().toLowerCase()));
  if (!o || !verified) {
    await c.text(c.t('مقدرناش نتحقق من الطلب ده من الرقم أو الإيميل ده. اتأكد من رقم الطلب (LY-XXXXXX) وإنك بتسأل من نفس الرقم اللي استخدمته في الطلب، أو اكتب الإيميل.' + (await humanLine(c)),
      'We could not verify this order from this number/email. Check the order number (LY-XXXXXX) and that you are writing from the number used for the order, or add the email.' + (await humanLine(c))));
    return;
  }
  const items = (await c.env.DB.prepare('SELECT product_title_ar, product_title_en, plan_name_ar, plan_name_en, qty, fulfillment_status FROM order_items WHERE order_id = ? ORDER BY sort').bind(o.id).all<any>()).results;
  const lines = items.map((i) => `• ${c.lang === 'ar' ? i.product_title_ar : i.product_title_en} — ${c.lang === 'ar' ? i.plan_name_ar : i.plan_name_en} ×${i.qty}: ${(c.lang === 'ar' ? FUL_AR : FUL_EN)[i.fulfillment_status] ?? i.fulfillment_status}`);
  const due = o.delivery_due_at && o.payment_status === 'verified' && o.fulfillment_status !== 'delivered' ? formatInZone(o.delivery_due_at, c.lang) : '';
  await c.text([
    c.t(`طلب *${o.number}*`, `Order *${o.number}*`),
    c.t(`الدفع: ${STATUS_AR[o.payment_status] ?? o.payment_status}`, `Payment: ${STATUS_EN[o.payment_status] ?? o.payment_status}`),
    c.t(`التسليم: ${FUL_AR[o.fulfillment_status] ?? o.fulfillment_status}`, `Delivery: ${FUL_EN[o.fulfillment_status] ?? o.fulfillment_status}`),
    ...(due ? [c.t(`الموعد المتوقع: ${due} (توقيت القاهرة)`, `Expected by: ${due} (Cairo time)`)] : []),
    ...lines,
    c.t('تفاصيل التفعيل بتظهر في صفحة طلبك الخاصة (الرابط اللي وصلك).', 'Activation details appear on your private order page (the link you received).'),
  ].join('\n'));
}

async function handleFlow(c: Ctx) {
  const d = c.m.flow!.data;
  const kind = String(d.kind ?? c.m.flow!.token.split(':')[1] ?? '') as FlowKind;
  const num = String(d.order_number ?? '').trim().toUpperCase();
  const orderNo = ORDER_RE.test(num) ? num.match(ORDER_RE)![0].toUpperCase() : '';
  if (kind === 'track') {
    if (!orderNo) { await c.text(c.t('رقم الطلب مش مظبوط. شكله LY-K7M2QX.', 'The order number looks wrong. It should look like LY-K7M2QX.')); return; }
    await orderStatus(c, orderNo, String(d.email ?? ''));
    return;
  }
  const lookup = orderNo ? await c.env.DB.prepare('SELECT id, customer_whatsapp FROM orders WHERE number = ? AND anonymized_at IS NULL').bind(orderNo).first<any>() : null;
  const verified = !!lookup && String(lookup.customer_whatsapp).replace(/\D/g, '') === c.m.from.replace(/\D/g, '');
  let topic = 'other', message = '';
  if (kind === 'support') {
    topic = ['order', 'payment', 'activation', 'replacement', 'refund', 'other'].includes(String(d.topic)) ? String(d.topic) : 'other';
    message = String(d.message ?? '').trim();
  } else if (kind === 'deletion') {
    topic = 'deletion';
    message = `Data deletion request via WhatsApp Flow. Sender number: +${c.m.from}.${orderNo ? ` Order: ${orderNo}.` : ''} Confirmed ownership: ${JSON.stringify(d.confirm ?? [])}.`;
  } else if (kind === 'request') {
    topic = 'other';
    message = `Product request via WhatsApp — ${String(d.category ?? '')}: ${String(d.product ?? '')}. ${String(d.details ?? '')}`.trim();
  } else { await menu(c); return; }
  if (message.length < 3) { await c.text(c.t('الرسالة فاضية. جرّب تاني.', 'The message was empty. Please try again.')); return; }
  const { number } = await createSupportRequest(c.env, c.s, {
    name: c.m.name || 'WhatsApp', contact: `+${c.m.from}`, topic, message, lang: c.lang,
    order_id: lookup?.id ?? null, order_verified: verified, via: 'whatsapp',
  });
  await c.text(c.t(`وصلنا طلبك وسجّلناه برقم *${number}*. هنرد عليك في أقرب وقت.${kind === 'deletion' ? '\nهنراجع الطلب ونأكد معاك قبل المسح.' : ''}`,
    `We received your request and logged it as *${number}*. We will reply as soon as possible.${kind === 'deletion' ? '\nWe will review it and confirm with you before deleting.' : ''}`) + (await humanLine(c)));
}

async function handleOne(env: Env, s: BusinessSettings, m: Msg) {
  const probe = m.text.replace(ORDER_RE, '');
  const lang: Lang = probe && !hasArabic(probe) && /[A-Za-z]{3,}/.test(probe) && !m.buttonId && !m.listId && !m.flow ? 'en' : 'ar';
  const c = new Ctx(env, s, m, lang);

  if (m.flow) return handleFlow(c);

  if (m.listId) {
    if (m.listId.startsWith('cat:')) return category(c, m.listId.slice(4));
    if (m.listId.startsWith('p:')) return product(c, m.listId.slice(2));
    if (m.listId.startsWith('all:')) { await c.text(`${baseUrl(env)}/c/${m.listId.slice(4)}`); return; }
  }
  if (m.buttonId) {
    if (m.buttonId === 'menu_browse') return browse(c);
    if (m.buttonId === 'menu_track') { if (!(await c.flow('track'))) await c.text(c.t('ابعت رقم طلبك (زي LY-K7M2QX) ونقولك وصل لفين.', 'Send your order number (like LY-K7M2QX) and we will tell you where it is.')); return; }
    if (m.buttonId === 'menu_support') { if (!(await c.flow('support'))) await c.text(c.t('اكتب مشكلتك هنا وإحنا هنتواصل معاك.' + (await humanLine(c)), 'Write your issue here and we will get back to you.' + (await humanLine(c)))); return; }
  }

  const raw = m.text.trim();
  const norm = raw.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  if (OPT_OUT.has(norm)) {
    await env.DB.prepare(`UPDATE orders SET whatsapp_optin = 0, renewal_optin = 0 WHERE customer_whatsapp = ?`).bind(`+${m.from}`).run();
    await c.text(c.t('تمام، وقّفنا رسائل الواتساب الأوتوماتيك عن رقمك. ممكن تتواصل معانا في أي وقت.', 'Done — we stopped automatic WhatsApp updates for your number. You can message us any time.'));
    return;
  }
  const mo = raw.match(ORDER_RE);
  if (mo) return orderStatus(c, mo[0]);
  if (/^(منتجات|المنتجات|products|shop|store|متجر)$/i.test(norm)) return browse(c);
  // Greeting / anything else: show the menu (at most once every 10 minutes per sender)
  if (await rateLimit(env, `wa-menu:${m.from}`, 1, 10 * 60_000)) return menu(c);
}

export async function handleWhatsAppWebhook(env: Env, payload: any) {
  const s = await loadSettings(env);
  const n = s.notifications;
  const { messages, templateUpdate } = parseInbound(payload, n.whatsapp_phone_number_id);
  if (templateUpdate && n.whatsapp_waba_id) {
    await syncApprovedTemplates(env, 'system:webhook').catch(() => null);
  }
  if (!messages.length || !n.whatsapp_autoreply) return;
  const t = now();
  for (const m of messages) {
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO wa_inbound (message_id, created_at) VALUES (?, ?)').bind(m.id, t).run();
    if (ins.meta.changes !== 1) continue; // already processed (Meta retry)
    if (!(await rateLimit(env, `wa-in:${m.from}`, 25, 3600_000))) continue;
    try { await handleOne(env, s, m); } catch (e: any) { console.error(JSON.stringify({ level: 'error', job: 'wa_inbound', message: String(e?.message ?? e).slice(0, 200) })); }
  }
  await dispatchPending(env).catch(() => null);
}
