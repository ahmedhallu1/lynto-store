// Generates migrations/0007_product_details.sql — detailed platform descriptions, feature lists and per-plan notes.
// Safe for production: product text is only replaced where it still equals the original launch text, and plan notes
// only where they are still empty, so anything the owner edited in the admin is left alone.
// Input snapshot: scripts/data/live-plans.json (see git history for how it was produced). Run: node scripts/product-details.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DETAILS as D1 } from './data/details-ai-software.mjs';
import { DETAILS as D2, CARDS, TOPUPS } from './data/details-entertainment-gaming.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = JSON.parse(readFileSync(join(root, 'scripts/data/live-plans.json'), 'utf8'));
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

const durAr = (v, u) => { const m = u === 'year' ? v * 12 : u === 'day' ? 0 : v; if (u === 'day') return `${v} يوم`; return m === 1 ? 'شهر واحد' : m === 2 ? 'شهرين' : m <= 10 ? `${m} شهور` : m === 12 ? 'سنة كاملة' : m === 24 ? 'سنتين' : `${m} شهر`; };
const durEn = (v, u) => { const m = u === 'year' ? v * 12 : v; if (u === 'day') return `${v} days`; return m === 1 ? '1 month' : `${m} months`; };

const products = new Map();
for (const r of rows) {
  if (!products.has(r.slug)) products.set(r.slug, { slug: r.slug, brand: r.brand, title_ar: r.title_ar, title_en: r.title_en, old_ar: r.description_ar, old_en: r.description_en, plans: [] });
  products.get(r.slug).plans.push(r);
}

const CLOSE_SUB = (b) => ({
  ar: `ملاحظة: مميزات الخدمة وشروطها بيحددها مقدّم الخدمة وممكن تتغير. LYnto مش تابعة لـ ${b}، وأسماء المنصات وشعاراتها ملك أصحابها.`,
  en: `Note: features and terms are set by the provider and may change. LYnto is not affiliated with ${b}; platform names and logos belong to their owners.`,
});
const ACT_SUB = { ar: 'بنفعّل الاشتراك على الإيميل اللي بتكتبه في الطلب من غير ما نطلب كلمة سر أبداً، وبتوصلك التفاصيل في صفحة طلبك الآمنة.', en: 'We activate the subscription on the email you enter in the order and never ask for a password; the details arrive on your private order page.' };

function build(p) {
  const spec = D1[p.slug] || D2[p.slug];
  const plan0 = p.plans[0];
  const close = CLOSE_SUB(p.brand || p.title_en);
  if (spec) {
    const kind = plan0.plan_type;
    const act = kind === 'license'
      ? { ar: 'بنسلّم مفتاح التفعيل مع خطوات واضحة في صفحة طلبك الآمنة.', en: 'We deliver the activation key with clear steps on your private order page.' }
      : kind === 'invite' ? { ar: 'بتوصلك دعوة العضوية على إيميلك وتقبلها منه.', en: 'You receive the membership invitation on your email and accept it from there.' } : ACT_SUB;
    return { ar: `${spec.ar}\n\n${act.ar}\n\n${close.ar}`, en: `${spec.en}\n\n${act.en}\n\n${close.en}`, fa: spec.fa, fe: spec.fe, tiers: spec.tiers || {} };
  }
  const card = CARDS[p.slug];
  if (card) {
    return {
      ar: `${card.ar}\n\nالكارت بيتسلّم ككود رقمي في صفحة طلبك الآمنة بعد تأكيد الدفع، وبتدخله في حسابك من صفحة استرداد الكارت عند المنصة. لازم منطقة حسابك تطابق منطقة الكارت، وهنسألك عنها وقت الطلب.\n\n${close.ar}`,
      en: `${card.en}\n\nThe card is delivered as a digital code on your private order page after payment is confirmed, and you redeem it in your account on the platform. Your account region must match the card region, which we ask about when you order.\n\n${close.en}`,
      fa: ['كود رقمي بيوصلك بعد تأكيد الدفع', 'خطوات الاسترداد في صفحة طلبك', 'قيم متعددة تناسب احتياجك', 'لازم منطقة الحساب تطابق منطقة الكارت'],
      fe: ['Digital code delivered after payment is confirmed', 'Redeem steps on your order page', 'Several denominations to fit your needs', 'Account region must match the card region'],
      tiers: {},
    };
  }
  const top = TOPUPS[p.slug];
  if (top) {
    return {
      ar: `${top.ar}\n\nمن غير ما نطلب كلمة سر أبداً. بنراجع الدفع وبننفّذ الشحن يدوياً، وبتوصلك رسالة تأكيد في صفحة طلبك أول ما يتم.\n\n${close.ar}`,
      en: `${top.en}\n\nWe never ask for a password. We verify payment and perform the top-up manually, and a confirmation appears on your order page as soon as it is done.\n\n${close.en}`,
      fa: ['الشحن على حسابك بالـ Player ID أو بيانات الحساب', 'من غير كلمة سر أبداً', 'كميات متعددة', 'التنفيذ بعد مراجعة الدفع'],
      fe: ['Top-up to your account using your Player ID or account details', 'No password, ever', 'Several amounts', 'Performed after payment review'],
      tiers: {},
    };
  }
  return null;
}

