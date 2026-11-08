// Public HTML uses the same localized metadata and factual copy as the React storefront.
// Product pages perform a single-product lookup; never materialize the whole catalog here.
import type { Context } from 'hono';
import type { AppContext } from '../env';
import type { Lang, PublicProductCard, PublicSettings } from '../../shared/types';
import { formatEGP } from '../../shared/money';
import { pageMetadata, SEO_COPY, routeParts, jsonLdText, type MetadataOptions } from '../../shared/seo';
import { STRINGS } from '../../shared/storefront-copy';
import { GUIDES, guideCopy, guideSchemas } from '../../shared/guides';
import { getPublishedProduct, listCategories, listIndexableProducts, listPublishedProductCards } from '../services/catalog';
import { loadSettings, toPublicSettings } from './settings';
import { baseUrl } from './util';

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const paragraphs = (text: string) => text.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
const alwaysOpen = (s: PublicSettings) => ['0','1','2','3','4','5','6'].every((d) => { const day = s.schedule_summary.week[d]; return day?.length === 1 && day[0].start === '00:00' && day[0].end === '24:00'; });
function productCard(p: PublicProductCard, lang: Lang, prefix: string) {
  return `<li><a href="${prefix}/p/${esc(p.slug)}">${esc(lang === 'ar' ? p.title_ar : p.title_en)}</a>${p.available && p.min_price_piastres ? ` — ${esc(formatEGP(p.min_price_piastres, lang))}` : ''}</li>`;
}
function contact(s: PublicSettings, lang: Lang, prefix: string) {
  return `<h2>${lang === 'ar' ? 'تواصل مع LYnto' : 'Contact LYnto'}</h2><ul>`
    + (s.support.email ? `<li><a href="mailto:${esc(s.support.email)}">${esc(s.support.email)}</a></li>` : '')
    + (s.support.whatsapp ? `<li><a href="https://wa.me/${s.support.whatsapp.replace(/\D/g, '')}">${esc(s.support.whatsapp)}</a></li>` : '')
    + `<li><a href="${prefix}/support">${lang === 'ar' ? 'نموذج الدعم' : 'Support form'}</a></li></ul>`;
}
function faq(s: PublicSettings, lang: Lang) {
  const t = STRINGS[lang];
  return `<h2>${t['faq.title']}</h2>` + [1,2,3,4,5,6].map((n) => `<h3>${esc(t[`faq.${n}.q` as keyof typeof t])}</h3><p>${esc(t[(n === 1 && alwaysOpen(s) ? 'faq.1.a247' : `faq.${n}.a`) as keyof typeof t])}</p>`).join('');
}
function guideBody(slug: string, lang: Lang, prefix: string): string | null {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return null;
  const g = guideCopy(guide, lang);
  return `<h1>${esc(g.title)}</h1><p>${esc(g.summary)}</p><p>LYnto · <time datetime="${guide.reviewed}">${guide.reviewed}</time></p>`
    + g.sections.map((s) => `<section><h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('')
    + `<h2>${lang === 'ar' ? 'روابط مفيدة' : 'Useful links'}</h2><ul>${g.links.map((a) => `<li><a href="${prefix}${a.path}">${esc(a.label)}</a></li>`).join('')}</ul>`
    + `<h2>${lang === 'ar' ? 'المصادر — تمت مراجعتها' : 'Sources — reviewed'} ${guide.reviewed}</h2><ul>${g.sources.map((a) => `<li><a href="${esc(a.url)}">${esc(a.label)}</a></li>`).join('')}</ul>`;
}

export async function renderPage(c: Context<AppContext>): Promise<Response> {
  const url = new URL(c.req.url), base = baseUrl(c.env);
  const { pathname: path, rest, lang, prefix } = routeParts(url.pathname);
  const L = SEO_COPY[lang], t = STRINGS[lang];
  const settings = await loadSettings(c.env), s = toPublicSettings(settings);
  c.set('businessSettings', settings);
  let status = 200, body = '', options: MetadataOptions = { settings: s };
  const missing = () => { status = 404; options.noindex = true; options.title = '404 | LYnto'; body = '<h1>404</h1>'; };
  if (rest === '/') {
    const [cats, products] = await Promise.all([listCategories(c.env), listPublishedProductCards(c.env, { limit: 12 })]);
    body = `<h1>${esc(L.siteTitle)}</h1><p>${esc(L.siteDesc)}</p><ul>${cats.map((ct) => `<li><a href="${prefix}/c/${ct.slug}">${esc(lang === 'ar' ? ct.name_ar : ct.name_en)}</a></li>`).join('')}</ul>`
      + (products.length ? `<ul>${products.map((p) => productCard(p, lang, prefix)).join('')}</ul>` : `<p>${esc(L.soon)}</p>`)
      + `<h2>${esc(t['home.how.title'])}</h2><ol>${[1,2,3,4].map((n) => `<li><h3>${esc(t[`home.how.${n}.t` as keyof typeof t])}</h3><p>${esc(t[`home.how.${n}.d` as keyof typeof t])}</p></li>`).join('')}</ol>`
      + `<h2>${lang === 'ar' ? 'طرق الدفع' : 'Payment methods'}</h2><p>${s.payment_methods.map((m) => esc(lang === 'ar' ? m.label_ar : m.label_en)).join(' · ')}</p>`
      + `<h2>${esc(L.guides)}</h2><ul>${GUIDES.map((g) => `<li><a href="${prefix}/guides/${g.slug}">${esc(guideCopy(g, lang).title)}</a></li>`).join('')}</ul>` + contact(s, lang, prefix);
  } else if (rest === '/products' || rest.startsWith('/c/')) {
    const categorySlug = rest.startsWith('/c/') ? rest.slice(3) : undefined;
    const [cats, products] = await Promise.all([listCategories(c.env), listPublishedProductCards(c.env, { categorySlug })]);
    const cat = categorySlug ? cats.find((x) => x.slug === categorySlug) : null;
    if (categorySlug && !cat) missing();
    else {
      options.category = cat;
      body = `<h1>${esc(cat ? lang === 'ar' ? cat.name_ar : cat.name_en : L.catalog)}</h1>`
        + (cat ? `<p>${esc(lang === 'ar' ? cat.description_ar : cat.description_en)}</p>` : `<p>${esc(L.siteDesc)}</p>`)
        + (products.length ? `<ul>${products.map((p) => productCard(p, lang, prefix)).join('')}</ul>` : `<p>${esc(L.soon)}</p>`);
    }
  } else if (rest.startsWith('/p/')) {
    const p = await getPublishedProduct(c.env, rest.slice(3));
    if (!p) missing();
    else {
      options.product = p;
      const features = lang === 'ar' ? p.features_ar : p.features_en;
      body = `<h1>${esc(lang === 'ar' ? p.title_ar : p.title_en)}</h1>${paragraphs(lang === 'ar' ? p.description_ar : p.description_en)}`
        + `<h2>${esc(t['product.features'])}</h2><ul>${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
        + `<h2>${lang === 'ar' ? 'الباقات والأسعار بالجنيه المصري' : 'Plans and prices in EGP'}</h2><ul>${p.plans.map((pl) => `<li><a href="${prefix}/p/${esc(p.slug)}?plan=${encodeURIComponent(pl.id)}">${esc(lang === 'ar' ? pl.name_ar : pl.name_en)}</a> — ${esc(formatEGP(pl.price_piastres, lang))}${pl.available ? '' : lang === 'ar' ? ' (غير متاح)' : ' (unavailable)'}</li>`).join('')}</ul>`
        + `<h2>${esc(t['product.delivery'])}</h2>${paragraphs((lang === 'ar' ? p.delivery_ar : p.delivery_en) || t['product.delivery.default'])}<p>${esc(t[alwaysOpen(s) ? 'product.delivery.time247' : 'product.delivery.time'])}</p>`
        + `<p><a href="${prefix}/guarantee">${esc(t['product.guarantee.policy'])}</a></p><p><a href="${prefix}/guides/pay-digital-subscriptions-egypt">${lang === 'ar' ? 'إزاي تدفع وتتابع طلبك؟' : 'How to pay and track your order'}</a></p>`;
    }
  } else if (rest === '/support') body = `<h1>${esc(L.support)}</h1>${faq(s, lang)}${contact(s, lang, prefix)}`;
  else if (rest === '/about') body = `<h1>${esc(L.about)}</h1>${[1,2,3].map((n) => `<p>${esc(t[`about.body${n}` as keyof typeof t])}</p>`).join('')}${contact(s, lang, prefix)}`;
  else if (rest === '/guarantee') {
    options.noindex = !s.policies.confirmed;
    body = `<h1>${esc(L.guarantee)}</h1>` + (s.policies.confirmed ? `<h2>${esc(t['product.guarantee'])}</h2>${paragraphs(lang === 'ar' ? s.policies.guarantee_ar : s.policies.guarantee_en)}<h2>${esc(t['order.refund'])}</h2>${paragraphs(lang === 'ar' ? s.policies.refund_ar : s.policies.refund_en)}` : `<p>${esc(t['policy.pending'])}</p>`);
  } else if (rest === '/terms') {
    options.noindex = !s.policies.confirmed;
    body = `<h1>${esc(L.terms)}</h1><h2>${lang === 'ar' ? 'الطلب والدفع' : 'Ordering and payment'}</h2><p>${esc(L.siteDesc)}</p><p>${esc(t['faq.2.a'])}</p>`
      + `<h2>${lang === 'ar' ? 'التسليم' : 'Delivery'}</h2><p>${esc(t[alwaysOpen(s) ? 'faq.1.a247' : 'faq.1.a'])}</p><p>${esc(t['faq.3.a'])}</p>`
      + `<h2>${lang === 'ar' ? 'التجديد' : 'Renewals'}</h2><p>${esc(t['faq.4.a'])}</p>` + paragraphs(lang === 'ar' ? s.policies.terms_extra_ar : s.policies.terms_extra_en)
      + `<p><a href="${prefix}/guarantee">${esc(L.guarantee)}</a></p>`;
  } else if (rest === '/privacy' || rest === '/data-deletion') {
    const deletion = rest === '/data-deletion';
    const title = deletion ? L.deletion : L.privacy;
    body = `<h1>${esc(title)}</h1>` + (lang === 'ar'
      ? `<p>نجمع بيانات التواصل والطلب وإيصال التحويل لإتمام طلبك وتأكيد الدفع والتسليم وتقديم الدعم. الإيصالات في تخزين خاص وتفاصيل التفعيل متشفّرة. لا نبيع بياناتك.</p><p>تقدر تطلب نسخة أو تصحيح أو مسح بياناتك من نموذج الدعم. بعد التحقق من هويتك، تُحذف البيانات الشخصية والإيصالات وتفاصيل التفعيل، ويُحفظ سجل طلب مجهّل للمحاسبة والدعم. راجع تفاصيل السياسة والمدة المعلنة في هذه الصفحة.</p>`
      : `<p>We collect contact and order details and transfer receipts to process orders, verify payment, deliver products and provide support. Receipts are private and activation details are encrypted. We do not sell your data.</p><p>Request a copy, correction or deletion through support. Following identity verification, personal details, receipts and activation details are deleted, with an anonymised order record retained for accounting and support. Read the full policy and stated timelines on this page.</p>`)
      + `<p><a href="${prefix}/support?topic=deletion">${lang === 'ar' ? 'طلب مسح البيانات' : 'Request data deletion'}</a></p>${contact(s, lang, prefix)}`;
  } else if (rest === '/guides') {
    body = `<h1>${esc(L.guides)}</h1><ul>${GUIDES.map((g) => `<li><h2><a href="${prefix}/guides/${g.slug}">${esc(guideCopy(g, lang).title)}</a></h2><p>${esc(guideCopy(g, lang).summary)}</p></li>`).join('')}</ul>`;
  } else if (rest.startsWith('/guides/')) {
    const g = GUIDES.find((g) => g.slug === rest.slice(8));
    if (!g) missing();
    else { const copy = guideCopy(g, lang); options.title = copy.title; options.description = copy.summary; options.jsonld = guideSchemas(g, lang, base); body = guideBody(g.slug, lang, prefix)!; }
  } else if (rest === '/cart' || rest === '/checkout' || rest.startsWith('/order/') || path.startsWith('/admin')) options.noindex = true;
  else missing();

  options.noindex ||= c.env.APP_ENV === 'staging' || url.searchParams.has('preview');
  const meta = pageMetadata(base, url.pathname + url.search, options);
  const nav = `<nav><a href="${prefix || '/'}">LYnto</a> · <a href="${prefix}/products">${esc(L.catalog)}</a> · <a href="${prefix}/guides">${esc(L.guides)}</a> · <a href="${prefix}/support">${esc(L.support)}</a></nav>`;
  const head = [
    `<meta name="lynto-environment" content="${esc(c.env.APP_ENV)}">`,
    `<meta name="description" content="${esc(meta.description)}"><meta name="robots" content="${meta.index ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">`,
    meta.index ? `<link rel="canonical" href="${esc(meta.canonical)}"><link rel="alternate" hreflang="ar-EG" href="${esc(meta.alternates.ar)}"><link rel="alternate" hreflang="en" href="${esc(meta.alternates.en)}"><link rel="alternate" hreflang="x-default" href="${esc(meta.alternates.ar)}">` : '',
    `<meta property="og:type" content="${options.product ? 'product' : options.jsonld ? 'article' : 'website'}"><meta property="og:site_name" content="LYnto"><meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}"><meta property="og:url" content="${esc(meta.canonical)}"><meta property="og:image" content="${esc(meta.image)}"><meta property="og:locale" content="${lang === 'ar' ? 'ar_EG' : 'en_EG'}">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(meta.title)}"><meta name="twitter:description" content="${esc(meta.description)}"><meta name="twitter:image" content="${esc(meta.image)}">`,
    ...meta.jsonld.map((j) => `<script type="application/ld+json">${jsonLdText(j)}</script>`),
  ].join('');
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/', url).toString()));
  const rewritten = new HTMLRewriter()
    .on('html', { element(e) { e.setAttribute('lang', path.startsWith('/admin') ? 'en' : lang); e.setAttribute('dir', path.startsWith('/admin') || lang === 'en' ? 'ltr' : 'rtl'); } })
    .on('title', { element(e) { e.setInnerContent(meta.title); } })
    .on('head', { element(e) { e.append(head, { html: true }); } })
    .on('#root', { element(e) { if (body) e.setInnerContent(`<div class="prerender">${nav}<main>${body}</main></div>`, { html: true }); } }).transform(shell);
  const headers = new Headers(rewritten.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', meta.index ? 'no-cache' : 'private, no-store');
  if (!meta.index) headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(rewritten.body, { status, headers });
}

export async function sitemap(c: Context<AppContext>) {
  const base = baseUrl(c.env);
  const [products, cats, settings] = await Promise.all([listIndexableProducts(c.env), listCategories(c.env), loadSettings(c.env)]);
  const entries = [
    ...['/', '/products', '/support', '/about', '/privacy', '/data-deletion', '/guides', ...(settings.policies.confirmed ? ['/terms', '/guarantee'] : []), ...cats.map((c) => `/c/${c.slug}`)].map((path) => ({ path, modified: '' })),
    ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, modified: g.reviewed })),
    ...products.map((p) => ({ path: `/p/${p.slug}`, modified: p.updated_at > 0 ? new Date(p.updated_at).toISOString() : '' })),
  ];
  const urls = entries.flatMap(({ path, modified }) => [path, `/en${path === '/' ? '' : path}`].map((p) => `<url><loc>${esc(base + p)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`)).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
