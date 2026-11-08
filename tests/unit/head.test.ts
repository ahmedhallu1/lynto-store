// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePageTitle } from '../../src/components/usePageTitle';
import { navigate } from '../../src/lib/router';
let root: Root;
function Page({ title, noindex = false }: { title: string; noindex?: boolean }) { usePageTitle(title, { noindex }); return null; }
const render = async (path: string, title: string, noindex = false) => act(async () => { navigate(path); root.render(createElement(Page, { title, noindex })); });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  document.head.innerHTML = '<title>LYnto</title><meta name="robots" content="index,follow"><link rel="canonical" href="https://lynto.store/en"><script type="application/ld+json">{"@type":"Product","name":"old"}</script>';
  const el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);
});
afterEach(async () => { await act(async()=>root.unmount()); document.body.innerHTML=''; });
describe('SPA head synchronization',()=>{
  it('restores indexability after Cart and updates canonical and social URLs',async()=>{
    await render('/en/cart','Your cart',true);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    await render('/en/products','Products');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('index,follow');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).not.toContain('noindex');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(location.origin+'/en/products');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(location.origin+'/en/products');
  });
  it('changes descriptions and reciprocal language links with the route',async()=>{
    await render('/en/about','About LYnto');const before=document.querySelector('meta[name="description"]')?.getAttribute('content');
    await render('/en/support','Support');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).not.toBe(before);
    expect(document.querySelector('link[hreflang="ar-EG"]')?.getAttribute('href')).toBe(location.origin+'/support');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
  it('never removes staging exclusion when navigating to public pages',async()=>{
    const meta=document.createElement('meta');meta.name='lynto-environment';meta.content='staging';document.head.appendChild(meta);
    await render('/en/cart','Cart',true); await render('/en/products','Products');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
