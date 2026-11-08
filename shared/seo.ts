import type { Lang, PublicCategory, PublicProduct, PublicSettings } from './types';
import { catalogImageSlugs } from './catalog-images';

export function productImage(base: string, product: Pick<PublicProduct, 'slug' | 'image_url'>) {
  return product.image_url ? absoluteUrl(base, product.image_url) : base + (catalogImageSlugs.has(product.slug) ? '/catalog/' + product.slug + '.jpg' : '/brand/og-image.jpg');
}

export const SEO_COPY = {
  ar: {
    siteTitle: 'LYnto | اشتراكات الذكاء الاصطناعي والبرامج وكروت الشحن في مصر',
    siteDesc: 'اشتراكات أدوات الذكاء الاصطناعي والبرامج والترفيه وكروت الشحن في مصر. الأسعار بالجنيه المصري والدفع بإنستاباي أو تحويل بنكي أو محفظة، مع تأكيد يدوي للدفع.',
    catalog: 'أسعار الاشتراكات الرقمية وكروت الشحن في مصر',
    support: 'الدعم والأسئلة الشائعة', about: 'عن LYnto', privacy: 'سياسة الخصوصية',
    terms: 'شروط الشراء', guarantee: 'الضمان والاسترجاع', deletion: 'سياسة مسح البيانات',
    guides: 'أدلة شراء الاشتراكات الرقمية وكروت الشحن في مصر',
    soon: 'المنتجات هتتنشر قريب بعد اعتماد الباقات والأسعار.',
  },
  en: {
    siteTitle: 'LYnto | AI subscriptions, software & gift cards in Egypt',
    siteDesc: 'Buy AI, software and entertainment subscriptions and gift cards in Egypt. Prices in EGP; pay LYnto by InstaPay, bank transfer or mobile wallet with manual payment verification.',
    catalog: 'Digital subscription & gift card prices in Egypt',
    support: 'Support & FAQ', about: 'About LYnto', privacy: 'Privacy policy',
    terms: 'Purchase terms', guarantee: 'Guarantee & refunds', deletion: 'Data deletion policy',
    guides: 'Digital subscription & gift card buying guides for Egypt',
    soon: 'Products will be listed once plans and prices are approved.',
  },
};

export const INFORMATION_DESCRIPTIONS = {
  ar: {
    support: 'إجابات عن الدفع بإنستاباي والمحافظ، تأكيد التحويل، التسليم والضمان. تواصل مع دعم LYnto قبل الطلب أو بخصوص طلبك الحالي.',
    about: 'LYnto متجر اشتراكات رقمية وتراخيص برامج وكروت شحن في مصر. اعرف طريقة الطلب والدفع والتسليم والدعم.',
    privacy: 'اعرف البيانات التي يجمعها LYnto لإتمام طلبك، وكيف تُستخدم وتُحمى، وطريقة طلب تصحيحها أو مسحها.',
    terms: 'شروط شراء المنتجات الرقمية من LYnto: الأسعار بالجنيه المصري، التحويل اليدوي، تأكيد الدفع والتسليم والتجديد.',
    guarantee: 'تفاصيل ضمان اشتراكات LYnto من تاريخ التفعيل، وحالات إصلاح المشكلة أو الاستبدال أو الاسترجاع حسب السياسة المنشورة.',
    'data-deletion': 'طريقة طلب مسح بياناتك الشخصية من LYnto، والبيانات التي تُحذف والسجلات المجهّلة التي تُحفظ للمحاسبة والدعم.',
    guides: 'أدلة عملية للدفع والتحقق من الحساب والمنطقة قبل شراء اشتراك رقمي أو كارت شحن. إجراءات واضحة وروابط للمصادر الرسمية.',
  },
  en: {
    support: 'Answers about InstaPay and wallet payments, transfer verification, delivery and guarantees. Contact LYnto before buying or for help with an existing order.',
    about: 'LYnto is a digital subscription, software license and gift card store serving Egypt. Learn how ordering, payments, delivery and support work.',
    privacy: 'Learn what LYnto collects to process orders, how information is used and protected, and how to request correction or deletion.',
    terms: 'LYnto digital purchase terms: prices in EGP, manual transfers, payment verification, delivery and renewals.',
    guarantee: 'LYnto subscription guarantees from activation, troubleshooting, replacements and refunds under the published policy.',
    'data-deletion': 'How to request deletion of personal data from LYnto, what is deleted and which anonymised records are retained.',
    guides: 'Practical guides to paying and checking account and region compatibility before buying a digital subscription or gift card, with official sources.',
  },
};

export const cleanPath = (path: string) => path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
export function routeParts(path: string) {
  const pathname = cleanPath(path);
  const lang: Lang = pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'ar';
  const prefix = lang === 'en' ? '/en' : '';
  return { pathname, lang, prefix, rest: prefix ? pathname.slice(3) || '/' : pathname };
}
export function absoluteUrl(base: string, path: string) {
  return new URL(path, base.replace(/\/+$/, '') + '/').toString();
}
export function jsonLdText(value: unknown) { return JSON.stringify(value).replace(/</g, '\\u003c'); }

export function organizationSchema(base: string, settings?: PublicSettings | null) {
  const support = settings?.support;
  const socials = support ? Object.values(support.socials).filter((u) => /^https:\/\//.test(u)) : [];
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': base + '/#organization',
    name: settings?.business_name || 'LYnto', url: base + '/', logo: base + '/brand/icon-512.png',
    areaServed: { '@type': 'Country', name: 'Egypt' },
    ...(socials.length ? { sameAs: socials } : {}),
    ...(support?.email || support?.whatsapp ? { contactPoint: [{
      '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: ['Arabic', 'English'],
      ...(support.email ? { email: support.email } : {}), ...(support.whatsapp ? { telephone: support.whatsapp } : {}),
    }] } : {}),
  };
}

