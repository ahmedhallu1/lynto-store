import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { requireAdmin } from '../lib/auth';
import { decryptText, newId } from '../lib/crypto';
import { HttpError, audit, bad, conflict, notFound, now, parseCsv, parseJSON, toCsv, baseUrl, normalizePhone } from '../lib/util';
import { SECRET_KEYS, deleteSecret, getSecret, loadSettings, saveSettings, secretStatus, setSecret, type SecretKey } from '../lib/settings';
import { checkoutBlockers } from '../../shared/defaults';
import { isValidInterval, localParts, zonedToUtc } from '../../shared/schedule';
import { parseEGP, piastresToEGPString } from '../../shared/money';
import { PLAN_TYPES, type BusinessSettings } from '../../shared/types';
import { publishProblems, toPublicProduct, type CategoryRow, type PlanRow, type ProductRow } from '../services/catalog';
import {
  approvePayment, cancelOrder, completeRefund, deliverItems, regenerateLink, rejectProof, replaceDelivery, requestRefund, updateItemDates, type OrderRow,
} from '../services/orders';
import { channelHealth, dispatchPending, orderLink, sendTest } from '../services/notifications';
import { renderCustomer, WHATSAPP_TEMPLATE_GUIDE, type CustomerEvent } from '../services/messages';
import { sendPurchase } from '../services/meta';
import { aiUsageToday, draftProductCopy, geminiKey } from '../services/gemini';
import { sniffMime } from '../services/orders';
import { runScheduled } from '../services/cron';
import { composeAndSend, resendDomainStatus } from '../services/mail';
import { eraseCustomerData } from '../services/privacy';
import { createMissingTemplates, syncApprovedTemplates, whatsappStatus } from '../services/whatsapp';
import { enforceRate } from '../lib/util';

export const admin = new Hono<AppContext>();
admin.use('*', requireAdmin);
admin.use('*', async (c, next) => { c.header('cache-control', 'no-store'); await next(); });

const actor = (c: any) => `admin:${c.get('admin').id}`;
const body = async <T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> => {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) throw bad('invalid_input', r.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
};

