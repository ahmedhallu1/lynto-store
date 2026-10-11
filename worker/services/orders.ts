import type { Env } from '../env';
import type { BusinessSettings, CustomerField } from '../../shared/types';
import { checkoutBlockers, paymentMethodComplete } from '../../shared/defaults';
import { addCalendarPeriod, addWorkingMinutes } from '../../shared/schedule';
import { decryptText, encryptText, hmacHex, newId, randomCode, randomToken, sha256Hex } from '../lib/crypto';
import { HttpError, bad, conflict, notFound, now, orderEventStmt, parseJSON, baseUrl } from '../lib/util';
import { loadSettings } from '../lib/settings';
import { isSellablePlan, type PlanRow, type ProductRow } from './catalog';
import { notificationStmts, ownerAlertStmts, planCustomerChannels, recipientFor, type OrderForNotify } from './notifications';

export type OrderRow = OrderForNotify & {
  access_hash: string; idem_hash: string; renewal_optin: number; tracking_consent: number; currency: string;
  subtotal_piastres: number; payment_method_id: string; payment_status: string; fulfillment_status: string;
  verified_amount_piastres: number | null; verified_reference: string | null; verified_at: number | null; verified_by: string | null;
  delivered_at: number | null; cancelled_at: number | null; cancel_reason: string | null;
  refund_requested_at: number | null; refund_reason: string | null; refunded_at: number | null; refund_amount_piastres: number | null; refund_reference: string | null;
  rejection_reason: string | null; last_action_id: string | null; internal_notes: string; overdue_alerted: number; created_at: number; updated_at: number;
};
export type ItemRow = {
  id: string; order_id: string; product_id: string; plan_id: string; product_title_ar: string; product_title_en: string;
  plan_name_ar: string; plan_name_en: string; plan_type: string; duration_value: number | null; duration_unit: 'day' | 'month' | 'year' | null;
  is_perpetual: number; guarantee_kind: string; guarantee_days: number | null; unit_price_piastres: number; qty: number; line_total_piastres: number;
  customer_fields: string; fulfillment_status: string; delivered_at: number | null; delivered_via: string | null;
  activated_at: number | null; expires_at: number | null; guarantee_until: number | null; renewal_reminded_at: number | null; last_action_id: string | null; sort: number;
};

export type CheckoutInput = {
  idempotency_key: string;
  lang: 'ar' | 'en';
  customer: { name: string; email: string; whatsapp: string; preferred_channel: 'whatsapp' | 'email'; whatsapp_optin: boolean; renewal_optin: boolean };
  payment_method_id: string;
  lines: Array<{ plan_id: string; qty: number; fields: Record<string, string> }>;
  expected_total_piastres: number;
  accept_terms: boolean;
  tracking_consent: boolean;
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function validateFields(defs: CustomerField[], input: Record<string, string>, lang: 'ar' | 'en'): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of defs) {
    const raw = (input?.[f.key] ?? '').toString().trim().slice(0, 200);
    const label = lang === 'ar' ? f.label_ar : f.label_en;
    if (!raw) { if (f.required) errors.push(`${label}: required`); continue; }
    if (f.type === 'email' && !EMAIL_RE.test(raw)) { errors.push(`${label}: invalid email`); continue; }
    if (f.type === 'select' && !(f.options ?? []).some((o) => o.value === raw)) { errors.push(`${label}: invalid option`); continue; }
    if (f.pattern) {
      try { if (!new RegExp(f.pattern).test(raw)) { errors.push(`${label}: invalid format`); continue; } } catch { /* bad pattern: ignore */ }
    }
    values[f.key] = raw;
  }
  return { values, errors };
}

