// Server-side SEO for the SPA: per-route <title>, description, canonical, hreflang, Open Graph,
// JSON-LD, robots, and a prerendered content block inside #root (replaced when React mounts).
import type { Context } from 'hono';
import type { AppContext } from '../env';
import type { PublicProduct } from '../../shared/types';
import { formatEGP } from '../../shared/money';
import { listCategories, listPublishedProducts } from '../services/catalog';
import { loadSettings } from './settings';
import { baseUrl } from './util';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

type Page = { status: number; index: boolean; title: string; description: string; body: string; jsonld?: unknown[]; image?: string };

const COPY = {
  ar: {
    siteTitle: 'LYnto — اشتراكات رقمية وكروت شحن في مصر',
    siteDesc: 'اطلب اشتراكات أدوات الذكاء الاصطناعي والبرامج والترفيه وكروت الشحن، وادفع بإنستاباي أو تحويل بنكي أو محفظة. التسليم خلال ساعتين عمل بعد تأكيد التحويل.',
    catalog: 'كل المنتجات', support: 'الدعم والأسئلة الشائعة', about: 'عن LYnto', privacy: 'سياسة الخصوصية', terms: 'شروط الشراء', guarantee: 'الضمان والاسترجاع',
    soon: 'المنتجات هتتنشر قريب بعد اعتماد الباقات والأسعار.',
  },
  en: {
    siteTitle: 'LYnto — Digital subscriptions & gift cards in Egypt',
    siteDesc: 'Order AI, software and entertainment subscriptions and gift cards. Pay by InstaPay, bank transfer or mobile wallet. Delivery within two working hours after your transfer is verified.',
    catalog: 'All products', support: 'Support & FAQ', about: 'About LYnto', privacy: 'Privacy policy', terms: 'Purchase terms', guarantee: 'Guarantee & refunds',
    soon: 'Products will be listed soon, once plans and prices are approved.',
  },
};

function productCard(p: PublicProduct, lang: 'ar' | 'en', prefix: string) {
  const title = lang === 'ar' ? p.title_ar : p.title_en;
  const price = p.min_price_piastres ? formatEGP(p.min_price_piastres, lang) : '';
  return `<li><a href="${prefix}/p/${esc(p.slug)}">${esc(title)}</a>${price ? ` — ${esc(price)}` : ''}</li>`;
}

