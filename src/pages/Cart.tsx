import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { Link, navigate } from '../lib/router';
import { api } from '../lib/api';
import { cart, useCart } from '../lib/cart';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { Alert, Button, Select, Spinner } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';

type Quote = { total_piastres: number; problems: Array<{ plan_id: string; error: string }>; lines: Array<{ plan_id: string; unit_price_piastres: number }> };

export function useQuote(items: ReturnType<typeof useCart>, lang: 'ar' | 'en') {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(items.map((i) => [i.planId, i.qty]));
  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    let live = true;
    setError(false);
    api.post<Quote>('/api/public/cart/quote', { lang, lines: items.map((i) => ({ plan_id: i.planId, qty: i.qty, fields: {} })) })
      .then((q) => live && setQuote(q)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [key, lang]);
  return { quote, error };
}

export function Cart() {
  const { t, href, lang, pick } = useI18n();
  const items = useCart();
  const { data } = useStore();
  const { quote, error } = useQuote(items, lang);
  usePageTitle(t('cart.title'), { noindex: true });
  const unavailable = new Set(quote?.problems.map((p) => p.plan_id));
  const priceFor = (planId: string) => quote?.lines.find((l) => l.plan_id === planId)?.unit_price_piastres;
  const canCheckout = !!quote && quote.problems.length === 0 && !!data?.settings.checkout_enabled;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t('cart.title')}</h1>
      <p className="mt-1 text-sm text-dim">{t('cart.digital')}</p>
      {items.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-muted">{t('cart.empty')}</p>
          <Link href={href('/products')} className="mt-3 inline-block font-semibold text-cyan">{t('home.cta.browse')}</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <ul className="space-y-3">
            {items.map((i) => {
              const unit = priceFor(i.planId) ?? i.unit_price;
              return (
                <li key={i.key} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={href(`/p/${i.slug}`)} className="font-semibold hover:text-cyan"><bdi>{pick(i.title_ar, i.title_en)}</bdi></Link>
                      <p className="text-sm text-muted"><bdi>{pick(i.plan_ar, i.plan_en)}</bdi></p>
                      {Object.entries(i.fields).length > 0 && <p className="mt-1 text-xs text-dim ltr text-start">{Object.values(i.fields).join(' · ')}</p>}
                    </div>
                    <p className="font-bold price">{money(unit * i.qty, lang)}</p>
                  </div>
                  {unavailable.has(i.planId) && <div className="mt-3"><Alert kind="warn">{t('cart.unavailable')}</Alert></div>}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    {i.max_qty > 1 ? (
                      <label className="flex items-center gap-2 text-sm text-muted">{t('product.qty')}
                        <Select className="w-24" value={i.qty} onChange={(e) => cart.setQty(i.key, Number(e.target.value))}>
                          {Array.from({ length: i.max_qty }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                        </Select>
                      </label>
                    ) : <span />}
                    <Button variant="ghost" size="sm" onClick={() => cart.remove(i.key)}>{t('cart.remove')}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <aside className="card h-fit p-5">
            <p className="flex items-baseline justify-between">
              <span className="text-muted">{t('cart.subtotal')}</span>
              {quote ? <span className="text-2xl font-bold price">{money(quote.total_piastres, lang)}</span> : error ? <span className="text-bad text-sm">{t('common.error')}</span> : <Spinner />}
            </p>
            {!data?.settings.checkout_enabled && <p className="mt-3 text-sm text-warn">{t('checkout.closed')}</p>}
            <Button className="mt-4 w-full" size="lg" disabled={!canCheckout} onClick={() => navigate(href('/checkout'))}>{t('cart.checkout')}</Button>
          </aside>
        </div>
      )}
    </div>
  );
}