/** Compute a server-side quote. Client prices are never trusted. */
export async function quote(env: Env, lines: CheckoutInput['lines'], lang: 'ar' | 'en', validateCustomerFields = true) {
  if (!Array.isArray(lines) || lines.length === 0) throw bad('empty_cart');
  if (lines.length > 10) throw bad('too_many_lines');
  const ids = [...new Set(lines.map((l) => String(l.plan_id)))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = (await env.DB.prepare(
    `SELECT pl.*, p.status AS p_status, p.supply_status AS p_supply, p.title_ar AS p_title_ar, p.title_en AS p_title_en, p.customer_fields AS p_fields, p.id AS p_id
     FROM plans pl JOIN products p ON p.id = pl.product_id WHERE pl.id IN (${placeholders})`,
  ).bind(...ids).all<PlanRow & { p_status: string; p_supply: string; p_title_ar: string; p_title_en: string; p_fields: string; p_id: string }>()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: Array<{ plan: (typeof rows)[number]; qty: number; fields: Record<string, string>; line_total: number }> = [];
  const problems: Array<{ plan_id: string; error: string }> = [];
  for (const l of lines) {
    const plan = byId.get(String(l.plan_id));
    const qty = Number(l.qty);
    if (!plan || plan.p_status !== 'published' || plan.p_supply !== 'validated' || !isSellablePlan(plan)) { problems.push({ plan_id: String(l.plan_id), error: 'unavailable' }); continue; }
    if (!Number.isInteger(qty) || qty < 1 || qty > plan.max_qty) { problems.push({ plan_id: plan.id, error: 'invalid_qty' }); continue; }
    let fields: Record<string, string> = {};
    if (validateCustomerFields) {
      const v = validateFields(parseJSON<CustomerField[]>(plan.p_fields, []), l.fields ?? {}, lang);
      if (v.errors.length) { problems.push({ plan_id: plan.id, error: 'fields: ' + v.errors.join('; ') }); continue; }
      fields = v.values;
    }
    items.push({ plan, qty, fields, line_total: (plan.price_piastres as number) * qty });
  }
  const subtotal = items.reduce((n, i) => n + i.line_total, 0);
  return { items, problems, subtotal, total: subtotal };
}

async function orderAccessHash(env: Env, token: string) {
  return hmacHex(env.TOKEN_SECRET, 'order-access:' + token);
}

export async function createOrder(env: Env, input: CheckoutInput, ipHashValue: string) {
  const s = await loadSettings(env);
  const blockers = checkoutBlockers(s);
  if (blockers.length) throw new HttpError(403, 'checkout_disabled', 'Checkout is not open yet.', blockers);
  if (!input.accept_terms) throw bad('terms_required');
  const method = s.payments.methods.find((m) => m.id === input.payment_method_id && m.enabled && paymentMethodComplete(m));
  if (!method) throw bad('invalid_payment_method');

  const idemHash = await hmacHex(env.TOKEN_SECRET, 'idem:' + input.idempotency_key);
  const existing = await env.DB.prepare('SELECT number, access_enc FROM orders WHERE idem_hash = ?').bind(idemHash).first<{ number: string; access_enc: string }>();
  if (existing) return replay(env, existing);

  const q = await quote(env, input.lines, input.lang);
  if (q.problems.length) throw conflict('cart_invalid', 'Some items are unavailable or incomplete.', q.problems);
  if (q.total !== input.expected_total_piastres) throw conflict('price_changed', 'Prices changed. Please review your cart.', { total_piastres: q.total });

  const t = now();
  const orderId = newId('ord');
  const token = randomToken(32);
  for (let attempt = 0; attempt < 4; attempt++) {
    const number = `LY-${randomCode(6)}`;
    const accessEnc = await encryptText(env.DATA_KEY, token, 'order-access:' + number);
    const order: OrderForNotify = {
      id: orderId, number, lang: input.lang, customer_name: input.customer.name, customer_email: input.customer.email,
      customer_whatsapp: input.customer.whatsapp, preferred_channel: input.customer.preferred_channel,
      whatsapp_optin: input.customer.whatsapp_optin ? 1 : 0, total_piastres: q.total, access_enc: accessEnc, delivery_due_at: null,
    };
    const stmts = [
      env.DB.prepare(`INSERT INTO orders (id, number, access_hash, access_enc, idem_hash, lang, customer_name, customer_email, customer_whatsapp, preferred_channel,
        whatsapp_optin, renewal_optin, tracking_consent, subtotal_piastres, total_piastres, payment_method_id, ip_hash, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        orderId, number, await orderAccessHash(env, token), accessEnc, idemHash, input.lang, input.customer.name, input.customer.email, input.customer.whatsapp,
        input.customer.preferred_channel, order.whatsapp_optin, input.customer.renewal_optin ? 1 : 0, input.tracking_consent ? 1 : 0, q.subtotal, q.total, method.id, ipHashValue, t, t),
      ...q.items.map((it, i) => env.DB.prepare(`INSERT INTO order_items (id, order_id, product_id, plan_id, product_title_ar, product_title_en, plan_name_ar, plan_name_en, plan_type,
        duration_value, duration_unit, is_perpetual, guarantee_kind, guarantee_days, unit_price_piastres, qty, line_total_piastres, customer_fields, sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        newId('itm'), orderId, it.plan.p_id, it.plan.id, it.plan.p_title_ar, it.plan.p_title_en, it.plan.name_ar, it.plan.name_en, it.plan.plan_type,
        it.plan.duration_value, it.plan.duration_unit, it.plan.is_perpetual, it.plan.guarantee_kind, it.plan.guarantee_days, it.plan.price_piastres, it.qty, it.line_total,
        JSON.stringify(it.fields), i)),
      orderEventStmt(env, orderId, 'customer', 'order_created', 'customer', { total_piastres: q.total, method: method.id }),
      ...notificationStmts(env, { orderId, audience: 'customer', event: 'order_received', channels: await planCustomerChannels(env, s, order, 'order_received'), recipientFor: recipientFor(order), dedupeBase: `order_received:${orderId}` }),
      ...(await ownerAlertStmts(env, s, orderId, 'owner_new_order', `owner_new_order:${orderId}`)),
    ];
    try {
      await env.DB.batch(stmts);
      return { number, token, url: `${baseUrl(env)}/order/${number}#k=${token}`, order_id: orderId, duplicate: false };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('idem_hash')) {
        const ex = await env.DB.prepare('SELECT number, access_enc FROM orders WHERE idem_hash = ?').bind(idemHash).first<{ number: string; access_enc: string }>();
        if (ex) return replay(env, ex);
      }
      if (msg.includes('orders.number')) continue; // number collision: retry with a new number
      throw e;
    }
  }
  throw new HttpError(500, 'order_number_exhausted');
}

async function replay(env: Env, ex: { number: string; access_enc: string }) {
  const token = await decryptText(env.DATA_KEY, ex.access_enc, 'order-access:' + ex.number);
  const id = (await env.DB.prepare('SELECT id FROM orders WHERE number = ?').bind(ex.number).first<{ id: string }>())!.id;
  return { number: ex.number, token, url: `${baseUrl(env)}/order/${ex.number}#k=${token}`, order_id: id, duplicate: true };
}

/** Resolve an order from its public number + secret token. Same error for "wrong token" and "no such order". */
export async function orderByToken(env: Env, number: string, token: string | undefined | null): Promise<OrderRow> {
  if (!token || token.length < 20 || !/^LY-[A-Z0-9]{6}$/.test(number)) throw notFound('order_not_found');
  const hash = await orderAccessHash(env, token);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE number = ? AND access_hash = ?').bind(number, hash).first<OrderRow>();
  if (!o) throw notFound('order_not_found');
  return o;
}

export async function getItems(env: Env, orderId: string) {
  return (await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort').bind(orderId).all<ItemRow>()).results;
}

/** Customer-facing view of an order. Delivery details are decrypted only for the token holder. */
export async function customerOrderView(env: Env, o: OrderRow) {
  const s = await loadSettings(env);
  const [items, events, proofs, deliveries] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort').bind(o.id),
    env.DB.prepare(`SELECT type, data, created_at, item_id FROM order_events WHERE order_id = ? AND visibility = 'customer' ORDER BY id`).bind(o.id),
    env.DB.prepare('SELECT id, status, reject_reason, transaction_ref, created_at FROM payment_proofs WHERE order_id = ? ORDER BY created_at').bind(o.id),
    env.DB.prepare(`SELECT d.* FROM deliveries d WHERE d.order_id = ? ORDER BY d.created_at`).bind(o.id),
  ]);
  const latest = new Map<string, any>();
  for (const d of deliveries.results as any[]) latest.set(d.item_id, d);
  const awaitingPayment = ['awaiting_transfer', 'proof_submitted', 'rejected'].includes(o.payment_status);
  const method = s.payments.methods.find((m) => m.id === o.payment_method_id);
  return {
    number: o.number, created_at: o.created_at, lang: o.lang,
    customer: { name: o.customer_name, email: o.customer_email, whatsapp: o.customer_whatsapp, preferred_channel: o.preferred_channel },
    total_piastres: o.total_piastres, currency: o.currency,
    payment_status: o.payment_status, fulfillment_status: o.fulfillment_status, rejection_reason: o.payment_status === 'rejected' ? o.rejection_reason : null,
    verified_at: o.verified_at, delivery_due_at: o.delivery_due_at, delivered_at: o.delivered_at, cancelled_at: o.cancelled_at,
    refund: o.refund_requested_at ? { requested_at: o.refund_requested_at, refunded_at: o.refunded_at, amount_piastres: o.refund_amount_piastres } : null,
    payment_method_id: o.payment_method_id,
    payment_destination: awaitingPayment && method ? {
      id: method.id, type: method.type, label_ar: method.label_ar, label_en: method.label_en, account: method.account, account_name: method.account_name,
      bank_name: method.bank_name ?? '', iban: method.iban ?? '', wallet_provider: method.wallet_provider ?? '', instapay_link: method.instapay_link ?? '',
      instructions_ar: method.instructions_ar ?? '', instructions_en: method.instructions_en ?? '',
    } : null,
    available_methods: awaitingPayment ? s.payments.methods.filter((m) => m.enabled && paymentMethodComplete(m)).map((m) => ({ id: m.id, label_ar: m.label_ar, label_en: m.label_en, type: m.type })) : [],
    can_upload_proof: ['awaiting_transfer', 'rejected', 'proof_submitted'].includes(o.payment_status) && (proofs.results as any[]).length < 6,
    can_cancel: o.payment_status === 'awaiting_transfer',
    proofs: (proofs.results as any[]).map((p) => ({ status: p.status, reject_reason: p.reject_reason, transaction_ref: p.transaction_ref, created_at: p.created_at })),
    items: await Promise.all((items.results as ItemRow[]).map(async (it) => {
      const d = latest.get(it.id);
      let details: string | null = null;
      if (d?.details_enc && it.fulfillment_status === 'delivered') {
        try { details = await decryptText(env.DATA_KEY, d.details_enc, 'delivery:' + d.id); } catch { details = null; }
      }
      return {
        id: it.id, product_title_ar: it.product_title_ar, product_title_en: it.product_title_en, plan_name_ar: it.plan_name_ar, plan_name_en: it.plan_name_en,
        plan_type: it.plan_type, qty: it.qty, unit_price_piastres: it.unit_price_piastres, line_total_piastres: it.line_total_piastres,
        fields: parseJSON<Record<string, string>>(it.customer_fields, {}), fulfillment_status: it.fulfillment_status,
        delivered_at: it.delivered_at, delivered_via: it.delivered_via, activated_at: it.activated_at, expires_at: it.expires_at, guarantee_until: it.guarantee_until,
        is_perpetual: !!it.is_perpetual, delivery: d ? { via: d.via, kind: d.kind, created_at: d.created_at, details, note: d.via === 'external' ? d.note : '' } : null,
      };
    })),
    timeline: (events.results as any[]).map((e) => ({ type: e.type, data: parseJSON(e.data, {}), created_at: e.created_at })),
    support: s.support,
  };
}

