// End-to-end workflow & security tests against a running LYnto Worker (local preview or staging).
// Usage:
//   BASE=http://127.0.0.1:4173 SETUP_TOKEN=... node tests/e2e/run.mjs
// Local runs read SETUP_TOKEN from .dev.vars and start a mock provider server on :9799
// (the Worker's TEST_PROVIDER_BASE) so no real email/WhatsApp/Meta/Gemini calls are made.
// Set NO_MOCK=1 for remote staging (provider tests are then skipped).
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = join(root, 'tests', 'e2e', '.artifacts');
mkdirSync(artifacts, { recursive: true });
const devVars = existsSync(join(root, '.dev.vars')) ? Object.fromEntries(readFileSync(join(root, '.dev.vars'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
const BASE = (process.env.BASE ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const SETUP_TOKEN = process.env.SETUP_TOKEN ?? devVars.SETUP_TOKEN;
const LOCAL = !process.env.NO_MOCK;
const D1_TARGET = process.env.D1_TARGET ?? '--local';
const RUN = Date.now().toString(36);
const CAN_D1 = LOCAL || D1_TARGET !== '--local';

// ---------------------------------------------------------------- mini test harness
const results = [];
let current = '';
async function test(name, fn) {
  current = name;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e) }); process.stdout.write(`  ✗ ${name}\n      ${e?.message ?? e}\n`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- HTTP helpers
let cookie = '';
async function req(method, path, { body, headers = {}, admin = false, raw = false, form } = {}) {
  const h = { ...headers };
  if (admin) { h['x-lynto-csrf'] = '1'; if (cookie) h.cookie = cookie; }
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) if (c.startsWith('__Host-lynto_admin=')) cookie = c.split(';')[0];
  if (raw) return res;
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const A = {
  get: (p) => req('GET', '/api/admin' + p, { admin: true }),
  post: (p, b = {}) => req('POST', '/api/admin' + p, { admin: true, body: b }),
  put: (p, b = {}) => req('PUT', '/api/admin' + p, { admin: true, body: b }),
};
const P = {
  get: (p, key) => req('GET', '/api/public' + p, { headers: key ? { 'x-order-key': key } : {} }),
  post: (p, b, key) => req('POST', '/api/public' + p, { body: b, headers: key ? { 'x-order-key': key } : {} }),
};
function d1(sql) {
  if (!LOCAL && D1_TARGET === '--local') return null;
  return execFileSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', process.env.D1_DB ?? 'lynto-db', D1_TARGET, ...(process.env.D1_ENV ? ['--env', process.env.D1_ENV] : []), '--json', '--command', sql], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360F8CFC0F01F0005FF02FEA7E1B8C60000000049454E44AE426082', 'hex');

// ---------------------------------------------------------------- mock providers
const mock = { mode: 'ok', calls: [] };
function startMock() {
  return new Promise((resolve) => {
    const srv = http.createServer((rq, rs) => {
      let body = '';
      rq.on('data', (c) => (body += c));
      rq.on('end', () => {
        const call = { method: rq.method, url: rq.url, headers: rq.headers, body };
        mock.calls.push(call);
        const send = (code, obj) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(obj)); };
        if (mock.mode === 'fail400') return send(400, { message: 'invalid recipient (mock)', error: { message: 'invalid (mock)' } });
        if (mock.mode === 'fail500') return send(500, { message: 'provider down (mock)' });
        if (rq.url === '/emails') return send(200, { id: 'mock-email-' + mock.calls.length });
        if (/\/messages$/.test(rq.url)) return send(200, { messages: [{ id: 'wamid.mock' + mock.calls.length }] });
        if (/\/events/.test(rq.url)) return send(200, { events_received: 1 });
        if (/generateContent/.test(rq.url)) return send(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ summary_ar: 'ملخص', summary_en: 'Summary', description_ar: 'وصف', description_en: 'Description', features_ar: ['ميزة'], features_en: ['Feature'] }) }] } }] });
        send(404, {});
      });
    });
    srv.listen(9799, '127.0.0.1', () => resolve(srv));
  });
}

// ---------------------------------------------------------------- test data
const adminFile = join(artifacts, `admin-${new URL(BASE).host.replace(/[^a-z0-9]/gi, '_')}.json`);
const creds = existsSync(adminFile) ? JSON.parse(readFileSync(adminFile, 'utf8')) : { email: `owner-test@example.com`, password: crypto.randomBytes(18).toString('base64url') };
const customer = (n) => ({ name: `Test Customer ${n}`, email: `customer${n}+${RUN}@example.com`, whatsapp: '+201000000' + String(100 + n).slice(-3), preferred_channel: 'whatsapp', whatsapp_optin: false, renewal_optin: true });
const orders = {};

