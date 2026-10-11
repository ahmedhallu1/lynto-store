// Owner-composed email: send from any @<domain> username (orders, contact, info, support, …) and keep a log.
import type { Env } from '../env';
import { loadSettings } from '../lib/settings';
import { HttpError, bad, baseUrl, notFound, now, orderEventStmt } from '../lib/util';
import { newId } from '../lib/crypto';
import { channelHealth, sendEmail } from './notifications';
import { composedHtml } from './messages';

const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,38}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,24}$/;

export type ComposeInput = {
  from_local: string;
  from_name?: string;
  to: string[];
  reply_to?: string;
  subject: string;
  body: string;
  lang?: 'ar' | 'en';
  order_id?: string | null;
};

export async function composeAndSend(env: Env, actor: string, input: ComposeInput) {
  const s = await loadSettings(env);
  const health = await channelHealth(env, s);
  if (!health.email.usable) throw new HttpError(409, 'email_not_ready', `Email sending is not ready: ${health.email.reason}`);
  const domain = (s.notifications.from_domain || 'lynto.store').toLowerCase();
  const local = input.from_local.trim().toLowerCase();
  if (!LOCAL_RE.test(local)) throw bad('invalid_sender', 'Sender username may contain letters, numbers, dots, dashes and underscores only.');
  const from = `${local}@${domain}`;
  const recipients = [...new Set(input.to.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length || recipients.length > 10) throw bad('invalid_recipients', 'Enter between 1 and 10 recipient addresses.');
  for (const r of recipients) if (!EMAIL_RE.test(r)) throw bad('invalid_recipient', `"${r}" is not a valid email address.`);
  const replyTo = (input.reply_to?.trim() || from).toLowerCase();
  if (!EMAIL_RE.test(replyTo)) throw bad('invalid_reply_to');
  if (input.order_id) {
    const o = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(input.order_id).first();
    if (!o) throw notFound('order_not_found');
  }
  const store = baseUrl(env);
  const html = composedHtml(input.body, input.lang ?? 'ar', store, { whatsapp: s.support.whatsapp, email: s.support.email });
  const results: Array<{ to: string; id: string; status: string; error?: string }> = [];
  for (const to of recipients) {
    const id = newId('eml');
    const t = now();
    await env.DB.prepare('INSERT INTO outbound_emails (id, from_addr, to_addr, reply_to, subject, body_text, order_id, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, from, to, replyTo, input.subject, input.body, input.order_id ?? null, 'queued', actor, t, t).run();
    try {
      const r = await sendEmail(env, s, to, input.subject, html, input.body, id, { from, fromName: input.from_name?.trim() || s.notifications.from_name, replyTo });
      await env.DB.prepare(`UPDATE outbound_emails SET status = 'sent', provider_message_id = ?, updated_at = ? WHERE id = ?`).bind(r.id, now(), id).run();
      results.push({ to, id, status: 'sent' });
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      await env.DB.prepare(`UPDATE outbound_emails SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`).bind(msg, now(), id).run();
      results.push({ to, id, status: 'failed', error: msg });
    }
  }
  if (input.order_id) {
    await orderEventStmt(env, input.order_id, actor, 'email_sent', 'internal', { from, to: recipients, subject: input.subject, ok: results.every((r) => r.status === 'sent') }).run();
  }
  return { from, results };
}

/** Looks up the Resend domain (needs a full-access key; a send-only key returns a clear note instead). */
export async function resendDomainStatus(env: Env, domain: string, key: string | null) {
  if (!key) return { available: false, note: 'No Resend API key is configured.' };
  const res = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res) return { available: false, note: 'Could not reach Resend.' };
  const body: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) return { available: false, note: 'This Resend key is send-only, so domain status cannot be read here. Check Resend → Domains in the dashboard.' };
  const d = (body?.data ?? []).find((x: any) => x.name === domain);
  return d ? { available: true, name: d.name, status: d.status, region: d.region } : { available: true, name: domain, status: 'not_found' };
}