// ---------------------------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------------------------
const MAGIC: Array<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { mime: 'application/pdf', test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];
export const MAX_PROOF_BYTES = 6 * 1024 * 1024;
export function sniffMime(bytes: Uint8Array): string | null {
  return MAGIC.find((m) => m.test(bytes))?.mime ?? null;
}

export async function submitProof(env: Env, o: OrderRow, file: File, ref: string, note: string) {
  if (!['awaiting_transfer', 'rejected', 'proof_submitted'].includes(o.payment_status)) throw conflict('proof_not_accepted', 'This order is not waiting for payment proof.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_proofs WHERE order_id = ?').bind(o.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 6) throw conflict('too_many_proofs', 'Too many receipts uploaded. Please contact support.');
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) throw bad('file_size', 'File must be smaller than 6 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) throw bad('file_type', 'Only JPG, PNG, WEBP or PDF files are accepted.');
  const proofId = newId('prf');
  const key = `proofs/${o.id}/${proofId}`;
  const sha = await sha256Hex(bytes);
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { order: o.number } });
  const s = await loadSettings(env);
  const t = now();
  const actionId = randomToken(12);
  const guard = { sql: 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)', params: [o.id, actionId] };
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'proof_submitted', rejection_reason = NULL, last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status IN ('awaiting_transfer','rejected','proof_submitted')`).bind(actionId, t, o.id),
    env.DB.prepare(`UPDATE payment_proofs SET status = 'superseded' WHERE order_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)`).bind(o.id, o.id, actionId),
    env.DB.prepare(`INSERT INTO payment_proofs (id, order_id, file_key, mime, size, sha256, transaction_ref, payer_note, created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)`)
      .bind(proofId, o.id, key, mime, bytes.length, sha, ref.slice(0, 120), note.slice(0, 500), t, o.id, actionId),
    env.DB.prepare(`INSERT INTO order_events (order_id, actor, type, visibility, data, created_at) SELECT ?, 'customer', 'proof_submitted', 'customer', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)`)
      .bind(o.id, JSON.stringify({ transaction_ref: ref.slice(0, 120) }), t, o.id, actionId),
    ...(await ownerAlertStmts(env, s, o.id, 'owner_proof_submitted', `owner_proof:${proofId}`, {}, guard)),
  ]);
  if (res[0].meta.changes !== 1) {
    await env.FILES.delete(key);
    throw conflict('proof_not_accepted');
  }
  return { proof_id: proofId };
}

// ---------------------------------------------------------------------------------------------
// Admin actions — each is atomic (single D1 batch) and idempotent (state-guarded UPDATE).
// ---------------------------------------------------------------------------------------------
async function loadOrder(env: Env, id: string) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!o) throw notFound('order_not_found');
  return o;
}
const guardFor = (orderId: string, actionId: string) => ({ sql: 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)', params: [orderId, actionId] });
function guardedEvent(env: Env, orderId: string, actionId: string, actor: string, type: string, visibility: 'customer' | 'internal', data: unknown, itemId: string | null = null) {
  return env.DB.prepare(`INSERT INTO order_events (order_id, item_id, actor, type, visibility, data, created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND last_action_id = ?)`)
    .bind(orderId, itemId, actor, type, visibility, JSON.stringify(data ?? {}), now(), orderId, actionId);
}

export function computeDue(s: BusinessSettings, from: number): number | null {
  return addWorkingMinutes(from, s.delivery.sla_working_hours * 60, s.schedule);
}

export async function approvePayment(env: Env, actor: string, orderId: string, input: { amount_piastres: number; reference: string; confirm_mismatch?: boolean }) {
  const o = await loadOrder(env, orderId);
  if (['verified', 'refund_requested', 'refunded'].includes(o.payment_status)) return { already: true, order: o };
  if (!['awaiting_transfer', 'proof_submitted', 'rejected'].includes(o.payment_status)) throw conflict('invalid_state', `Cannot approve an order in state ${o.payment_status}.`);
  if (!Number.isInteger(input.amount_piastres) || input.amount_piastres <= 0) throw bad('invalid_amount');
  if (input.amount_piastres !== o.total_piastres && !input.confirm_mismatch) throw conflict('amount_mismatch', 'Received amount differs from the order total.', { total_piastres: o.total_piastres });
  const s = await loadSettings(env);
  const t = now();
  const due = computeDue(s, t);
  if (due === null) throw conflict('schedule_missing', 'Set your working hours in Setup before approving payments.');
  const actionId = randomToken(12);
  const g = guardFor(o.id, actionId);
  const upd = { ...o, delivery_due_at: due };
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'verified', verified_amount_piastres = ?, verified_reference = ?, verified_at = ?, verified_by = ?, delivery_due_at = ?,
      fulfillment_status = CASE WHEN fulfillment_status = 'not_started' THEN 'processing' ELSE fulfillment_status END, rejection_reason = NULL,
      last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status IN ('awaiting_transfer','proof_submitted','rejected')`)
      .bind(input.amount_piastres, input.reference.slice(0, 120), t, actor, due, actionId, t, o.id),
    env.DB.prepare(`UPDATE order_items SET fulfillment_status = 'processing' WHERE order_id = ? AND fulfillment_status = 'not_started' AND ${g.sql}`).bind(o.id, ...g.params),
    env.DB.prepare(`UPDATE payment_proofs SET status = 'accepted', reviewed_at = ?, reviewed_by = ? WHERE order_id = ? AND status = 'pending' AND ${g.sql}`).bind(t, actor, o.id, ...g.params),
    guardedEvent(env, o.id, actionId, actor, 'payment_verified', 'customer', { delivery_due_at: due }),
    guardedEvent(env, o.id, actionId, actor, 'payment_verified_detail', 'internal', { amount_piastres: input.amount_piastres, reference: input.reference, mismatch: input.amount_piastres !== o.total_piastres }),
    ...notificationStmts(env, { orderId: o.id, audience: 'customer', event: 'payment_confirmed', channels: await planCustomerChannels(env, s, upd, 'payment_confirmed'), recipientFor: recipientFor(o), dedupeBase: `payment_confirmed:${o.id}` }, g),
  ]);
  if (res[0].meta.changes !== 1) return { already: true, order: await loadOrder(env, o.id) };
  return { already: false, order: await loadOrder(env, o.id), purchase: true };
}

