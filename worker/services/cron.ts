import type { Env } from '../env';
import { loadSettings } from '../lib/settings';
import { now } from '../lib/util';
import { dispatchPending, notificationStmts, ownerAlertStmts, planCustomerChannels, recipientFor } from './notifications';
import { cancelOrder } from './orders';

/** Runs every 5 minutes in production. Each job is idempotent. */
export async function runScheduled(env: Env) {
  const t = now();
  const s = await loadSettings(env);
  const report: Record<string, number> = {};

  // 1) Expire unpaid orders with no proof after the configured window.
  const expiry = t - s.delivery.unpaid_expiry_hours * 3600_000;
  const stale = (await env.DB.prepare(`SELECT id FROM orders WHERE payment_status = 'awaiting_transfer' AND created_at < ? LIMIT 50`).bind(expiry).all<{ id: string }>()).results;
  for (const o of stale) await cancelOrder(env, 'system', o.id, 'Expired: no payment received in time').catch(() => {});
  report.expired = stale.length;

  // 2) Overdue delivery alerts (once per order).
  const overdue = (await env.DB.prepare(`SELECT id FROM orders WHERE payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered') AND delivery_due_at < ? AND overdue_alerted = 0 LIMIT 50`).bind(t).all<{ id: string }>()).results;
  for (const o of overdue) {
    const guard = { sql: 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND overdue_alerted = 1)', params: [o.id] };
    await env.DB.batch([
      env.DB.prepare('UPDATE orders SET overdue_alerted = 1 WHERE id = ? AND overdue_alerted = 0').bind(o.id),
      env.DB.prepare(`INSERT INTO order_events (order_id, actor, type, visibility, data, created_at) VALUES (?, 'system', 'delivery_overdue', 'internal', '{}', ?)`).bind(o.id, t),
      ...(await ownerAlertStmts(env, s, o.id, 'owner_delivery_overdue', `overdue:${o.id}`, {}, guard)),
    ]);
  }
  report.overdue = overdue.length;

  // 2b) One payment reminder for orders still awaiting transfer (real channels only — never creates manual to-dos).
  const remindBefore = t - s.delivery.payment_reminder_hours * 3600_000;
  const unpaid = (await env.DB.prepare(`SELECT * FROM orders WHERE payment_status = 'awaiting_transfer' AND reminder_processed = 0 AND created_at < ? AND created_at > ? LIMIT 50`).bind(remindBefore, t - s.delivery.unpaid_expiry_hours * 3600_000).all<any>()).results;
  for (const o of unpaid) {
    const channels = (await planCustomerChannels(env, s, o, 'payment_reminder')).filter((c) => c !== 'manual');
    const guard = { sql: 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND reminder_processed = 1 AND payment_status = \'awaiting_transfer\')', params: [o.id] };
    await env.DB.batch([
      env.DB.prepare('UPDATE orders SET reminder_processed = 1 WHERE id = ? AND reminder_processed = 0').bind(o.id),
      ...(channels.length ? notificationStmts(env, { orderId: o.id, audience: 'customer', event: 'payment_reminder', channels, recipientFor: recipientFor(o), dedupeBase: `payment_reminder:${o.id}` }, guard) : []),
    ]);
  }
  report.payment_reminders = unpaid.length;

  // 3) Renewal reminders (only with the customer's opt-in; never auto-charges).
  const windowEnd = t + s.delivery.renewal_reminder_days * 86_400_000;
  const due = (await env.DB.prepare(`SELECT i.id AS item_id, i.expires_at, i.product_title_ar, i.product_title_en, o.* FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.expires_at IS NOT NULL AND i.expires_at > ? AND i.expires_at <= ? AND i.renewal_reminded_at IS NULL AND i.fulfillment_status = 'delivered'
    AND o.renewal_optin = 1 AND o.payment_status = 'verified' LIMIT 50`).bind(t, windowEnd).all<any>()).results;
  for (const row of due) {
    const channels = (await planCustomerChannels(env, s, row, 'renewal_reminder')).filter((c) => c !== 'manual' || row.preferred_channel === 'whatsapp');
    await env.DB.batch([
      env.DB.prepare('UPDATE order_items SET renewal_reminded_at = ? WHERE id = ? AND renewal_reminded_at IS NULL').bind(t, row.item_id),
      ...notificationStmts(env, { orderId: row.id, audience: 'customer', event: 'renewal_reminder', channels: channels.length ? channels : ['manual'], recipientFor: recipientFor(row),
        dedupeBase: `renewal:${row.item_id}:${row.expires_at}`, payload: { product: row.lang === 'en' ? row.product_title_en : row.product_title_ar, expires_at: row.expires_at } }),
    ]);
  }
  report.renewals = due.length;

  // 4) Send/retry pending notifications.
  report.dispatched = (await dispatchPending(env, { limit: 50 })).processed;

  // 5) Housekeeping.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(t),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(t - 86_400_000),
  ]);
  return report;
}
