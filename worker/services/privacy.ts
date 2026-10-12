// Personal-data erasure: removes what identifies the customer, keeps what accounting needs (numbers, amounts, dates, statuses).
import type { Env } from '../env';
import { HttpError, now } from '../lib/util';
import { randomToken } from '../lib/crypto';

export type EraseResult = { anonymized: string[]; skipped: Array<{ number: string; reason: string }> };

/** Orders still being worked on are not erased automatically (the owner needs the data to deliver). */
function blocker(o: { payment_status: string; fulfillment_status: string }): string | null {
  if (o.payment_status === 'proof_submitted') return 'payment proof awaiting review';
  if (o.payment_status === 'verified' && ['not_started', 'processing', 'partially_delivered'].includes(o.fulfillment_status)) return 'paid order not fully delivered yet';
  if (o.payment_status === 'refund_requested') return 'refund in progress';
  return null;
}

export async function eraseCustomerData(env: Env, actor: string, by: { order_id?: string; email?: string; whatsapp?: string }): Promise<EraseResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (by.order_id) { where.push('id = ?'); params.push(by.order_id); }
  if (by.email) { where.push('LOWER(customer_email) = ?'); params.push(by.email.trim().toLowerCase()); }
  if (by.whatsapp) { where.push('customer_whatsapp = ?'); params.push(by.whatsapp.trim()); }
  if (!where.length) throw new HttpError(400, 'invalid_input', 'Give an order, email or WhatsApp number.');
  const orders = (await env.DB.prepare(`SELECT id, number, payment_status, fulfillment_status, anonymized_at FROM orders WHERE (${where.join(' OR ')})`).bind(...params).all<any>()).results;
  const out: EraseResult = { anonymized: [], skipped: [] };
  const t = now();
  for (const o of orders) {
    if (o.anonymized_at) continue;
    const why = blocker(o);
    if (why) { out.skipped.push({ number: o.number, reason: why }); continue; }
    // receipts (private R2) first — if this throws nothing else is changed
    const proofs = (await env.DB.prepare('SELECT id, file_key FROM payment_proofs WHERE order_id = ?').bind(o.id).all<{ id: string; file_key: string }>()).results;
    for (const p of proofs) await env.FILES.delete(p.file_key).catch(() => {});
    const dead = randomToken(24);
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET customer_name = '[deleted]', customer_email = ?, customer_whatsapp = '[deleted]', whatsapp_optin = 0, renewal_optin = 0, tracking_consent = 0,
        internal_notes = '', rejection_reason = NULL, refund_reason = NULL, cancel_reason = NULL, ip_hash = NULL, access_hash = ?, access_enc = 'deleted', anonymized_at = ?, updated_at = ? WHERE id = ?`)
        .bind(`deleted+${o.id}@invalid.example`, dead, t, t, o.id),
      env.DB.prepare(`UPDATE order_items SET customer_fields = '{}' WHERE order_id = ?`).bind(o.id),
      env.DB.prepare(`UPDATE deliveries SET details_enc = NULL, note = '' WHERE order_id = ?`).bind(o.id),
      env.DB.prepare('DELETE FROM payment_proofs WHERE order_id = ?').bind(o.id),
      env.DB.prepare(`UPDATE notifications SET recipient = '[deleted]', payload = '{}', manual_note = NULL, last_error = CASE WHEN status IN ('pending','manual_action_required') THEN 'Personal data erased' ELSE NULL END, status = CASE WHEN status IN ('pending','manual_action_required') THEN 'failed' ELSE status END WHERE order_id = ?`).bind(o.id),
      env.DB.prepare(`UPDATE support_requests SET name = '[deleted]', contact = '[deleted]', message = '[deleted]', admin_notes = '', ip_hash = NULL WHERE order_id = ?`).bind(o.id),
      env.DB.prepare(`UPDATE outbound_emails SET to_addr = '[deleted]', reply_to = '', body_text = '', subject = '[deleted]' WHERE order_id = ?`).bind(o.id),
      env.DB.prepare(`UPDATE order_events SET data = '{}' WHERE order_id = ? AND type IN ('proof_rejected','email_sent','refund_requested_detail','payment_verified_detail')`).bind(o.id),
      env.DB.prepare(`INSERT INTO order_events (order_id, actor, type, visibility, data, created_at) VALUES (?, ?, 'personal_data_erased', 'internal', '{}', ?)`).bind(o.id, actor, t),
    ]);
    out.anonymized.push(o.number);
  }
  return out;
}