function cairoMonthStart(t: number) {
  const p = localParts(t, 'Africa/Cairo');
  return zonedToUtc(p.y, p.m, 1, 0, 0, 'Africa/Cairo');
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------
admin.get('/dashboard', async (c) => {
  const t = now();
  const month = cairoMonthStart(t);
  const s = await loadSettings(c.env);
  const [counts, revenue, proofs, awaiting, failed, support] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'proof_submitted') AS proofs_pending,
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'awaiting_transfer') AS awaiting_transfer,
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered')) AS awaiting_delivery,
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered') AND delivery_due_at < ?1) AS overdue,
      (SELECT COUNT(*) FROM notifications WHERE status = 'failed') AS failed_notifications,
      (SELECT COUNT(*) FROM notifications WHERE status = 'manual_action_required') AS manual_notifications,
      (SELECT COUNT(*) FROM support_requests WHERE status != 'closed') AS open_support,
      (SELECT COUNT(*) FROM orders WHERE payment_status = 'refund_requested') AS refund_requests`).bind(t),
    c.env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN payment_status IN ('verified','refund_requested','refunded') THEN verified_amount_piastres END), 0) AS verified_all,
      COALESCE(SUM(CASE WHEN payment_status IN ('verified','refund_requested','refunded') AND verified_at >= ?1 THEN verified_amount_piastres END), 0) AS verified_month,
      COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN refund_amount_piastres END), 0) AS refunded_all,
      COALESCE(SUM(CASE WHEN payment_status = 'refunded' AND refunded_at >= ?1 THEN refund_amount_piastres END), 0) AS refunded_month,
      COUNT(CASE WHEN payment_status IN ('verified','refund_requested','refunded') THEN 1 END) AS paid_orders
      FROM orders`).bind(month),
    c.env.DB.prepare(`SELECT id, number, customer_name, total_piastres, payment_method_id, updated_at FROM orders WHERE payment_status = 'proof_submitted' ORDER BY updated_at LIMIT 15`),
    c.env.DB.prepare(`SELECT id, number, customer_name, total_piastres, delivery_due_at, fulfillment_status FROM orders WHERE payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered') ORDER BY delivery_due_at LIMIT 20`),
    c.env.DB.prepare(`SELECT n.id, n.order_id, n.event, n.channel, n.status, n.last_error, n.updated_at, o.number FROM notifications n LEFT JOIN orders o ON o.id = n.order_id WHERE n.status IN ('failed','manual_action_required') ORDER BY n.updated_at DESC LIMIT 15`),
    c.env.DB.prepare(`SELECT id, number, name, topic, created_at FROM support_requests WHERE status != 'closed' ORDER BY created_at DESC LIMIT 10`),
  ]);
  const productStats = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM products GROUP BY status`).all<{ status: string; n: number }>();
  return c.json({
    now: t, counts: counts.results[0], revenue: revenue.results[0], proofs: proofs.results, awaiting_delivery: awaiting.results,
    attention: failed.results, support: support.results, products: Object.fromEntries(productStats.results.map((r) => [r.status, r.n])),
    blockers: checkoutBlockers(s), accepting_orders: s.store.accepting_orders,
  });
});

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------
admin.get('/orders', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const view = c.req.query('view') ?? 'all';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
  const where: string[] = [];
  const params: unknown[] = [];
  if (view === 'proofs') where.push(`payment_status = 'proof_submitted'`);
  else if (view === 'awaiting_transfer') where.push(`payment_status IN ('awaiting_transfer','rejected')`);
  else if (view === 'to_deliver') where.push(`payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered')`);
  else if (view === 'overdue') { where.push(`payment_status = 'verified' AND fulfillment_status IN ('not_started','processing','partially_delivered') AND delivery_due_at < ?`); params.push(now()); }
  else if (view === 'delivered') where.push(`fulfillment_status = 'delivered'`);
  else if (view === 'refunds') where.push(`payment_status IN ('refund_requested','refunded')`);
  else if (view === 'cancelled') where.push(`payment_status = 'cancelled'`);
  if (q) {
    where.push(`(number LIKE ? OR customer_email LIKE ? OR customer_name LIKE ? OR customer_whatsapp LIKE ? OR verified_reference LIKE ?)`);
    const like = `%${q.replace(/[%_]/g, '')}%`;
    params.push(like.toUpperCase(), like.toLowerCase(), like, like.replace(/\s/g, ''), like);
  }
  const order = view === 'to_deliver' || view === 'overdue' ? 'delivery_due_at ASC' : view === 'proofs' ? 'updated_at ASC' : 'created_at DESC';
  const sql = `SELECT id, number, customer_name, customer_email, customer_whatsapp, total_piastres, payment_status, fulfillment_status, payment_method_id, delivery_due_at, created_at, updated_at
    FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const rows = await c.env.DB.prepare(sql).bind(...params, limit, offset).all();
  return c.json({ orders: rows.results, now: now() });
});

admin.get('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const o = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!o) throw notFound('order_not_found');
  const [items, proofs, deliveries, events, notes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort').bind(id),
    c.env.DB.prepare('SELECT id, mime, size, sha256, transaction_ref, payer_note, status, reject_reason, created_at, reviewed_at, reviewed_by FROM payment_proofs WHERE order_id = ? ORDER BY created_at DESC').bind(id),
    c.env.DB.prepare('SELECT id, item_id, kind, via, note, created_by, created_at, (details_enc IS NOT NULL) AS has_details FROM deliveries WHERE order_id = ? ORDER BY created_at DESC').bind(id),
    c.env.DB.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC').bind(id),
    c.env.DB.prepare('SELECT id, event, channel, recipient, status, provider, provider_message_id, attempts, last_error, manual_note, created_at, updated_at, sent_at, delivered_at FROM notifications WHERE order_id = ? ORDER BY created_at DESC').bind(id),
  ]);
  const s = await loadSettings(c.env);
  const { access_hash, access_enc, idem_hash, ...safe } = o as any;
  return c.json({
    order: safe,
    items: (items.results as any[]).map((i) => ({ ...i, customer_fields: parseJSON(i.customer_fields, {}) })),
    proofs: proofs.results, deliveries: deliveries.results,
    events: (events.results as any[]).map((e) => ({ ...e, data: parseJSON(e.data, {}) })),
    notifications: notes.results,
    payment_method: s.payments.methods.find((m) => m.id === o.payment_method_id) ?? null,
    tracking_url: o.access_enc === 'deleted' ? null : await orderLink(c.env, o),
    timezone: s.schedule.timezone,
  });
});

admin.post('/orders/:id/approve', async (c) => {
  const b = await body(c, z.object({ amount_egp: z.union([z.string(), z.number()]), reference: z.string().trim().min(1, 'Enter the transfer reference').max(120), confirm_mismatch: z.boolean().default(false) }));
  const amount = parseEGP(b.amount_egp);
  if (!amount) throw bad('invalid_amount', 'Enter the amount you received in EGP.');
  const r = await approvePayment(c.env, actor(c), c.req.param('id'), { amount_piastres: amount, reference: b.reference, confirm_mismatch: b.confirm_mismatch });
  if (!r.already) {
    await audit(c.env, actor(c), 'payment_approved', 'order', c.req.param('id'), { amount_piastres: amount, reference: b.reference });
    c.executionCtx.waitUntil(Promise.all([dispatchPending(c.env, { orderId: c.req.param('id') }), sendPurchase(c.env, c.req.param('id'))]).catch(() => {}));
  }
  return c.json({ already: r.already });
});

admin.post('/orders/:id/reject', async (c) => {
  const b = await body(c, z.object({ reason: z.string().trim().min(3).max(300) }));
  const r = await rejectProof(c.env, actor(c), c.req.param('id'), b.reason);
  if (!r.already) c.executionCtx.waitUntil(dispatchPending(c.env, { orderId: c.req.param('id') }).catch(() => {}));
  return c.json(r);
});

const dateish = z.union([z.number().int(), z.null()]).optional();
admin.post('/orders/:id/deliver', async (c) => {
  const b = await body(c, z.object({
    mode: z.enum(['portal', 'external']),
    note: z.string().max(500).optional(),
    items: z.array(z.object({ item_id: z.string(), details: z.string().max(4000).optional(), activated_at: dateish, expires_at: dateish })).min(1).max(20),
  }));
  const r = await deliverItems(c.env, actor(c), c.req.param('id'), b);
  if (!r.already) {
    await audit(c.env, actor(c), b.mode === 'portal' ? 'delivered_portal' : 'delivered_external', 'order', c.req.param('id'), { items: b.items.map((i) => i.item_id) });
    c.executionCtx.waitUntil(dispatchPending(c.env, { orderId: c.req.param('id') }).catch(() => {}));
  }
  return c.json({ already: r.already, full: (r as any).full ?? false });
});

admin.post('/orders/:id/items/:itemId/replacement', async (c) => {
  const b = await body(c, z.object({ mode: z.enum(['portal', 'external']), details: z.string().max(4000).optional(), note: z.string().max(500).optional() }));
  const r = await replaceDelivery(c.env, actor(c), c.req.param('id'), c.req.param('itemId'), b);
  await audit(c.env, actor(c), 'replacement_delivered', 'order', c.req.param('id'), { item: c.req.param('itemId') });
  c.executionCtx.waitUntil(dispatchPending(c.env, { orderId: c.req.param('id') }).catch(() => {}));
  return c.json(r);
});

admin.post('/orders/:id/items/:itemId/dates', async (c) => {
  const b = await body(c, z.object({ activated_at: z.number().int().nullable(), expires_at: z.number().int().nullable(), guarantee_until: z.number().int().nullable() }));
  return c.json(await updateItemDates(c.env, actor(c), c.req.param('id'), c.req.param('itemId'), b));
});

admin.post('/orders/:id/cancel', async (c) => {
  const b = await body(c, z.object({ reason: z.string().trim().min(2).max(300) }));
  const r = await cancelOrder(c.env, actor(c), c.req.param('id'), b.reason);
  await audit(c.env, actor(c), 'order_cancelled', 'order', c.req.param('id'), b);
  return c.json(r);
});

admin.post('/orders/:id/refund-request', async (c) => {
  const b = await body(c, z.object({ reason: z.string().trim().min(2).max(500) }));
  const r = await requestRefund(c.env, actor(c), c.req.param('id'), b.reason);
  await audit(c.env, actor(c), 'refund_requested', 'order', c.req.param('id'), b);
  return c.json(r);
});

admin.post('/orders/:id/refund-complete', async (c) => {
  const b = await body(c, z.object({ amount_egp: z.union([z.string(), z.number()]), reference: z.string().trim().min(1).max(120), refunded_at: z.number().int().optional() }));
  const amount = parseEGP(b.amount_egp);
  if (!amount) throw bad('invalid_amount');
  const r = await completeRefund(c.env, actor(c), c.req.param('id'), { amount_piastres: amount, reference: b.reference, refunded_at: b.refunded_at });
  await audit(c.env, actor(c), 'refund_completed', 'order', c.req.param('id'), { amount_piastres: amount, reference: b.reference });
  return c.json(r);
});

admin.post('/orders/:id/notes', async (c) => {
  const b = await body(c, z.object({ notes: z.string().max(4000) }));
  const r = await c.env.DB.prepare('UPDATE orders SET internal_notes = ?, updated_at = ? WHERE id = ?').bind(b.notes, now(), c.req.param('id')).run();
  if (r.meta.changes !== 1) throw notFound();
  return c.json({ ok: true });
});

admin.post('/orders/:id/regenerate-link', async (c) => {
  const r = await regenerateLink(c.env, actor(c), c.req.param('id'));
  await audit(c.env, actor(c), 'order_link_regenerated', 'order', c.req.param('id'));
  return c.json(r);
});

admin.get('/proofs/:id/file', async (c) => {
  const p = await c.env.DB.prepare('SELECT file_key, mime, order_id FROM payment_proofs WHERE id = ?').bind(c.req.param('id')).first<{ file_key: string; mime: string; order_id: string }>();
  if (!p) throw notFound();
  const obj = await c.env.FILES.get(p.file_key);
  if (!obj) throw notFound('file_missing');
  return new Response(obj.body, {
    headers: {
      'content-type': p.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'content-disposition': 'inline',
    },
  });
});

admin.get('/deliveries/:id', async (c) => {
  const d = await c.env.DB.prepare('SELECT * FROM deliveries WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!d) throw notFound();
  const details = d.details_enc ? await decryptText(c.env.DATA_KEY, d.details_enc, 'delivery:' + d.id) : null;
  await audit(c.env, actor(c), 'delivery_details_viewed', 'order', d.order_id, { delivery: d.id });
  return c.json({ details });
});

// ---------------------------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------------------------
admin.get('/notifications', async (c) => {
  const status = c.req.query('status');
  const rows = await c.env.DB.prepare(`SELECT n.*, o.number FROM notifications n LEFT JOIN orders o ON o.id = n.order_id ${status ? 'WHERE n.status = ?' : ''} ORDER BY n.created_at DESC LIMIT 200`)
    .bind(...(status ? [status] : [])).all();
  return c.json({ notifications: (rows.results as any[]).map(({ payload, ...r }) => r) });
});

admin.post('/notifications/:id/retry', async (c) => {
  const r = await c.env.DB.prepare(`UPDATE notifications SET status = 'pending', attempts = 0, next_attempt_at = 0, lock_until = 0, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'failed'`).bind(now(), c.req.param('id')).run();
  if (r.meta.changes !== 1) throw conflict('not_failed', 'Only failed notifications can be retried.');
  const n = await c.env.DB.prepare('SELECT order_id FROM notifications WHERE id = ?').bind(c.req.param('id')).first<{ order_id: string | null }>();
  await dispatchPending(c.env, n?.order_id ? { orderId: n.order_id } : {});
  const after = await c.env.DB.prepare('SELECT status, last_error FROM notifications WHERE id = ?').bind(c.req.param('id')).first();
  return c.json({ notification: after });
});

admin.post('/notifications/:id/mark-sent', async (c) => {
  const b = await body(c, z.object({ note: z.string().max(300).default('Sent manually by owner') }));
  const r = await c.env.DB.prepare(`UPDATE notifications SET status = 'sent', provider = 'manual', manual_note = ?, sent_at = ?, updated_at = ? WHERE id = ? AND status IN ('manual_action_required','failed')`)
    .bind(b.note, now(), now(), c.req.param('id')).run();
  if (r.meta.changes !== 1) throw conflict('invalid_state');
  await audit(c.env, actor(c), 'notification_marked_manual', 'notification', c.req.param('id'), b);
  return c.json({ ok: true });
});

admin.get('/notifications/:id/whatsapp', async (c) => {
  const n = await c.env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!n || !n.order_id || n.audience !== 'customer') throw notFound();
  const o = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(n.order_id).first<any>();
  if (o.access_enc === 'deleted') throw conflict('data_erased', 'This customer\'s personal data was erased.');
  const link = await orderLink(c.env, o);
  const payload = parseJSON<any>(n.payload, {});
  const r = renderCustomer(n.event as CustomerEvent, { lang: o.lang, name: o.customer_name, number: o.number, total_piastres: o.total_piastres, link, due_at: o.delivery_due_at, reason: payload.reason, product: payload.product, expires_at: payload.expires_at, store_url: baseUrl(c.env) });
  const text = `${r.text}\n\n${r.cta}: ${n.event === 'renewal_reminder' ? baseUrl(c.env) : link}`;
  return c.json({ text, url: `https://wa.me/${o.customer_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` });
});

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------
const customerFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), type: z.enum(['text', 'email', 'select']), required: z.boolean(),
  label_ar: z.string().max(120), label_en: z.string().max(120), help_ar: z.string().max(300).optional(), help_en: z.string().max(300).optional(),
  pattern: z.string().max(120).optional(), options: z.array(z.object({ value: z.string().max(60), label_ar: z.string().max(80), label_en: z.string().max(80) })).max(30).optional(),
});
const planSchema = z.object({
  id: z.string().max(64).optional(), name_ar: z.string().trim().min(1).max(120), name_en: z.string().trim().min(1).max(120),
  plan_type: z.enum(PLAN_TYPES), duration_value: z.number().int().min(1).max(120).nullable(), duration_unit: z.enum(['day', 'month', 'year']).nullable(),
  is_perpetual: z.boolean(), price_egp: z.union([z.string(), z.number(), z.null()]), status: z.enum(['proposed', 'approved', 'retired']),
  availability: z.enum(['available', 'unavailable']), max_qty: z.number().int().min(1).max(20),
  guarantee_kind: z.enum(['full_period', 'days', 'none', 'pending']), guarantee_days: z.number().int().min(1).max(730).nullable(),
  notes_ar: z.string().max(500).default(''), notes_en: z.string().max(500).default(''), sort: z.number().int().default(0),
});
const productSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), category_id: z.string().max(40), brand: z.string().max(80),
  title_ar: z.string().trim().min(1).max(160), title_en: z.string().trim().min(1).max(160),
  summary_ar: z.string().max(300), summary_en: z.string().max(300), description_ar: z.string().max(4000), description_en: z.string().max(4000),
  features_ar: z.array(z.string().max(200)).max(12), features_en: z.array(z.string().max(200)).max(12),
  delivery_ar: z.string().max(1000), delivery_en: z.string().max(1000), guarantee_ar: z.string().max(2000), guarantee_en: z.string().max(2000),
  customer_fields: z.array(customerFieldSchema).max(8), owner_instructions: z.string().max(4000),
  image_key: z.string().max(64).nullable(), icon_text: z.string().max(6), accent: z.string().regex(/^(#[0-9a-fA-F]{6})?$/),
  featured: z.boolean(), supply_status: z.enum(['pending', 'validated', 'unavailable']), supply_notes: z.string().max(4000), official_url: z.string().max(300),
  sort: z.number().int(), plans: z.array(planSchema).max(20),
});

