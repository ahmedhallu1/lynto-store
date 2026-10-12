import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'lynto_theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { /* storage unavailable */ }
  return 'auto';
}
let pref: ThemePref = typeof window === 'undefined' ? 'auto' : read();

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
export const effectiveTheme = (): 'light' | 'dark' => (pref === 'auto' ? (mq?.matches ? 'light' : 'dark') : pref);

function apply() {
  const el = document.documentElement;
  if (pref === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme() === 'light' ? '#f4f7fc' : '#061326');
  for (const l of listeners) l();
}
mq?.addEventListener?.('change', apply);
if (typeof window !== 'undefined') apply();

export function setThemePref(p: ThemePref) {
  pref = p;
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* ignore */ }
  apply();
}
export const nextThemePref = (p: ThemePref): ThemePref => (p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');
export function useThemePref(): ThemePref {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => pref, () => 'auto' as ThemePref);
}
