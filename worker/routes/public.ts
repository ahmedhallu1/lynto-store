import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { loadSettings, toPublicSettings } from '../lib/settings';
import { bad, clientIp, enforceRate, ipHash, notFound, normalizePhone, now, HttpError } from '../lib/util';
import { getPublishedProduct, listCategories, listPublishedProducts } from '../services/catalog';
import { cancelOrder, changePaymentMethod, createOrder, customerOrderView, orderByToken, quote, submitProof } from '../services/orders';
import { dispatchPending } from '../services/notifications';
import { createSupportRequest } from '../services/support';

export const publicRoutes = new Hono<AppContext>();

publicRoutes.get('/bootstrap', async (c) => {
  const s = await loadSettings(c.env);
  const products = await listPublishedProducts(c.env);
  const categories = await listCategories(c.env, products);
  c.header('cache-control', 'no-store');
  return c.json({ settings: toPublicSettings(s), categories, featured: products.filter((p) => p.featured).slice(0, 8), product_count: products.length });
});

publicRoutes.get('/products', async (c) => {
  const products = await listPublishedProducts(c.env);
  return c.json({ products });
});

publicRoutes.get('/products/:slug', async (c) => {
  const p = await getPublishedProduct(c.env, c.req.param('slug'));
  if (!p) throw notFound('product_not_found');
  return c.json({ product: p });
});

const linesSchema = z.array(z.object({ plan_id: z.string().max(64), qty: z.number().int().min(1).max(20), fields: z.record(z.string(), z.string().max(200)).default({}) })).min(1).max(10);

publicRoutes.post('/cart/quote', async (c) => {
  await enforceRate(c.env, `quote:${await ipHash(c.env, clientIp(c))}`, 120, 600_000, true);
  const body = z.object({ lines: linesSchema, lang: z.enum(['ar', 'en']).default('ar') }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input');
  const q = await quote(c.env, body.data.lines, body.data.lang, false);
  return c.json({
    total_piastres: q.total, problems: q.problems,
    lines: q.items.map((i) => ({ plan_id: i.plan.id, qty: i.qty, unit_price_piastres: i.plan.price_piastres, line_total_piastres: i.line_total })),
  });
});

const checkoutSchema = z.object({
  idempotency_key: z.string().min(16).max(80),
  lang: z.enum(['ar', 'en']),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/),
    whatsapp: z.string().trim().max(24),
    preferred_channel: z.enum(['whatsapp', 'email']),
    whatsapp_optin: z.boolean().default(false),
    renewal_optin: z.boolean().default(false),
  }),
  payment_method_id: z.string().max(40),
  lines: linesSchema,
  expected_total_piastres: z.number().int().min(1),
  accept_terms: z.boolean(),
  tracking_consent: z.boolean().default(false),
});

publicRoutes.post('/orders', async (c) => {
  const ih = await ipHash(c.env, clientIp(c));
  await enforceRate(c.env, `order:${ih}`, 30, 3600_000, true);
  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw bad('invalid_input', 'Please check the form fields.', parsed.error.issues.map((i) => i.path.join('.')));
  const phone = normalizePhone(parsed.data.customer.whatsapp);
  if (!phone) throw bad('invalid_whatsapp', 'Enter a valid WhatsApp number with country code.', ['customer.whatsapp']);
  const result = await createOrder(c.env, { ...parsed.data, customer: { ...parsed.data.customer, whatsapp: phone } }, ih);
  c.executionCtx.waitUntil(dispatchPending(c.env, { orderId: result.order_id }).catch(() => {}));
  return c.json({ number: result.number, token: result.token, url: result.url, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
});

const orderKey = (c: any) => c.req.header('x-order-key');

publicRoutes.get('/orders/:number', async (c) => {
  await enforceRate(c.env, `orderview:${await ipHash(c.env, clientIp(c))}`, 120, 600_000, true);
  const o = await orderByToken(c.env, c.req.param('number'), orderKey(c));
  c.header('cache-control', 'no-store');
  return c.json({ order: await customerOrderView(c.env, o) });
});

publicRoutes.post('/orders/:number/proof', async (c) => {
  await enforceRate(c.env, `proof:${await ipHash(c.env, clientIp(c))}`, 20, 3600_000, true);
  const o = await orderByToken(c.env, c.req.param('number'), orderKey(c));
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !file || typeof file === 'string') throw bad('file_required', 'Attach the transfer receipt.');
  const ref = String(form.get('transaction_ref') ?? '').trim();
  const note = String(form.get('note') ?? '').trim();
  const r = await submitProof(c.env, o, file as File, ref, note);
  c.executionCtx.waitUntil(dispatchPending(c.env, { orderId: o.id }).catch(() => {}));
  return c.json(r, 201);
});

publicRoutes.post('/orders/:number/payment-method', async (c) => {
  const o = await orderByToken(c.env, c.req.param('number'), orderKey(c));
  const body = z.object({ method_id: z.string().max(40) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input');
  await changePaymentMethod(c.env, o, body.data.method_id);
  return c.json({ ok: true });
});

publicRoutes.post('/orders/:number/cancel', async (c) => {
  const o = await orderByToken(c.env, c.req.param('number'), orderKey(c));
  const r = await cancelOrder(c.env, 'customer', o.id, 'Cancelled by customer', true);
  return c.json(r);
});

const supportSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contact: z.string().trim().min(5).max(120),
  topic: z.enum(['order', 'payment', 'activation', 'replacement', 'refund', 'deletion', 'other']),
  message: z.string().trim().min(5).max(2000),
  order_number: z.string().trim().max(12).optional().default(''),
  order_key: z.string().max(80).optional().default(''),
  lang: z.enum(['ar', 'en']).default('ar'),
  website: z.string().max(0).optional().default(''), // honeypot
});

publicRoutes.post('/support', async (c) => {
  const ih = await ipHash(c.env, clientIp(c));
  await enforceRate(c.env, `support:${ih}`, 6, 3600_000, true);
  const parsed = supportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw bad('invalid_input', 'Please check the form fields.', parsed.error.issues.map((i) => i.path.join('.')));
  const d = parsed.data;
  let orderId: string | null = null, verified = 0;
  if (d.order_number) {
    const num = d.order_number.toUpperCase();
    if (d.order_key) {
      try { orderId = (await orderByToken(c.env, num, d.order_key)).id; verified = 1; } catch { /* unverified */ }
    }
    if (!orderId) {
      // Link by number for the owner's convenience, but mark as unverified (never expose order data back).
      orderId = (await c.env.DB.prepare('SELECT id FROM orders WHERE number = ?').bind(num).first<{ id: string }>())?.id ?? null;
    }
  }
  const s = await loadSettings(c.env);
  const { number } = await createSupportRequest(c.env, s, { name: d.name, contact: d.contact, topic: d.topic, message: d.message, lang: d.lang, order_id: orderId, order_verified: !!verified, ip_hash: ih, via: 'web' });
  c.executionCtx.waitUntil(dispatchPending(c.env).catch(() => {}));
  return c.json({ number }, 201);
});

publicRoutes.all('*', () => { throw new HttpError(404, 'not_found'); });
