import { useI18n } from '../i18n';
import { Link } from '../lib/router';
import { useStore } from '../lib/store';
import { ProductCard } from '../components/ProductCard';
import { Icon, categoryIcon } from '../components/icons';
import { Section, Spinner, Alert } from '../components/ui';
import { isAlwaysOpen, time12, weekdayName } from '../lib/format';
import { usePageTitle } from '../components/usePageTitle';
import { SEO_COPY } from '../../shared/seo';
import { GUIDES, guideCopy } from '../../shared/guides';

export function WorkingHours({ week }: { week: Record<string, Array<{ start: string; end: string }>> }) {
  const { lang, pick, t } = useI18n();
  const order = [6, 0, 1, 2, 3, 4, 5];
  if (isAlwaysOpen(week)) return <p className="mt-1 text-sm font-semibold text-text">{t('home.hours.247')}</p>;
  return (
    <ul className="divide-y divide-line/60 text-sm">
      {order.map((d) => {
        const ivs = week[String(d)] ?? [];
        return (
          <li key={d} className="flex justify-between gap-4 py-2">
            <span className="text-muted">{weekdayName(d, lang)}</span>
            <span className="text-text">{ivs.length ? ivs.map((iv) => `${time12(iv.start, lang)} – ${time12(iv.end, lang)}`).join(pick('، ', ', ')) : pick('مقفول', 'Closed')}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Home() {
  const { t, href, pick, lang } = useI18n();
  const { data, error, reload } = useStore();
  usePageTitle(SEO_COPY[lang].siteTitle, { settings: data?.settings });
  const s = data?.settings;
  const methods = s?.payment_methods.length ? s.payment_methods : null;
  const open247 = isAlwaysOpen(s?.schedule_summary.week);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">{t('home.eyebrow')}</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl lg:leading-[1.15]">{t('home.title')}</h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">{t('home.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={href('/products')} className="brand-gradient inline-flex min-h-12 items-center gap-2 rounded-xl px-6 font-semibold text-white shadow-lg shadow-blue/25 hover:brightness-110">
                {t('home.cta.browse')} <Icon.arrow className="rtl:rotate-180" />
              </Link>
              <a href="#how" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-surface-2 px-6 font-semibold hover:border-cyan/60">{t('home.cta.how')}</a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><Icon.clock className="text-cyan" /> {t(open247 ? 'home.hero.sla247' : 'home.hero.sla')}</li>
              <li className="flex items-center gap-2"><Icon.shield className="text-cyan" /> {pick('مش بنطلب كلمة سر حسابك', 'We never ask for your password')}</li>
            </ul>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(32_199_207/0.18),transparent)]" aria-hidden />
            <picture>
              <source type="image/webp" srcSet="/brand/lynto-hero-640.webp 640w, /brand/lynto-hero-960.webp 960w, /brand/lynto-hero-1408.webp 1408w" sizes="(min-width: 1024px) 520px, 100vw" />
              <img src="/brand/lynto-hero-1408.jpg" alt="LYnto — Automated payments & subscriptions" width={1408} height={768} className="relative w-full rounded-3xl border border-line glow" fetchPriority="high" />
            </picture>
          </div>
        </div>
      </section>

      {error && <div className="mx-auto max-w-6xl px-4"><Alert kind="bad" title={t('common.error')}><button className="underline" onClick={reload}>{t('common.retry')}</button></Alert></div>}
      {!data && !error && <Spinner />}

      {data && (
        <>
          <Section title={t('home.categories')}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data.categories.map((c) => {
                const I = categoryIcon(c.icon);
                return (
                  <Link key={c.id} href={href(`/c/${c.slug}`)} className="card flex flex-col gap-3 p-4 hover:border-cyan/60">
                    <span className="grid size-11 place-items-center rounded-xl bg-cyan/10 text-cyan"><I /></span>
                    <span className="font-semibold leading-snug">{pick(c.name_ar, c.name_en)}</span>
                    <span className="text-xs text-muted line-clamp-2">{pick(c.description_ar, c.description_en)}</span>
                  </Link>
                );
              })}
            </div>
          </Section>

          {data.product_count === 0 ? (
            <section className="mx-auto max-w-6xl px-4">
              <div className="card glow p-6 sm:p-8">
                <h2 className="text-xl font-bold">{t('home.launch.title')}</h2>
                <p className="mt-2 max-w-2xl text-muted">{t('home.launch.body')}</p>
                <Link href={href('/support')} className="mt-4 inline-flex items-center gap-2 font-semibold text-cyan">{t('support.contact')} <Icon.arrow className="rtl:rotate-180" width={16} height={16} /></Link>
              </div>
            </section>
          ) : data.featured.length > 0 ? (
            <Section title={t('home.featured')} action={<Link href={href('/products')} className="text-sm font-semibold text-cyan">{t('home.viewAll')}</Link>}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.featured.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            </Section>
          ) : null}

          <Section title={t('home.how.title')} id="how">
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="card p-5">
                  <span className="grid size-9 place-items-center rounded-full brand-gradient font-bold text-white ltr">{n}</span>
                  <h3 className="mt-3 font-semibold">{t(`home.how.${n}.t` as any)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(`home.how.${n}.d` as any)}</p>
                </li>
              ))}
            </ol>
          </Section>

          <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-3">
            <div className="card p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Icon.wallet className="text-cyan" /> {t('home.pay.title')}</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {(methods ?? [{ id: 'instapay', type: 'instapay' }, { id: 'bank', type: 'bank' }, { id: 'wallet', type: 'wallet' }] as any[]).map((m) => (
                  <li key={m.id} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-cyan" aria-hidden />{methods ? pick(m.label_ar, m.label_en) : t(`pay.${m.type}` as any)}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted">{t('home.pay.body')}</p>
            </div>
            <div className="card p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Icon.clock className="text-cyan" /> {t('home.delivery.title')}</h2>
              <p className="mt-4 text-sm text-muted">{open247 && s?.sla_working_hours === 2 ? t('home.delivery.body247') : s && s.sla_working_hours !== 2 ? t('home.delivery.body', { hours: s.sla_working_hours }) : t('home.delivery.body1')}</p>
              <p className="mt-4 text-sm font-semibold">{t('home.hours')}</p>
              {s?.schedule_summary.configured ? <WorkingHours week={s.schedule_summary.week} /> : <p className="mt-1 text-sm text-dim">{t('home.hours.pending')}</p>}
            </div>
            <div className="card p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Icon.whatsapp className="text-cyan" /> {t('home.support.title')}</h2>
              <p className="mt-4 text-sm text-muted">{t('home.support.body')}</p>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                {s?.support.whatsapp && <a className="inline-flex items-center gap-2 text-cyan" href={`https://wa.me/${s.support.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><Icon.whatsapp width={16} height={16} /> <span className="ltr">{s.support.whatsapp}</span></a>}
                {s?.support.email && <a className="inline-flex items-center gap-2 text-cyan" href={`mailto:${s.support.email}`}><Icon.mail width={16} height={16} /> <span className="ltr">{s.support.email}</span></a>}
                <Link href={href('/support')} className="font-semibold text-cyan">{t('support.form')}</Link>
              </div>
            </div>
          </section>
        </>
      )}
      <Section title={pick('أدلة تساعدك تختار وتطلب', 'Guides to choosing and ordering')}>
        <div className="grid gap-4 md:grid-cols-2">{GUIDES.map((g) => { const copy = guideCopy(g, lang); return <article key={g.slug} className="card p-5"><h2 className="font-semibold"><Link href={href(`/guides/${g.slug}`)} className="text-cyan">{copy.title}</Link></h2><p className="mt-2 text-sm text-muted">{copy.summary}</p></article>; })}</div>
      </Section>
    </>
  );
}
