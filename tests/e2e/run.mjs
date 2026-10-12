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
if (/(^|\/\/)(www\.)?lynto\.store/.test(BASE)) { console.error('Refusing to run destructive E2E tests against production.'); process.exit(2); }
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
  let res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  // The local Vite/Miniflare proxy occasionally answers a request with a non-JSON 500 before it reaches the Worker; retry once.
  if (LOCAL && res.status === 500 && !(res.headers.get('content-type') ?? '').includes('json')) res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
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
const mock = { mode: 'ok', calls: [], flows: [], templates: [] };
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
        const u = rq.url.split('?')[0];
        if (/\/flows$/.test(u)) {
          if (rq.method === 'GET') return send(200, { data: mock.flows });
          const b = JSON.parse(body || '{}'); const fl = { id: 'flow-' + (mock.flows.length + 1), name: b.name, status: 'DRAFT' };
          mock.flows.push(fl); return send(200, { id: fl.id, success: true, validation_errors: [] });
        }
        if (/\/message_templates$/.test(u)) {
          if (rq.method === 'GET') return send(200, { data: mock.templates });
          const b = JSON.parse(body || '{}'); mock.templates.push({ name: b.name, language: b.language, status: 'APPROVED' });
          return send(200, { id: 't-' + mock.templates.length, status: 'APPROVED', category: b.category });
        }
        if (/\/flow-\d+\/publish$/.test(u)) { const fl = mock.flows.find((x) => u.includes('/' + x.id + '/')); if (fl) fl.status = 'PUBLISHED'; return send(200, { success: true }); }
        if (rq.method === 'GET' && /\/flow-\d+$/.test(u)) return send(200, { id: u.split('/').pop(), json_version: '7.3', validation_errors: [] });
        if (/\/subscribed_apps$/.test(u)) return send(200, { success: true, data: [{}] });
        if (/\/register$/.test(u)) return send(200, { success: true });
        if (rq.method === 'GET' && /^\/v[\d.]+\/\d+$/.test(u)) return send(200, { id: 'x', status: 'CONNECTED', platform_type: 'CLOUD_API', code_verification_status: 'VERIFIED', health_status: { can_send_message: 'AVAILABLE', entities: [] } });
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
const T = {}; // isolated products created by this run