async function loadProductFull(c: any, id: string) {
  const p = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first() as ProductRow | null;
  if (!p) throw notFound('product_not_found');
  const plans = (await c.env.DB.prepare('SELECT * FROM plans WHERE product_id = ? ORDER BY sort').bind(id).all()).results as PlanRow[];
  return { p, plans };
}
const productOut = (p: ProductRow, plans: PlanRow[]) => ({
  ...p, featured: !!p.featured, features_ar: parseJSON(p.features_ar, []), features_en: parseJSON(p.features_en, []), customer_fields: parseJSON(p.customer_fields, []),
  plans: plans.map((pl) => ({ ...pl, is_perpetual: !!pl.is_perpetual, price_egp: piastresToEGPString(pl.price_piastres) })),
  publish_problems: publishProblems(p, plans),
});

admin.get('/categories', async (c) => c.json({ categories: (await c.env.DB.prepare('SELECT * FROM categories ORDER BY sort').all()).results }));
admin.put('/categories/:id', async (c) => {
  const b = await body(c, z.object({ name_ar: z.string().min(1).max(80), name_en: z.string().min(1).max(80), description_ar: z.string().max(300), description_en: z.string().max(300), sort: z.number().int() }));
  await c.env.DB.prepare('UPDATE categories SET name_ar = ?, name_en = ?, description_ar = ?, description_en = ?, sort = ? WHERE id = ?').bind(b.name_ar, b.name_en, b.description_ar, b.description_en, b.sort, c.req.param('id')).run();
  await audit(c.env, actor(c), 'category_updated', 'category', c.req.param('id'), b);
  return c.json({ ok: true });
});

admin.get('/products', async (c) => {
  const [prods, plans] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM products ORDER BY sort, title_en'),
    c.env.DB.prepare('SELECT * FROM plans ORDER BY sort'),
  ]);
  const byP = new Map<string, PlanRow[]>();
  for (const pl of plans.results as PlanRow[]) byP.set(pl.product_id, [...(byP.get(pl.product_id) ?? []), pl]);
  return c.json({ products: (prods.results as ProductRow[]).map((p) => productOut(p, byP.get(p.id) ?? [])) });
});

admin.get('/products/:id', async (c) => {
  const { p, plans } = await loadProductFull(c, c.req.param('id'));
  return c.json({ product: productOut(p, plans) });
});

admin.get('/products/:id/preview', async (c) => {
  const { p, plans } = await loadProductFull(c, c.req.param('id'));
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(p.category_id).first<CategoryRow>();
  return c.json({ product: toPublicProduct(p, cat!, plans, { preview: true }), status: p.status, problems: publishProblems(p, plans) });
});

async function saveProduct(c: any, id: string, data: z.infer<typeof productSchema>, isNew: boolean) {
  const t = now();
  const existing = isNew ? null : ((await c.env.DB.prepare('SELECT status FROM products WHERE id = ?').bind(id).first()) as { status: string } | null);
  if (!isNew && !existing) throw notFound('product_not_found');
  const planRows: PlanRow[] = [];
  for (const [i, pl] of data.plans.entries()) {
    const price = pl.price_egp === null || pl.price_egp === '' ? null : parseEGP(pl.price_egp);
    if (pl.price_egp !== null && pl.price_egp !== '' && price === null) throw bad('invalid_price', `Plan "${pl.name_en}" has an invalid price.`);
    if (pl.status === 'approved' && !price) throw bad('price_required', `Plan "${pl.name_en}" cannot be approved without a price.`);
    planRows.push({
      id: pl.id && /^pln_[a-z0-9_]+$/.test(pl.id) ? pl.id : newId('pln'), product_id: id, name_ar: pl.name_ar, name_en: pl.name_en, plan_type: pl.plan_type,
      duration_value: pl.is_perpetual ? null : pl.duration_value, duration_unit: pl.is_perpetual ? null : pl.duration_unit, is_perpetual: pl.is_perpetual ? 1 : 0,
      price_piastres: price, status: pl.status, availability: pl.availability, max_qty: pl.max_qty, guarantee_kind: pl.guarantee_kind,
      guarantee_days: pl.guarantee_kind === 'days' ? pl.guarantee_days : null, notes_ar: pl.notes_ar, notes_en: pl.notes_en, sort: pl.sort || i + 1, created_at: t, updated_at: t,
    });
  }
  const row: ProductRow = {
    id, slug: data.slug, category_id: data.category_id, brand: data.brand, title_ar: data.title_ar, title_en: data.title_en, summary_ar: data.summary_ar, summary_en: data.summary_en,
    description_ar: data.description_ar, description_en: data.description_en, features_ar: JSON.stringify(data.features_ar.filter(Boolean)), features_en: JSON.stringify(data.features_en.filter(Boolean)),
    delivery_ar: data.delivery_ar, delivery_en: data.delivery_en, guarantee_ar: data.guarantee_ar, guarantee_en: data.guarantee_en,
    customer_fields: JSON.stringify(data.customer_fields), owner_instructions: data.owner_instructions, image_key: data.image_key, icon_text: data.icon_text, accent: data.accent,
    status: (existing?.status as any) ?? 'draft', featured: data.featured ? 1 : 0, supply_status: data.supply_status, supply_notes: data.supply_notes, official_url: data.official_url,
    sort: data.sort, created_at: t, updated_at: t, published_at: null,
  };
  if (row.status === 'published') {
    const problems = publishProblems(row, planRows);
    if (problems.length) throw conflict('publish_validation', 'This product is published; these changes would make it invalid. Unpublish first or fix:', problems);
  }
  const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(data.category_id).first();
  if (!cat) throw bad('invalid_category');
  const slugClash = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').bind(data.slug, id).first();
  if (slugClash) throw conflict('slug_taken', 'Another product already uses this URL slug.');

  const keepIds = planRows.map((p) => p.id);
  const existingPlans = (await c.env.DB.prepare('SELECT id FROM plans WHERE product_id = ?').bind(id).all()).results as Array<{ id: string }>;
  const removed = existingPlans.filter((p) => !keepIds.includes(p.id)).map((p) => p.id);
  const stmts: D1PreparedStatement[] = [];
  if (isNew) {
    stmts.push(c.env.DB.prepare(`INSERT INTO products (id, slug, category_id, brand, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, features_ar, features_en, delivery_ar, delivery_en, guarantee_ar, guarantee_en, customer_fields, owner_instructions, image_key, icon_text, accent, status, featured, supply_status, supply_notes, official_url, sort, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?)`).bind(
      id, row.slug, row.category_id, row.brand, row.title_ar, row.title_en, row.summary_ar, row.summary_en, row.description_ar, row.description_en, row.features_ar, row.features_en,
      row.delivery_ar, row.delivery_en, row.guarantee_ar, row.guarantee_en, row.customer_fields, row.owner_instructions, row.image_key, row.icon_text, row.accent, row.featured,
      row.supply_status, row.supply_notes, row.official_url, row.sort, t, t));
  } else {
    stmts.push(c.env.DB.prepare(`UPDATE products SET slug=?, category_id=?, brand=?, title_ar=?, title_en=?, summary_ar=?, summary_en=?, description_ar=?, description_en=?, features_ar=?, features_en=?, delivery_ar=?, delivery_en=?, guarantee_ar=?, guarantee_en=?, customer_fields=?, owner_instructions=?, image_key=?, icon_text=?, accent=?, featured=?, supply_status=?, supply_notes=?, official_url=?, sort=?, updated_at=? WHERE id=?`).bind(
      row.slug, row.category_id, row.brand, row.title_ar, row.title_en, row.summary_ar, row.summary_en, row.description_ar, row.description_en, row.features_ar, row.features_en,
      row.delivery_ar, row.delivery_en, row.guarantee_ar, row.guarantee_en, row.customer_fields, row.owner_instructions, row.image_key, row.icon_text, row.accent, row.featured,
      row.supply_status, row.supply_notes, row.official_url, row.sort, t, id));
  }
  for (const rid of removed) {
    stmts.push(c.env.DB.prepare(`DELETE FROM plans WHERE id = ? AND NOT EXISTS (SELECT 1 FROM order_items WHERE plan_id = ?)`).bind(rid, rid));
    stmts.push(c.env.DB.prepare(`UPDATE plans SET status = 'retired', updated_at = ? WHERE id = ?`).bind(t, rid));
  }
  for (const pl of planRows) {
    stmts.push(c.env.DB.prepare(`INSERT INTO plans (id, product_id, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, guarantee_days, notes_ar, notes_en, sort, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_ar=excluded.name_ar, name_en=excluded.name_en, plan_type=excluded.plan_type, duration_value=excluded.duration_value,
      duration_unit=excluded.duration_unit, is_perpetual=excluded.is_perpetual, price_piastres=excluded.price_piastres, status=excluded.status, availability=excluded.availability, max_qty=excluded.max_qty,
      guarantee_kind=excluded.guarantee_kind, guarantee_days=excluded.guarantee_days, notes_ar=excluded.notes_ar, notes_en=excluded.notes_en, sort=excluded.sort, updated_at=excluded.updated_at WHERE plans.product_id = excluded.product_id`).bind(
      pl.id, id, pl.name_ar, pl.name_en, pl.plan_type, pl.duration_value, pl.duration_unit, pl.is_perpetual, pl.price_piastres, pl.status, pl.availability, pl.max_qty, pl.guarantee_kind, pl.guarantee_days, pl.notes_ar, pl.notes_en, pl.sort, t, t));
  }
  await c.env.DB.batch(stmts);
  await audit(c.env, actor(c), isNew ? 'product_created' : 'product_updated', 'product', id, { slug: data.slug, plans: planRows.map((p) => ({ id: p.id, price: p.price_piastres, status: p.status })) });
}

