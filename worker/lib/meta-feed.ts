// Public product feed for the Meta (Facebook/Instagram/WhatsApp) catalog. Public catalog data only:
// published + validated products and their approved, priced, available plans. Never customer or payment data.
import type { Context } from 'hono';
import type { AppContext } from '../env';
import { baseUrl } from './util';
import { catalogImageSlugs } from '../../shared/catalog-images';

const csv = (v: string | number) => {
  const s = String(v).replace(/\r?\n+/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'item_group_id', 'product_type'];

export async function metaCatalogFeed(c: Context<AppContext>) {
  const base = baseUrl(c.env);
  const rows = (await c.env.DB.prepare(`SELECT pl.id AS plan_id, pl.name_en AS plan_en, pl.name_ar AS plan_ar, pl.price_piastres,
      p.id AS product_id, p.slug, p.brand, p.title_en, p.title_ar, p.summary_en, p.summary_ar, p.image_key, cat.name_en AS category_en
    FROM plans pl JOIN products p ON p.id = pl.product_id JOIN categories cat ON cat.id = p.category_id
    WHERE p.status = 'published' AND p.supply_status = 'validated' AND pl.status = 'approved' AND pl.price_piastres > 0 AND pl.availability = 'available'
    ORDER BY p.sort, p.title_en, pl.sort`).all<any>()).results;
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const image = r.image_key ? `${base}/media/${r.image_key}` : base + (catalogImageSlugs.has(r.slug) ? `/catalog/${r.slug}.jpg` : '/brand/og-image.jpg');
    const description = [`${r.title_en} — ${r.plan_en}.`, r.summary_en, r.summary_ar ? `${r.title_ar} — ${r.plan_ar}. ${r.summary_ar}` : ''].filter(Boolean).join(' ').slice(0, 4900);
    lines.push([
      r.plan_id, `${r.title_en} — ${r.plan_en}`.slice(0, 150), description, 'in stock', 'new', `${(r.price_piastres / 100).toFixed(2)} EGP`,
      `${base}/en/p/${r.slug}?plan=${encodeURIComponent(r.plan_id)}`, image, r.brand || r.title_en, r.product_id, r.category_en,
    ].map(csv).join(','));
  }
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'public, max-age=900', 'x-robots-tag': 'noindex' } });
}