async function main() {
  console.log(`LYnto E2E — ${BASE} (${LOCAL ? 'local with mock providers' : 'remote, no mocks'})`);
  const mockSrv = LOCAL ? await startMock() : null;

  // warm-up: the local Vite/Miniflare proxy can drop the very first POST after a cold start
  for (let i = 0; i < 3; i++) { await req('GET', '/healthz').catch(() => {}); await req('POST', '/api/public/cart/quote', { body: { lang: 'en', lines: [{ plan_id: 'x', qty: 1, fields: {} }] } }).catch(() => {}); }
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

  // ------------------------------------------------------------ isolated catalogue (independent of the live launch catalogue)
  await test('create isolated test products (draft, subscription, top-up)', async () => {
    const base = { category_id: 'cat_ai', brand: 'E2E', summary_ar: 'اختبار', summary_en: 'test', description_ar: 'وصف اختبار', description_en: 'test description', features_ar: [], features_en: [],
      delivery_ar: '', delivery_en: '', guarantee_ar: '', guarantee_en: '', owner_instructions: '', image_key: null, icon_text: 'E2E', accent: '', featured: false, supply_status: 'pending', supply_notes: '', official_url: '', sort: 900 };
    const plan = (id, over) => ({ id, name_ar: 'خطة', name_en: 'Plan', plan_type: 'private', duration_value: 1, duration_unit: 'month', is_perpetual: false, price_egp: null, status: 'proposed', availability: 'available', max_qty: 1, guarantee_kind: 'pending', guarantee_days: null, notes_ar: '', notes_en: '', sort: 0, ...over });
    const emailField = { key: 'account_email', type: 'email', required: true, label_ar: 'الإيميل', label_en: 'Email' };
    const playerField = { key: 'player_id', type: 'text', required: true, pattern: '^[0-9]{5,16}$', label_ar: 'رقم اللاعب', label_en: 'Player ID' };
    const mk = async (slug, over, plans) => { const r = await A.post('/products', { ...base, slug, title_ar: 'منتج اختبار ' + slug, title_en: 'E2E ' + slug, ...over, plans }); eq(r.status, 201, 'create ' + slug + ' ' + r.text); return r.json.product; };
    const d = await mk('e2e-draft-' + RUN, { customer_fields: [emailField] }, [plan('pln_e2ed' + RUN)]);
    T.draft = { id: d.id, slug: d.slug, plan: 'pln_e2ed' + RUN };
    const sub = await mk('e2e-sub-' + RUN, { customer_fields: [emailField] }, [plan('pln_e2es' + RUN)]);
    T.sub = { id: sub.id, slug: sub.slug, plan: 'pln_e2es' + RUN };
    const top = await mk('e2e-topup-' + RUN, { customer_fields: [playerField] }, [
      plan('pln_e2et60' + RUN, { plan_type: 'topup', is_perpetual: true, duration_value: null, duration_unit: null, max_qty: 5 }),
      plan('pln_e2et325' + RUN, { plan_type: 'topup', is_perpetual: true, duration_value: null, duration_unit: null, max_qty: 5 })]);
    T.top = { id: top.id, slug: top.slug, plan60: 'pln_e2et60' + RUN, plan325: 'pln_e2et325' + RUN };
  });

  // ------------------------------------------------------------ draft exclusion
  await test('drafts are not exposed publicly (API, HTML, sitemap)', async () => {
    const r = await P.get('/products');
    eq(r.status, 200, 'status');
    const ids = r.json.products.map((p) => p.slug);
    assert(!ids.includes(T.draft.slug), 'claude-pro (draft) must not be listed');
    eq((await P.get(`/products/${T.draft.slug}`)).status, 404, 'draft product API');
    const html = await req('GET', `/p/${T.draft.slug}`);
    eq(html.status, 404, 'draft product page status');
    assert(html.text.includes('noindex'), 'draft page must be noindex');
    const sm = await req('GET', '/sitemap.xml');
    assert(!sm.text.includes(`/p/${T.draft.slug}`), 'sitemap must not include drafts');
  });
  await test('draft plans cannot be quoted or ordered', async () => {
    const q = await P.post('/cart/quote', { lang: 'ar', lines: [{ plan_id: T.draft.plan, qty: 1, fields: {} }] });
    eq(q.json.problems[0]?.error, 'unavailable', 'quote problem');
  });
  await test('checkout is disabled while setup is incomplete', async () => {
    await A.put('/settings/store', { accepting_orders: false, business_name: 'LYnto', announcement_ar: '', announcement_en: '' });
    const r = await P.post('/orders', orderBody([{ plan_id: T.draft.plan, qty: 1, fields: { account_email: 'a@b.co' } }], 100, 'x'));
    assert([403, 409].includes(r.status), `status ${r.status}`);
  });
  await test('admin preview can view a draft; public cannot', async () => {
    eq((await A.get(`/products/${T.draft.id}/preview`)).status, 200, 'admin preview');
    eq((await req('GET', `/api/admin/products/${T.draft.id}/preview`)).status, 401, 'no cookie');
  });

  // ------------------------------------------------------------ publish validation
  await test('publishing an unpriced/unvalidated product is refused with reasons', async () => {
    const r = await A.post(`/products/${T.sub.id}/status`, { status: 'published' });
    eq(r.status, 409, 'status');
    assert(Array.isArray(r.json.details) && r.json.details.some((d) => /price|approved/i.test(d)), 'problems listed');
  });
  await test('a plan cannot be approved without a price', async () => {
    const r = await A.post('/plans/bulk', { plans: [{ id: T.sub.plan, price_egp: null, status: 'approved', availability: 'available' }] });
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
    eq((await A.put('/settings/support', { whatsapp: '01000000001', email: 'support-test@example.com', phone: '', hours_note_ar: '', hours_note_en: '', socials: { facebook: 'https://www.facebook.com/profile.php?id=61595340380778', instagram: 'https://www.instagram.com/lynto.store', tiktok: '', telegram: '', x: '', youtube: '' } })).status, 200, 'support');
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
    const prod = (await A.get(`/products/${T.sub.id}`)).json.product;
    const r = await A.put(`/products/${T.sub.id}`, { ...strip(prod), supply_status: 'validated', plans: prod.plans.map((pl) => ({ ...stripPlan(pl), price_egp: '450', status: 'approved', guarantee_kind: 'full_period' })) });
    eq(r.status, 200, 'save chatgpt');
    eq((await A.post(`/products/${T.sub.id}/status`, { status: 'published' })).status, 200, 'publish chatgpt');
    const pubg = (await A.get(`/products/${T.top.id}`)).json.product;
    eq((await A.put(`/products/${T.top.id}`, { ...strip(pubg), supply_status: 'validated', plans: pubg.plans.map((pl, i) => ({ ...stripPlan(pl), price_egp: i === 0 ? '55.50' : '', status: i === 0 ? 'approved' : 'proposed', guarantee_kind: 'none' })) })).status, 200, 'save pubg');
    eq((await A.post(`/products/${T.top.id}/status`, { status: 'published' })).status, 200, 'publish pubg');
  });
  await test('published products appear publicly with SEO tags; unapproved plans stay hidden', async () => {
    const r = await P.get(`/products/${T.sub.slug}`);
    eq(r.status, 200, 'api');
    eq(r.json.product.plans[0].price_piastres, 45000, 'price');
    const pubg = (await P.get(`/products/${T.top.slug}`)).json.product;
    eq(pubg.plans.length, 1, 'only the approved PUBG plan is public');
    const html = await req('GET', `/en/p/${T.sub.slug}`);
    eq(html.status, 200, 'html');
    assert(html.text.includes('rel="canonical"') && html.text.includes('application/ld+json') && html.text.includes('hreflang="ar-EG"'), 'seo tags');
    assert(html.text.includes('E2E ' + T.sub.slug), 'prerendered content');
    assert((await req('GET', '/sitemap.xml')).text.includes(`/p/${T.sub.slug}`), 'sitemap includes published');
  });

  // ------------------------------------------------------------ checkout integrity
  const lines = [
    { plan_id: T.sub.plan, qty: 1, fields: { account_email: 'buyer-account@example.com' } },
    { plan_id: T.top.plan60, qty: 2, fields: { player_id: '5123456789' } },
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
    eq((await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 2, fields: { account_email: 'a@b.co' } }], 90000, 'qty-' + RUN))).json.error, 'cart_invalid', 'qty');
    eq((await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 1, fields: {} }], 45000, 'fld-' + RUN))).json.error, 'cart_invalid', 'missing field');
    eq((await P.post('/orders', orderBody([{ plan_id: T.top.plan60, qty: 1, fields: { player_id: 'abc' } }], 5550, 'pat-' + RUN))).json.error, 'cart_invalid', 'pattern');
    eq((await P.post('/orders', orderBody([{ plan_id: T.top.plan325, qty: 1, fields: { player_id: '5123456789' } }], 1, 'unap-' + RUN))).json.error, 'cart_invalid', 'unapproved plan');
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
    const gpt = d.items.find((i) => i.plan_id === T.sub.plan), pubg = d.items.find((i) => i.plan_id === T.top.plan60);
    eq((await A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: gpt.id, details: '' }] })).status, 400, 'details required');
    const activated = Date.UTC(2026, 9, 10, 12, 0);
    const [r1, r2] = await Promise.all([1, 2].map(() => A.post(`/orders/${id}/deliver`, { mode: 'portal', items: [{ item_id: gpt.id, details: 'Activation link: https://example.com/redeem/TEST-CODE-123', activated_at: activated }] })));
    eq([r1, r2].filter((r) => r.json?.already === false).length, 1, 'one real delivery');
    let o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.fulfillment_status, 'partially_delivered', 'partial');
    const ci = o.items.find((i) => i.product_title_en.includes('e2e-sub'));
    assert(ci.delivery.details.includes('TEST-CODE-123'), 'customer sees decrypted details');
    // 10 Oct 15:00 Cairo (UTC+3, DST) + 1 calendar month = 10 Nov 15:00 Cairo (UTC+2 after DST ends) = 13:00 UTC
    eq(new Date(ci.expires_at).toISOString(), '2026-11-10T13:00:00.000Z', 'expiry = activation + 1 month (Cairo calendar, across DST end)');
    const pi = o.items.find((i) => i.product_title_en.includes('e2e-topup'));
    eq(pi.fulfillment_status, 'processing', 'other item still processing');
    eq((await A.post(`/orders/${id}/deliver`, { mode: 'external', note: 'sent on WhatsApp', items: [{ item_id: pubg.id }] })).json.already, false, 'external');
    o = (await P.get(`/orders/${orders.main.number}`, orders.main.token)).json.order;
    eq(o.fulfillment_status, 'delivered', 'delivered');
    eq(o.items.find((i) => i.product_title_en.includes('e2e-topup')).expires_at, null, 'top-up has no fabricated expiry');
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

  // ------------------------------------------------------------ data deletion policy
  await test('data erasure: personal data removed, amounts kept, link dead; orders in review are skipped', async () => {
    const email = `erase-${RUN}@example.com`;
    const ord = (await P.post('/orders', { ...orderBody([{ plan_id: T.sub.plan, qty: 1, fields: { account_email: 'erase-acct@example.com' } }], 45000, 'erase-' + RUN, 12), customer: { ...customer(12), email } })).json;
    const id = await idOf(ord.number);
    const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), 'r.png');
    eq((await req('POST', `/api/public/orders/${ord.number}/proof`, { form: fd, headers: { 'x-order-key': ord.token } })).status, 201, 'proof');
    const blocked = await A.post('/privacy/erase', { email, confirm: true });
    eq(blocked.json.anonymized.length, 0, 'nothing erased while proof awaits review'); assert(/proof/.test(blocked.json.skipped[0].reason), 'reason given');
    eq((await A.post('/privacy/erase', { email })).status, 400, 'confirm flag required');
    eq((await A.post(`/orders/${id}/cancel`, { reason: 'Customer request' })).status, 200, 'cancel');
    const done = await A.post('/privacy/erase', { email, confirm: true });
    eq(done.json.anonymized[0], ord.number, 'erased');
    const d = (await A.get(`/orders/${id}`)).json;
    eq(d.order.customer_name, '[deleted]', 'name'); eq(d.order.customer_whatsapp, '[deleted]', 'whatsapp'); assert(!d.order.customer_email.includes('erase-'), 'email gone');
    eq(d.proofs.length, 0, 'receipts removed'); eq(d.order.total_piastres, 45000, 'amount kept'); eq(d.tracking_url, null, 'link removed');
    assert(d.items.every((i) => Object.keys(i.customer_fields).length === 0), 'activation fields removed');
    eq((await P.get(`/orders/${ord.number}`, ord.token)).status, 404, 'private link no longer works');
    eq((await A.post('/privacy/erase', { email, confirm: true })).json.anonymized.length, 0, 'idempotent');
    const page = await req('GET', '/data-deletion');
    eq(page.status, 200, 'policy page'); assert(page.text.includes('rel="canonical"'), 'seo');
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
    await test('owner compose: any username @domain via Resend; unsafe senders rejected; logged', async () => {
      mock.mode = 'ok'; mock.calls = [];
      const r = await A.post('/mail/send', { from_local: 'info', to: ['someone@example.com'], subject: 'مرحباً', body: 'أهلاً\n\nرسالة اختبار https://lynto.store', lang: 'ar' });
      eq(r.status, 200, 'send ' + r.text); eq(r.json.from, 'info@lynto.store', 'sender');
      const b = JSON.parse(mock.calls.find((c) => c.url === '/emails').body);
      eq(b.from, 'LYnto <info@lynto.store>', 'from header'); eq(b.reply_to, 'info@lynto.store', 'reply-to defaults to sender');
      assert(b.html.includes('dir="rtl"') && b.html.includes('<a href="https://lynto.store"'), 'branded rtl html with linkified url');
      assert(b.html.includes('href="https://www.facebook.com/profile.php?id=61595340380778"') && b.html.includes('href="https://www.instagram.com/lynto.store"') && b.html.includes('/brand/social-facebook.png'), 'emails carry Facebook and Instagram icon links');
      eq((await A.post('/mail/send', { from_local: 'a@evil.com', to: ['x@example.com'], subject: 's', body: 'b' })).status, 400, 'sender injection rejected');
      eq((await A.post('/mail/send', { from_local: 'orders', to: ['not-an-email'], subject: 's', body: 'b' })).status, 400, 'bad recipient rejected');
      eq((await A.post('/mail/send', { from_local: 'orders', to: Array.from({ length: 11 }, (_, i) => 'u' + i + '@example.com'), subject: 's', body: 'b' })).status, 400, 'too many recipients');
      mock.mode = 'fail400';
      const f = await A.post('/mail/send', { from_local: 'contact', to: ['someone@example.com'], subject: 'x', body: 'y' });
      eq(f.json.results[0].status, 'failed', 'provider rejection recorded');
      mock.mode = 'ok';
      const log = (await A.get('/mail/log')).json.emails;
      assert(log.some((e) => e.from_addr === 'info@lynto.store' && e.status === 'sent') && log.some((e) => e.from_addr === 'contact@lynto.store' && e.status === 'failed'), 'log has both');
    });
    await test('support request: acknowledgement email only when the contact is an email address', async () => {
      mock.mode = 'ok'; mock.calls = [];
      const a = await P.post('/support', { name: 'Ack Test', contact: 'ack-' + RUN + '@example.com', topic: 'other', message: 'Hello there, need help', lang: 'ar' });
      eq(a.status, 201, 'created');
      await sleep(1500);
      const sent = mock.calls.filter((c) => c.url === '/emails').map((c) => JSON.parse(c.body));
      const ack = sent.find((m) => (m.to || []).includes('ack-' + RUN + '@example.com'));
      assert(ack, 'acknowledgement sent'); eq(ack.from, 'LYnto <support@lynto.store>', 'from support@'); assert(ack.subject.includes(a.json.number), 'ticket number in subject');
      mock.calls = [];
      await P.post('/support', { name: 'Phone Test', contact: '+201000000555', topic: 'other', message: 'Call me please', lang: 'ar' });
      await sleep(800);
      eq(mock.calls.filter((c) => c.url === '/emails').length, 0, 'no email to a phone contact');
    });
    await test('unpaid-order reminder: sent once by email, never creates manual to-dos', async () => {
      mock.mode = 'ok'; mock.calls = [];
      const ord = (await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 1, fields: { account_email: 'rem@example.com' } }], 45000, 'rem-' + RUN, 11, { preferred_channel: 'email' }))).json;
      const id = await idOf(ord.number);
      d1(`UPDATE orders SET created_at = created_at - 8*3600000 WHERE id = '${id}'`);
      await A.post('/system/run-jobs'); await A.post('/system/run-jobs');
      const n = (await A.get(`/orders/${id}`)).json.notifications.filter((x) => x.event === 'payment_reminder');
      eq(n.length, 1, 'exactly one reminder'); eq(n[0].status, 'sent', 'sent by email'); eq(n[0].channel, 'email', 'channel');
      assert(mock.calls.some((c) => c.url === '/emails' && JSON.parse(c.body).subject.includes(ord.number)), 'email carries order number');
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
    // ------------------------------------------------------------ WhatsApp inbound: menu, browsing, tracking, Flows, opt-out, go-live
    const waHook = async (messages, secret = 'app_secret_mock') => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999111', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '123456789' }, contacts: [{ profile: { name: 'Test Sender' }, wa_id: messages[0].from }], messages } }] }] });
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const r = await fetch(BASE + '/api/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + sig }, body: payload });
      await sleep(1500);
      return r.status;
    };
    const waOut = () => mock.calls.filter((c) => /\/messages$/.test(c.url)).map((c) => JSON.parse(c.body));
    let wmid = 0; const mid = () => 'wamid.in-' + RUN + '-' + ++wmid;

    await test('WhatsApp inbound: menu on first message, no duplicate on Meta retry, bad signature rejected', async () => {
      const cur = (await A.get('/settings')).json.settings.notifications;
      eq((await A.put('/settings/notifications', { ...cur, email_provider: 'none', whatsapp_enabled: false, whatsapp_phone_number_id: '123456789', whatsapp_waba_id: '999111', whatsapp_autoreply: true })).status, 200, 'settings');
      mock.mode = 'ok'; mock.calls = [];
      const m = { id: mid(), from: '201000000700', type: 'text', text: { body: 'مرحبا' } };
      eq(await waHook([m]), 200, 'accepted');
      let out = waOut();
      eq(out.length, 1, 'one reply'); eq(out[0].to, '201000000700', 'to sender'); eq(out[0].interactive.type, 'button', 'button menu');
      eq(out[0].interactive.action.buttons.length, 3, 'three buttons');
      assert(out[0].interactive.action.buttons.every((b) => b.reply.title.length <= 20), 'titles within WhatsApp limit');
      eq(await waHook([m]), 200, 'retry accepted');
      eq(waOut().length, 1, 'duplicate delivery ignored');
      mock.calls = [];
      eq(await waHook([{ id: mid(), from: '201000000701', type: 'text', text: { body: 'hello' } }], 'wrong-secret'), 401, 'bad signature');
      eq(waOut().length, 0, 'nothing sent for unsigned payload');
    });
    await test('WhatsApp inbound: browse categories → products → product link (no catalog feature used)', async () => {
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000702', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu_browse', title: 'تصفّح المنتجات' } } }]);
      let out = waOut();
      eq(out[0].interactive.type, 'list', 'category list');
      const rows = out[0].interactive.action.sections[0].rows;
      assert(rows.length >= 1 && rows.every((r) => r.id.startsWith('cat:') && r.title.length <= 24), 'category rows');
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000702', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'cat:ai-tools', title: 'x' } } }]);
      out = waOut();
      const prow = out[0].interactive.action.sections[0].rows;
      assert(prow.length >= 2 && prow.length <= 10 && prow.some((r) => r.id.startsWith('p:')) && prow.some((r) => r.id === 'all:ai-tools'), 'product rows + see-all');
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000702', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'p:' + T.sub.slug, title: 'x' } } }]);
      out = waOut();
      eq(out[0].interactive.type, 'cta_url', 'cta_url');
      assert(out[0].interactive.action.parameters.url.endsWith('/p/' + T.sub.slug), 'product url');
    });
    await test('WhatsApp inbound: order tracking only for the verified number; wrong sender learns nothing', async () => {
      const ord = (await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 1, fields: { account_email: 'wa-track@example.com' } }], 45000, 'wat-' + RUN, 13))).json;
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000113', type: 'text', text: { body: 'حالة طلبي ' + ord.number } }]);
      let t = waOut()[0].text.body;
      assert(t.includes(ord.number) && t.includes('في انتظار التحويل'), 'status for the order owner: ' + t);
      assert(!t.includes('wa-track@example.com') && !t.includes('#k='), 'no private data or tokens in the message');
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000999', type: 'text', text: { body: ord.number } }]);
      t = waOut()[0].text.body;
      assert(t.includes('مقدرناش نتحقق') && !t.includes('في انتظار التحويل'), 'impostor gets a generic reply: ' + t);
    });
    await test('WhatsApp Flow submissions create support tickets (verified when sender matches the order)', async () => {
      const ord = (await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 1, fields: { account_email: 'wa-flow@example.com' } }], 45000, 'waf-' + RUN, 15))).json;
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000115', type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { name: 'flow', body: 'Sent',
        response_json: JSON.stringify({ flow_token: 'lynto:support:abc', kind: 'support', topic: 'activation', order_number: ord.number, message: 'الكود مش شغال معايا' }) } } }]);
      assert(waOut()[0].text.body.includes('SR-'), 'ticket number replied');
      const list = (await A.get('/support')).json.requests;
      const tk = list.find((r) => r.message === 'الكود مش شغال معايا');
      assert(tk, 'ticket stored'); eq(tk.order_verified, 1, 'verified by sender number'); eq(tk.topic, 'activation', 'topic'); eq(tk.contact, '+201000000115', 'contact');
      await waHook([{ id: mid(), from: '201000000555', type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { name: 'flow', body: 'Sent',
        response_json: JSON.stringify({ flow_token: 'lynto:deletion:z', kind: 'deletion', order_number: ord.number, confirm: ['yes'] }) } } }]);
      const del = (await A.get('/support')).json.requests.find((r) => r.topic === 'deletion' && r.contact === '+201000000555');
      assert(del, 'deletion ticket stored'); eq(del.order_verified, 0, 'not verified for a different number');
    });
    await test('WhatsApp opt-out keyword stops automatic messages for that number', async () => {
      const ord = (await P.post('/orders', orderBody([{ plan_id: T.sub.plan, qty: 1, fields: { account_email: 'wa-stop@example.com' } }], 45000, 'was-' + RUN, 16, { whatsapp_optin: true }))).json;
      const id = await idOf(ord.number);
      eq((await A.get('/orders/' + id)).json.order.whatsapp_optin, 1, 'opted in');
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000116', type: 'text', text: { body: 'STOP' } }]);
      eq((await A.get('/orders/' + id)).json.order.whatsapp_optin, 0, 'opted out');
      assert(waOut()[0].text.body.length > 5, 'confirmation sent');
    });
    await test('WhatsApp tools: Flows are created once; go-live check registers, subscribes, syncs templates and enables sending', async () => {
      const a = await A.post('/whatsapp/flows/create');
      eq(a.status, 200, 'create ' + a.text); eq(a.json.results.filter((r) => r.status === 'created').length, 4, 'four flows');
      eq((await A.post('/whatsapp/flows/create')).json.results.filter((r) => r.status === 'exists').length, 4, 'idempotent');
      const st = (await A.get('/settings')).json.settings.notifications;
      assert(st.whatsapp_flows.support && st.whatsapp_flows.track && st.whatsapp_flows.deletion && st.whatsapp_flows.request, 'flow ids saved');
      mock.calls = [];
      await waHook([{ id: mid(), from: '201000000703', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu_track', title: 'تتبع طلبي' } } }]);
      const fl = waOut()[0];
      eq(fl.interactive.type, 'flow', 'flow message'); eq(fl.interactive.action.parameters.flow_id, st.whatsapp_flows.track, 'track flow id'); assert(fl.interactive.action.parameters.flow_cta.length <= 20, 'cta length');
      const g = await A.post('/whatsapp/go-live');
      eq(g.status, 200, 'go-live ' + g.text);
      assert(g.json.enabled === true && g.json.blockers.length === 0, 'enabled automatically: ' + JSON.stringify(g.json));
      assert(['subscribe_app', 'templates', 'flows', 'sync_templates', 'enable'].every((k) => g.json.steps.some((x) => x.step === k && x.ok)), 'all steps ok');
      const after = (await A.get('/settings')).json.settings.notifications;
      eq(after.whatsapp_enabled, true, 'switched on'); eq(after.whatsapp_templates.order_received.name, 'lynto_order_received', 'template activated');
      await A.put('/settings/notifications', { ...after, whatsapp_enabled: false });
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
      eq((await A.post('/ai/draft', { product_id: T.draft.id })).json.error, 'ai_disabled', 'disabled by default');
      const s = (await A.get('/settings')).json.settings;
      await A.put('/settings/ai', { ...s.ai, gemini_enabled: true });
      await A.put('/secrets/gemini_api_key', { value: 'AIza_mock_key_for_tests' });
      mock.mode = 'ok'; mock.calls = [];
      const r = await A.post('/ai/draft', { product_id: T.draft.id });
      eq(r.status, 200, 'draft'); eq(r.json.draft.summary_en, 'Summary', 'content');
      const sent = mock.calls.find((c) => /generateContent/.test(c.url)).body;
      assert(!/@example\.com|TEST ACCOUNT|IPN-|instapay/i.test(sent), 'no customer/payment data in prompt');
      mock.mode = 'fail500';
      const f = await A.post('/ai/draft', { product_id: T.draft.id });
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
    d1(`UPDATE order_items SET expires_at = ${Date.now() + 86400000} WHERE order_id = '${mid}' AND plan_id = '${T.sub.plan}'`);
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
    assert(csv.includes(T.sub.plan) && csv.includes('price_egp'), 'export');
    const changed = csv.replace(new RegExp(`(${T.top.plan325},[^\\n]*?,)(,)(proposed)`), '$1149$2$3');
    const dry = await A.post('/import/products', { csv: changed, dry_run: true });
    eq(dry.status, 200, 'dry'); eq(dry.json.applied, false, 'not applied'); eq(dry.json.errors.length, 0, JSON.stringify(dry.json.errors));
    const broken = csv.replace(new RegExp(`(${T.sub.plan},[^\\n]*?),450,approved,`), '$1,abc,approved,');
    eq((await A.post('/import/products', { csv: broken, dry_run: true })).json.errors.length > 0, true, 'invalid price reported');
    const apply = await A.post('/import/products', { csv: changed, dry_run: false });
    eq(apply.json.applied, true, 'applied');
    eq((await P.get(`/products/${T.sub.slug}`)).status, 200, 'published product still published after import');
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
