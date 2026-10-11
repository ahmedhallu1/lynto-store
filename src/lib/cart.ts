import { useSyncExternalStore } from 'react';

// The cart is a temporary convenience in localStorage. Prices are always recalculated on the server.
export type CartItem = {
  key: string;
  productId: string;
  slug: string;
  planId: string;
  qty: number;
  fields: Record<string, string>;
  title_ar: string;
  title_en: string;
  plan_ar: string;
  plan_en: string;
  unit_price: number;
  max_qty: number;
};

const KEY = 'lynto_cart_v1';
const listeners = new Set<() => void>();
let cache: CartItem[] | null = null;

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as CartItem[]).filter((i) => i && i.planId && i.qty > 0) : [];
  } catch {
    cache = [];
  }
  return cache;
}
function write(items: CartItem[]) {
  cache = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  for (const l of listeners) l();
}
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = null; for (const l of listeners) l(); } });

export const cart = {
  items: read,
  add(item: Omit<CartItem, 'key'>) {
    const key = `${item.planId}:${JSON.stringify(item.fields)}`;
    const items = [...read()];
    const existing = items.find((i) => i.key === key);
    if (existing) existing.qty = Math.min(existing.qty + item.qty, item.max_qty);
    else items.push({ ...item, key });
    write(items.slice(0, 10));
  },
  setQty(key: string, qty: number) {
    write(read().map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(qty, i.max_qty)) } : i)));
  },
  remove(key: string) { write(read().filter((i) => i.key !== key)); },
  clear() { write([]); },
};

export function useCart() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => []);
}

// Idempotency key for the current checkout attempt (reset after a successful order).
export function checkoutKey(): string {
  try {
    let k = sessionStorage.getItem('lynto_idem');
    if (!k) { k = crypto.randomUUID() + '-' + Date.now().toString(36); sessionStorage.setItem('lynto_idem', k); }
    return k;
  } catch {
    return crypto.randomUUID();
  }
}
export function resetCheckoutKey() {
  try { sessionStorage.removeItem('lynto_idem'); } catch { /* ignore */ }
}

// Orders placed in this browser (number + private link) so customers can find them again.
export function rememberOrder(number: string, url: string) {
  try {
    const list = JSON.parse(localStorage.getItem('lynto_orders') ?? '[]') as Array<{ number: string; url: string; at: number }>;
    localStorage.setItem('lynto_orders', JSON.stringify([{ number, url, at: Date.now() }, ...list.filter((o) => o.number !== number)].slice(0, 20)));
  } catch { /* ignore */ }
}
export function rememberedOrders(): Array<{ number: string; url: string; at: number }> {
  try { return JSON.parse(localStorage.getItem('lynto_orders') ?? '[]'); } catch { return []; }
}
