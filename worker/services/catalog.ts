import type { Env } from '../env';
import type { CustomerField, PublicCategory, PublicPlan, PublicProduct, PublicProductCard } from '../../shared/types';
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
  // A detail request must never deserialize the entire catalog. Loading it here risks exceeding
  // Workers Free CPU limits as the catalog grows to hundreds of bilingual product pages.
  const p = await env.DB.prepare("SELECT * FROM products WHERE slug = ? AND status = 'published' AND supply_status = 'validated'").bind(slug).first<ProductRow>();
  if (!p) return null;
  const [cat, plans] = await Promise.all([
    env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(p.category_id).first<CategoryRow>(),
    env.DB.prepare("SELECT * FROM plans WHERE product_id = ? AND status = 'approved' AND price_piastres > 0 ORDER BY sort").bind(p.id).all<PlanRow>(),
  ]);
  if (!cat || !plans.results.length) return null;
  return toPublicProduct(p, cat, plans.results);
}

export async function listCategories(env: Env, products?: PublicProduct[]): Promise<PublicCategory[]> {
  if (!products) {
    // Count eligible products in SQL, without loading descriptions, customer fields or plans.
    const rows = await env.DB.prepare(`SELECT c.*, COUNT(p.id) AS product_count FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.status = 'published' AND p.supply_status = 'validated'
        AND EXISTS (SELECT 1 FROM plans pl WHERE pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres > 0)
      GROUP BY c.id ORDER BY c.sort`).all<PublicCategory>();
    return rows.results;
  }
  const cats = (await env.DB.prepare('SELECT * FROM categories ORDER BY sort').all<CategoryRow>()).results;
  return cats.map((c) => ({ ...c, product_count: products.filter((p) => p.category.id === c.id).length }));
}

export async function listPublishedProductCards(env: Env, opts: { categorySlug?: string; featured?: boolean; limit?: number } = {}): Promise<PublicProductCard[]> {
  const params: (string | number)[] = [];
  const category = opts.categorySlug ? (params.push(opts.categorySlug), ' AND c.slug = ?') : '';
  const featured = opts.featured ? ' AND p.featured = 1' : '';
  const limit = opts.limit ? (params.push(Math.max(1, Math.min(200, Math.trunc(opts.limit)))), ' LIMIT ?') : '';
  const rows = await env.DB.prepare(`SELECT p.id, p.slug, p.brand, p.title_ar, p.title_en, p.summary_ar, p.summary_en,
      p.image_key, p.icon_text, p.accent, p.featured, c.id AS category_id, c.slug AS category_slug,
      c.name_ar AS category_ar, c.name_en AS category_en,
      MIN(CASE WHEN pl.availability = 'available' THEN pl.price_piastres END) AS min_price_piastres
    FROM products p JOIN categories c ON c.id = p.category_id JOIN plans pl ON pl.product_id = p.id
    WHERE p.status = 'published' AND p.supply_status = 'validated' AND pl.status = 'approved' AND pl.price_piastres > 0${category}${featured}
    GROUP BY p.id ORDER BY p.featured DESC, p.sort, p.title_en${limit}`).bind(...params).all<any>();
  return rows.results.map((r) => ({ id: r.id, slug: r.slug, brand: r.brand, title_ar: r.title_ar, title_en: r.title_en,
    summary_ar: r.summary_ar, summary_en: r.summary_en, image_url: r.image_key ? `/media/${r.image_key}` : null,
    icon_text: r.icon_text, accent: r.accent, featured: !!r.featured, min_price_piastres: r.min_price_piastres,
    available: r.min_price_piastres !== null,
    category: { id: r.category_id, slug: r.category_slug, name_ar: r.category_ar, name_en: r.category_en } }));
}

export async function listIndexableProducts(env: Env): Promise<{ slug: string; updated_at: number }[]> {
  const rows = await env.DB.prepare(`SELECT p.slug,
      MAX(p.updated_at, COALESCE((SELECT MAX(pl.updated_at) FROM plans pl WHERE pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres > 0), p.updated_at)) AS updated_at
    FROM products p WHERE p.status = 'published' AND p.supply_status = 'validated'
      AND EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id)
      AND EXISTS (SELECT 1 FROM plans pl WHERE pl.product_id = p.id AND pl.status = 'approved' AND pl.price_piastres > 0)
    ORDER BY p.slug`).all<{ slug: string; updated_at: number }>();
  return rows.results;
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