async function main() {
  console.log(`LYnto E2E — ${BASE} (${LOCAL ? 'local with mock providers' : 'remote, no mocks'})`);
  const mockSrv = LOCAL ? await startMock() : null;

  await test('health endpoint responds', async () => { const r = await req('GET', '/healthz'); eq(r.status, 200, 'status'); assert(r.json.ok, 'db ok'); });

  // ------------------------------------------------------------ admin protection
  await test('admin API rejects unauthenticated requests', async () => {
    for (const p of ['/dashboard', '/orders', '/products', '/settings', '/export/orders.csv']) eq((await req('GET', '/api/admin' + p)).status, 401, p);
  });
  await test('admin mutations require CSRF header', async () => {
    const r = await req('POST', '/api/admin/orders/x/approve', { body: {} });
    eq(r.status, 403, 'status');
  });
  await test('setup rejects a wrong token and an absent token', async () => {
    eq((await req('POST', '/api/admin/auth/setup', { admin: true, body: { token: 'x'.repeat(40), email: 'a@b.co', password: 'abcdefghijklmn' } })).status, 403, 'wrong token');
    eq((await req('POST', '/api/admin/auth/setup', { admin: true, body: { email: 'a@b.co', password: 'abcdefghijklmn' } })).status, 400, 'missing token');
  });
  await test('owner account bootstrap (or login if already created)', async () => {
    const st = (await req('GET', '/api/admin/auth/status', { admin: true })).json;
    if (!st.admin_exists) {
      assert(SETUP_TOKEN, 'SETUP_TOKEN needed');
      const r = await req('POST', '/api/admin/auth/setup', { admin: true, body: { token: SETUP_TOKEN, email: creds.email, name: 'Test Owner', password: creds.password } });
      eq(r.status, 200, 'setup');
      writeFileSync(adminFile, JSON.stringify(creds), { mode: 0o600 });
      eq((await req('POST', '/api/admin/auth/setup', { admin: true, body: { token: SETUP_TOKEN, email: 'x@y.co', password: 'another-password-1' } })).status, 403, 'setup is one-time');
    } else {
      const r = await req('POST', '/api/admin/auth/login', { admin: true, body: creds });
      eq(r.status, 200, 'login');
    }
    eq((await A.get('/dashboard')).status, 200, 'dashboard with session');
  });
  await test('session cookie is HttpOnly, Secure, SameSite=Strict, __Host- prefixed', async () => {
    const saved = cookie;
    const res = await req('POST', '/api/admin/auth/login', { admin: true, body: creds, raw: true });
    const sc = res.headers.getSetCookie().find((c) => c.startsWith('__Host-lynto_admin='));
    assert(sc && /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\//.test(sc), `cookie flags: ${sc}`);
    if (!cookie) cookie = saved;
  });

  // ------------------------------------------------------------ draft exclusion
  await test('drafts are not exposed publicly (API, HTML, sitemap)', async () => {
    const r = await P.get('/products');
    eq(r.status, 200, 'status');
    const ids = r.json.products.map((p) => p.slug);
    assert(!ids.includes('claude-pro'), 'claude-pro (draft) must not be listed');
    eq((await P.get('/products/claude-pro')).status, 404, 'draft product API');
    const html = await req('GET', '/p/claude-pro');
    eq(html.status, 404, 'draft product page status');
    assert(html.text.includes('noindex'), 'draft page must be noindex');
    const sm = await req('GET', '/sitemap.xml');
    assert(!sm.text.includes('/p/claude-pro'), 'sitemap must not include drafts');
  });
  await test('draft plans cannot be quoted or ordered', async () => {
    const q = await P.post('/cart/quote', { lang: 'ar', lines: [{ plan_id: 'pln_claude_pro_1m', qty: 1, fields: {} }] });
    eq(q.json.problems[0]?.error, 'unavailable', 'quote problem');
  });
  await test('checkout is disabled while setup is incomplete', async () => {
    const r = await P.post('/orders', orderBody([{ plan_id: 'pln_claude_pro_1m', qty: 1, fields: { account_email: 'a@b.co' } }], 100, 'x'));
    assert([403, 409].includes(r.status), `status ${r.status}`);
  });
  await test('admin preview can view a draft; public cannot', async () => {
    eq((await A.get('/products/prd_claude_pro/preview')).status, 200, 'admin preview');
    eq((await req('GET', '/api/admin/products/prd_claude_pro/preview')).status, 401, 'no cookie');
  });

  // ------------------------------------------------------------ publish validation
  await test('publishing an unpriced/unvalidated product is refused with reasons', async () => {
    const r = await A.post('/products/prd_chatgpt_plus/status', { status: 'published' });
    eq(r.status, 409, 'status');
    assert(Array.isArray(r.json.details) && r.json.details.some((d) => /price|approved/i.test(d)), 'problems listed');
  });
  await test('a plan cannot be approved without a price', async () => {
    const r = await A.post('/plans/bulk', { plans: [{ id: 'pln_chatgpt_plus_1m', price_egp: null, status: 'approved', availability: 'available' }] });
    eq(r.status, 400, 'status');
  });

  // ------------------------------------------------------------ settings
  await test('owner setup screen saves business settings and opens checkout', async () => {
    eq((await A.put('/settings/payments', { methods: [
      { id: 'instapay', type: 'instapay', enabled: true, label_ar: 'إنستاباي', label_en: 'InstaPay', account: 'test-only@instapay', account_name: 'TEST ACCOUNT' },
      { id: 'wallet', type: 'wallet', enabled: true, label_ar: 'فودافون كاش', label_en: 'Vodafone Cash', account: '01000000000', account_name: 'TEST ACCOUNT', wallet_provider: 'Vodafone Cash' },
    ] })).status, 200, 'payments');
    const week = {}; for (const d of ['0', '1', '2', '3', '4']) week[d] = [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }]; week['6'] = [{ start: '12:00', end: '16:00' }];
    eq((await A.put('/settings/schedule', { timezone: 'Africa/Cairo', week, holidays: [] })).status, 200, 'schedule');
    const bad = await A.put('/settings/schedule', { timezone: 'Africa/Cairo', week: { '0': [{ start: '10:00', end: '14:00' }, { start: '13:00', end: '15:00' }] }, holidays: [] });
    eq(bad.status, 400, 'overlapping hours rejected');
    eq((await A.put('/settings/schedule', { timezone: 'Africa/Cairo', week, holidays: [] })).status, 200, 'schedule restored');
    eq((await A.put('/settings/support', { whatsapp: '01000000001', email: 'support-test@example.com', phone: '', hours_note_ar: '', hours_note_en: '', socials: { facebook: '', instagram: '', tiktok: '', telegram: '', x: '', youtube: '' } })).status, 200, 'support');
    const s = (await A.get('/settings')).json.settings;
    eq(s.support.whatsapp, '+201000000001', 'support WhatsApp normalised to E.164');
    eq((await A.put('/settings/policies', { ...s.policies, confirmed: true })).status, 200, 'policies');
    const r = await A.put('/settings/store', { accepting_orders: true, business_name: 'LYnto', announcement_ar: '', announcement_en: '' });
    eq(r.status, 200, 'store');
    eq(r.json.blockers.length, 0, 'no blockers');
    eq((await P.get('/bootstrap')).json.settings.checkout_enabled, true, 'checkout enabled');
  });

  // ------------------------------------------------------------ catalog approval
  await test('owner approves plans/prices and publishes products', async () => {
    const prod = (await A.get('/products/prd_chatgpt_plus')).json.product;
    const r = await A.put('/products/prd_chatgpt_plus', { ...strip(prod), supply_status: 'validated', plans: prod.plans.map((pl) => ({ ...stripPlan(pl), price_egp: '450', status: 'approved', guarantee_kind: 'full_period' })) });
    eq(r.status, 200, 'save chatgpt');
    eq((await A.post('/products/prd_chatgpt_plus/status', { status: 'published' })).status, 200, 'publish chatgpt');
    const pubg = (await A.get('/products/prd_pubg_uc')).json.product;
    eq((await A.put('/products/prd_pubg_uc', { ...strip(pubg), supply_status: 'validated', plans: pubg.plans.map((pl, i) => ({ ...stripPlan(pl), price_egp: i === 0 ? '55.50' : '', status: i === 0 ? 'approved' : 'proposed', guarantee_kind: 'none' })) })).status, 200, 'save pubg');
    eq((await A.post('/products/prd_pubg_uc/status', { status: 'published' })).status, 200, 'publish pubg');
  });
  await test('published products appear publicly with SEO tags; unapproved plans stay hidden', async () => {
    const r = await P.get('/products/chatgpt-plus');
    eq(r.status, 200, 'api');
    eq(r.json.product.plans[0].price_piastres, 45000, 'price');
    const pubg = (await P.get('/products/pubg-mobile-uc')).json.product;
    eq(pubg.plans.length, 1, 'only the approved PUBG plan is public');
    const html = await req('GET', '/en/p/chatgpt-plus');
    eq(html.status, 200, 'html');
    assert(html.text.includes('rel="canonical"') && html.text.includes('application/ld+json') && html.text.includes('hreflang="ar-EG"'), 'seo tags');
    assert(html.text.includes('ChatGPT Plus'), 'prerendered content');
    assert((await req('GET', '/sitemap.xml')).text.includes('/p/chatgpt-plus'), 'sitemap includes published');
  });

  // ------------------------------------------------------------ checkout integrity
  const lines = [
    { plan_id: 'pln_chatgpt_plus_1m', qty: 1, fields: { account_email: 'buyer-account@example.com' } },
    { plan_id: 'pln_pubg_60', qty: 2, fields: { player_id: '5123456789' } },
  ];
  const total = 45000 + 2 * 5550;
  await test('server rejects a manipulated checkout total', async () => {
    const r = await P.post('/orders', orderBody(lines, 100, 'manip-' + RUN));
    eq(r.status, 409, 'status'); eq(r.json.error, 'price_changed', 'code'); eq(r.json.details.total_piastres, total, 'server total');
  });
  await test('server ignores client-supplied unit prices', async () => {
    const r = await P.post('/cart/quote', { lang: 'en', lines: lines.map((l) => ({ ...l, unit_price_piastres: 1, price: 1 })) });
    eq(r.json.total_piastres, total, 'quote total');
  });
  await test('server rejects quantity above plan max and missing/invalid required fields', async () => {
    eq((await P.post('/orders', orderBody([{ plan_id: 'pln_chatgpt_plus_1m', qty: 2, fields: { account_email: 'a@b.co' } }], 90000, 'qty-' + RUN))).json.error, 'cart_invalid', 'qty');
    eq((await P.post('/orders', orderBody([{ plan_id: 'pln_chatgpt_plus_1m', qty: 1, fields: {} }], 45000, 'fld-' + RUN))).json.error, 'cart_invalid', 'missing field');
    eq((await P.post('/orders', orderBody([{ plan_id: 'pln_pubg_60', qty: 1, fields: { player_id: 'abc' } }], 5550, 'pat-' + RUN))).json.error, 'cart_invalid', 'pattern');
    eq((await P.post('/orders', orderBody([{ plan_id: 'pln_pubg_325', qty: 1, fields: { player_id: '5123456789' } }], 1, 'unap-' + RUN))).json.error, 'cart_invalid', 'unapproved plan');
  });
  await test('invalid WhatsApp numbers are rejected', async () => {
    const b = orderBody(lines, total, 'wa-' + RUN); b.customer.whatsapp = '12';
    eq((await P.post('/orders', b)).json.error, 'invalid_whatsapp', 'code');
  });
  await test('order creation is idempotent (duplicate submit returns the same order)', async () => {
    const body = orderBody(lines, total, 'main-' + RUN, 1);
    const [a, b] = await Promise.all([P.post('/orders', body), P.post('/orders', body)]);
    assert([200, 201].includes(a.status) && [200, 201].includes(b.status), `statuses ${a.status}/${b.status} ${a.text} ${b.text}`);
    eq(a.json.number, b.json.number, 'same number'); eq(a.json.token, b.json.token, 'same token');
    const c = await P.post('/orders', body);
    eq(c.json.duplicate, true, 'replay flagged duplicate'); eq(c.json.number, a.json.number, 'replay number');
    orders.main = a.json;
    const list = (await A.get(`/orders?q=${a.json.number}`)).json.orders;
    eq(list.length, 1, 'exactly one order stored');
  });

  // ------------------------------------------------------------ order privacy
  await test('order page requires the private token; other tokens and bare numbers fail', async () => {
    const { number, token } = orders.main;
    eq((await P.get(`/orders/${number}`, token)).status, 200, 'with token');
    eq((await P.get(`/orders/${number}`)).status, 404, 'no token');
    eq((await P.get(`/orders/${number}`, 'A'.repeat(43))).status, 404, 'wrong token');
    const other = await P.post('/orders', orderBody([lines[0]], 45000, 'other-' + RUN, 2));
    orders.other = other.json;
    eq((await P.get(`/orders/${number}`, other.json.token)).status, 404, "another customer's token");
    const html = await req('GET', `/order/${number}`);
    assert(html.headers.get('x-robots-tag')?.includes('noindex'), 'order page noindex');
    assert(!html.text.includes('Test Customer'), 'no customer data in HTML shell');
  });
  await test('customer sees payment instructions with exact amount; no manual-mode leak of other data', async () => {
    const o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.payment_status, 'awaiting_transfer', 'status'); eq(o.total_piastres, total, 'amount');
    eq(o.payment_destination.account, 'test-only@instapay', 'destination');
  });
  await test('without a sending integration, notifications are honest manual actions (not "sent")', async () => {
    const d = (await A.get(`/orders/${orders.main.order_id ?? (await idOf(orders.main.number))}`)).json;
    const n = d.notifications.filter((x) => x.event === 'order_received');
    assert(n.length >= 1 && n.every((x) => x.status === 'manual_action_required'), JSON.stringify(n.map((x) => x.status)));
    const wa = await A.get(`/notifications/${n[0].id}/whatsapp`);
    assert(wa.json.url.startsWith('https://wa.me/201000000101?text='), 'wa.me shortcut');
  });

  // ------------------------------------------------------------ proofs
  await test('receipt upload validates file type and stores privately', async () => {
    const { number, token } = orders.main;
    const bad = new FormData(); bad.append('file', new Blob(['hello'], { type: 'image/png' }), 'fake.png');
    eq((await req('POST', `/api/public/orders/${number}/proof`, { form: bad, headers: { 'x-order-key': token } })).status, 400, 'fake png rejected');
    const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'r.png'); fd.append('transaction_ref', 'TXN-1');
    eq((await req('POST', `/api/public/orders/${number}/proof`, { form: fd, headers: { 'x-order-key': token } })).status, 201, 'upload');
    eq((await P.get(`/orders/${number}`, token)).json.order.payment_status, 'proof_submitted', 'status');
  });
  await test('receipts are only retrievable by the authenticated owner', async () => {
    const d = (await A.get(`/orders/${await idOf(orders.main.number)}`)).json;
    const pid = d.proofs[0].id;
    eq((await req('GET', `/api/admin/proofs/${pid}/file`)).status, 401, 'anonymous');
    const r = await req('GET', `/api/admin/proofs/${pid}/file`, { admin: true, raw: true });
    eq(r.status, 200, 'owner'); eq(r.headers.get('content-type'), 'image/png', 'type');
    assert((r.headers.get('content-security-policy') ?? '').includes('sandbox'), 'sandboxed');
    assert((r.headers.get('cache-control') ?? '').includes('no-store'), 'no-store');
  });
  await test('reject proof with reason → customer sees it and can resubmit', async () => {
    const id = await idOf(orders.main.number);
    eq((await A.post(`/orders/${id}/reject`, { reason: 'المبلغ لسه موصلش' })).status, 200, 'reject');
    eq((await A.post(`/orders/${id}/reject`, { reason: 'again' })).json.already, true, 'repeat reject is a no-op');
    const o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.payment_status, 'rejected', 'status'); eq(o.rejection_reason, 'المبلغ لسه موصلش', 'reason');
    const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'r2.png');
    eq((await req('POST', `/api/public/orders/${orders.main.number}/proof`, { form: fd, headers: { 'x-order-key': orders.main.token } })).status, 201, 'resubmit');
    eq((await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order.payment_status, 'proof_submitted', 'back to review');
  });

  // ------------------------------------------------------------ approval
  await test('approval requires matching amount (or explicit confirmation)', async () => {
    const id = await idOf(orders.main.number);
    const r = await A.post(`/orders/${id}/approve`, { amount_egp: '100', reference: 'IPN-123' });
    eq(r.status, 409, 'mismatch'); eq(r.json.error, 'amount_mismatch', 'code');
  });
  await test('approve payment is atomic and idempotent (parallel clicks → one transition, one notification)', async () => {
    const id = await idOf(orders.main.number);
    const rs = await Promise.all([1, 2, 3].map(() => A.post(`/orders/${id}/approve`, { amount_egp: String(total / 100), reference: 'IPN-123' })));
    rs.forEach((r) => eq(r.status, 200, 'status'));
    eq(rs.filter((r) => r.json.already === false).length, 1, 'exactly one real approval');
    const d = (await A.get(`/orders/${id}`)).json;
    eq(d.order.payment_status, 'verified', 'verified'); assert(d.order.delivery_due_at > Date.now() - 60_000, 'due set');
    eq(d.notifications.filter((n) => n.event === 'payment_confirmed').length, 1, 'one payment_confirmed notification');
    eq(d.events.filter((e) => e.type === 'payment_verified').length, 1, 'one verification event');
    const o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.payment_destination, null, 'payment details hidden after verification'); eq(o.fulfillment_status, 'processing', 'processing');
  });

  // ------------------------------------------------------------ delivery
  await test('partial delivery via portal, then external delivery completes the order', async () => {
    const id = await idOf(orders.main.number);
    const d = (await A.get(`/orders/${id}`)).json;
    const gpt = d.items.find((i) => i.plan_id === 'pln_chatgpt_plus_1m'), pubg = d.items.find((i) => i.plan_id === 'pln_pubg_60');
    eq((await A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: gpt.id, details: '' }] })).status, 400, 'details required');
    const activated = Date.UTC(2026, 9, 10, 12, 0);
    const [r1, r2] = await Promise.all([1, 2].map(() => A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: gpt.id, details: 'Activation link: https://example.com/redeem/TEST-CODE-123', activated_at: activated }] })));
    eq([r1, r2].filter((r) => r.json?.already === false).length, 1, 'one real delivery');
    let o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.fulfillment_status, 'partially_delivered', 'partial');
    const ci = o.items.find((i) => i.product_title_en.includes('ChatGPT'));
    assert(ci.delivery.details.includes('TEST-CODE-123'), 'customer sees decrypted details');
    // 10 Oct 15:00 Cairo (UTC+3, DST) + 1 calendar month = 10 Nov 15:00 Cairo (UTC+2 after DST ends) = 13:00 UTC
    eq(new Date(ci.expires_at).toISOString(), '2026-11-10T13:00:00.000Z', 'expiry = activation + 1 month (Cairo calendar, across DST end)');
    const pi = o.items.find((i) => i.product_title_en.includes('PUBG'));
    eq(pi.fulfillment_status, 'processing', 'other item still processing');
    eq((await A.post(`/orders/${id}/deliver`, { mode: 'external', note: 'sent on WhatsApp', items: [{ item_id: pubg.id }] })).json.already, false, 'external');
    o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.fulfillment_status, 'delivered', 'delivered');
    eq(o.items.find((i) => i.product_title_en.includes('PUBG')).expires_at, null, 'top-up has no fabricated expiry');
    const d2 = (await A.get(`/orders/${id}`)).json;
    eq(d2.notifications.filter((n) => n.event === 'order_delivered').length, 1, 'one completion notice');
    eq(d2.notifications.filter((n) => n.event === 'item_delivered').length, 1, 'one partial notice');
    if (CAN_D1) {
      const raw = d1(`SELECT details_enc FROM deliveries WHERE order_id = '${id}' AND details_enc IS NOT NULL`);
      if (raw) assert(!raw.includes('TEST-CODE-123') && raw.includes('v1:'), 'delivery details encrypted at rest');
    }
    eq((await A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: gpt.id, details: 'again' }] })).json.already, true, 'repeat delivery is a no-op');
  });
  await test('delivery is refused before payment verification', async () => {
    const id = await idOf(orders.other.number);
    const items = (await A.get(`/orders/${id}`)).json.items;
    const r = await A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: items[0].id, details: 'x123' }] });
    eq(r.status, 409, 'status'); eq(r.json.error, 'payment_not_verified', 'code');
  });

  // ------------------------------------------------------------ refunds & revenue
  await test('refund flow: request → complete only with valid amount; revenue excludes unpaid orders', async () => {
    const before = (await A.get('/dashboard')).json.revenue;
    const ord = (await P.post('/orders', orderBody([lines[0]], 45000, 'refund-' + RUN, 3))).json;
    const id = await idOf(ord.number);
    eq((await A.post(`/orders/${id}/refund-request`, { reason: 'Test refund reason' })).status, 409, 'cannot refund unpaid');
    eq((await A.post(`/orders/${id}/approve`, { amount_egp: '450', reference: 'R-1' })).status, 200, 'approve');
    eq((await A.post(`/orders/${id}/refund-request`, { reason: 'Customer changed mind before delivery' })).status, 200, 'request');
    eq((await A.post(`/orders/${id}/refund-complete`, { amount_egp: '9999', reference: 'RF-1' })).status, 400, 'over-refund rejected');
    eq((await A.post(`/orders/${id}/refund-complete`, { amount_egp: '450', reference: 'RF-1' })).status, 200, 'complete');
    eq((await A.post(`/orders/${id}/refund-complete`, { amount_egp: '450', reference: 'RF-1' })).json.already, true, 'idempotent');
    const o = (await P.get(`/orders/${ord.number}`, ord.token)).json.order;
    eq(o.payment_status, 'refunded', 'refunded'); eq(o.fulfillment_status, 'cancelled', 'undelivered items cancelled');
    const after = (await A.get('/dashboard')).json.revenue;
    eq(after.verified_all - before.verified_all, 45000, 'verified revenue +450 only (unpaid "other" order excluded)');
    eq(after.refunded_all - before.refunded_all, 45000, 'refund shown separately');
  });
  await test('customer can cancel an unpaid order; paid orders cannot be cancelled by customer', async () => {
    eq((await P.post(`/orders/${orders.other.number}/cancel`, {}, orders.other.token)).json.already, false, 'cancel');
    eq((await P.get(`/orders/${orders.other.number}`, orders.other.token)).json.order.payment_status, 'cancelled', 'cancelled');
    eq((await P.post(`/orders/${orders.main.number}/cancel`, {}, orders.main.token)).status, 409, 'paid order');
  });

  // ------------------------------------------------------------ provider integrations (mocked)
  if (LOCAL) {
    await test('email via provider: accepted → "sent"; provider rejection → "failed" and retryable', async () => {
      const s = (await A.get('/settings')).json.settings;
      eq((await A.put('/settings/notifications', { ...s.notifications, email_provider: 'resend', from_email: 'orders@lynto.store', owner_alert_email: '' })).status, 200, 'settings');
      eq((await A.put('/secrets/resend_api_key', { value: 're_test_mock_key_123' })).status, 200, 'secret');
      mock.mode = 'ok'; mock.calls = [];
      const ord = (await P.post('/orders', orderBody([lines[0]], 45000, 'mail-' + RUN, 4, { preferred_channel: 'email' }))).json;
      await sleep(1500);
      const id = await idOf(ord.number);
      let n = (await A.get(`/orders/${id}`)).json.notifications.find((x) => x.event === 'order_received' && x.channel === 'email');
      eq(n.status, 'sent', 'email sent'); eq(n.provider, 'resend', 'provider');
      const call = mock.calls.find((c) => c.url === '/emails');
      assert(call && call.headers['idempotency-key'] === n.id, 'idempotency key = notification id');
      assert(!JSON.parse(call.body).html.includes('TEST ACCOUNT'), 'no bank details in email');
      mock.mode = 'fail400';
      eq((await A.post(`/orders/${id}/approve`, { amount_egp: '450', reference: 'M-1' })).status, 200, 'approve');
      await sleep(1500);
      n = (await A.get(`/orders/${id}`)).json.notifications.find((x) => x.event === 'payment_confirmed' && x.channel === 'email');
      eq(n.status, 'failed', 'permanent provider error → failed'); assert(n.last_error.includes('400'), 'error recorded');
      mock.mode = 'ok';
      const rr = await A.post(`/notifications/${n.id}/retry`);
      eq(rr.json.notification.status, 'sent', 'retry succeeded');
      mock.mode = 'fail500';
      const ord2 = (await P.post('/orders', orderBody([lines[0]], 45000, 'mail2-' + RUN, 5, { preferred_channel: 'email' }))).json;
      await sleep(1500);
      n = (await A.get(`/orders/${await idOf(ord2.number)}`)).json.notifications.find((x) => x.event === 'order_received' && x.channel === 'email');
      eq(n.status, 'pending', 'transient error → pending with backoff'); eq(n.attempts, 1, 'attempt counted');
      mock.mode = 'ok';
    });
    await test('WhatsApp Cloud API: opted-in customers get template messages; signed webhooks update delivery', async () => {
      const s = (await A.get('/settings')).json.settings;
      const templates = Object.fromEntries(Object.keys(s.notifications.whatsapp_templates).map((k) => [k, { name: 'lynto_' + k, language: 'ar_EG' }]));
      eq((await A.put('/settings/notifications', { ...s.notifications, email_provider: 'none', whatsapp_enabled: true, whatsapp_phone_number_id: '123456789', whatsapp_templates: templates })).status, 200, 'settings');
      await A.put('/secrets/whatsapp_access_token', { value: 'EAAG_mock_token' });
      await A.put('/secrets/whatsapp_app_secret', { value: 'app_secret_mock' });
      await A.put('/secrets/whatsapp_verify_token', { value: 'verify_mock_123' });
      mock.calls = [];
      const ord = (await P.post('/orders', orderBody([lines[0]], 45000, 'wa-ok-' + RUN, 6, { whatsapp_optin: true }))).json;
      await sleep(1500);
      const id = await idOf(ord.number);
      const n = (await A.get(`/orders/${id}`)).json.notifications.find((x) => x.event === 'order_received' && x.channel === 'whatsapp');
      eq(n.status, 'sent', 'sent'); assert(n.provider_message_id?.startsWith('wamid.'), 'message id stored');
      const call = mock.calls.find((c) => /\/messages$/.test(c.url));
      const body = JSON.parse(call.body);
      eq(body.template.name, 'lynto_order_received', 'template'); eq(body.to, '201000000106', 'recipient');
      const noOpt = (await P.post('/orders', orderBody([lines[0]], 45000, 'wa-no-' + RUN, 7))).json;
      await sleep(800);
      const n2 = (await A.get(`/orders/${await idOf(noOpt.number)}`)).json.notifications;
      assert(!n2.some((x) => x.channel === 'whatsapp'), 'no WhatsApp API message without opt-in');
      assert(n2.some((x) => x.channel === 'manual'), 'manual fallback for WhatsApp-preferring customer');
      const hook = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: n.provider_message_id, status: 'delivered' }] } }] }] });
      eq((await req('POST', '/api/webhooks/whatsapp', { body: JSON.parse(hook), headers: { 'x-hub-signature-256': 'sha256=deadbeef' } })).status, 401, 'bad signature rejected');
      const sig = crypto.createHmac('sha256', 'app_secret_mock').update(hook).digest('hex');
      const ok = await fetch(BASE + '/api/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + sig }, body: hook });
      eq(ok.status, 200, 'webhook');
      eq((await A.get(`/orders/${id}`)).json.notifications.find((x) => x.id === n.id).status, 'delivered', 'delivered via webhook');
      eq((await req('GET', '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify_mock_123&hub.challenge=42')).text, '42', 'verify handshake');
      eq((await req('GET', '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42')).status, 403, 'bad verify token');
      await A.put('/settings/notifications', { ...s.notifications, email_provider: 'none', whatsapp_enabled: false });
    });
    await test('Meta Purchase is sent once, only after verification, only with consent', async () => {
      await A.put('/settings/tracking', { meta_pixel_id: '1234567890', capi_enabled: true, meta_test_event_code: 'TEST123' });
      await A.put('/secrets/meta_capi_token', { value: 'capi_mock_token' });
      mock.calls = [];
      const ord = (await P.post('/orders', { ...orderBody([lines[0]], 45000, 'capi-' + RUN, 8), tracking_consent: true })).json;
      const id = await idOf(ord.number);
      const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'r.png');
      await req('POST', `/api/public/orders/${ord.number}/proof`, { form: fd, headers: { 'x-order-key': ord.token } });
      await sleep(800);
      eq(mock.calls.filter((c) => /\/events/.test(c.url)).length, 0, 'no Purchase for unpaid order or receipt upload');
      await Promise.all([1, 2].map(() => A.post(`/orders/${id}/approve`, { amount_egp: '450', reference: 'C-1' })));
      await sleep(1500);
      const ev = mock.calls.filter((c) => /\/events/.test(c.url));
      eq(ev.length, 1, 'exactly one Purchase');
      const data = JSON.parse(ev[0].body).data[0];
      eq(data.event_name, 'Purchase', 'name'); eq(data.event_id, `purchase_${ord.number}`, 'dedup id'); eq(data.custom_data.value, 450, 'value');
      assert(!ev[0].body.includes('buyer-account@example.com') && !ev[0].body.includes(ord.token), 'no delivery data / tokens sent to Meta');
      const noConsent = (await P.post('/orders', orderBody([lines[0]], 45000, 'capi-no-' + RUN, 9))).json;
      await A.post(`/orders/${await idOf(noConsent.number)}/approve`, { amount_egp: '450', reference: 'C-2' });
      await sleep(1000);
      eq(mock.calls.filter((c) => /\/events/.test(c.url)).length, 1, 'no Purchase without consent');
      await A.put('/settings/tracking', { meta_pixel_id: '', capi_enabled: false, meta_test_event_code: '' });
    });
    await test('Gemini helper: disabled by default, works when enabled, fails gracefully, sends only public content', async () => {
      eq((await A.post('/ai/draft', { product_id: 'prd_claude_pro' })).json.error, 'ai_disabled', 'disabled by default');
      const s = (await A.get('/settings')).json.settings;
      await A.put('/settings/ai', { ...s.ai, gemini_enabled: true });
      await A.put('/secrets/gemini_api_key', { value: 'AIza_mock_key_for_tests' });
      mock.mode = 'ok'; mock.calls = [];
      const r = await A.post('/ai/draft', { product_id: 'prd_claude_pro' });
      eq(r.status, 200, 'draft'); eq(r.json.draft.summary_en, 'Summary', 'content');
      const sent = mock.calls.find((c) => /generateContent/.test(c.url)).body;
      assert(!/@example\.com|TEST ACCOUNT|IPN-|instapay/i.test(sent), 'no customer/payment data in prompt');
      mock.mode = 'fail500';
      const f = await A.post('/ai/draft', { product_id: 'prd_claude_pro' });
      eq(f.status, 502, 'graceful failure'); eq(f.json.error, 'ai_unavailable', 'code');
      mock.mode = 'ok';
      await A.put('/settings/ai', { ...s.ai, gemini_enabled: false });
      await req('DELETE', '/api/admin/secrets/gemini_api_key', { admin: true });
    });
  }

  // ------------------------------------------------------------ support
  await test('support requests: linked & verified with order key, unverified without', async () => {
    const a = await P.post('/support', { name: 'Test', contact: 'test@example.com', topic: 'activation', message: 'Need help please', order_number: orders.main.number, order_key: orders.main.token, lang: 'ar' });
    eq(a.status, 201, 'created');
    const b = await P.post('/support', { name: 'Test', contact: 'test@example.com', topic: 'other', message: 'Hello there', order_number: orders.main.number, lang: 'en' });
    eq(b.status, 201, 'created 2');
    const list = (await A.get('/support')).json.requests;
    eq(list.find((r) => r.number === a.json.number).order_verified, 1, 'verified');
    eq(list.find((r) => r.number === b.json.number).order_verified, 0, 'unverified');
    eq((await P.post('/support', { name: 'Bot', contact: 'bot@example.com', topic: 'other', message: 'spam spam', website: 'http://spam' })).status, 400, 'honeypot');
  });

  // ------------------------------------------------------------ scheduled jobs
  await test('scheduled jobs: unpaid expiry, overdue alerts, renewal reminders (opt-in only), no duplicates', async () => {
    if (!CAN_D1) return;
    const unpaid = (await P.post('/orders', orderBody([lines[0]], 45000, 'exp-' + RUN, 10))).json;
    const uid = await idOf(unpaid.number);
    d1(`UPDATE orders SET created_at = created_at - 3*86400000 WHERE id = '${uid}'`);
    const mid = await idOf(orders.main.number);
    d1(`UPDATE order_items SET expires_at = ${Date.now() + 86400000} WHERE order_id = '${mid}' AND plan_id = 'pln_chatgpt_plus_1m'`);
    const r1 = (await A.post('/system/run-jobs')).json.report;
    const r2 = (await A.post('/system/run-jobs')).json.report;
    eq((await P.get(`/orders/${unpaid.number}`, unpaid.token)).json.order.payment_status, 'cancelled', 'unpaid order expired');
    assert(r1.renewals >= 1 && r2.renewals === 0, `renewal reminder once (${r1.renewals}/${r2.renewals})`);
    const n = (await A.get(`/orders/${mid}`)).json.notifications.filter((x) => x.event === 'renewal_reminder');
    eq(n.length, 1, 'one reminder notification');
  });

  // ------------------------------------------------------------ CSV
  await test('CSV export and validated import (dry run, then apply)', async () => {
    const csv = (await req('GET', '/api/admin/export/products.csv', { admin: true })).text;
    assert(csv.includes('pln_chatgpt_plus_1m') && csv.includes('price_egp'), 'export');
    const changed = csv.replace(/(pln_grammarly_1m,[^\n]*?,)(,)(proposed)/, '$1149$2$3');
    const dry = await A.post('/import/products', { csv: changed, dry_run: true });
    eq(dry.status, 200, 'dry'); eq(dry.json.applied, false, 'not applied'); eq(dry.json.errors.length, 0, JSON.stringify(dry.json.errors));
    const broken = csv.replace('pln_chatgpt_plus_1m,', 'pln_chatgpt_plus_1m,').replace(/,450,approved,/, ',abc,approved,');
    eq((await A.post('/import/products', { csv: broken, dry_run: true })).json.errors.length > 0, true, 'invalid price reported');
    const apply = await A.post('/import/products', { csv: changed, dry_run: false });
    eq(apply.json.applied, true, 'applied');
    eq((await P.get('/products/chatgpt-plus')).status, 200, 'published product still published after import');
  });

  // ------------------------------------------------------------ security headers & abuse limits
  await test('security headers on HTML; admin shell is noindex', async () => {
    const r = await req('GET', '/');
    const csp = r.headers.get('content-security-policy') ?? '';
    assert(csp.includes("frame-ancestors 'none'") && csp.includes("default-src 'self'"), 'csp');
    eq(r.headers.get('x-content-type-options'), 'nosniff', 'nosniff');
    assert((await req('GET', '/admin')).headers.get('x-robots-tag')?.includes('noindex'), 'admin noindex');
    assert((await req('GET', '/robots.txt')).text.includes('Disallow'), 'robots');
  });
  await test('login brute force is rate limited', async () => {
    const saved = cookie;
    let limited = false;
    for (let i = 0; i < 9; i++) {
      const r = await req('POST', '/api/admin/auth/login', { admin: true, body: { email: 'brute-' + RUN + '@example.com', password: 'wrong-password-' + i } });
      if (r.status === 429) { limited = true; break; }
    }
    cookie = saved;
    assert(limited, 'expected 429');
  });
  await test('sign out invalidates the session', async () => {
    const saved = cookie;
    await A.post('/auth/logout');
    const prev = cookie; cookie = saved;
    eq((await A.get('/dashboard')).status, 401, 'old cookie rejected after logout');
    cookie = prev;
  });

  mockSrv?.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  writeFileSync(join(artifacts, `results-${new URL(BASE).host.replace(/[^a-z0-9]/gi, '_')}.json`), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

// ---------------------------------------------------------------- helpers
function orderBody(lines, expected, key, n = 0, overrides = {}) {
  return { idempotency_key: `${key}-${RUN}-xxxxxxxx`, lang: 'ar', customer: { ...customer(n), ...overrides }, payment_method_id: 'instapay', lines, expected_total_piastres: expected, accept_terms: true, tracking_consent: false };
}
const idCache = {};
async function idOf(number) {
  if (idCache[number]) return idCache[number];
  const r = await A.get(`/orders?q=${number}`);
  return (idCache[number] = r.json.orders[0].id);
}
function strip(p) {
  const { id, status, created_at, updated_at, published_at, publish_problems, plans, ...rest } = p;
  return { ...rest, featured: !!p.featured };
}
function stripPlan(pl) {
  const { product_id, created_at, updated_at, price_piastres, ...rest } = pl;
  return { ...rest, is_perpetual: !!pl.is_perpetual, guarantee_days: pl.guarantee_days ?? null };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });
