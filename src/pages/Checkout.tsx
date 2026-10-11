import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Link, navigate } from '../lib/router';
import { ApiError, api } from '../lib/api';
import { cart, checkoutKey, rememberOrder, resetCheckoutKey, useCart } from '../lib/cart';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { getConsent, track } from '../lib/pixel';
import { useQuote } from './Cart';
import { Alert, Button, Checkbox, Field, Input, Spinner, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { usePageTitle } from '../components/usePageTitle';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function Checkout() {
  const { t, href, lang, pick } = useI18n();
  const items = useCart();
  const { data } = useStore();
  const { quote } = useQuote(items, lang);
  usePageTitle(t('checkout.title'), { noindex: true });
  const methods = data?.settings.payment_methods ?? [];
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '+20', preferred_channel: 'whatsapp' as 'whatsapp' | 'email', whatsapp_optin: false, renewal_optin: false, payment_method_id: '', accept_terms: false, tracking_consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const pixel = !!data?.settings.meta_pixel_id && getConsent() === 'granted';

  useEffect(() => { if (!form.payment_method_id && methods[0]) setForm((f) => ({ ...f, payment_method_id: methods[0].id })); }, [methods.length]);
  useEffect(() => { if (quote && quote.total_piastres) track('InitiateCheckout', { currency: 'EGP', value: quote.total_piastres / 100, num_items: items.length }); }, [!!quote]);

  if (!items.length) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="text-muted">{t('cart.empty')}</p><Link href={href('/products')} className="mt-3 inline-block font-semibold text-cyan">{t('home.cta.browse')}</Link></div>;
  }
  if (!data) return <Spinner />;
  if (!data.settings.checkout_enabled) return <div className="mx-auto max-w-3xl px-4 py-16"><Alert kind="warn" title={t('checkout.closed')} /></div>;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = t('common.required');
    if (!EMAIL_RE.test(form.email.trim())) e.email = pick('إيميل مش صحيح', 'Enter a valid email');
    const digits = form.whatsapp.replace(/[^\d+]/g, '');
    if (!/^(\+|00)?\d{8,15}$/.test(digits) && !/^01\d{9}$/.test(digits)) e.whatsapp = pick('اكتب الرقم بكود الدولة، مثال ‎+201001234567', 'Include the country code, e.g. +201001234567');
    if (!form.payment_method_id) e.payment_method_id = t('common.required');
    if (!form.accept_terms) e.accept_terms = t('common.required');
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) setTimeout(() => {
      const el = document.getElementById({ name: 'name', email: 'email', whatsapp: 'wa', payment_method_id: 'methods', accept_terms: 'terms' }[first] ?? '');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); (el as HTMLInputElement | null)?.focus?.({ preventScroll: true });
    }, 0);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setServerError('');
    if (!validate() || !quote) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ number: string; token: string; url: string }>('/api/public/orders', {
        idempotency_key: checkoutKey(), lang,
        customer: { name: form.name.trim(), email: form.email.trim(), whatsapp: form.whatsapp.trim(), preferred_channel: form.preferred_channel, whatsapp_optin: form.whatsapp_optin, renewal_optin: form.renewal_optin },
        payment_method_id: form.payment_method_id,
        lines: items.map((i) => ({ plan_id: i.planId, qty: i.qty, fields: i.fields })),
        expected_total_piastres: quote.total_piastres, accept_terms: form.accept_terms, tracking_consent: pixel && form.tracking_consent,
      });
      const path = `${href(`/order/${res.number}`)}#k=${res.token}`;
      rememberOrder(res.number, path);
      cart.clear();
      resetCheckoutKey();
      navigate(path, { replace: true });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'price_changed') setServerError(t('checkout.priceChanged'));
      else if (err.code === 'invalid_whatsapp') setErrors((x) => ({ ...x, whatsapp: pick('رقم واتساب مش صحيح', 'Invalid WhatsApp number') }));
      else if (err.code === 'cart_invalid') setServerError(t('cart.unavailable'));
      else setServerError(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('checkout.title')}</h1>
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">{t('checkout.contact')}</h2>
          <Field label={t('checkout.name')} required error={errors.name} htmlFor="name"><Input id="name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('checkout.email')} required error={errors.email} htmlFor="email"><Input id="email" type="email" dir="ltr" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={t('checkout.whatsapp')} required hint={t('checkout.whatsapp.help')} error={errors.whatsapp} htmlFor="wa"><Input id="wa" type="tel" dir="ltr" autoComplete="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('checkout.channel')}</legend>
            <div className="flex gap-2">
              {(['whatsapp', 'email'] as const).map((c) => (
                <label key={c} className={cx('flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3', form.preferred_channel === c ? 'border-cyan bg-cyan/5' : 'border-line')}>
                  <input type="radio" name="channel" className="accent-cyan" checked={form.preferred_channel === c} onChange={() => set('preferred_channel', c)} />
                  {t(`checkout.channel.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Checkbox label={t('checkout.waOptin')} checked={form.whatsapp_optin} onChange={(e) => set('whatsapp_optin', e.target.checked)} />
          <Checkbox label={t('checkout.renewalOptin')} checked={form.renewal_optin} onChange={(e) => set('renewal_optin', e.target.checked)} />
        </section>

        <section id="methods" tabIndex={-1} className="card space-y-3 p-5">
          <h2 className="font-semibold">{t('checkout.method')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((m) => (
              <label key={m.id} className={cx('flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3', form.payment_method_id === m.id ? 'border-cyan bg-cyan/5' : 'border-line')}>
                <input type="radio" name="method" className="size-5 accent-cyan" checked={form.payment_method_id === m.id} onChange={() => set('payment_method_id', m.id)} />
                {m.type === 'bank' ? <Icon.bank className="text-cyan" /> : <Icon.wallet className="text-cyan" />}
                <span className="font-medium">{pick(m.label_ar, m.label_en)}</span>
              </label>
            ))}
          </div>
          {errors.payment_method_id && <p className="text-xs text-bad">{errors.payment_method_id}</p>}
          <p className="text-sm text-muted">{t('checkout.manual')}</p>
        </section>

        <section className="card space-y-3 p-5">
          <Checkbox
            id="terms"
            checked={form.accept_terms}
            onChange={(e) => set('accept_terms', e.target.checked)}
            label={<>{t('checkout.terms', { terms: '\u0000', guarantee: '\u0001' }).split(/(\u0000|\u0001)/).map((part, i) =>
              part === '\u0000' ? <Link key={i} href={href('/terms')} target="_blank" className="text-cyan underline">{t('checkout.terms.link')}</Link>
                : part === '\u0001' ? <Link key={i} href={href('/guarantee')} target="_blank" className="text-cyan underline">{t('checkout.guarantee.link')}</Link> : part)}</>}
          />
          {errors.accept_terms && <p className="text-xs text-bad">{errors.accept_terms}</p>}
          {pixel && <Checkbox label={t('checkout.tracking')} checked={form.tracking_consent} onChange={(e) => set('tracking_consent', e.target.checked)} />}
        </section>
      </div>

      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-20 lg:mt-14">
        <h2 className="font-semibold">{t('checkout.summary')}</h2>
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.key} className="flex justify-between gap-3">
              <span className="text-muted"><bdi>{pick(i.title_ar, i.title_en)}</bdi> — <bdi>{pick(i.plan_ar, i.plan_en)}</bdi> <span className="ltr inline-block">×{i.qty}</span></span>
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-muted">{t('cart.subtotal')}</span>
          <span className="text-2xl font-bold price">{quote ? money(quote.total_piastres, lang) : '…'}</span>
        </p>
        {serverError && <Alert kind="bad">{serverError} {serverError === t('checkout.priceChanged') && <Link href={href('/cart')} className="underline">{t('nav.cart')}</Link>}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!quote || quote.problems.length > 0}>{submitting ? t('checkout.placing') : t('checkout.place')}</Button>
      </aside>
    </form>
  );
}
