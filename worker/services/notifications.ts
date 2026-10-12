import type { Env } from '../env';
import type { BusinessSettings } from '../../shared/types';
import { getSecret, loadSettings } from '../lib/settings';
import { decryptText, newId } from '../lib/crypto';
import { baseUrl, isProd, now } from '../lib/util';
import { emailHtml, renderCustomer, renderOwner, type CustomerEvent, type NotificationEvent, type OwnerEvent } from './messages';

export type Channel = 'email' | 'whatsapp' | 'manual';
const BACKOFF_MIN = [1, 5, 15, 60, 180];
const MAX_ATTEMPTS = 5;

class PermanentError extends Error {}
class RetryableError extends Error {}

function providerBase(env: Env, real: string) {
  return !isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE.replace(/\/$/, '') : real;
}

export type ChannelHealth = { email: { usable: boolean; provider: string; reason: string }; whatsapp: { usable: boolean; reason: string } };

export async function channelHealth(env: Env, s: BusinessSettings): Promise<ChannelHealth> {
  const n = s.notifications;
  let email = { usable: false, provider: n.email_provider, reason: 'No email provider selected.' };
  if (n.email_provider !== 'none') {
    if (!n.from_email) email = { ...email, reason: 'Sender address (from email) is missing.' };
    else if (n.email_provider === 'cloudflare') email = env.EMAIL ? { usable: true, provider: 'cloudflare', reason: 'Cloudflare Email Service binding present.' } : { ...email, reason: 'Cloudflare Email Service binding is not configured on this Worker (requires Workers Paid + domain onboarding).' };
    else if (n.email_provider === 'resend') email = (await getSecret(env, 'resend_api_key')) ? { usable: true, provider: 'resend', reason: 'Resend API key stored.' } : { ...email, reason: 'Resend API key is missing.' };
  }
  let whatsapp = { usable: false, reason: 'WhatsApp Cloud API is disabled.' };
  if (n.whatsapp_enabled) {
    if (!n.whatsapp_phone_number_id) whatsapp.reason = 'Phone number ID is missing.';
    else if (!(await getSecret(env, 'whatsapp_access_token'))) whatsapp.reason = 'Access token is missing.';
    else whatsapp = { usable: true, reason: 'Configured. Messages also need approved templates per event.' };
  }
  return { email, whatsapp };
}

export type OrderForNotify = {
  id: string; number: string; lang: string; customer_name: string; customer_email: string; customer_whatsapp: string;
  preferred_channel: string; whatsapp_optin: number; total_piastres: number; access_enc: string; delivery_due_at: number | null;
};

/** Decide which channels a customer event should use. Missing integrations => honest manual mode. */
export async function planCustomerChannels(env: Env, s: BusinessSettings, order: OrderForNotify, event: CustomerEvent): Promise<Channel[]> {
  const h = await channelHealth(env, s);
  const ch: Channel[] = [];
  if (h.email.usable && order.customer_email) ch.push('email');
  const tpl = s.notifications.whatsapp_templates[event];
  if (h.whatsapp.usable && order.whatsapp_optin && tpl?.name) ch.push('whatsapp');
  if ((order.preferred_channel === 'whatsapp' && !ch.includes('whatsapp')) || ch.length === 0) ch.push('manual');
  return ch;
}

/** Support acknowledgements: email only, and only when the contact is an email address and sending works. */
export async function planSupportChannels(env: Env, s: BusinessSettings, contact: string): Promise<Channel[]> {
  const h = await channelHealth(env, s);
  return h.email.usable && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(contact.trim()) ? ['email'] : [];
}

/** Build INSERT OR IGNORE statements for notifications. `guardSql` makes the insert conditional (atomic with the action). */
export function notificationStmts(
  env: Env,
  args: { orderId: string | null; audience: 'customer' | 'owner'; event: NotificationEvent; channels: Channel[]; recipientFor: (c: Channel) => string; dedupeBase: string; payload?: unknown },
  guard?: { sql: string; params: unknown[] },
) {
  const t = now();
  return args.channels.map((c) => {
    const status = c === 'manual' ? 'manual_action_required' : 'pending';
    const cols = '(id, order_id, audience, event, channel, recipient, status, payload, dedupe_key, next_attempt_at, created_at, updated_at)';
    const vals = [newId('ntf'), args.orderId, args.audience, args.event, c, args.recipientFor(c), status, JSON.stringify(args.payload ?? {}), `${args.dedupeBase}:${c}`, t, t, t];
    if (guard) return env.DB.prepare(`INSERT OR IGNORE INTO notifications ${cols} SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(...vals, ...guard.params);
    return env.DB.prepare(`INSERT OR IGNORE INTO notifications ${cols} VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...vals);
  });
}