function planNote(p, pl, tiers) {
  const keys = Object.keys(tiers).sort((a, b) => b.length - a.length);
  const k = keys.find((x) => pl.name_en.includes(x));
  const tier = k ? tiers[k] : null;
  const perp = pl.is_perpetual === 1;
  let ar = '', en = '';
  if (pl.plan_type === 'gift_card') {
    ar = `كارت بقيمة ${pl.name_en} بيتسلّم ككود رقمي بعد تأكيد الدفع.`;
    en = `A ${pl.name_en} card delivered as a digital code after payment is confirmed.`;
  } else if (pl.plan_type === 'topup') {
    ar = `كمية الشحن: ${pl.name_en}. بتتضاف لحسابك بالبيانات اللي هتكتبها في الطلب بعد مراجعة الدفع.`;
    en = `Top-up amount: ${pl.name_en}. Added to your account using the details you enter in the order, after payment review.`;
  } else if (pl.plan_type === 'license' || perp) {
    ar = `${tier ? tier[0] + ' ' : ''}ترخيص دائم: بتدفع مرة واحدة من غير اشتراك شهري، وبيتسلّم مفتاح التفعيل مع الخطوات.`;
    en = `${tier ? tier[1] + ' ' : ''}Perpetual licence: pay once with no monthly fee; the activation key is delivered with the steps.`;
  } else {
    const dA = durAr(pl.duration_value, pl.duration_unit), dE = durEn(pl.duration_value, pl.duration_unit);
    const how = pl.plan_type === 'invite'
      ? { ar: `بتوصلك دعوة عضوية على إيميلك. مدة الاشتراك ${dA} من تاريخ التفعيل.`, en: `A membership invitation arrives on your email. Subscription length: ${dE} from activation.` }
      : { ar: `بيتفعّل على الإيميل اللي هتكتبه في الطلب. مدة الاشتراك ${dA} من تاريخ التفعيل.`, en: `Activated on the email you enter in the order. Subscription length: ${dE} from activation.` };
    ar = `${tier ? tier[0] + ' ' : ''}${how.ar}`;
    en = `${tier ? tier[1] + ' ' : ''}${how.en}`;
  }
  return { ar, en };
}

let sql = `-- 0007: detailed platform descriptions, feature lists and per-plan notes (generated by scripts/product-details.mjs).\n-- Guarded: product text changes only where it still equals the launch text; plan notes only where still empty.\n`;
let nProd = 0, nPlan = 0;
const missing = [];
for (const p of products.values()) {
  const b = build(p);
  if (!b) { missing.push(p.slug); continue; }
  sql += `UPDATE products SET description_ar = ${q(b.ar)}, description_en = ${q(b.en)}, features_ar = ${q(JSON.stringify(b.fa))}, features_en = ${q(JSON.stringify(b.fe))}, updated_at = ${NOW} WHERE slug = ${q(p.slug)} AND description_ar = ${q(p.old_ar)} AND description_en = ${q(p.old_en)};\n`;
  nProd++;
  for (const pl of p.plans) {
    const n = planNote(p, pl, b.tiers);
    sql += `UPDATE plans SET notes_ar = ${q(n.ar)}, notes_en = ${q(n.en)}, updated_at = ${NOW} WHERE id = ${q(pl.plan_id)} AND notes_ar = '' AND notes_en = '';\n`;
    nPlan++;
  }
}
writeFileSync(join(root, 'migrations/0007_product_details.sql'), sql);
console.log(`products: ${nProd}/${products.size}, plans: ${nPlan}${missing.length ? ', MISSING: ' + missing.join(', ') : ''}`);
