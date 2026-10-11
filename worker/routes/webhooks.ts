import { Hono } from 'hono';
import type { AppContext } from '../env';
import { getSecret } from '../lib/settings';
import { fromB64, hmacHex, timingSafeEqual, b64url } from '../lib/crypto';
import { now } from '../lib/util';

export const webhooks = new Hono<AppContext>();

// ---- WhatsApp Cloud API: verification handshake + delivery status updates ----
webhooks.get('/whatsapp', async (c) => {
  const verify = await getSecret(c.env, 'whatsapp_verify_token');
  const mode = c.req.query('hub.mode'), token = c.req.query('hub.verify_token'), challenge = c.req.query('hub.challenge');
  if (mode === 'subscribe' && verify && token && timingSafeEqual(token, verify)) return c.text(challenge ?? '');
  return c.text('forbidden', 403);
});

webhooks.post('/whatsapp', async (c) => {
  const raw = await c.req.text();
  const secret = await getSecret(c.env, 'whatsapp_app_secret');
  const sig = c.req.header('x-hub-signature-256') ?? '';
  if (!secret || !sig.startsWith('sha256=') || !timingSafeEqual(sig.slice(7), await hmacHex(secret, raw))) return c.text('invalid signature', 401);
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return c.text('bad json', 400); }
  const t = now();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const st of change?.value?.statuses ?? []) {
        const id = String(st.id ?? '');
        if (!id) continue;
        if (st.status === 'delivered' || st.status === 'read') {
          await c.env.DB.prepare(`UPDATE notifications SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?), updated_at = ? WHERE provider_message_id = ? AND status IN ('sent','pending')`).bind(t, t, id).run();
        } else if (st.status === 'failed') {
          const err = (st.errors?.[0]?.title ?? st.errors?.[0]?.message ?? 'failed').toString().slice(0, 300);
          await c.env.DB.prepare(`UPDATE notifications SET status = 'failed', last_error = ?, updated_at = ? WHERE provider_message_id = ?`).bind(`WhatsApp: ${err}`, t, id).run();
        }
      }
    }
  }
  return c.text('ok');
});

// ---- Resend (Svix-signed) delivery events ----
webhooks.post('/resend', async (c) => {
  const raw = await c.req.text();
  const secret = await getSecret(c.env, 'resend_webhook_secret');
  const id = c.req.header('svix-id'), ts = c.req.header('svix-timestamp'), sigs = c.req.header('svix-signature');
  if (!secret || !id || !ts || !sigs) return c.text('unauthorized', 401);
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return c.text('stale', 401);
  const key = await crypto.subtle.importKey('raw', fromB64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const ok = sigs.split(' ').some((s) => {
    const v = s.split(',')[1] ?? '';
    return timingSafeEqual(v.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), expected);
  });
  if (!ok) return c.text('invalid signature', 401);
  const evt: any = JSON.parse(raw);
  const msgId = evt?.data?.email_id;
  const t = now();
  if (msgId && evt.type === 'email.delivered') {
    await c.env.DB.prepare(`UPDATE notifications SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?), updated_at = ? WHERE provider_message_id = ? AND status IN ('sent','pending')`).bind(t, t, msgId).run();
  } else if (msgId && (evt.type === 'email.bounced' || evt.type === 'email.complained' || evt.type === 'email.failed')) {
    await c.env.DB.prepare(`UPDATE notifications SET status = 'failed', last_error = ?, updated_at = ? WHERE provider_message_id = ?`).bind(`Resend: ${evt.type}`, t, msgId).run();
  }
  return c.text('ok');
});