export async function ownerAlertStmts(env: Env, s: BusinessSettings, orderId: string | null, event: OwnerEvent, dedupeBase: string, payload: unknown = {}, guard?: { sql: string; params: unknown[] }) {
  const h = await channelHealth(env, s);
  if (!h.email.usable || !s.notifications.owner_alert_email) return [];
  return notificationStmts(env, { orderId, audience: 'owner', event, channels: ['email'], recipientFor: () => s.notifications.owner_alert_email, dedupeBase, payload }, guard);
}

export function recipientFor(order: OrderForNotify) {
  return (c: Channel) => (c === 'email' ? order.customer_email : order.customer_whatsapp);
}

export async function orderLink(env: Env, order: { number: string; access_enc: string }) {
  const token = await decryptText(env.DATA_KEY, order.access_enc, 'order-access:' + order.number);
  return `${baseUrl(env)}/order/${order.number}#k=${token}`;
}

type NotificationRow = {
  id: string; order_id: string | null; audience: 'customer' | 'owner'; event: NotificationEvent; channel: Channel; recipient: string;
  status: string; attempts: number; payload: string;
};

export type SendOpts = { from?: string; fromName?: string; replyTo?: string };

export async function sendEmail(env: Env, s: BusinessSettings, to: string, subject: string, html: string, text: string, idem: string, opts: SendOpts = {}): Promise<{ provider: string; id: string | null }> {
  const n = s.notifications;
  const addr = opts.from ?? n.from_email;
  const name = opts.fromName ?? n.from_name;
  const replyTo = opts.replyTo ?? n.reply_to;
  if (n.email_provider === 'cloudflare') {
    if (!env.EMAIL) throw new PermanentError('Cloudflare Email binding missing');
    try {
      const res: any = await env.EMAIL.send({ to, from: addr, subject, html, text, ...(replyTo ? { replyTo } : {}) });
      return { provider: 'cloudflare', id: res?.messageId ?? res?.id ?? null };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/rate|timeout|temporar|5\d\d/i.test(msg)) throw new RetryableError(msg);
      throw new PermanentError(msg);
    }
  }
  if (n.email_provider === 'resend') {
    const key = await getSecret(env, 'resend_api_key');
    if (!key) throw new PermanentError('Resend API key missing');
    const from = name ? `${name.replace(/[<>"]/g, '')} <${addr}>` : addr;
    const res = await fetch(providerBase(env, 'https://api.resend.com') + '/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': idem },
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) return { provider: 'resend', id: body?.id ?? null };
    const msg = `Resend ${res.status}: ${body?.message ?? body?.name ?? 'error'}`;
    if (res.status === 429 || res.status >= 500) throw new RetryableError(msg);
    throw new PermanentError(msg);
  }
  throw new PermanentError('No email provider configured');
}

