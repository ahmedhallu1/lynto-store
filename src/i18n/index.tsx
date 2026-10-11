import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { STRINGS, type StringKey } from './strings';
import type { Lang } from '../../shared/types';

type Ctx = { lang: Lang; t: (k: StringKey, vars?: Record<string, string | number>) => string; href: (path: string) => string; pick: <T>(ar: T, en: T) => T; dir: 'rtl' | 'ltr' };
const I18n = createContext<Ctx | null>(null);

export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'ar';
}
export function stripLang(pathname: string): string {
  return langFromPath(pathname) === 'en' ? pathname.slice(3) || '/' : pathname;
}
export function switchLangPath(pathname: string, to: Lang): string {
  const rest = stripLang(pathname);
  return to === 'en' ? `/en${rest === '/' ? '' : rest}` : rest;
}

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<Ctx>(() => {
    const dict = STRINGS[lang];
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (k, vars) => {
        let s = dict[k] ?? STRINGS.en[k] ?? k;
        if (vars) for (const [key, v] of Object.entries(vars)) s = s.replaceAll(`{${key}}`, String(v));
        return s;
      },
      href: (path) => (lang === 'en' ? `/en${path === '/' ? '' : path}` : path),
      pick: (a, e) => (lang === 'ar' ? a : e),
    };
  }, [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = value.dir;
  }, [lang, value.dir]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