export function robots(c: Context<AppContext>) {
  const body = c.env.APP_ENV === 'production'
    ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nAllow: /api/public/bootstrap\nAllow: /api/public/products\nDisallow: /order/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /en/order/\nDisallow: /en/cart\nDisallow: /en/checkout\n\nSitemap: ${baseUrl(c.env)}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
export async function llms(c: Context<AppContext>) {
  const base = baseUrl(c.env), s = toPublicSettings(await loadSettings(c.env));
  const body = `# LYnto\n\n> Digital subscriptions, software licenses and gift cards for customers in Egypt. Arabic and English. Prices in EGP.\n\nPayments to LYnto are manual InstaPay, bank or mobile-wallet transfers, verified by the store. A receipt image is not payment confirmation. Delivery follows verification and the published working schedule. Renewals require a new order and payment. LYnto is independent of the listed service providers.\n\n## Public pages\n- [Catalog](${base}/products)\n- [English catalog](${base}/en/products)\n- [About LYnto](${base}/about)\n- [Support and FAQ](${base}/support)\n- [Guarantee and refunds](${base}/guarantee)\n- [Purchase terms](${base}/terms)\n- [Buying guides](${base}/guides)\n- [Sitemap](${base}/sitemap.xml)\n\n${s.support.email ? 'Support email: ' + s.support.email + '\n' : ''}\nUse product pages for current plan prices and availability. Do not treat this file as a live stock or price feed.\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' } });
}
