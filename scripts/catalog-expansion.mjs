// Generates migrations/0008_catalog_expansion.sql — more plans for launch products and new products (scripts/data/expansion.mjs).
// Safe for production: only INSERT OR IGNORE of new ids; existing plans are re-sorted only where their sort is still the launch value,
// so owner edits (prices, names, order) are never overwritten. Prices are ESTIMATES (launch model) for the owner to review.
// Run: node scripts/catalog-expansion.mjs   (regenerate only BEFORE the migration is applied)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA, NEW } from './data/expansion.mjs';
import { DETAILS as D1 } from './data/details-ai-software.mjs';
import { DETAILS as D2 } from './data/details-entertainment-gaming.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const FX = 50;
const MARKUP = { sub: 1.18, invite: 1.18, license: 1.15, card: 1.10, topup: 1.10 };
const FLOOR = 97;
const nice = (n) => { const step = n < 100 ? 1 : n < 500 ? 5 : n < 2000 ? 10 : n < 10000 ? 50 : 100; return Math.ceil(n / step) * step; };
const price = (usd, kind) => Math.max(FLOOR, nice(usd * FX * MARKUP[kind]));
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const durAr = (m) => (m === 1 ? 'شهر واحد' : m === 2 ? 'شهرين' : m <= 10 ? `${m} شهور` : m === 12 ? 'سنة كاملة' : m === 24 ? 'سنتين' : `${m} شهر`);
const durEn = (m) => (m === 1 ? '1 month' : `${m} months`);

// ---------- existing launch plans (parsed from the applied migration; the source of truth for ids, names and sort)
function sqlValues(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    while (s[i] === ' ' || s[i] === ',') i++;
    if (s[i] === "'") { let v = ''; i++; for (;;) { if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else v += s[i++]; } out.push(v); }
    else { let j = i; while (j < s.length && s[j] !== ',') j++; const raw = s.slice(i, j).trim(); out.push(raw === 'NULL' ? null : Number(raw)); i = j; }
  }
  return out;
}
const launch = readFileSync(join(root, 'migrations/0003_launch_catalog.sql'), 'utf8').split('\n');
const products = new Map();
for (const line of launch) {
  const m = line.match(/^INSERT INTO (products|plans) \(([^)]*)\) VALUES \((.*)\);$/);
  if (!m) continue;
  const cols = m[2].split(', ');
  const vals = sqlValues(m[3]);
  const row = Object.fromEntries(cols.map((c, k) => [c, vals[k]]));
  if (m[1] === 'products') products.set(row.id, { ...row, plans: [] });
  else products.get(row.product_id).plans.push(row);
}
const bySlug = new Map([...products.values()].map((p) => [p.slug, p]));
const allPrices = [...products.values()].flatMap((p) => p.plans.map((pl) => pl.price_piastres / 100));

// ---------- text helpers (same voice as migration 0007)
const CLOSE = (b) => ({
  ar: `ملاحظة: مميزات الخدمة وشروطها بيحددها مقدّم الخدمة وممكن تتغير. LYnto مش تابعة لـ ${b}، وأسماء المنصات وشعاراتها ملك أصحابها.`,
  en: `Note: features and terms are set by the provider and may change. LYnto is not affiliated with ${b}; platform names and logos belong to their owners.`,
});
const ACT = {
  sub: { ar: 'بنفعّل الاشتراك على الإيميل اللي بتكتبه في الطلب من غير ما نطلب كلمة سر أبداً، وبتوصلك التفاصيل في صفحة طلبك الآمنة.', en: 'We activate the subscription on the email you enter in the order and never ask for a password; the details arrive on your private order page.' },
  license: { ar: 'بنسلّم مفتاح التفعيل مع خطوات واضحة في صفحة طلبك الآمنة.', en: 'We deliver the activation key with clear steps on your private order page.' },
};
const firstSentence = (s) => { const m = s.match(/^(.+?[.!؟?])(\s|$)/); return m ? m[1] : s; };

