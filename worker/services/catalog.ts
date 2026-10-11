import type { Env } from '../env';
import type { CustomerField, PublicCategory, PublicPlan, PublicProduct } from '../../shared/types';
import { parseJSON } from '../lib/util';

export type ProductRow = {
  id: string; slug: string; category_id: string; brand: string; title_ar: string; title_en: string;
  summary_ar: string; summary_en: string; description_ar: string; description_en: string;
  features_ar: string; features_en: string; delivery_ar: string; delivery_en: string;
  guarantee_ar: string; guarantee_en: string; customer_fields: string; owner_instructions: string;
  image_key: string | null; icon_text: string; accent: string; status: 'draft' | 'published' | 'archived';
  featured: number; supply_status: 'pending' | 'validated' | 'unavailable'; supply_notes: string; official_url: string;
  sort: number; created_at: number; updated_at: number; published_at: number | null;
};
export type PlanRow = {
  id: string; product_id: string; name_ar: string; name_en: string; plan_type: PublicPlan['plan_type'];
  duration_value: number | null; duration_unit: 'day' | 'month' | 'year' | null; is_perpetual: number;
  price_piastres: number | null; status: 'proposed' | 'approved' | 'retired'; availability: 'available' | 'unavailable';
  max_qty: number; guarantee_kind: string; guarantee_days: number | null; notes_ar: string; notes_en: string;
  sort: number; created_at: number; updated_at: number;
};
export type CategoryRow = { id: string; slug: string; name_ar: string; name_en: string; description_ar: string; description_en: string; icon: string; sort: number };

/** A plan is sellable only when approved, priced, and available. */
export function isSellablePlan(p: PlanRow): boolean {
  return p.status === 'approved' && typeof p.price_piastres === 'number' && p.price_piastres > 0 && p.availability === 'available';
}

export function toPublicPlan(p: PlanRow, allowUnpriced = false): PublicPlan {
  return {
    id: p.id, name_ar: p.name_ar, name_en: p.name_en, plan_type: p.plan_type,
    duration_value: p.duration_value, duration_unit: p.duration_unit, is_perpetual: !!p.is_perpetual,
    price_piastres: allowUnpriced ? (p.price_piastres ?? 0) : (p.price_piastres as number),
    available: p.availability === 'available', max_qty: p.max_qty,
    guarantee_kind: p.guarantee_kind, guarantee_days: p.guarantee_days, notes_ar: p.notes_ar, notes_en: p.notes_en,
  };
}

export function toPublicProduct(p: ProductRow, cat: CategoryRow, plans: PlanRow[], opts: { preview?: boolean } = {}): PublicProduct {
  const visiblePlans = opts.preview ? plans.filter((x) => x.status !== 'retired') : plans.filter((x) => x.status === 'approved' && x.price_piastres);
  const pub = visiblePlans.map((x) => toPublicPlan(x, opts.preview));
  const sellable = plans.filter(isSellablePlan);
  return {
    id: p.id, slug: p.slug,
    category: { id: cat.id, slug: cat.slug, name_ar: cat.name_ar, name_en: cat.name_en },
    brand: p.brand, title_ar: p.title_ar, title_en: p.title_en, summary_ar: p.summary_ar, summary_en: p.summary_en,
    description_ar: p.description_ar, description_en: p.description_en,
    features_ar: parseJSON<string[]>(p.features_ar, []), features_en: parseJSON<string[]>(p.features_en, []),
    delivery_ar: p.delivery_ar, delivery_en: p.delivery_en, guarantee_ar: p.guarantee_ar, guarantee_en: p.guarantee_en,
    customer_fields: parseJSON<CustomerField[]>(p.customer_fields, []),
    image_url: p.image_key ? `/media/${p.image_key}` : null, icon_text: p.icon_text, accent: p.accent, featured: !!p.featured,
    plans: pub,
    min_price_piastres: sellable.length ? Math.min(...sellable.map((x) => x.price_piastres as number)) : null,
    available: sellable.length > 0,
  };
}

/** Published products with their approved plans only. Drafts/archived never leave this function. */
export async function listPublishedProducts(env: Env): Promise<PublicProduct[]> {
  const [prods, cats, plans] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM products WHERE status = 'published' AND supply_status = 'validated' ORDER BY featured DESC, sort, title_en`),
    env.DB.prepare('SELECT * FROM categories ORDER BY sort'),
    env.DB.prepare(`SELECT pl.* FROM plans pl JOIN products p ON p.id = pl.product_id WHERE p.status = 'published' AND pl.status = 'approved' AND pl.price_piastres IS NOT NULL ORDER BY pl.sort`),
  ]);
  const catMap = new Map((cats.results as CategoryRow[]).map((c) => [c.id, c]));
  const byProduct = new Map<string, PlanRow[]>();
  for (const pl of plans.results as PlanRow[]) {
    const l = byProduct.get(pl.product_id) ?? [];
    l.push(pl);
    byProduct.set(pl.product_id, l);
  }
  return (prods.results as ProductRow[])
    .filter((p) => catMap.has(p.category_id) && (byProduct.get(p.id) ?? []).length > 0)
    .map((p) => toPublicProduct(p, catMap.get(p.category_id)!, byProduct.get(p.id) ?? []));
}

export async function getPublishedProduct(env: Env, slug: string): Promise<PublicProduct | null> {
  const all = await listPublishedProducts(env);
  return all.find((p) => p.slug === slug) ?? null;
}

export async function listCategories(env: Env, products?: PublicProduct[]): Promise<PublicCategory[]> {
  const cats = (await env.DB.prepare('SELECT * FROM categories ORDER BY sort').all<CategoryRow>()).results;
  const prods = products ?? (await listPublishedProducts(env));
  return cats.map((c) => ({ ...c, product_count: prods.filter((p) => p.category.id === c.id).length }));
}

/** Server-side publish validation. Returns a list of problems; empty = publishable. */
export function publishProblems(p: ProductRow, plans: PlanRow[]): string[] {
  const problems: string[] = [];
  if (!p.title_ar.trim() || !p.title_en.trim()) problems.push('Arabic and English titles are required.');
  if (!p.description_ar.trim() || !p.description_en.trim()) problems.push('Arabic and English descriptions are required.');
  if (p.supply_status !== 'validated') problems.push('Supply validation must be marked "validated" (you confirmed you can legitimately supply this product).');
  const sellable = plans.filter(isSellablePlan);
  if (!sellable.length) problems.push('At least one plan must be approved, priced in EGP, and available.');
  for (const pl of plans.filter((x) => x.status === 'approved')) {
    if (!pl.price_piastres) problems.push(`Plan "${pl.name_en}" is approved but has no price.`);
    if (!pl.is_perpetual && pl.plan_type !== 'gift_card' && pl.plan_type !== 'topup' && !(pl.duration_value && pl.duration_unit)) problems.push(`Plan "${pl.name_en}" needs a duration.`);
    if (pl.guarantee_kind === 'pending') problems.push(`Plan "${pl.name_en}" needs guarantee terms (full period, N days, or none).`);
    if (pl.guarantee_kind === 'days' && !(pl.guarantee_days && pl.guarantee_days > 0)) problems.push(`Plan "${pl.name_en}" guarantee days must be set.`);
  }
  const fields = parseJSON<CustomerField[]>(p.customer_fields, []);
  for (const f of fields) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(f.key)) problems.push(`Customer field key "${f.key}" is invalid.`);
    if (f.type === 'select' && !(f.options && f.options.length)) problems.push(`Customer field "${f.key}" needs options.`);
  }
  return problems;
}
