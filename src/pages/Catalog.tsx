import { useEffect, useMemo, useState } from 'react';
import type { PublicProductCard } from '../../shared/types';
import { useI18n } from '../i18n';
import { Link, navigate, useLocation } from '../lib/router';
import { fetchProducts, useStore } from '../lib/store';
import { ProductCard } from '../components/ProductCard';
import { Icon } from '../components/icons';
import { Alert, Input, Select, Spinner, cx } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';
import { SEO_COPY } from '../../shared/seo';

export function Catalog({ categorySlug }: { categorySlug?: string }) {
  const { t, href, pick, lang } = useI18n();
  const { data } = useStore();
  const { search } = useLocation();
  const [products, setProducts] = useState<PublicProductCard[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState(search.get('q') ?? '');
  const [sort, setSort] = useState(search.get('sort') ?? 'featured');
  const category = data?.categories.find((c) => c.slug === categorySlug);
  usePageTitle(category ? pick(category.name_ar, category.name_en) : SEO_COPY[lang].catalog, { category, noindex: !!categorySlug && !!data && !category });

  useEffect(() => { fetchProducts().then(setProducts).catch(() => setError(true)); }, []);

  const list = useMemo(() => {
    if (!products) return [];
    const needle = q.trim().toLowerCase();
    let l = products.filter((p) => (!categorySlug || p.category.slug === categorySlug)
      && (!needle || [p.title_ar, p.title_en, p.brand, p.summary_ar, p.summary_en].some((s) => s.toLowerCase().includes(needle))));
    const price = (p: PublicProductCard) => p.min_price_piastres ?? Number.MAX_SAFE_INTEGER;
    if (sort === 'priceAsc') l = [...l].sort((a, b) => price(a) - price(b));
    else if (sort === 'priceDesc') l = [...l].sort((a, b) => (b.min_price_piastres ?? 0) - (a.min_price_piastres ?? 0));
    else if (sort === 'name') l = [...l].sort((a, b) => pick(a.title_ar, a.title_en).localeCompare(pick(b.title_ar, b.title_en)));
    return l;
  }, [products, q, sort, categorySlug, pick]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{category ? pick(category.name_ar, category.name_en) : t('catalog.title')}</h1>
      {category && <p className="mt-2 text-muted">{pick(category.description_ar, category.description_en)}</p>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('catalog.search')}</span>
          <Icon.search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 text-dim" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('catalog.search')} className="ps-10" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="whitespace-nowrap">{t('catalog.sort')}</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="sm:w-52">
            <option value="featured">{t('catalog.sort.featured')}</option>
            <option value="priceAsc">{t('catalog.sort.priceAsc')}</option>
            <option value="priceDesc">{t('catalog.sort.priceDesc')}</option>
            <option value="name">{t('catalog.sort.name')}</option>
          </Select>
        </label>
      </div>

      <nav className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2" aria-label={t('home.categories')}>
        <Link href={href('/products')} className={cx('whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium', !categorySlug ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted hover:text-text')} aria-current={!categorySlug ? 'page' : undefined}>{t('catalog.all')}</Link>
        {data?.categories.map((c) => (
          <Link key={c.id} href={href(`/c/${c.slug}`)} aria-current={c.slug === categorySlug ? 'page' : undefined}
            className={cx('whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium', c.slug === categorySlug ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted hover:text-text')}>
            {pick(c.name_ar, c.name_en)}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {error && <Alert kind="bad" title={t('common.error')} />}
        {!products && !error && <Spinner label={t('common.loading')} />}
        {products && products.length === 0 && (
          <div className="card glow p-6">
            <h2 className="text-lg font-bold">{t('home.launch.title')}</h2>
            <p className="mt-2 text-muted">{t('home.launch.body')}</p>
            <button className="mt-3 font-semibold text-cyan" onClick={() => navigate(href('/support'))}>{t('support.contact')}</button>
          </div>
        )}
        {products && products.length > 0 && (
          <>
            <p className="mb-3 text-sm text-dim" aria-live="polite">{t('catalog.count', { n: list.length })}</p>
            {list.length === 0 ? <p className="text-muted">{t('catalog.empty')}</p> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