export async function rejectProof(env: Env, actor: string, orderId: string, reason: string) {
  const o = await loadOrder(env, orderId);
  if (o.payment_status === 'rejected') return { already: true };
  if (!['proof_submitted', 'awaiting_transfer'].includes(o.payment_status)) throw conflict('invalid_state', `Cannot reject proof for an order in state ${o.payment_status}.`);
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw bad('reason_required', 'Give the customer a short reason.');
  const s = await loadSettings(env);
  const t = now();
  const actionId = randomToken(12);
  const g = guardFor(o.id, actionId);
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'rejected', rejection_reason = ?, last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status IN ('proof_submitted','awaiting_transfer')`).bind(clean, actionId, t, o.id),
    env.DB.prepare(`UPDATE payment_proofs SET status = 'rejected', reject_reason = ?, reviewed_at = ?, reviewed_by = ? WHERE order_id = ? AND status = 'pending' AND ${g.sql}`).bind(clean, t, actor, o.id, ...g.params),
    guardedEvent(env, o.id, actionId, actor, 'proof_rejected', 'customer', { reason: clean }),
    ...notificationStmts(env, { orderId: o.id, audience: 'customer', event: 'proof_rejected', channels: await planCustomerChannels(env, s, o, 'proof_rejected'), recipientFor: recipientFor(o), dedupeBase: `proof_rejected:${o.id}:${actionId}`, payload: { reason: clean } }, g),
  ]);
  if (res[0].meta.changes !== 1) return { already: true };
  return { already: false };
}

export type DeliverInput = { mode: 'portal' | 'external'; note?: string; items: Array<{ item_id: string; details?: string; activated_at?: number | null; expires_at?: number | null }> };

function itemDates(it: ItemRow, tz: string, activatedAt: number, expiresOverride?: number | null) {
  let expires: number | null = null;
  if (!it.is_perpetual && it.duration_value && it.duration_unit) expires = addCalendarPeriod(activatedAt, it.duration_value, it.duration_unit, tz);
  if (expiresOverride !== undefined && expiresOverride !== null) expires = expiresOverride;
  let guarantee: number | null = null;
  if (it.guarantee_kind === 'full_period') guarantee = expires;
  else if (it.guarantee_kind === 'days' && it.guarantee_days) guarantee = activatedAt + it.guarantee_days * 86_400_000;
  return { activated: activatedAt, expires, guarantee };
}

export async function deliverItems(env: Env, actor: string, orderId: string, input: DeliverInput) {
  const o = await loadOrder(env, orderId);
  if (o.payment_status !== 'verified') throw conflict('payment_not_verified', 'Approve the payment before delivering.');
  const items = await getItems(env, o.id);
  const requested = new Map(input.items.map((i) => [i.item_id, i]));
  const deliverable = items.filter((it) => requested.has(it.id) && ['not_started', 'processing'].includes(it.fulfillment_status));
  if (!deliverable.length) return { already: true, order: o };
  if (input.mode === 'portal') {
    for (const it of deliverable) {
      const d = requested.get(it.id)!.details?.trim() ?? '';
      if (d.length < 2) throw bad('details_required', 'Paste the delivery details for each selected item.');
      if (d.length > 4000) throw bad('details_too_long');
    }
  }
  const s = await loadSettings(env);
  const t = now();
  const actionId = randomToken(12);
  // Guard follow-up inserts on items actually transitioned by THIS action, so a concurrent
  // duplicate click (whose item updates match nothing) cannot add events or notifications.
  const itemGuard = { sql: 'EXISTS (SELECT 1 FROM order_items WHERE order_id = ? AND last_action_id = ?)', params: [o.id, actionId] };
  const remainingAfter = items.filter((it) => !['delivered', 'cancelled'].includes(it.fulfillment_status) && !deliverable.some((d) => d.id === it.id)).length;
  const full = remainingAfter === 0;
  const stmts: D1PreparedStatement[] = [];
  const itemUpdateIdx: number[] = [];
  for (const it of deliverable) {
    const req = requested.get(it.id)!;
    const dates = itemDates(it, s.schedule.timezone, req.activated_at ?? t, req.expires_at);
    const deliveryId = newId('dlv');
    const enc = input.mode === 'portal' ? await encryptText(env.DATA_KEY, req.details!.trim(), 'delivery:' + deliveryId) : null;
    itemUpdateIdx.push(stmts.length);
    stmts.push(
      env.DB.prepare(`UPDATE order_items SET fulfillment_status = 'delivered', delivered_at = ?, delivered_via = ?, activated_at = ?, expires_at = ?, guarantee_until = ?, last_action_id = ?
        WHERE id = ? AND order_id = ? AND fulfillment_status IN ('not_started','processing')
        AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND payment_status = 'verified')`)
        .bind(t, input.mode, dates.activated, dates.expires, dates.guarantee, actionId, it.id, o.id, o.id),
      env.DB.prepare(`INSERT INTO deliveries (id, order_id, item_id, kind, via, details_enc, note, created_by, created_at) SELECT ?,?,?,'initial',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM order_items WHERE id = ? AND last_action_id = ?)`)
        .bind(deliveryId, o.id, it.id, input.mode, enc, (input.note ?? '').slice(0, 500), actor, t, it.id, actionId),
      env.DB.prepare(`INSERT INTO order_events (order_id, item_id, actor, type, visibility, data, created_at) SELECT ?,?,?,?,'customer',?,? WHERE EXISTS (SELECT 1 FROM order_items WHERE id = ? AND last_action_id = ?)`)
        .bind(o.id, it.id, actor, input.mode === 'portal' ? 'item_delivered' : 'item_delivered_external', JSON.stringify({ title_en: it.product_title_en, title_ar: it.product_title_ar }), t, it.id, actionId),
    );
  }
  stmts.push(
    env.DB.prepare(`UPDATE orders SET last_action_id = ?2, updated_at = ?3,
      fulfillment_status = CASE WHEN (SELECT COUNT(*) FROM order_items WHERE order_id = ?1 AND fulfillment_status NOT IN ('delivered','cancelled')) = 0 THEN 'delivered' ELSE 'partially_delivered' END,
      delivered_at = CASE WHEN (SELECT COUNT(*) FROM order_items WHERE order_id = ?1 AND fulfillment_status NOT IN ('delivered','cancelled')) = 0 THEN ?3 ELSE delivered_at END
      WHERE id = ?1 AND EXISTS (SELECT 1 FROM order_items WHERE order_id = ?1 AND last_action_id = ?2)`).bind(o.id, actionId, t),
  );
  if (input.mode === 'portal' || full) {
    const ev = full ? 'order_delivered' : 'item_delivered';
    stmts.push(...notificationStmts(env, { orderId: o.id, audience: 'customer', event: ev, channels: await planCustomerChannels(env, s, o, ev), recipientFor: recipientFor(o), dedupeBase: full ? `order_delivered:${o.id}` : `item_delivered:${actionId}` }, itemGuard));
  }
  const res = await env.DB.batch(stmts);
  const changed = itemUpdateIdx.reduce((n, i) => n + (res[i].meta.changes ?? 0), 0);
  if (changed === 0) return { already: true, order: await loadOrder(env, o.id) };
  return { already: false, order: await loadOrder(env, o.id), full };
}

export async function replaceDelivery(env: Env, actor: string, orderId: string, itemId: string, input: { mode: 'portal' | 'external'; details?: string; note?: string }) {
  const o = await loadOrder(env, orderId);
  const it = (await getItems(env, o.id)).find((x) => x.id === itemId);
  if (!it) throw notFound('item_not_found');
  if (it.fulfillment_status !== 'delivered') throw conflict('not_delivered', 'Only delivered items can receive a replacement.');
  if (input.mode === 'portal' && !(input.details && input.details.trim().length >= 2)) throw bad('details_required');
  const s = await loadSettings(env);
  const t = now();
  const actionId = randomToken(12);
  const g = guardFor(o.id, actionId);
  const deliveryId = newId('dlv');
  const enc = input.mode === 'portal' ? await encryptText(env.DATA_KEY, input.details!.trim().slice(0, 4000), 'delivery:' + deliveryId) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET last_action_id = ?, updated_at = ? WHERE id = ?').bind(actionId, t, o.id),
    env.DB.prepare(`INSERT INTO deliveries (id, order_id, item_id, kind, via, details_enc, note, created_by, created_at) VALUES (?,?,?,'replacement',?,?,?,?,?)`)
      .bind(deliveryId, o.id, it.id, input.mode, enc, (input.note ?? '').slice(0, 500), actor, t),
    guardedEvent(env, o.id, actionId, actor, 'replacement_delivered', 'customer', { title_en: it.product_title_en, title_ar: it.product_title_ar }, it.id),
    ...(input.mode === 'portal' ? notificationStmts(env, { orderId: o.id, audience: 'customer', event: 'item_delivered', channels: await planCustomerChannels(env, s, o, 'item_delivered'), recipientFor: recipientFor(o), dedupeBase: `item_delivered:${actionId}` }, g) : []),
  ]);
  return { ok: true };
}

export async function updateItemDates(env: Env, actor: string, orderId: string, itemId: string, input: { activated_at: number | null; expires_at: number | null; guarantee_until: number | null }) {
  const r = await env.DB.prepare('UPDATE order_items SET activated_at = ?, expires_at = ?, guarantee_until = ?, renewal_reminded_at = NULL WHERE id = ? AND order_id = ?')
    .bind(input.activated_at, input.expires_at, input.guarantee_until, itemId, orderId).run();
  if (r.meta.changes !== 1) throw notFound('item_not_found');
  await orderEventStmt(env, orderId, actor, 'item_dates_updated', 'internal', input, itemId).run();
  return { ok: true };
}

export async function cancelOrder(env: Env, actor: string, orderId: string, reason: string, byCustomer = false) {
  const o = await loadOrder(env, orderId);
  if (o.payment_status === 'cancelled') return { already: true };
  const allowed = byCustomer ? ['awaiting_transfer'] : ['awaiting_transfer', 'proof_submitted', 'rejected'];
  if (!allowed.includes(o.payment_status)) throw conflict('invalid_state', o.payment_status === 'verified' ? 'Paid orders are closed through the refund flow.' : `Cannot cancel in state ${o.payment_status}.`);
  const t = now();
  const actionId = randomToken(12);
  const g = guardFor(o.id, actionId);
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'cancelled', fulfillment_status = 'cancelled', cancelled_at = ?, cancel_reason = ?, last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status IN (${allowed.map(() => '?').join(',')})`)
      .bind(t, reason.slice(0, 300), actionId, t, o.id, ...allowed),
    env.DB.prepare(`UPDATE order_items SET fulfillment_status = 'cancelled' WHERE order_id = ? AND fulfillment_status != 'delivered' AND ${g.sql}`).bind(o.id, ...g.params),
    guardedEvent(env, o.id, actionId, actor, 'order_cancelled', 'customer', { reason: reason.slice(0, 300) }),
  ]);
  return { already: res[0].meta.changes !== 1 };
}

