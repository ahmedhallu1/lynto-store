import { useEffect, useMemo, useState } from 'react';
import type { PublicProduct } from '../../shared/types';
import { useI18n } from '../i18n';
import { Link, navigate, useLocation } from '../lib/router';
import { adminApi, api } from '../lib/api';
import { cart } from '../lib/cart';
import { useStore } from '../lib/store';
import { durationLabel, isAlwaysOpen, money } from '../lib/format';
import { track } from '../lib/pixel';
import { Icon } from '../components/icons';
import { Alert, Badge, Button, Field, Input, ProductMark, Select, Spinner, cx } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function ProductPage({ slug }: { slug: string }) {
  const { t, href, lang, pick } = useI18n();
  const { search } = useLocation();
  const previewId = search.get('preview');
  const { data } = useStore();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [planId, setPlanId] = useState('');
  const [qty, setQty] = useState(1);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setState('loading');
    const req = previewId
      ? adminApi.get<{ product: PublicProduct }>(`/products/${encodeURIComponent(previewId)}/preview`)
      : api.get<{ product: PublicProduct }>(`/api/public/products/${encodeURIComponent(slug)}`);
    req.then((r) => {
      setProduct(r.product);
      setPlanId(r.product.plans.find((p) => p.available)?.id ?? r.product.plans[0]?.id ?? '');
      setState('ok');
      if (!previewId) track('ViewContent', { content_ids: [r.product.id], content_type: 'product', currency: 'EGP', value: (r.product.min_price_piastres ?? 0) / 100 });
    }).catch((e) => setState(e?.status === 404 || e?.status === 401 ? 'missing' : 'error'));
  }, [slug, previewId]);

  const title = product ? pick(product.title_ar, product.title_en) : '';
  usePageTitle(title || t('nav.products'), { noindex: !!previewId });
  const plan = useMemo(() => product?.plans.find((p) => p.id === planId), [product, planId]);

  if (state === 'loading') return <Spinner label={t('common.loading')} />;
  if (state !== 'ok' || !product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg text-muted">{state === 'error' ? t('common.error') : t('product.notFound')}</p>
        <Link href={href('/products')} className="mt-4 inline-block font-semibold text-cyan">{t('home.viewAll')}</Link>
      </div>
    );
  }

  const checkoutOpen = !!data?.settings.checkout_enabled;
  const validate = () => {
    const errs: Record<string, string> = {};
    for (const f of product.customer_fields) {
      const v = (fields[f.key] ?? '').trim();
      if (!v) { if (f.required) errs[f.key] = t('common.required'); continue; }
      if (f.type === 'email' && !EMAIL_RE.test(v)) errs[f.key] = pick('إيميل مش صحيح', 'Invalid email');
      if (f.pattern) { try { if (!new RegExp(f.pattern).test(v)) errs[f.key] = pick('الصيغة مش صحيحة', 'Invalid format'); } catch { /* ignore */ } }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
  const add = (goCheckout: boolean) => {
    if (!plan || previewId || !validate()) return;
    cart.add({ productId: product.id, slug: product.slug, planId: plan.id, qty, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])),
      title_ar: product.title_ar, title_en: product.title_en, plan_ar: plan.name_ar, plan_en: plan.name_en, unit_price: plan.price_piastres, max_qty: plan.max_qty });
    track('AddToCart', { content_ids: [plan.id], content_type: 'product', currency: 'EGP', value: (plan.price_piastres * qty) / 100 });
    setAdded(true);
    if (goCheckout) navigate(href('/cart'));
  };

  const guaranteeText = (kind: string, days: number | null) =>
    kind === 'full_period' ? t('product.guarantee.full_period') : kind === 'days' && days ? t('product.guarantee.days', { n: days }) : kind === 'none' ? t('product.guarantee.none') : '';
  const features = pick(product.features_ar, product.features_en);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {previewId && <div className="mb-4"><Alert kind="warn" title={t('product.preview')} /></div>}
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-dim">
        <Link href={href('/products')} className="hover:text-text">{t('nav.products')}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href={href(`/c/${product.category.slug}`)} className="hover:text-text">{pick(product.category.name_ar, product.category.name_en)}</Link>
      </nav>

      <div className="mb-6 flex items-start gap-4">
        <ProductMark text={product.icon_text} accent={product.accent} image={product.image_url} slug={product.slug} size={96} label={title} />
        <div>
          {product.brand && <p className="text-sm text-dim ltr inline-block">{product.brand}</p>}
          <h1 className="text-2xl font-bold sm:text-3xl"><bdi>{title}</bdi></h1>
          <p className="mt-2 text-muted">{pick(product.summary_ar, product.summary_en)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="order-2 lg:order-1 space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">{t('product.about')}</h2>
            <p className="mt-2 whitespace-pre-line text-muted">{pick(product.description_ar, product.description_en)}</p>
            {features.length > 0 && (
              <>
                <h3 className="mt-5 font-semibold">{t('product.features')}</h3>
                <ul className="mt-2 space-y-1.5">
                  {features.map((f, i) => <li key={i} className="flex gap-2 text-muted"><Icon.check className="mt-1 shrink-0 text-cyan" width={16} height={16} /><span>{f}</span></li>)}
                </ul>
              </>
            )}
          </section>
          <section className="card p-5 space-y-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Icon.bolt className="text-cyan" width={18} height={18} /> {t('product.delivery')}</h2>
              <p className="mt-1 text-muted">{pick(product.delivery_ar, product.delivery_en) || t('product.delivery.default')}</p>
              <p className="mt-1 text-sm text-text">{t(isAlwaysOpen(data?.settings.schedule_summary.week) ? 'product.delivery.time247' : 'product.delivery.time')}</p>
            </div>
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Icon.shield className="text-cyan" width={18} height={18} /> {t('product.guarantee')}</h2>
              {plan && guaranteeText(plan.guarantee_kind, plan.guarantee_days) && <p className="mt-1 text-muted">{guaranteeText(plan.guarantee_kind, plan.guarantee_days)}</p>}
              {pick(product.guarantee_ar, product.guarantee_en) && <p className="mt-1 whitespace-pre-line text-muted">{pick(product.guarantee_ar, product.guarantee_en)}</p>}
              <Link href={href('/guarantee')} className="mt-1 inline-block text-sm font-semibold text-cyan">{t('product.guarantee.policy')}</Link>
            </div>
          </section>
        </div>

        <aside className="order-1 lg:order-2">
          <div className="card glow p-5 lg:sticky lg:top-20">
            <fieldset>
              <legend className="mb-3 font-semibold">{t('product.plans')}</legend>
              <div className="space-y-2">
                {product.plans.map((pl) => (
                  <label key={pl.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition', planId === pl.id ? 'border-cyan bg-cyan/5' : 'border-line hover:border-cyan/50', !pl.available && 'opacity-60')}>
                    <input type="radio" name="plan" value={pl.id} checked={planId === pl.id} onChange={() => { setPlanId(pl.id); setQty(1); }} disabled={!pl.available} className="size-5 accent-cyan" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium"><bdi>{pick(pl.name_ar, pl.name_en)}</bdi></span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge kind="cyan">{t(`product.type.${pl.plan_type}` as any)}</Badge>
                        <Badge>{durationLabel(pl, t, lang)}</Badge>
                        {!pl.available && <Badge kind="warn">{t('catalog.unavailable')}</Badge>}
                      </span>
                    </span>
                    <span className="font-bold price whitespace-nowrap">{pl.price_piastres ? money(pl.price_piastres, lang) : <span className="text-xs text-warn">{t('product.pricePending')}</span>}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {plan && pick(plan.notes_ar, plan.notes_en) && (
              <div className="mt-3 rounded-xl border border-cyan/30 bg-cyan/5 p-3">
                <p className="text-xs font-semibold text-cyan">{pick('تفاصيل الخطة اللي اخترتها', 'About the plan you selected')}</p>
                <p className="mt-1 text-sm leading-relaxed text-text/90">{pick(plan.notes_ar, plan.notes_en)}</p>
              </div>
            )}

            {plan && plan.max_qty > 1 && (
              <div className="mt-4 max-w-40">
                <Field label={t('product.qty')} htmlFor="qty">
                  <Select id="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                    {Array.from({ length: plan.max_qty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            {product.customer_fields.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="font-semibold">{t('product.required')}</p>
                {product.customer_fields.map((f) => (
                  <Field key={f.key} label={pick(f.label_ar, f.label_en)} hint={pick(f.help_ar ?? '', f.help_en ?? '')} error={errors[f.key]} required={f.required} htmlFor={`f-${f.key}`}>
                    {f.type === 'select' ? (
                      <Select id={`f-${f.key}`} value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} aria-invalid={!!errors[f.key]}>
                        <option value="">—</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{pick(o.label_ar, o.label_en)}</option>)}
                      </Select>
                    ) : (
                      <Input id={`f-${f.key}`} type={f.type === 'email' ? 'email' : 'text'} dir="ltr" inputMode={f.pattern?.includes('0-9') ? 'numeric' : undefined} autoComplete={f.type === 'email' ? 'email' : 'off'}
                        value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} aria-invalid={!!errors[f.key]} />
                    )}
                  </Field>
                ))}
                <p className="text-xs text-dim">{t('product.requiredNote')}</p>
              </div>
            )}

            {plan && plan.price_piastres > 0 && (
              <p className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
                <span className="text-muted">{t('product.total')}</span>
                <span className="text-2xl font-bold price">{money(plan.price_piastres * qty, lang)}</span>
              </p>
            )}
            {!checkoutOpen && !previewId && <p className="mt-3 text-sm text-warn">{t('product.checkoutClosed')}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button onClick={() => add(true)} disabled={!plan?.available || !!previewId}>{t('product.buy')}</Button>
              <Button variant="secondary" onClick={() => add(false)} disabled={!plan?.available || !!previewId}>{t('product.add')}</Button>
            </div>
            {added && <p className="mt-3 text-sm text-ok" role="status">{t('product.added')} — <Link href={href('/cart')} className="underline">{t('nav.cart')}</Link></p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
