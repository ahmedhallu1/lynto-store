import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getPublishedProduct, listCategories, listIndexableProducts, listPublishedProductCards } from '../../worker/services/catalog';
import type { Env } from '../../worker/env';
let db: DatabaseSync;
let materialized: number;
const prepare = (sql: string) => {
  let args: any[] = [];
  return {
    bind(...values: any[]) { args = values; return this; },
    async first() { const row = db.prepare(sql).get(...args); materialized += row ? 1 : 0; return row || null; },
    async all() { const results = db.prepare(sql).all(...args); materialized += results.length; return { results, success: true }; },
  };
};
let env: Env;
const add = (id: string, status = 'published', supply = 'validated', planStatus = 'approved', availability = 'available', price: number | null = 12345) => {
  db.prepare('INSERT INTO products (id, slug, category_id, title_ar, title_en, description_ar, description_en, status, supply_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, id, 'c_ai', 'منتج '+id, 'Product '+id, 'وصف', 'Description', status, supply, 100, 200);
  db.prepare('INSERT INTO plans (id, product_id, name_ar, name_en, plan_type, price_piastres, status, availability, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('plan-'+id, id, 'شهر', 'Month', 'private', price, planStatus, availability, 100, 300);
};
beforeEach(() => {
  db = new DatabaseSync(':memory:'); materialized = 0;
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO categories (id, slug, name_ar, name_en) VALUES (?,?,?,?)').run('c_ai','ai-tools','ذكاء اصطناعي','AI');
  env = { DB: { prepare } } as unknown as Env;
});
afterEach(() => db.close());
describe('catalog queries with real SQLite', () => {
  it('loads only the requested product and approved priced plans as the catalog grows', async () => {
    for (let i=0; i<200; i++) add('p'+i);
    const p = await getPublishedProduct(env, 'p150');
    expect(p?.slug).toBe('p150');
    expect(p?.plans[0].price_piastres).toBe(12345);
    expect(materialized).toBe(3);
  });
  it('excludes drafts, unvalidated supply, proposed plans and unpriced products', async () => {
    add('draft','draft'); add('pending','published','pending'); add('proposed','published','validated','proposed'); add('unpriced','published','validated','approved','available',null);
    for (const slug of ['draft','pending','proposed','unpriced','missing']) expect(await getPublishedProduct(env,slug)).toBeNull();
    expect(await listIndexableProducts(env)).toEqual([]);
    expect(await listPublishedProductCards(env)).toEqual([]);
    expect((await listCategories(env))[0].product_count).toBe(0);
  });
  it('keeps unavailable published products discoverable while never advertising a live price', async () => {
    add('available'); add('unavailable','published','validated','approved','unavailable');
    const cards = await listPublishedProductCards(env);
    expect(cards.find((p) => p.slug==='unavailable')).toMatchObject({ available:false, min_price_piastres:null });
    expect((await listCategories(env))[0].product_count).toBe(2);
    expect((await listIndexableProducts(env)).map((p) => p.slug)).toEqual(['available','unavailable']);
    expect((await listIndexableProducts(env))[0].updated_at).toBe(300);
  });
  it('returns bounded card projections with category and feature filtering', async () => {
    add('one'); add('two'); db.exec("UPDATE products SET featured=1 WHERE id='two'");
    expect((await listPublishedProductCards(env,{ featured:true, limit:1 }))[0].slug).toBe('two');
    expect(await listPublishedProductCards(env,{ categorySlug:'nonexistent' })).toEqual([]);
    const card = (await listPublishedProductCards(env))[0];
    expect(card).not.toHaveProperty('description_ar');
    expect(card).not.toHaveProperty('owner_instructions');
  });
});