admin.post('/products', async (c) => {
  const data = await body(c, productSchema);
  const id = newId('prd');
  await saveProduct(c, id, data, true);
  const { p, plans } = await loadProductFull(c, id);
  return c.json({ product: productOut(p, plans) }, 201);
});

admin.put('/products/:id', async (c) => {
  const data = await body(c, productSchema);
  await saveProduct(c, c.req.param('id'), data, false);
  const { p, plans } = await loadProductFull(c, c.req.param('id'));
  return c.json({ product: productOut(p, plans) });
});

admin.post('/products/:id/duplicate', async (c) => {
  const { p, plans } = await loadProductFull(c, c.req.param('id'));
  const id = newId('prd');
  const t = now();
  let slug = `${p.slug}-copy`;
  for (let i = 2; await c.env.DB.prepare('SELECT 1 FROM products WHERE slug = ?').bind(slug).first(); i++) slug = `${p.slug}-copy-${i}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO products (id, slug, category_id, brand, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, features_ar, features_en, delivery_ar, delivery_en, guarantee_ar, guarantee_en, customer_fields, owner_instructions, image_key, icon_text, accent, status, featured, supply_status, supply_notes, official_url, sort, created_at, updated_at)
      SELECT ?, ?, category_id, brand, title_ar || ' (نسخة)', title_en || ' (copy)', summary_ar, summary_en, description_ar, description_en, features_ar, features_en, delivery_ar, delivery_en, guarantee_ar, guarantee_en, customer_fields, owner_instructions, image_key, icon_text, accent, 'draft', 0, 'pending', supply_notes, official_url, sort + 1, ?, ? FROM products WHERE id = ?`)
      .bind(id, slug, t, t, p.id),
    ...plans.filter((pl) => pl.status !== 'retired').map((pl) => c.env.DB.prepare(`INSERT INTO plans (id, product_id, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, guarantee_days, notes_ar, notes_en, sort, created_at, updated_at)
      SELECT ?, ?, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, 'proposed', availability, max_qty, guarantee_kind, guarantee_days, notes_ar, notes_en, sort, ?, ? FROM plans WHERE id = ?`).bind(newId('pln'), id, t, t, pl.id)),
  ]);
  await audit(c.env, actor(c), 'product_duplicated', 'product', id, { from: p.id });
  return c.json({ id }, 201);
});

async function setStatus(c: any, id: string, status: 'draft' | 'published' | 'archived') {
  const { p, plans } = await loadProductFull(c, id);
  if (status === 'published') {
    const problems = publishProblems(p, plans);
    if (problems.length) return { id, ok: false, problems };
  }
  await c.env.DB.prepare(`UPDATE products SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ?`).bind(status, status, now(), now(), id).run();
  await audit(c.env, actor(c), `product_${status}`, 'product', id);
  return { id, ok: true, problems: [] as string[] };
}

admin.post('/products/:id/status', async (c) => {
  const b = await body(c, z.object({ status: z.enum(['draft', 'published', 'archived']) }));
  const r = await setStatus(c, c.req.param('id'), b.status);
  if (!r.ok) throw conflict('publish_validation', 'Cannot publish yet:', r.problems);
  return c.json(r);
});

admin.post('/products/bulk', async (c) => {
  const b = await body(c, z.object({ ids: z.array(z.string()).min(1).max(100), action: z.enum(['publish', 'unpublish', 'archive', 'feature', 'unfeature', 'set_category', 'set_supply']), value: z.string().optional() }));
  const results = [];
  for (const id of b.ids) {
    if (b.action === 'publish') results.push(await setStatus(c, id, 'published'));
    else if (b.action === 'unpublish') results.push(await setStatus(c, id, 'draft'));
    else if (b.action === 'archive') results.push(await setStatus(c, id, 'archived'));
    else if (b.action === 'feature' || b.action === 'unfeature') {
      await c.env.DB.prepare('UPDATE products SET featured = ?, updated_at = ? WHERE id = ?').bind(b.action === 'feature' ? 1 : 0, now(), id).run();
      results.push({ id, ok: true, problems: [] });
    } else if (b.action === 'set_category') {
      if (!(await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(b.value ?? '').first())) throw bad('invalid_category');
      await c.env.DB.prepare('UPDATE products SET category_id = ?, updated_at = ? WHERE id = ?').bind(b.value, now(), id).run();
      results.push({ id, ok: true, problems: [] });
    } else if (b.action === 'set_supply') {
      if (!['pending', 'validated', 'unavailable'].includes(b.value ?? '')) throw bad('invalid_value');
      const cur = await c.env.DB.prepare('SELECT status FROM products WHERE id = ?').bind(id).first<{ status: string }>();
      if (cur?.status === 'published' && b.value !== 'validated') { results.push({ id, ok: false, problems: ['Unpublish before changing supply status.'] }); continue; }
      await c.env.DB.prepare('UPDATE products SET supply_status = ?, updated_at = ? WHERE id = ?').bind(b.value, now(), id).run();
      results.push({ id, ok: true, problems: [] });
    }
  }
  await audit(c.env, actor(c), 'products_bulk', 'product', '', { action: b.action, value: b.value, ids: b.ids });
  return c.json({ results });
});

admin.post('/plans/bulk', async (c) => {
  const b = await body(c, z.object({ plans: z.array(z.object({ id: z.string(), price_egp: z.union([z.string(), z.number(), z.null()]), status: z.enum(['proposed', 'approved', 'retired']), availability: z.enum(['available', 'unavailable']) })).min(1).max(200) }));
  const errors: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const pl of b.plans) {
    const price = pl.price_egp === null || pl.price_egp === '' ? null : parseEGP(pl.price_egp);
    if (pl.price_egp !== null && pl.price_egp !== '' && price === null) { errors.push(`${pl.id}: invalid price`); continue; }
    if (pl.status === 'approved' && !price) { errors.push(`${pl.id}: approval needs a price`); continue; }
    stmts.push(c.env.DB.prepare('UPDATE plans SET price_piastres = ?, status = ?, availability = ?, updated_at = ? WHERE id = ?').bind(price, pl.status, pl.availability, now(), pl.id));
  }
  if (errors.length) throw bad('invalid_plans', errors.join('; '));
  // Published products must stay valid after the change.
  await c.env.DB.batch(stmts);
  const published = (await c.env.DB.prepare(`SELECT DISTINCT p.id FROM products p JOIN plans pl ON pl.product_id = p.id WHERE p.status = 'published' AND pl.id IN (${b.plans.map(() => '?').join(',')})`).bind(...b.plans.map((p) => p.id)).all<{ id: string }>()).results;
  const unpublished: string[] = [];
  for (const { id } of published) {
    const { p, plans } = await loadProductFull(c, id);
    if (publishProblems(p, plans).length) { await c.env.DB.prepare(`UPDATE products SET status = 'draft', updated_at = ? WHERE id = ?`).bind(now(), id).run(); unpublished.push(p.title_en); }
  }
  await audit(c.env, actor(c), 'plans_bulk', 'plan', '', { plans: b.plans, unpublished });
  return c.json({ ok: true, unpublished });
});

