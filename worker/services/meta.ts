// Meta Conversions API — Purchase is sent ONLY after the owner verifies payment, once per order.
// Requires: Pixel ID + CAPI token configured, and the customer's tracking consent at checkout.
import type { Env } from '../env';
import { getSecret, loadSettings } from '../lib/settings';
import { sha256Hex } from '../lib/crypto';
import { baseUrl, isProd, now } from '../lib/util';

export function purchaseEventId(orderNumber: string) {
  return `purchase_${orderNumber}`;
}

export async function sendPurchase(env: Env, orderId: string) {
  const s = await loadSettings(env);
  if (!s.tracking.meta_pixel_id || !s.tracking.capi_enabled) return { skipped: 'not_configured' };
  const token = await getSecret(env, 'meta_capi_token');
  if (!token) return { skipped: 'no_token' };
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!o || o.payment_status !== 'verified' || !o.tracking_consent) return { skipped: 'not_eligible' };
  const eventId = purchaseEventId(o.number);
  const ins = await env.DB.prepare(`INSERT OR IGNORE INTO analytics_events (event_id, order_id, name, status, created_at) VALUES (?, ?, 'Purchase', 'pending', ?)`).bind(eventId, o.id, now()).run();
  if (ins.meta.changes !== 1) return { skipped: 'duplicate' };
  const items = (await env.DB.prepare('SELECT plan_id, qty, unit_price_piastres FROM order_items WHERE order_id = ?').bind(o.id).all<any>()).results;
  const body: any = {
    data: [{
      event_name: 'Purchase', event_time: Math.floor((o.verified_at ?? now()) / 1000), event_id: eventId, action_source: 'website',
      event_source_url: `${baseUrl(env)}/checkout`,
      user_data: { em: [await sha256Hex(o.customer_email.trim().toLowerCase())], ph: [await sha256Hex(o.customer_whatsapp.replace(/\D/g, ''))] },
      custom_data: { currency: 'EGP', value: (o.verified_amount_piastres ?? o.total_piastres) / 100, content_type: 'product',
        contents: items.map((i) => ({ id: i.plan_id, quantity: i.qty, item_price: i.unit_price_piastres / 100 })) },
    }],
  };
  if (s.tracking.meta_test_event_code) body.test_event_code = s.tracking.meta_test_event_code;
  const base = !isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE : 'https://graph.facebook.com';
  try {
    const res = await fetch(`${base}/${s.notifications.whatsapp_api_version || 'v23.0'}/${s.tracking.meta_pixel_id}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const status = res.ok ? 'sent' : 'failed';
    await env.DB.prepare('UPDATE analytics_events SET status = ?, error = ? WHERE event_id = ?').bind(status, res.ok ? null : `HTTP ${res.status}`, eventId).run();
    return { status };
  } catch (e: any) {
    await env.DB.prepare(`UPDATE analytics_events SET status = 'failed', error = ? WHERE event_id = ?`).bind(String(e?.message ?? e).slice(0, 200), eventId).run();
    return { status: 'failed' };
  }
}
