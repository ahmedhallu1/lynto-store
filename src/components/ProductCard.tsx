import type { PublicProduct } from '../../shared/types';
import { useI18n } from '../i18n';
import { Link } from '../lib/router';
import { money } from '../lib/format';
import { Badge, ProductMark } from './ui';

export function ProductCard({ p }: { p: PublicProduct }) {
  const { t, href, lang, pick } = useI18n();
  const title = pick(p.title_ar, p.title_en);
  return (
    <Link href={href(`/p/${p.slug}`)} className="card group flex flex-col gap-4 p-4 transition hover:border-cyan/60 hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <ProductMark text={p.icon_text} accent={p.accent} image={p.image_url} slug={p.slug} size={72} label={title} />
        <div className="min-w-0">
          <p className="text-xs text-dim">{pick(p.category.name_ar, p.category.name_en)}</p>
          <h3 className="font-semibold leading-snug text-text group-hover:text-cyan"><bdi>{title}</bdi></h3>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-muted">{pick(p.summary_ar, p.summary_en)}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        {p.available && p.min_price_piastres ? (
          <p className="text-sm text-muted">{t('catalog.from')} <span className="font-bold text-text price inline-block">{money(p.min_price_piastres, lang)}</span></p>
        ) : (
          <Badge kind="warn">{t('catalog.unavailable')}</Badge>
        )}
        <span className="text-cyan text-sm" aria-hidden>{lang === 'ar' ? '←' : '→'}</span>
      </div>
    </Link>
  );
}