// ---- Media (product images) ----
admin.post('/media', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw bad('file_required');
  const f = file as File;
  if (f.size > 2 * 1024 * 1024) throw bad('file_size', 'Images must be under 2 MB.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !mime.startsWith('image/')) throw bad('file_type', 'Use JPG, PNG or WEBP.');
  const id = newId('med');
  await c.env.FILES.put(`media/${id}`, bytes, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare('INSERT INTO media (id, file_key, mime, size, created_at) VALUES (?,?,?,?,?)').bind(id, `media/${id}`, mime, bytes.length, now()).run();
  return c.json({ id, url: `/media/${id}` }, 201);
});

// ---- CSV ----
const PRODUCT_CSV_COLUMNS = ['product_id', 'slug', 'category', 'brand', 'title_ar', 'title_en', 'product_status', 'supply_status', 'plan_id', 'plan_name_ar', 'plan_name_en', 'plan_type', 'duration_value', 'duration_unit', 'is_perpetual', 'price_egp', 'plan_status', 'availability', 'max_qty', 'guarantee_kind', 'guarantee_days'];

admin.get('/export/products.csv', async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT p.id AS product_id, p.slug, cat.slug AS category, p.brand, p.title_ar, p.title_en, p.status AS product_status, p.supply_status,
    pl.id AS plan_id, pl.name_ar AS plan_name_ar, pl.name_en AS plan_name_en, pl.plan_type, pl.duration_value, pl.duration_unit, pl.is_perpetual, pl.price_piastres, pl.status AS plan_status, pl.availability, pl.max_qty, pl.guarantee_kind, pl.guarantee_days
    FROM products p JOIN categories cat ON cat.id = p.category_id LEFT JOIN plans pl ON pl.product_id = p.id ORDER BY p.sort, pl.sort`).all<any>()).results;
  const csv = toCsv(rows.map((r) => ({ ...r, price_egp: piastresToEGPString(r.price_piastres) })), PRODUCT_CSV_COLUMNS);
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="lynto-products-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
});

admin.post('/import/products', async (c) => {
  const b = await body(c, z.object({ csv: z.string().max(1_000_000), dry_run: z.boolean().default(true) }));
  const rows = parseCsv(b.csv);
  if (!rows.length) throw bad('empty_csv');
  const missing = PRODUCT_CSV_COLUMNS.filter((col) => !(col in rows[0]));
  if (missing.length) throw bad('missing_columns', `Missing columns: ${missing.join(', ')}`);
  const cats = new Map(((await c.env.DB.prepare('SELECT id, slug FROM categories').all<any>()).results).map((r: any) => [r.slug, r.id]));
  const errors: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  const statusRequests = new Map<string, string>();
  const t = now();
  let productUpdates = 0, planUpdates = 0, planCreates = 0;
  const seenProducts = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const product = (await c.env.DB.prepare('SELECT id FROM products WHERE id = ? OR slug = ?').bind(r.product_id, r.slug).first<{ id: string }>());
    if (!product) { errors.push(`Row ${line}: product "${r.product_id || r.slug}" not found (create new products in the editor).`); continue; }
    const catId = cats.get(r.category);
    if (!catId) { errors.push(`Row ${line}: unknown category "${r.category}".`); continue; }
    if (!['pending', 'validated', 'unavailable'].includes(r.supply_status)) { errors.push(`Row ${line}: invalid supply_status.`); continue; }
    if (!seenProducts.has(product.id)) {
      seenProducts.add(product.id);
      productUpdates++;
      stmts.push(c.env.DB.prepare('UPDATE products SET category_id = ?, brand = ?, title_ar = ?, title_en = ?, supply_status = ?, updated_at = ? WHERE id = ?').bind(catId, r.brand, r.title_ar, r.title_en, r.supply_status, t, product.id));
      if (['draft', 'published', 'archived'].includes(r.product_status)) statusRequests.set(product.id, r.product_status);
    }
    if (!r.plan_name_en && !r.plan_id) continue;
    const price = r.price_egp ? parseEGP(r.price_egp) : null;
    if (r.price_egp && price === null) { errors.push(`Row ${line}: invalid price "${r.price_egp}".`); continue; }
    if (!PLAN_TYPES.includes(r.plan_type as any)) { errors.push(`Row ${line}: invalid plan_type.`); continue; }
    if (!['proposed', 'approved', 'retired'].includes(r.plan_status)) { errors.push(`Row ${line}: invalid plan_status.`); continue; }
    if (r.plan_status === 'approved' && !price) { errors.push(`Row ${line}: approved plan needs price_egp.`); continue; }
    if (!['available', 'unavailable'].includes(r.availability)) { errors.push(`Row ${line}: invalid availability.`); continue; }
    if (!['full_period', 'days', 'none', 'pending'].includes(r.guarantee_kind)) { errors.push(`Row ${line}: invalid guarantee_kind.`); continue; }
    const perpetual = ['1', 'true', 'yes'].includes(r.is_perpetual.toLowerCase());
    const dv = perpetual || !r.duration_value ? null : Number(r.duration_value);
    const du = perpetual || !r.duration_unit ? null : r.duration_unit;
    if (du && !['day', 'month', 'year'].includes(du)) { errors.push(`Row ${line}: invalid duration_unit.`); continue; }
    const vals = [r.plan_name_ar, r.plan_name_en, r.plan_type, dv, du, perpetual ? 1 : 0, price, r.plan_status, r.availability, Math.min(Math.max(Number(r.max_qty) || 1, 1), 20), r.guarantee_kind, r.guarantee_kind === 'days' ? Number(r.guarantee_days) || null : null, t];
    const existingPlan = r.plan_id ? await c.env.DB.prepare('SELECT id FROM plans WHERE id = ? AND product_id = ?').bind(r.plan_id, product.id).first() : null;
    if (existingPlan) {
      planUpdates++;
      stmts.push(c.env.DB.prepare('UPDATE plans SET name_ar=?, name_en=?, plan_type=?, duration_value=?, duration_unit=?, is_perpetual=?, price_piastres=?, status=?, availability=?, max_qty=?, guarantee_kind=?, guarantee_days=?, updated_at=? WHERE id = ?').bind(...vals, r.plan_id));
    } else {
      planCreates++;
      stmts.push(c.env.DB.prepare('INSERT INTO plans (name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, guarantee_days, updated_at, id, product_id, created_at, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,99)').bind(...vals, newId('pln'), product.id, t));
    }
  }
  const summary = { rows: rows.length, product_updates: productUpdates, plan_updates: planUpdates, plan_creates: planCreates, errors };
  if (b.dry_run || errors.length) return c.json({ applied: false, ...summary });
  // Products currently published are first set to draft-safe state only if they become invalid.
  if (stmts.length) await c.env.DB.batch(stmts);
  const statusResults = [];
  for (const [id, st] of statusRequests) statusResults.push(await setStatus(c, id, st as any));
  for (const id of seenProducts) {
    if (statusRequests.get(id) === 'published') continue;
    const { p, plans } = await loadProductFull(c, id);
    if (p.status === 'published' && publishProblems(p, plans).length) await c.env.DB.prepare(`UPDATE products SET status = 'draft' WHERE id = ?`).bind(id).run();
  }
  await audit(c.env, actor(c), 'products_imported', 'product', '', summary);
  return c.json({ applied: true, ...summary, status_results: statusResults.filter((r) => !r.ok) });
});

admin.get('/export/orders.csv', async (c) => {
  const tz = (await loadSettings(c.env)).schedule.timezone;
  const fmt = (t: number | null) => (t ? (() => { const p = localParts(t, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`; })() : '');
  const rows = (await c.env.DB.prepare(`SELECT o.*, (SELECT GROUP_CONCAT(product_title_en || ' — ' || plan_name_en || ' x' || qty, ' | ') FROM order_items WHERE order_id = o.id) AS items FROM orders o ORDER BY created_at DESC`).all<any>()).results;
  const out = rows.map((o) => ({
    number: o.number, created_cairo: fmt(o.created_at), customer_name: o.customer_name, customer_email: o.customer_email, customer_whatsapp: o.customer_whatsapp,
    items: o.items, total_egp: piastresToEGPString(o.total_piastres), payment_method: o.payment_method_id, payment_status: o.payment_status, fulfillment_status: o.fulfillment_status,
    verified_amount_egp: piastresToEGPString(o.verified_amount_piastres), verified_reference: o.verified_reference ?? '', verified_cairo: fmt(o.verified_at),
    delivery_due_cairo: fmt(o.delivery_due_at), delivered_cairo: fmt(o.delivered_at), refund_amount_egp: piastresToEGPString(o.refund_amount_piastres), refunded_cairo: fmt(o.refunded_at),
  }));
  const cols = Object.keys(out[0] ?? { number: '' });
  return new Response(toCsv(out, cols), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="lynto-orders-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
});

