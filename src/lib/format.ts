import { formatEGP } from '../../shared/money';
import { formatInZone } from '../../shared/schedule';
import type { Lang, PublicPlan } from '../../shared/types';
import type { StringKey } from '../i18n/strings';

export const money = (p: number | null | undefined, lang: Lang) => formatEGP(p ?? 0, lang);
export const dateTime = (t: number | null | undefined, lang: Lang, withTime = true) => (t ? formatInZone(t, lang, 'Africa/Cairo', withTime) : '');

export function durationLabel(pl: Pick<PublicPlan, 'duration_value' | 'duration_unit' | 'is_perpetual'>, t: (k: StringKey) => string, lang: Lang) {
  if (pl.is_perpetual || !pl.duration_value || !pl.duration_unit) return t('product.perpetual');
  const n = pl.duration_value;
  const unit = pl.duration_unit;
  if (lang === 'ar') {
    if (unit === 'month') return n === 1 ? 'شهر' : n === 2 ? 'شهرين' : n <= 10 ? `${n} شهور` : `${n} شهر`;
    if (unit === 'year') return n === 1 ? 'سنة' : n === 2 ? 'سنتين' : `${n} سنين`;
    return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوم`;
  }
  return `${n} ${t((`product.${unit}${n === 1 ? '' : 's'}`) as StringKey)}`;
}

const WEEKDAYS = {
  ar: ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
export const weekdayName = (d: number, lang: Lang) => WEEKDAYS[lang][d];

export function time12(hm: string, lang: Lang) {
  const [h, m] = hm.split(':').map(Number);
  if (h === 24) return lang === 'ar' ? '12:00 بالليل' : '12:00 AM';
  const suffix = lang === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}
