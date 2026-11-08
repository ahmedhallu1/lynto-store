import { GUIDES, guideCopy, guideSchemas } from '../../shared/guides';
import { SEO_COPY } from '../../shared/seo';
import { useI18n } from '../i18n';
import { Link } from '../lib/router';
import { usePageTitle } from '../components/usePageTitle';
import { NotFound } from './Info';

export function Guides({ slug }: { slug?: string }) {
  const { lang, href, pick } = useI18n();
  const guide = GUIDES.find((g) => g.slug === slug);
  const copy = guide ? guideCopy(guide, lang) : null;
  usePageTitle(copy?.title || SEO_COPY[lang].guides, { description: copy?.summary, noindex: !!slug && !guide, jsonld: guide ? guideSchemas(guide, lang, window.location.origin) : [] });
  if (slug && !guide) return <NotFound />;
  if (!guide || !copy) return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">{SEO_COPY[lang].guides}</h1>
      <p className="mt-3 text-muted">{pick('إجابات عملية تساعدك تختار المنتج وتدفع وتتابع طلبك بوضوح.', 'Practical answers to help you choose, pay and track your order clearly.')}</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">{GUIDES.map((g) => { const c = guideCopy(g, lang); return (
        <article key={g.slug} className="card p-6"><h2 className="text-lg font-semibold"><Link className="text-cyan" href={href(`/guides/${g.slug}`)}>{c.title}</Link></h2><p className="mt-3 text-muted">{c.summary}</p></article>
      ); })}</div>
    </section>
  );
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-5 text-sm text-muted" aria-label={pick('مسار الصفحة', 'Breadcrumb')}><Link href={href('/')}>LYnto</Link> / <Link href={href('/guides')}>{pick('أدلة الشراء', 'Buying guides')}</Link></nav>
      <h1 className="text-2xl font-bold sm:text-3xl">{copy.title}</h1>
      <p className="mt-4 text-lg text-muted">{copy.summary}</p>
      <p className="mt-4 text-sm text-dim">LYnto · {pick('تمت المراجعة', 'Reviewed')} <time dateTime={guide.reviewed}>{guide.reviewed}</time></p>
      {copy.sections.map((s) => <section key={s.heading} className="mt-8"><h2 className="text-xl font-semibold">{s.heading}</h2>{s.paragraphs.map((p, i) => <p key={i} className="mt-3 leading-relaxed text-muted">{p}</p>)}</section>)}
      <section className="mt-8 card p-5"><h2 className="font-semibold">{pick('روابط مفيدة', 'Useful links')}</h2><ul className="mt-3 space-y-2">{copy.links.map((a) => <li key={a.path}><Link className="text-cyan underline" href={href(a.path)}>{a.label}</Link></li>)}</ul></section>
      <section className="mt-8"><h2 className="font-semibold">{pick('المصادر', 'Sources')}</h2><ul className="mt-3 space-y-2 text-sm">{copy.sources.map((s) => <li key={s.url}><a className="text-cyan underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul><p className="mt-3 text-xs text-dim">{pick('المعلومات تمت مراجعتها في', 'Information reviewed on')} {guide.reviewed}. {pick('راجع صفحة المنتج للسعر الحالي والباقة المتاحة.', 'Check the product page for current prices and available plans.')}</p></section>
    </article>
  );
}