export async function renderPage(c: Context<AppContext>): Promise<Response> {
  const env = c.env;
  const url = new URL(c.req.url);
  let path = url.pathname.replace(/\/+$/, '') || '/';
  const lang: 'ar' | 'en' = path === '/en' || path.startsWith('/en/') ? 'en' : 'ar';
  const prefix = lang === 'en' ? '/en' : '';
  const rest = lang === 'en' ? path.slice(3) || '/' : path;
  const L = COPY[lang];
  const base = baseUrl(env);
  const settings = await loadSettings(env);

  let page: Page;
  const simple = (title: string, desc: string, index = true): Page => ({ status: 200, index, title: `${title} | LYnto`, description: desc, body: `<h1>${esc(title)}</h1><p>${esc(desc)}</p>` });

  const needsCatalog = rest === '/' || rest === '/products' || rest.startsWith('/c/') || rest.startsWith('/p/');
  const products = needsCatalog ? await listPublishedProducts(env) : [];

  if (rest === '/') {
    const cats = await listCategories(env, products);
    page = {
      status: 200, index: true, title: L.siteTitle, description: L.siteDesc,
      body: `<h1>LYnto</h1><p>${esc(L.siteDesc)}</p><ul>${cats.map((ct) => `<li><a href="${prefix}/c/${ct.slug}">${esc(lang === 'ar' ? ct.name_ar : ct.name_en)}</a></li>`).join('')}</ul>`
        + (products.length ? `<ul>${products.slice(0, 12).map((p) => productCard(p, lang, prefix)).join('')}</ul>` : `<p>${esc(L.soon)}</p>`),
      jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'LYnto', url: base, logo: `${base}/brand/icon-512.png`,
        ...(settings.support.email || settings.support.whatsapp ? { contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', ...(settings.support.email ? { email: settings.support.email } : {}), ...(settings.support.whatsapp ? { telephone: settings.support.whatsapp } : {}) }] } : {}) },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'LYnto', url: base, inLanguage: ['ar-EG', 'en'] }],
    };
  } else if (rest === '/products') {
    page = { status: 200, index: true, title: `${L.catalog} | LYnto`, description: L.siteDesc, body: `<h1>${esc(L.catalog)}</h1>${products.length ? `<ul>${products.map((p) => productCard(p, lang, prefix)).join('')}</ul>` : `<p>${esc(L.soon)}</p>`}` };
  } else if (rest.startsWith('/c/')) {
    const slug = rest.slice(3);
    const cats = await listCategories(env, products);
    const cat = cats.find((x) => x.slug === slug);
    if (!cat) page = { ...simple('404', ''), status: 404, index: false };
    else {
      const name = lang === 'ar' ? cat.name_ar : cat.name_en;
      const desc = (lang === 'ar' ? cat.description_ar : cat.description_en) || L.siteDesc;
      const list = products.filter((p) => p.category.id === cat.id);
      page = { status: 200, index: true, title: `${name} | LYnto`, description: desc, body: `<h1>${esc(name)}</h1><p>${esc(desc)}</p>${list.length ? `<ul>${list.map((p) => productCard(p, lang, prefix)).join('')}</ul>` : `<p>${esc(L.soon)}</p>`}`,
        jsonld: [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'LYnto', item: base + (prefix || '/') }, { '@type': 'ListItem', position: 2, name, item: `${base}${prefix}/c/${slug}` }] }] };
    }
  } else if (rest.startsWith('/p/')) {
    const slug = rest.slice(3);
    const p = products.find((x) => x.slug === slug);
    if (!p) page = { status: 404, index: false, title: 'Not found | LYnto', description: '', body: '<h1>404</h1>' };
    else {
      const title = lang === 'ar' ? p.title_ar : p.title_en;
      const summary = (lang === 'ar' ? p.summary_ar : p.summary_en) || (lang === 'ar' ? p.description_ar : p.description_en).slice(0, 160);
      const features = lang === 'ar' ? p.features_ar : p.features_en;
      const prices = p.plans.map((pl) => pl.price_piastres);
      page = {
        status: 200, index: true, title: `${title} | LYnto`, description: summary, image: p.image_url ? base + p.image_url : undefined,
        body: `<h1>${esc(title)}</h1><p>${esc(lang === 'ar' ? p.description_ar : p.description_en)}</p><ul>${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          + `<ul>${p.plans.map((pl) => `<li>${esc(lang === 'ar' ? pl.name_ar : pl.name_en)} — ${esc(formatEGP(pl.price_piastres, lang))}</li>`).join('')}</ul>`,
        jsonld: [{
          '@context': 'https://schema.org', '@type': 'Product', name: p.title_en, description: p.description_en, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
          image: p.image_url ? base + p.image_url : `${base}/brand/og-image.jpg`, sku: p.id,
          offers: { '@type': 'AggregateOffer', priceCurrency: 'EGP', lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2), offerCount: prices.length,
            availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${base}${prefix}/p/${p.slug}` },
        }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LYnto', item: base + (prefix || '/') },
          { '@type': 'ListItem', position: 2, name: lang === 'ar' ? p.category.name_ar : p.category.name_en, item: `${base}${prefix}/c/${p.category.slug}` },
          { '@type': 'ListItem', position: 3, name: title, item: `${base}${prefix}/p/${p.slug}` }] }],
      };
    }
  } else if (rest === '/support') page = simple(L.support, L.siteDesc);
  else if (rest === '/about') page = simple(L.about, L.siteDesc);
  else if (rest === '/privacy') page = simple(L.privacy, L.privacy);
  else if (rest === '/terms') page = simple(L.terms, L.terms, settings.policies.confirmed);
  else if (rest === '/guarantee') page = simple(L.guarantee, L.guarantee, settings.policies.confirmed);
  else if (rest === '/cart' || rest === '/checkout' || rest.startsWith('/order/') || path.startsWith('/admin')) page = { status: 200, index: false, title: 'LYnto', description: L.siteDesc, body: '' };
  else page = { status: 404, index: false, title: 'Not found | LYnto', description: L.siteDesc, body: '<h1>404</h1>' };

  const shellRes = await env.ASSETS.fetch(new Request(new URL('/', url).toString()));
  const canonical = `${base}${path === '/' ? '/' : path}`;
  const altAr = `${base}${rest === '/' ? '/' : rest}`;
  const altEn = `${base}/en${rest === '/' ? '' : rest}`;
  const isAdmin = path.startsWith('/admin');
  const htmlLang = isAdmin ? 'en' : lang;
  const dir = htmlLang === 'ar' ? 'rtl' : 'ltr';
  const head = [
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta name="robots" content="${page.index ? 'index,follow' : 'noindex,nofollow'}">`,
    page.index ? `<link rel="canonical" href="${esc(canonical)}">` : '',
    page.index ? `<link rel="alternate" hreflang="ar-EG" href="${esc(altAr)}"><link rel="alternate" hreflang="en" href="${esc(altEn)}"><link rel="alternate" hreflang="x-default" href="${esc(altAr)}">` : '',
    `<meta property="og:type" content="website"><meta property="og:site_name" content="LYnto"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(page.image ?? `${base}/brand/og-image.jpg`)}"><meta property="og:locale" content="${lang === 'ar' ? 'ar_EG' : 'en_US'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...(page.index ? (page.jsonld ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`) : []),
  ].join('');

  const rewritten = new HTMLRewriter()
    .on('html', { element(e) { e.setAttribute('lang', htmlLang); e.setAttribute('dir', dir); } })
    .on('title', { element(e) { e.setInnerContent(page.title); } })
    .on('head', { element(e) { e.append(head, { html: true }); } })
    .on('#root', { element(e) { if (page.body) e.setInnerContent(`<div class="prerender">${page.body}</div>`, { html: true }); } })
    .transform(shellRes);

  const headers = new Headers(rewritten.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  if (!page.index) headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(rewritten.body, { status: page.status, headers });
}

export async function sitemap(c: Context<AppContext>) {
  const base = baseUrl(c.env);
  const products = await listPublishedProducts(c.env);
  const cats = await listCategories(c.env, products);
  const s = await loadSettings(c.env);
  const paths = ['/', '/products', '/support', '/about', '/privacy', ...(s.policies.confirmed ? ['/terms', '/guarantee'] : []),
    ...cats.map((x) => `/c/${x.slug}`), ...products.map((p) => `/p/${p.slug}`)];
  const urls = paths.flatMap((p) => [p, `/en${p === '/' ? '' : p}`]).map((p) => `<url><loc>${base}${p}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

export function robots(c: Context<AppContext>) {
  const base = baseUrl(c.env);
  const prod = c.env.APP_ENV === 'production';
  const body = prod
    ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /order/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /en/order/\nDisallow: /en/cart\nDisallow: /en/checkout\n\nSitemap: ${base}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