// ---------------------------------------------------------------------------------------------
// Settings & integrations
// ---------------------------------------------------------------------------------------------
const intervalSchema = z.object({ start: z.string(), end: z.string() }).refine(isValidInterval, 'Invalid time range');
const sectionSchemas = {
  store: z.object({ accepting_orders: z.boolean(), business_name: z.string().trim().min(1).max(80), announcement_ar: z.string().max(300), announcement_en: z.string().max(300) }),
  payments: z.object({
    methods: z.array(z.object({
      id: z.string().regex(/^[a-z0-9_]{2,30}$/), type: z.enum(['instapay', 'bank', 'wallet']), enabled: z.boolean(),
      label_ar: z.string().trim().min(1).max(60), label_en: z.string().trim().min(1).max(60), account: z.string().trim().max(80), account_name: z.string().trim().max(80),
      bank_name: z.string().trim().max(80).optional(), iban: z.string().trim().max(40).optional(), wallet_provider: z.string().trim().max(40).optional(),
      instapay_link: z.string().trim().max(200).refine((v) => !v || /^https:\/\/ipn\.eg\//.test(v) || /^https:\/\//.test(v), 'Must be an https link').optional(),
      instructions_ar: z.string().max(500).optional(), instructions_en: z.string().max(500).optional(),
    })).max(8),
  }),
  schedule: z.object({
    timezone: z.literal('Africa/Cairo').or(z.string().max(40)),
    week: z.partialRecord(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.array(intervalSchema).max(4)),
    holidays: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(80).optional(), intervals: z.array(intervalSchema).max(4).optional() })).max(120),
  }),
  delivery: z.object({ sla_working_hours: z.number().min(0.5).max(72), unpaid_expiry_hours: z.number().int().min(1).max(720), renewal_reminder_days: z.number().int().min(1).max(30), payment_reminder_hours: z.number().int().min(1).max(168) }),
  support: z.object({
    whatsapp: z.string().trim().max(24), email: z.string().trim().max(254), phone: z.string().trim().max(24), hours_note_ar: z.string().max(200), hours_note_en: z.string().max(200),
    socials: z.object({ facebook: z.string().max(200), instagram: z.string().max(200), tiktok: z.string().max(200), telegram: z.string().max(200), x: z.string().max(200), youtube: z.string().max(200) }),
  }),
  policies: z.object({ confirmed: z.boolean(), guarantee_ar: z.string().max(5000), guarantee_en: z.string().max(5000), refund_ar: z.string().max(5000), refund_en: z.string().max(5000), terms_extra_ar: z.string().max(5000), terms_extra_en: z.string().max(5000) }),
  notifications: z.object({
    email_provider: z.enum(['none', 'cloudflare', 'resend']), from_domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]{3,80}$/), from_email: z.string().trim().toLowerCase().max(254), from_support: z.string().trim().toLowerCase().max(254), from_name: z.string().trim().max(80), reply_to: z.string().trim().max(254), owner_alert_email: z.string().trim().max(254),
    whatsapp_enabled: z.boolean(), whatsapp_phone_number_id: z.string().trim().regex(/^\d*$/).max(30), whatsapp_waba_id: z.string().trim().regex(/^\d*$/).max(30).default(''), whatsapp_api_version: z.string().regex(/^v\d+\.\d+$/),
    whatsapp_templates: z.record(z.string(), z.object({ name: z.string().trim().regex(/^[a-z0-9_]*$/).max(512), language: z.string().trim().max(10) })),
  }),
  tracking: z.object({ meta_pixel_id: z.string().trim().regex(/^\d*$/).max(20), capi_enabled: z.boolean(), meta_test_event_code: z.string().trim().max(40) }),
  ai: z.object({ gemini_enabled: z.boolean(), model: z.string().trim().regex(/^[a-z0-9.\-]+$/).max(60), daily_limit: z.number().int().min(1).max(500) }),
} as const;

admin.get('/settings', async (c) => {
  const s = await loadSettings(c.env);
  const base = baseUrl(c.env);
  return c.json({
    settings: s, blockers: checkoutBlockers(s), secrets: await secretStatus(c.env), health: await channelHealth(c.env, s),
    env: { app_env: c.env.APP_ENV, email_binding: !!c.env.EMAIL, cloudflare_access: !!(c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD), gemini_key: !!(await geminiKey(c.env)) },
    ai_usage_today: await aiUsageToday(c.env),
    webhooks: { whatsapp: `${base}/api/webhooks/whatsapp`, resend: `${base}/api/webhooks/resend` },
    whatsapp_template_guide: WHATSAPP_TEMPLATE_GUIDE,
    admin: c.get('admin'),
  });
});

admin.put('/settings/:section', async (c) => {
  const section = c.req.param('section') as keyof typeof sectionSchemas;
  const schema = sectionSchemas[section];
  if (!schema) throw notFound('unknown_section');
  const value: any = await body(c, schema as z.ZodTypeAny);
  const s = await loadSettings(c.env);
  if (section === 'payments') {
    const ids = value.methods.map((m: any) => m.id);
    if (new Set(ids).size !== ids.length) throw bad('duplicate_method_id');
  }
  if (section === 'schedule') {
    for (const [d, list] of Object.entries(value.week as Record<string, Array<{ start: string; end: string }>>)) {
      const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) throw bad('overlapping_hours', `Overlapping hours on day ${d}.`);
    }
    try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }); } catch { throw bad('invalid_timezone'); }
    value.configured = Object.values(value.week).some((l: any) => l.length > 0);
  }
  if (section === 'support' && value.whatsapp) {
    const p = normalizePhone(value.whatsapp);
    if (!p) throw bad('invalid_whatsapp', 'Support WhatsApp must include a valid country code.');
    value.whatsapp = p;
  }
  const next = { ...s, [section]: section === 'schedule' ? { ...value } : { ...(s as any)[section], ...value } } as BusinessSettings;
  await saveSettings(c.env, next, actor(c));
  await audit(c.env, actor(c), 'settings_updated', 'settings', section, section === 'payments' ? { methods: value.methods.map((m: any) => ({ id: m.id, enabled: m.enabled })) } : value);
  return c.json({ settings: next, blockers: checkoutBlockers(next) });
});

