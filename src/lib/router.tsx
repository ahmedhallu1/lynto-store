import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
const snapshot = () => window.location.pathname + window.location.search + window.location.hash;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot, () => '/');
  const url = new URL(href, 'http://x');
  return { pathname: url.pathname, search: url.searchParams, hash: url.hash, href };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  emit();
  window.scrollTo({ top: 0 });
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/') || href.startsWith('/media/')) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

/** Match "/p/:slug" style patterns. Returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean), a = path.split('/').filter(Boolean);
  if (pattern.endsWith('/*')) {
    const base = p.slice(0, -1);
    if (a.length < base.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < base.length; i++) {
      if (base[i].startsWith(':')) params[base[i].slice(1)] = decodeURIComponent(a[i]);
      else if (base[i] !== a[i]) return null;
    }
    params['*'] = a.slice(base.length).join('/');
    return params;
  }
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