async function sendWhatsApp(env: Env, s: BusinessSettings, to: string, event: CustomerEvent, params: string[]): Promise<{ provider: string; id: string | null }> {
  const n = s.notifications;
  const token = await getSecret(env, 'whatsapp_access_token');
  const tpl = n.whatsapp_templates[event];
  if (!token || !n.whatsapp_phone_number_id || !tpl?.name) throw new PermanentError('WhatsApp not configured for this event');
  const url = `${providerBase(env, 'https://graph.facebook.com')}/${n.whatsapp_api_version}/${n.whatsapp_phone_number_id}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'template',
      template: { name: tpl.name, language: { code: tpl.language || 'ar_EG' }, components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: (p.replace(/\s+/g, ' ').trim() || '-').slice(0, 900) })) }] },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (res.ok && body?.messages?.[0]?.id) return { provider: 'whatsapp_cloud', id: body.messages[0].id };
  const msg = `WhatsApp ${res.status}: ${body?.error?.message ?? 'error'}`;
  if (res.status === 429 || res.status >= 500) throw new RetryableError(msg);
  throw new PermanentError(msg);
}

async function deliverOne(env: Env, s: BusinessSettings, row: NotificationRow) {
  const payload = JSON.parse(row.payload || '{}');
  const store = baseUrl(env);
  let order: any = null;
  if (row.order_id) order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(row.order_id).first();
  if (row.order_id && !order) throw new PermanentError('Order no longer exists');
  const lang = (order?.lang === 'en' ? 'en' : 'ar') as 'ar' | 'en';
  const ctx = {
    lang, name: order?.customer_name ?? payload.name ?? '', number: order?.number ?? payload.number ?? '', total_piastres: order?.total_piastres ?? 0,
    link: order ? await orderLink(env, order) : store, due_at: order?.delivery_due_at, reason: payload.reason, product: payload.product,
    expires_at: payload.expires_at, store_url: store,
  };
  if (row.audience === 'owner') {
    const r = renderOwner(row.event as OwnerEvent, { ...ctx, lang: 'en', extra: payload.extra });
    const link = `${store}/admin${row.order_id ? `/orders/${row.order_id}` : payload.path ?? ''}`;
    return sendEmail(env, s, row.recipient, `[LYnto] ${r.subject}`, emailHtml(r, link, 'en', store), `${r.text}\n\n${link}`, row.id);
  }
  const r = renderCustomer(row.event as CustomerEvent, ctx);
  const support = { whatsapp: s.support.whatsapp, email: s.support.email };
  if (row.channel === 'email') {
    const from = row.event === 'support_received' ? s.notifications.from_support || s.notifications.from_email : s.notifications.from_email;
    return sendEmail(env, s, row.recipient, r.subject, emailHtml(r, ctx.link, lang, store, support), `${r.text}\n\n${r.cta}: ${row.event === 'renewal_reminder' ? store : ctx.link}`, row.id, { from });
  }
  if (row.channel === 'whatsapp') return sendWhatsApp(env, s, row.recipient, row.event as CustomerEvent, r.waParams);
  throw new PermanentError('Manual channel cannot be auto-sent');
}

/** Send due notifications. Safe to run concurrently: rows are claimed with a lock. */
export async function dispatchPending(env: Env, opts: { orderId?: string; limit?: number } = {}) {
  const t = now();
  const where = opts.orderId ? 'AND order_id = ?' : '';
  const stmt = env.DB.prepare(`SELECT * FROM notifications WHERE status = 'pending' AND channel != 'manual' AND next_attempt_at <= ? AND lock_until < ? ${where} ORDER BY created_at LIMIT ?`);
  const rows = (opts.orderId ? await stmt.bind(t, t, opts.orderId, opts.limit ?? 20).all<NotificationRow>() : await stmt.bind(t, t, opts.limit ?? 20).all<NotificationRow>()).results;
  if (!rows.length) return { processed: 0 };
  const s = await loadSettings(env);
  let processed = 0;
  for (const row of rows) {
    const claim = await env.DB.prepare(`UPDATE notifications SET lock_until = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND lock_until < ?`).bind(t + 60_000, t, row.id, t).run();
    if (claim.meta.changes !== 1) continue;
    processed++;
    try {
      const res = await deliverOne(env, s, row);
      await env.DB.prepare(`UPDATE notifications SET status = 'sent', provider = ?, provider_message_id = ?, attempts = attempts + 1, sent_at = ?, updated_at = ?, lock_until = 0, last_error = NULL WHERE id = ?`)
        .bind(res.provider, res.id, now(), now(), row.id).run();
    } catch (e: any) {
      const attempts = row.attempts + 1;
      const permanent = e instanceof PermanentError;
      const failed = permanent || attempts >= MAX_ATTEMPTS;
      const next = now() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000;
      await env.DB.prepare(`UPDATE notifications SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?, lock_until = 0 WHERE id = ?`)
        .bind(failed ? 'failed' : 'pending', attempts, next, String(e?.message ?? e).slice(0, 500), now(), row.id).run();
    }
  }
  return { processed };
}

/** Send a one-off test message to an owner-controlled recipient (not stored as a customer notification). */
export async function sendTest(env: Env, channel: 'email' | 'whatsapp', to: string) {
  const s = await loadSettings(env);
  const store = baseUrl(env);
  if (channel === 'email') {
    const r = { subject: 'LYnto test email', preheader: 'Email sending works.', text: 'This is a test message from your LYnto store settings. If you can read this, sending from your domain works.', cta: 'Open store', waParams: [], rows: [['Sender', s.notifications.from_email]] as Array<[string, string]> };
    return sendEmail(env, s, to, r.subject, emailHtml(r, store, 'en', store, { whatsapp: s.support.whatsapp, email: s.support.email }), r.text, 'test-' + crypto.randomUUID());
  }
  const r = renderCustomer('order_received', { lang: 'ar', name: 'Test', number: 'LY-TEST00', total_piastres: 100, link: store, store_url: store });
  return sendWhatsApp(env, s, to, 'order_received', r.waParams);
}
