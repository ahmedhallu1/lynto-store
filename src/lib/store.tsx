import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicCategory, PublicProductCard, PublicSettings } from '../../shared/types';
import { api } from './api';

type Bootstrap = { settings: PublicSettings; categories: PublicCategory[]; featured: PublicProductCard[]; product_count: number };
type Ctx = { data: Bootstrap | null; error: boolean; reload: () => void };
const StoreCtx = createContext<Ctx>({ data: null, error: false, reload: () => {} });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    api.get<Bootstrap>('/api/public/bootstrap').then(setData).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);
  return <StoreCtx.Provider value={{ data, error, reload: load }}>{children}</StoreCtx.Provider>;
}
export const useStore = () => useContext(StoreCtx);

// Simple cached product list for catalog/product pages.
let productsPromise: Promise<PublicProductCard[]> | null = null;
export function fetchProducts(force = false) {
  if (!productsPromise || force) productsPromise = api.get<{ products: PublicProductCard[] }>('/api/public/products?view=cards').then((r) => r.products).catch((e) => { productsPromise = null; throw e; });
  return productsPromise;
}