export async function requestRefund(env: Env, actor: string, orderId: string, reason: string) {
  const o = await loadOrder(env, orderId);
  if (o.payment_status === 'refund_requested') return { already: true };
  if (o.payment_status !== 'verified') throw conflict('invalid_state', 'Refunds can be recorded only for verified payments.');
  const t = now();
  const actionId = randomToken(12);
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'refund_requested', refund_requested_at = ?, refund_reason = ?, last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status = 'verified'`)
      .bind(t, reason.slice(0, 500), actionId, t, o.id),
    guardedEvent(env, o.id, actionId, actor, 'refund_requested', 'customer', {}),
    guardedEvent(env, o.id, actionId, actor, 'refund_requested_detail', 'internal', { reason: reason.slice(0, 500) }),
  ]);
  return { already: res[0].meta.changes !== 1 };
}

export async function completeRefund(env: Env, actor: string, orderId: string, input: { amount_piastres: number; reference: string; refunded_at?: number }) {
  const o = await loadOrder(env, orderId);
  if (o.payment_status === 'refunded') return { already: true };
  if (o.payment_status !== 'refund_requested') throw conflict('invalid_state', 'Record the refund request first.');
  if (!Number.isInteger(input.amount_piastres) || input.amount_piastres <= 0 || input.amount_piastres > (o.verified_amount_piastres ?? o.total_piastres)) throw bad('invalid_amount', 'Refund amount must be positive and not exceed the verified amount.');
  if (!input.reference?.trim()) throw bad('reference_required', 'Enter the refund transfer reference.');
  const t = now();
  const actionId = randomToken(12);
  const g = guardFor(o.id, actionId);
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET payment_status = 'refunded', refunded_at = ?, refund_amount_piastres = ?, refund_reference = ?, last_action_id = ?, updated_at = ? WHERE id = ? AND payment_status = 'refund_requested'`)
      .bind(input.refunded_at ?? t, input.amount_piastres, input.reference.slice(0, 120), actionId, t, o.id),
    env.DB.prepare(`UPDATE order_items SET fulfillment_status = 'cancelled' WHERE order_id = ? AND fulfillment_status IN ('not_started','processing') AND ${g.sql}`).bind(o.id, ...g.params),
    env.DB.prepare(`UPDATE orders SET fulfillment_status = CASE WHEN (SELECT COUNT(*) FROM order_items WHERE order_id = ?1 AND fulfillment_status = 'delivered') = 0 THEN 'cancelled' ELSE fulfillment_status END WHERE id = ?1 AND last_action_id = ?2`).bind(o.id, actionId),
    guardedEvent(env, o.id, actionId, actor, 'refunded', 'customer', { amount_piastres: input.amount_piastres }),
    guardedEvent(env, o.id, actionId, actor, 'refunded_detail', 'internal', { amount_piastres: input.amount_piastres, reference: input.reference }),
  ]);
  return { already: res[0].meta.changes !== 1 };
}

export async function changePaymentMethod(env: Env, o: OrderRow, methodId: string) {
  const s = await loadSettings(env);
  const m = s.payments.methods.find((x) => x.id === methodId && x.enabled && paymentMethodComplete(x));
  if (!m) throw bad('invalid_payment_method');
  const r = await env.DB.prepare(`UPDATE orders SET payment_method_id = ?, updated_at = ? WHERE id = ? AND payment_status IN ('awaiting_transfer','rejected','proof_submitted')`).bind(m.id, now(), o.id).run();
  if (r.meta.changes !== 1) throw conflict('invalid_state');
}

export async function regenerateLink(env: Env, actor: string, orderId: string) {
  const o = await loadOrder(env, orderId);
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET access_hash = ?, access_enc = ?, updated_at = ? WHERE id = ?').bind(await orderAccessHash(env, token), await encryptText(env.DATA_KEY, token, 'order-access:' + o.number), now(), o.id),
    orderEventStmt(env, o.id, actor, 'access_link_regenerated', 'internal', {}),
  ]);
  return { url: `${baseUrl(env)}/order/${o.number}#k=${token}` };
}