admin.put('/secrets/:key', async (c) => {
  const key = c.req.param('key') as SecretKey;
  if (!SECRET_KEYS.includes(key)) throw notFound('unknown_secret');
  const b = await body(c, z.object({ value: z.string().trim().min(4).max(4000) }));
  await setSecret(c.env, key, b.value);
  await audit(c.env, actor(c), 'secret_set', 'secret', key);
  return c.json({ secrets: await secretStatus(c.env) });
});

admin.delete('/secrets/:key', async (c) => {
  const key = c.req.param('key') as SecretKey;
  if (!SECRET_KEYS.includes(key)) throw notFound('unknown_secret');
  await deleteSecret(c.env, key);
  await audit(c.env, actor(c), 'secret_deleted', 'secret', key);
  return c.json({ secrets: await secretStatus(c.env) });
});

admin.post('/integrations/test', async (c) => {
  const b = await body(c, z.object({ channel: z.enum(['email', 'whatsapp']), to: z.string().trim().min(5).max(254) }));
  try {
    const r = await sendTest(c.env, b.channel, b.to);
    await audit(c.env, actor(c), 'integration_test', 'integration', b.channel, { ok: true, provider: r.provider });
    return c.json({ ok: true, provider: r.provider, id: r.id, note: 'Accepted by provider. Delivery to the inbox/phone is not confirmed until the provider reports it.' });
  } catch (e: any) {
    await audit(c.env, actor(c), 'integration_test', 'integration', b.channel, { ok: false, error: String(e?.message ?? e).slice(0, 200) });
    return c.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, 200);
  }
});

admin.post('/ai/draft', async (c) => {
  const b = await body(c, z.object({ product_id: z.string() }));
  const { p } = await loadProductFull(c, b.product_id);
  const cat = await c.env.DB.prepare('SELECT name_en FROM categories WHERE id = ?').bind(p.category_id).first<{ name_en: string }>();
  const draft = await draftProductCopy(c.env, { brand: p.brand, title_en: p.title_en, title_ar: p.title_ar, category: cat?.name_en ?? '', description_en: p.description_en, official_url: p.official_url });
  await audit(c.env, actor(c), 'ai_draft', 'product', p.id);
  return c.json({ draft });
});

// ---------------------------------------------------------------------------------------------
// Support & audit
// ---------------------------------------------------------------------------------------------
admin.get('/support', async (c) => {
  const status = c.req.query('status');
  const rows = await c.env.DB.prepare(`SELECT s.*, o.number AS order_number FROM support_requests s LEFT JOIN orders o ON o.id = s.order_id ${status ? 'WHERE s.status = ?' : ''} ORDER BY s.created_at DESC LIMIT 200`)
    .bind(...(status ? [status] : [])).all();
  return c.json({ requests: rows.results });
});

admin.put('/support/:id', async (c) => {
  const b = await body(c, z.object({ status: z.enum(['open', 'in_progress', 'closed']), admin_notes: z.string().max(4000) }));
  const r = await c.env.DB.prepare('UPDATE support_requests SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?').bind(b.status, b.admin_notes, now(), c.req.param('id')).run();
  if (r.meta.changes !== 1) throw notFound();
  return c.json({ ok: true });
});

admin.get('/audit', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();
  return c.json({ entries: rows.results });
});

admin.get('/expiring', async (c) => {
  const t = now();
  const rows = await c.env.DB.prepare(`SELECT i.id, i.order_id, i.product_title_en, i.plan_name_en, i.activated_at, i.expires_at, i.renewal_reminded_at, o.number, o.customer_name, o.renewal_optin
    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.expires_at IS NOT NULL AND i.expires_at BETWEEN ? AND ? AND o.payment_status = 'verified' ORDER BY i.expires_at LIMIT 100`).bind(t - 7 * 86_400_000, t + 30 * 86_400_000).all();
  return c.json({ items: rows.results, now: t });
});

// ---------------------------------------------------------------------------------------------
// Owner mail: send from any username @ the verified domain, with a log
// ---------------------------------------------------------------------------------------------
admin.get('/mail/info', async (c) => {
  const s = await loadSettings(c.env);
  const health = await channelHealth(c.env, s);
  const key = await getSecret(c.env, 'resend_api_key');
  return c.json({
    domain: s.notifications.from_domain, provider: s.notifications.email_provider, ready: health.email.usable, reason: health.email.reason,
    domain_status: s.notifications.email_provider === 'resend' ? await resendDomainStatus(c.env, s.notifications.from_domain, key) : { available: false, note: 'Resend is not the selected provider.' },
    suggested: ['orders', 'support', 'contact', 'info', 'hello', 'billing', 'noreply'],
    default_from_name: s.notifications.from_name,
  });
});

admin.post('/mail/send', async (c) => {
  await enforceRate(c.env, `mail:${c.get('admin').id}`, 60, 3600_000);
  const b = await body(c, z.object({
    from_local: z.string().trim().min(1).max(40), from_name: z.string().trim().max(80).optional(),
    to: z.array(z.string().trim().max(254)).min(1).max(10), reply_to: z.string().trim().max(254).optional(),
    subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000),
    lang: z.enum(['ar', 'en']).default('ar'), order_id: z.string().max(64).nullable().optional(),
  }));
  const r = await composeAndSend(c.env, actor(c), b);
  await audit(c.env, actor(c), 'email_composed', 'email', '', { from: r.from, to: b.to, subject: b.subject });
  return c.json(r);
});

admin.get('/mail/log', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT e.id, e.from_addr, e.to_addr, e.reply_to, e.subject, e.status, e.error, e.created_by, e.created_at, e.order_id, o.number AS order_number
    FROM outbound_emails e LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.created_at DESC LIMIT 200`).all();
  return c.json({ emails: rows.results });
});

admin.get('/mail/log/:id', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM outbound_emails WHERE id = ?').bind(c.req.param('id')).first();
  if (!r) throw notFound();
  return c.json({ email: r });
});

// ---- WhatsApp management ----
admin.get('/whatsapp/status', async (c) => c.json(await whatsappStatus(c.env)));
admin.post('/whatsapp/templates/create', async (c) => {
  const r = await createMissingTemplates(c.env);
  await audit(c.env, actor(c), 'whatsapp_templates_created', 'integration', 'whatsapp', r);
  return c.json(r);
});
admin.post('/whatsapp/templates/sync', async (c) => {
  const r = await syncApprovedTemplates(c.env, actor(c));
  await audit(c.env, actor(c), 'whatsapp_templates_synced', 'integration', 'whatsapp', r);
  return c.json(r);
});

// ---- Personal data erasure (data deletion policy) ----
admin.post('/privacy/erase', async (c) => {
  const b = await body(c, z.object({ order_id: z.string().max(64).optional(), email: z.string().trim().max(254).optional(), whatsapp: z.string().trim().max(32).optional(), confirm: z.literal(true) }));
  const r = await eraseCustomerData(c.env, actor(c), b);
  await audit(c.env, actor(c), 'personal_data_erased', 'customer', b.order_id ?? '', { orders: r.anonymized, skipped: r.skipped });
  return c.json(r);
});

admin.post('/system/run-jobs', async (c) => {
  const report = await runScheduled(c.env);
  await audit(c.env, actor(c), 'jobs_run_manually', 'system', '', report);
  return c.json({ report });
});

admin.all('*', () => { throw new HttpError(404, 'not_found'); });