export function productSchemas(product: PublicProduct, lang: Lang, base: string, checkoutEnabled = true): unknown[] {
  const prefix = lang === 'en' ? '/en' : '';
  const title = lang === 'ar' ? product.title_ar : product.title_en;
  const description = lang === 'ar' ? product.description_ar : product.description_en;
  const url = base + prefix + '/p/' + product.slug;
  const image = productImage(base, product);
  return [
    {
      '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product',
      name: title, description, sku: product.id, url, image,
      ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
      offers: product.plans.filter((p) => Number.isSafeInteger(p.price_piastres) && p.price_piastres > 0).map((p) => ({
        '@type': 'Offer', '@id': url + '#offer-' + p.id, sku: p.id,
        name: lang === 'ar' ? p.name_ar : p.name_en, priceCurrency: 'EGP', price: (p.price_piastres / 100).toFixed(2),
        availability: checkoutEnabled && p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: url + '?plan=' + encodeURIComponent(p.id),
        seller: { '@type': 'Organization', '@id': base + '/#organization', name: 'LYnto' },
      })),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LYnto', item: base + (prefix || '/') },
        { '@type': 'ListItem', position: 2, name: lang === 'ar' ? product.category.name_ar : product.category.name_en, item: base + prefix + '/c/' + product.category.slug },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    },
  ];
}

export type MetadataOptions = {
  title?: string; description?: string; noindex?: boolean; product?: PublicProduct | null;
  category?: PublicCategory | null; settings?: PublicSettings | null; image?: string; jsonld?: unknown[];
};
export type PageMetadata = {
  title: string; description: string; index: boolean; canonical: string; lang: Lang;
  alternates: { ar: string; en: string }; image: string; jsonld: unknown[];
};

export function pageMetadata(base: string, path: string, opts: MetadataOptions = {}): PageMetadata {
  base = base.replace(/\/+$/, '');
  const { pathname, lang, prefix, rest } = routeParts(path);
  const L = SEO_COPY[lang];
  const key = rest.slice(1) as keyof typeof INFORMATION_DESCRIPTIONS.en;
  const privateRoute = /^\/admin(?:\/|$)/.test(pathname) || /^\/(?:cart|checkout)(?:\/|$)/.test(rest) || rest.startsWith('/order/');
  const preview = /(?:[?&])preview=/.test(path);
  let title = opts.title || (rest === '/' ? L.siteTitle : rest === '/products' ? L.catalog : rest === '/data-deletion' ? L.deletion : (L as any)[key] || 'LYnto');
  let description = opts.description || INFORMATION_DESCRIPTIONS[lang][key] || L.siteDesc;
  let jsonld = opts.jsonld || [];
  let image = opts.image || base + '/brand/og-image.jpg';
  if (opts.category) {
    const c = opts.category;
    title = lang === 'ar' ? `${c.name_ar} في مصر | LYnto` : `${c.name_en} in Egypt | LYnto`;
    description = (lang === 'ar' ? c.description_ar : c.description_en) + (lang === 'ar' ? ' قارن الباقات والأسعار بالجنيه المصري وادفع بإنستاباي أو محفظة.' : ' Compare plans and prices in EGP; pay by InstaPay or mobile wallet.');
    jsonld = [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': base + pathname + '#collection',
      name: lang === 'ar' ? c.name_ar : c.name_en, url: base + pathname, inLanguage: lang === 'ar' ? 'ar-EG' : 'en',
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LYnto', item: base + (prefix || '/') },
        { '@type': 'ListItem', position: 2, name: lang === 'ar' ? c.name_ar : c.name_en, item: base + pathname },
      ],
    }];
  }
  if (opts.product) {
    const p = opts.product;
    const name = lang === 'ar' ? p.title_ar : p.title_en;
    title = lang === 'ar' ? `${name} في مصر — الأسعار والباقات | LYnto` : `${name} in Egypt — plans & prices | LYnto`;
    description = (lang === 'ar' ? p.summary_ar : p.summary_en) || (lang === 'ar' ? p.description_ar : p.description_en);
    if (p.min_price_piastres) description += lang === 'ar' ? ` يبدأ من ${(p.min_price_piastres / 100).toFixed(2)} جنيه. الدفع بإنستاباي أو محفظة وتأكيد التحويل يدوياً.` : ` From EGP ${(p.min_price_piastres / 100).toFixed(2)}. Pay by InstaPay or wallet; transfers are verified manually.`;
    image = productImage(base, p);
    jsonld = productSchemas(p, lang, base, opts.settings?.checkout_enabled ?? true);
  } else if (rest === '/' || rest === '/about') {
    jsonld = [organizationSchema(base, opts.settings), {
      '@context': 'https://schema.org', '@type': rest === '/' ? 'WebSite' : 'AboutPage',
      '@id': base + pathname + (rest === '/' ? '#website' : '#about'), name: 'LYnto', url: base + pathname,
      inLanguage: lang === 'ar' ? 'ar-EG' : 'en', publisher: { '@id': base + '/#organization' },
    }];
  }
  const index = !privateRoute && !preview && !opts.noindex;
  return {
    title: title.includes('LYnto') ? title : title + ' | LYnto', description: description.replace(/\s+/g, ' ').trim(),
    index, canonical: base + pathname, lang,
    alternates: { ar: base + (rest === '/' ? '/' : rest), en: base + '/en' + (rest === '/' ? '' : rest) },
    image, jsonld: index ? jsonld : [],
  };
}