const F = {
  email: { key: 'account_email', type: 'email', required: true, label_ar: 'إيميل الحساب اللي هيتفعّل عليه الاشتراك', label_en: 'Email of the account to activate',
    help_ar: 'لازم يكون نفس الإيميل المسجّل بيه في الخدمة. مش هنطلب كلمة سر أبداً.', help_en: 'Must match the email registered with the service. We never ask for a password.' },
  region: { key: 'account_region', type: 'select', required: true, label_ar: 'منطقة حسابك', label_en: 'Your account region',
    help_ar: 'الكارت بيشتغل بس على حساب من نفس المنطقة.', help_en: 'The card only works on an account of the same region.',
    options: [{ value: 'US', label_ar: 'حسابي على متجر الولايات المتحدة (US)', label_en: 'My account is on the United States store (US)' }] },
  player: { key: 'player_id', type: 'text', required: true, pattern: '^[0-9]{5,16}$', label_ar: 'رقم اللاعب (Player ID)', label_en: 'Player ID',
    help_ar: 'هتلاقيه في صفحة البروفايل جوه اللعبة. اكتبه أرقام بس.', help_en: 'Find it on your in-game profile. Digits only.' },
  gameid: { key: 'player_id', type: 'text', required: true, pattern: '^#?[0-9A-Za-z]{4,20}$', label_ar: 'رقم أو كود اللاعب (Player Tag / ID)', label_en: 'Player Tag / ID',
    help_ar: 'هتلاقيه في صفحة البروفايل جوه اللعبة (مثلاً #ABC123). من غير كلمة سر.', help_en: 'Find it on your in-game profile (e.g. #ABC123). No password.' },
};
const fieldsFor = (f) => (F[f] ? [F[f]] : []);

function planNote(kind, type, months, nameEn, tiers) {
  const keys = Object.keys(tiers ?? {}).sort((a, b) => b.length - a.length);
  const k = keys.find((x) => nameEn.includes(x));
  const tier = k ? tiers[k] : null;
  const pre = (i) => (tier ? tier[i] + ' ' : '');
  if (type === 'gift_card') return { ar: `كارت بقيمة ${nameEn} بيتسلّم ككود رقمي بعد تأكيد الدفع.`, en: `A ${nameEn} card delivered as a digital code after payment is confirmed.` };
  if (type === 'topup') return { ar: `كمية الشحن: ${nameEn}. بتتضاف لحسابك بالبيانات اللي هتكتبها في الطلب بعد مراجعة الدفع.`, en: `Top-up amount: ${nameEn}. Added to your account using the details you enter in the order, after payment review.` };
  if (type === 'license' && months > 0) return { ar: `${pre(0)}مفتاح تفعيل لمدة ${durAr(months)} من تاريخ التفعيل، بيتسلّم مع الخطوات.`, en: `${pre(1)}Activation key valid for ${durEn(months)} from activation, delivered with the steps.` };
  if (type === 'license' || months === 0) return { ar: `${pre(0)}ترخيص دائم: بتدفع مرة واحدة من غير اشتراك شهري، وبيتسلّم مع خطوات التفعيل.`, en: `${pre(1)}Perpetual: pay once with no monthly fee; delivered with the activation steps.` };
  const how = type === 'invite'
    ? { ar: `بتوصلك دعوة عضوية على إيميلك. مدة الاشتراك ${durAr(months)} من تاريخ التفعيل.`, en: `A membership invitation arrives on your email. Subscription length: ${durEn(months)} from activation.` }
    : { ar: `بيتفعّل على الإيميل اللي هتكتبه في الطلب. مدة الاشتراك ${durAr(months)} من تاريخ التفعيل.`, en: `Activated on the email you enter in the order. Subscription length: ${durEn(months)} from activation.` };
  return { ar: pre(0) + how.ar, en: pre(1) + how.en };
}

/** Normalise a plan spec [tierAr, tierEn, months, usd|{egp,opts}, opts?] for a product of `kind`. */
function makePlan(kind, spec, defaultType) {
  const [tierAr, tierEn, months, p, opts0] = spec;
  const p2 = typeof p === 'object' ? p : { usd: p };
  const opts = p2.opts ?? opts0 ?? {};
  const planKind = opts.kind ?? kind;
  const egp = p2.egp ?? price(p2.usd, planKind);
  const nameAr = months > 0 ? (tierAr ? `${tierAr} — ${durAr(months)}` : durAr(months)) : tierAr;
  const nameEn = months > 0 ? (tierEn ? `${tierEn} — ${durEn(months)}` : durEn(months)) : tierEn;
  const type = opts.type ?? defaultType ?? (kind === 'card' ? 'gift_card' : kind === 'topup' ? 'topup' : kind === 'license' ? 'license' : 'private');
  const qty = opts.qty ?? (kind === 'card' || kind === 'topup' ? (egp > 8000 ? 1 : 5) : egp > 20000 ? 1 : 2);
  return { tierEn, months, egp, nameAr, nameEn, type, qty, perpetual: months === 0 ? 1 : 0, guarantee: months > 0 ? 'full_period' : 'none' };
}

