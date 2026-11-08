import { describe, expect, it } from 'vitest';
import { pageMetadata, jsonLdText } from '../../shared/seo';
import { GUIDES, guideSchemas } from '../../shared/guides';
import type { PublicProduct } from '../../shared/types';
const product: PublicProduct = {
  id: 'p_one', slug: 'chatgpt-plus', category: { id: 'c_ai', slug: 'ai-tools', name_ar: 'أدوات الذكاء الاصطناعي', name_en: 'AI tools' },
  brand: 'OpenAI', title_ar: 'اشتراك ChatGPT Plus', title_en: 'ChatGPT Plus subscription', summary_ar: 'باقة شهرية', summary_en: 'Monthly plan',
  description_ar: 'تفاصيل عربية للباقة', description_en: 'English plan details', features_ar: [], features_en: [], delivery_ar: '', delivery_en: '', guarantee_ar: '', guarantee_en: '', customer_fields: [], image_url: null, icon_text: 'GPT', accent: '#20C7CF', featured: true,
  plans: [{ id: 'plan-1', name_ar: 'شهر واحد', name_en: '1 month', plan_type: 'private', duration_value: 1, duration_unit: 'month', is_perpetual: false, price_piastres: 118050, available: true, max_qty: 1, guarantee_kind: 'full_period', guarantee_days: null, notes_ar: '', notes_en: '' },
    { id: 'plan-2', name_ar: '3 شهور', name_en: '3 months', plan_type: 'private', duration_value: 3, duration_unit: 'month', is_perpetual: false, price_piastres: 300000, available: false, max_qty: 1, guarantee_kind: 'full_period', guarantee_days: null, notes_ar: '', notes_en: '' }],
  min_price_piastres: 118050, available: true,
};
const base = 'https://lynto.store';
describe('public search metadata', () => {
  it('indexes catalog after a cart visit and keeps private pages excluded', () => {
    expect(pageMetadata(base, '/en/cart').index).toBe(false);
    expect(pageMetadata(base, '/en/products').index).toBe(true);
    expect(pageMetadata(base, '/en/order/LY-ABC123#k=private').jsonld).toEqual([]);
    expect(pageMetadata(base, '/admin/orders').index).toBe(false);
    expect(pageMetadata(base, '/p/chatgpt-plus?preview=private').index).toBe(false);
  });
  it('uses a product-specific canonical without plan, campaign or private fragment', () => {
    const m = pageMetadata(base, '/en/p/chatgpt-plus/?plan=plan-1&utm_source=test#private', { product });
    expect(m.canonical).toBe(base + '/en/p/chatgpt-plus');
    expect(m.alternates.ar).toBe(base + '/p/chatgpt-plus');
    expect(m.description).toContain('1180.50');
    expect(m.title).toContain('ChatGPT Plus');
  });
  it('localizes visible facts and describes individual offers accurately', () => {
    const ar = pageMetadata(base, '/p/chatgpt-plus', { product });
    const p = ar.jsonld[0] as any;
    expect(p.name).toBe(product.title_ar);
    expect(p.description).toBe(product.description_ar);
    expect(p.offers).toHaveLength(2);
    expect(p.offers[0]).toMatchObject({ '@type': 'Offer', price: '1180.50', priceCurrency: 'EGP', availability: 'https://schema.org/InStock' });
    expect(p.offers[0].url).toBe(base + '/p/chatgpt-plus?plan=plan-1');
    expect(p.offers[1].availability).toBe('https://schema.org/OutOfStock');
    const en = pageMetadata(base, '/en/p/chatgpt-plus', { product });
    expect((en.jsonld[0] as any).name).toBe(product.title_en);
  });
  it('does not advertise available offers when checkout is closed', () => {
    const m = pageMetadata(base, '/p/chatgpt-plus', { product, settings: { checkout_enabled: false } as any });
    expect((m.jsonld[0] as any).offers.every((o: any) => o.availability.endsWith('/OutOfStock'))).toBe(true);
  });
  it('escapes script-closing text in JSON-LD', () => {
    const raw = { name: '</script><script>alert(1)</script>' };
    const encoded = jsonLdText(raw);
    expect(encoded).not.toContain('<');
    expect(JSON.parse(encoded)).toEqual(raw);
  });
  it('uses distinct information-page descriptions and a named deletion policy', () => {
    expect(pageMetadata(base, '/support').description).not.toBe(pageMetadata(base, '/about').description);
    expect(pageMetadata(base, '/data-deletion').title).toContain('مسح البيانات');
  });
  it('only links real guide routes in both languages and preserves reviewed dates', () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const g of GUIDES) for (const lang of ['ar','en'] as const) {
      expect(g[lang].sections.length).toBeGreaterThanOrEqual(3);
      const schema = guideSchemas(g, lang, base)[0] as any;
      expect(schema.dateModified).toBe(g.reviewed);
      expect(schema.citation.length).toBeGreaterThan(0);
    }
  });
});
