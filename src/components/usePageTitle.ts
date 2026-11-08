import { useEffect } from 'react';
import { pageMetadata, jsonLdText, type MetadataOptions } from '../../shared/seo';
import { useLocation } from '../lib/router';

/** Keep the complete head consistent on SPA navigation, including recovery from noindex pages. */
export function usePageTitle(title: string, opts: MetadataOptions = {}) {
  const { href } = useLocation();
  const staging = document.querySelector('meta[name="lynto-environment"]')?.getAttribute('content') === 'staging';
  const serialized = JSON.stringify(pageMetadata(window.location.origin, href, { ...opts, title: title || undefined, noindex: staging || opts.noindex }));
  useEffect(() => {
    const m: ReturnType<typeof pageMetadata> = JSON.parse(serialized);
    document.title = m.title;
    const meta = (key: string, value: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = value;
    };
    meta('description', m.description);
    // Always assign both states: a noindex value from Cart must not leak into Products.
    meta('robots', m.index ? 'index,follow,max-image-preview:large' : 'noindex,nofollow');
    for (const node of document.head.querySelectorAll('link[rel="canonical"],link[rel="alternate"][hreflang],script[type="application/ld+json"]')) node.remove();
    if (m.index) {
      const link = (rel: string, url: string, language?: string) => {
        const el = document.createElement('link'); el.rel = rel; el.href = url;
        if (language) el.hreflang = language;
        document.head.appendChild(el);
      };
      link('canonical', m.canonical);
      link('alternate', m.alternates.ar, 'ar-EG'); link('alternate', m.alternates.en, 'en'); link('alternate', m.alternates.ar, 'x-default');
      for (const schema of m.jsonld) {
        const el = document.createElement('script'); el.type = 'application/ld+json'; el.textContent = jsonLdText(schema); document.head.appendChild(el);
      }
    }
    meta('og:type', opts.product ? 'product' : m.jsonld.some((s: any) => s['@type'] === 'Article') ? 'article' : 'website', true);
    meta('og:site_name', 'LYnto', true); meta('og:title', m.title, true); meta('og:description', m.description, true);
    meta('og:url', m.canonical, true); meta('og:image', m.image, true); meta('og:locale', m.lang === 'ar' ? 'ar_EG' : 'en_EG', true);
    meta('twitter:card', 'summary_large_image'); meta('twitter:title', m.title); meta('twitter:description', m.description); meta('twitter:image', m.image);
  }, [serialized, !!opts.product]);
}
