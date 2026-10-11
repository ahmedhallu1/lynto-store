import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from '../lib/router';
import { switchLangPath, useI18n } from '../i18n';
import { useCart } from '../lib/cart';
import { useStore } from '../lib/store';
import { getConsent, initPixel, setConsent } from '../lib/pixel';
import { Icon } from './icons';
import { Button, cx } from './ui';

export function Logo({ className }: { className?: string }) {
  return (
    <picture>
      <source srcSet="/brand/lynto-lockup.webp" type="image/webp" />
      <img src="/brand/lynto-lockup.png" alt="LYnto" width={160} height={46} className={cx('h-9 w-auto sm:h-10', className)} />
    </picture>
  );
}

function Header() {
  const { t, href, lang } = useI18n();
  const { pathname } = useLocation();
  const items = useCart();
  const count = items.reduce((n, i) => n + i.qty, 0);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const nav = [
    { to: href('/products'), label: t('nav.products') },
    { to: href('/support'), label: t('nav.support') },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{t('nav.skip')}</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href={href('/')} aria-label="LYnto" className="shrink-0 rounded-lg"><Logo /></Link>
        <nav className="ms-6 hidden md:flex items-center gap-1" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.to} href={n.to} className={cx('rounded-lg px-3 py-2 text-sm font-medium hover:text-text', pathname.startsWith(n.to) ? 'text-text' : 'text-muted')}>{n.label}</Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <a href={switchLangPath(pathname, lang === 'ar' ? 'en' : 'ar') + window.location.search} hrefLang={lang === 'ar' ? 'en' : 'ar'} lang={lang === 'ar' ? 'en' : 'ar'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:text-text">
            <Icon.globe /> <span>{t('nav.lang')}</span>
          </a>
          <Link href={href('/cart')} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:text-text" aria-label={`${t('nav.cart')} (${count})`}>
            <Icon.cart />
            {count > 0 && <span className="absolute top-1 end-0.5 grid min-w-5 h-5 place-items-center rounded-full bg-cyan px-1 text-[11px] font-bold text-ink ltr">{count}</span>}
          </Link>
          <button className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted" aria-expanded={open} aria-controls="mobile-nav" aria-label={t('nav.menu')} onClick={() => setOpen((v) => !v)}>
            {open ? <Icon.close /> : <Icon.menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="md:hidden border-t border-line px-4 pb-4 pt-2" aria-label="Mobile">
          {[{ to: href('/'), label: t('nav.home') }, ...nav].map((n) => (
            <Link key={n.to} href={n.to} className="block rounded-lg px-2 py-3 text-base font-medium text-text">{n.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const { t, href, lang, pick } = useI18n();
  const { data } = useStore();
  const support = data?.settings.support;
  const socials = support ? Object.entries(support.socials).filter(([, v]) => v && /^https:\/\//.test(v)) : [];
  return (
    <footer className="mt-16 border-t border-line/70 bg-ink/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">{t('home.eyebrow')}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('footer.policies')}</p>
          <ul className="space-y-1.5 text-sm text-muted">
            <li><Link className="hover:text-text" href={href('/terms')}>{t('terms.title')}</Link></li>
            <li><Link className="hover:text-text" href={href('/guarantee')}>{t('guarantee.title')}</Link></li>
            <li><Link className="hover:text-text" href={href('/privacy')}>{t('privacy.title')}</Link></li>
            <li><Link className="hover:text-text" href={href('/about')}>{t('about.title')}</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('support.contact')}</p>
          <ul className="space-y-1.5 text-sm text-muted">
            {support?.whatsapp && <li><a className="hover:text-text inline-flex items-center gap-2" href={`https://wa.me/${support.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><Icon.whatsapp width={16} height={16} /><span className="ltr">{support.whatsapp}</span></a></li>}
            {support?.email && <li><a className="hover:text-text inline-flex items-center gap-2" href={`mailto:${support.email}`}><Icon.mail width={16} height={16} /><span className="ltr">{support.email}</span></a></li>}
            <li><Link className="hover:text-text" href={href('/support')}>{t('support.form')}</Link></li>
          </ul>
          {socials.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {socials.map(([k, v]) => <li key={k}><a href={v} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line px-2.5 py-1.5 capitalize text-muted hover:text-text">{k}</a></li>)}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-line/60 py-5 text-center text-xs text-dim px-4">
        <p>© {new Date().getFullYear()} {data?.settings.business_name || 'LYnto'}. {t('footer.rights')} {t('footer.trademarks')}</p>
        <p className="mt-1">{pick('الأسعار بالجنيه المصري.', 'Prices in Egyptian pounds (EGP).')}</p>
      </div>
    </footer>
  );
}

function ConsentBanner() {
  const { t } = useI18n();
  const { data } = useStore();
  const pixelId = data?.settings.meta_pixel_id ?? '';
  const [state, setState] = useState(getConsent());
  useEffect(() => { if (pixelId && state === 'granted') initPixel(pixelId); }, [pixelId, state]);
  if (!pixelId || state) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl card p-4 shadow-2xl" role="dialog" aria-live="polite" aria-label="Cookies">
      <p className="text-sm text-muted">{t('consent.text')}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => { setConsent('granted'); setState('granted'); }}>{t('consent.accept')}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setConsent('denied'); setState('denied'); }}>{t('consent.decline')}</Button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { data, } = useStore();
  const { pick } = useI18n();
  const announcement = data ? pick(data.settings.announcement_ar, data.settings.announcement_en) : '';
  return (
    <div className="flex min-h-dvh flex-col">
      {announcement && <div className="brand-gradient px-4 py-2 text-center text-sm font-medium text-white">{announcement}</div>}
      <Header />
      <main id="main" className="flex-1" tabIndex={-1}>{children}</main>
      <Footer />
      <ConsentBanner />
    </div>
  );
}