/** Display order: cards/top-ups by price; subscriptions grouped by tier (first appearance), then by length, then price. */
function ordered(kind, plans) {
  if (kind === 'card' || kind === 'topup') return [...plans].sort((a, b) => a.egp - b.egp);
  const tierOrder = [];
  for (const p of plans) if (!tierOrder.includes(p.tierEn)) tierOrder.push(p.tierEn);
  const m = (x) => (x.months === 0 ? 10_000 : x.months);
  return [...plans].sort((a, b) => tierOrder.indexOf(a.tierEn) - tierOrder.indexOf(b.tierEn) || m(a) - m(b) || a.egp - b.egp);
}

const planInsert = (id, productId, p, sort, note) => `INSERT OR IGNORE INTO plans (id, product_id, name_ar, name_en, plan_type, duration_value, duration_unit, is_perpetual, price_piastres, status, availability, max_qty, guarantee_kind, notes_ar, notes_en, sort, created_at, updated_at) VALUES (${[
  id, productId, p.nameAr, p.nameEn, p.type, p.months > 0 ? p.months : null, p.months > 0 ? 'month' : null, p.perpetual, p.egp * 100, 'approved', 'available', p.qty, p.guarantee, note.ar, note.en, sort, NOW, NOW].map(q).join(', ')});`;

const lines = [
  '-- 0008: catalogue expansion (generated by scripts/catalog-expansion.mjs). Prices are ESTIMATES (USD × 50 × margin, floor 97 EGP).',
  '-- Only inserts new ids; launch plans are re-sorted only where their sort is unchanged since 0003, so owner edits are kept.',
];
const newPrices = [];
let nExtra = 0, nNewProducts = 0, nNewPlans = 0;

// ---------- 1) more plans for launch products
for (const [slug, specs] of Object.entries(EXTRA)) {
  const prod = bySlug.get(slug);
  if (!prod) throw new Error('Unknown launch product ' + slug);
  const t0 = prod.plans[0].plan_type;
  const kind = t0 === 'gift_card' ? 'card' : t0 === 'topup' ? 'topup' : t0 === 'license' ? 'license' : 'sub';
  const tiers = (D1[slug] || D2[slug])?.tiers ?? {};
  const existing = prod.plans.map((pl) => ({ id: pl.id, sort0: pl.sort, egp: pl.price_piastres / 100, months: pl.duration_value ?? 0, nameEn: pl.name_en, tierEn: pl.name_en.split(' — ')[0].replace(/^\d+ months?$/, '') }));
  const added = [];
  specs.forEach((spec, k) => {
    const p = makePlan(kind, spec, kind === 'sub' ? 'private' : undefined);
    if (existing.some((e) => e.nameEn === p.nameEn) || added.some((a) => a.nameEn === p.nameEn)) throw new Error(`Duplicate plan ${slug} ${p.nameEn}`);
    added.push({ ...p, id: `pln_${prod.id.slice(4)}_e${k + 1}` });
  });
  const all = ordered(kind, [...existing, ...added]);
  all.forEach((p, i) => {
    const sort = i + 1;
    if (p.sort0 !== undefined) { if (p.sort0 !== sort) lines.push(`UPDATE plans SET sort = ${sort} WHERE id = ${q(p.id)} AND sort = ${p.sort0};`); return; }
    lines.push(planInsert(p.id, prod.id, p, sort, planNote(kind, p.type, p.months, p.nameEn, tiers)));
    newPrices.push(p.egp); nExtra++;
  });
}

// ---------- 2) new products
const maxSort = Math.max(...[...products.values()].map((p) => p.sort));
NEW.forEach((n, i) => {
  if (bySlug.has(n.slug)) throw new Error('Product already exists: ' + n.slug);
  const id = 'prd_' + n.slug.replace(/-/g, '_');
  const close = CLOSE(n.brand);
  let descAr, descEn;
  if (n.kind === 'card') {
    const region = n.field === 'region';
    descAr = `${n.sumAr}\n\nالكارت بيتسلّم ككود رقمي في صفحة طلبك الآمنة بعد تأكيد الدفع، وبتدخله في حسابك من صفحة استرداد الكارت عند المنصة.${region ? ' لازم منطقة حسابك تطابق منطقة الكارت، وهنسألك عنها وقت الطلب.' : ''}\n\n${close.ar}`;
    descEn = `${n.sumEn}\n\nThe card is delivered as a digital code on your private order page after payment is confirmed, and you redeem it in your account on the platform.${region ? ' Your account region must match the card region, which we ask about when you order.' : ''}\n\n${close.en}`;
  } else if (n.kind === 'topup') {
    descAr = `${n.sumAr}\n\nمن غير ما نطلب كلمة سر أبداً. بنراجع الدفع وبننفّذ الشحن يدوياً، وبتوصلك رسالة تأكيد في صفحة طلبك أول ما يتم.\n\n${close.ar}`;
    descEn = `${n.sumEn}\n\nWe never ask for a password. We verify payment and perform the top-up manually, and a confirmation appears on your order page as soon as it is done.\n\n${close.en}`;
  } else {
    const act = ACT[n.kind] ?? ACT.sub;
    descAr = `${n.sumAr}\n\n${act.ar}\n\n${close.ar}`;
    descEn = `${n.sumEn}\n\n${act.en}\n\n${close.en}`;
  }
  const notes = `Catalogue expansion (15 Oct 2026). Prices are ESTIMATES: USD list price × ${FX} EGP/USD × margin, rounded (floor ${FLOOR} EGP); review before accepting orders. Confirm: you are authorised to supply this, the exact current plan names, availability for Egypt and your delivery method.`;
  lines.push(`INSERT OR IGNORE INTO products (id, slug, category_id, brand, title_ar, title_en, summary_ar, summary_en, description_ar, description_en, features_ar, features_en, customer_fields, icon_text, accent, status, featured, supply_status, supply_notes, official_url, sort, created_at, updated_at, published_at) VALUES (${[
    id, n.slug, n.cat, n.brand, n.ar, n.en, firstSentence(n.sumAr), firstSentence(n.sumEn), descAr, descEn, JSON.stringify(n.fa), JSON.stringify(n.fe), JSON.stringify(fieldsFor(n.field)),
    n.icon, n.accent, 'published', 0, 'validated', notes, n.url, maxSort + i + 1, NOW, NOW, NOW].map(q).join(', ')});`);
  nNewProducts++;
  const plans = ordered(n.kind, n.plans.map((spec) => makePlan(n.kind, spec, n.planType)));
  const seen = new Set();
  plans.forEach((p, j) => {
    if (seen.has(p.nameEn)) throw new Error(`Duplicate plan ${n.slug} ${p.nameEn}`);
    seen.add(p.nameEn);
    lines.push(planInsert(`pln_${id.slice(4)}_${j + 1}`, id, p, j + 1, planNote(n.kind, p.type, p.months, p.nameEn, n.tiers)));
    newPrices.push(p.egp); nNewPlans++;
  });
});

writeFileSync(join(root, 'migrations', '0008_catalog_expansion.sql'), lines.join('\n') + '\n');

// ---------- coverage report
const prices = [...new Set([...allPrices, ...newPrices])].sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i < prices.length; i++) gaps.push({ from: prices[i - 1], to: prices[i], ratio: prices[i] / prices[i - 1] });
const worst = gaps.filter((g) => g.to <= 50000).sort((a, b) => b.ratio - a.ratio).slice(0, 6);
console.log(`New plans on launch products: ${nExtra}; new products: ${nNewProducts} with ${nNewPlans} plans`);
console.log(`Distinct prices: ${allPrices.length ? new Set(allPrices).size : 0} → ${prices.length}; range ${prices[0]} – ${prices.at(-1)} EGP`);
console.log('Largest relative gaps up to 50,000 EGP:', worst.map((g) => `${g.from}→${g.to} (×${g.ratio.toFixed(2)})`).join(', '));
