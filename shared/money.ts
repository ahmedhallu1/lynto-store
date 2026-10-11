// Money is always integer piastres (1 EGP = 100 piastres). Never use floats for totals.

export function formatEGP(piastres: number | null | undefined, lang: 'ar' | 'en' = 'ar'): string {
  if (piastres === null || piastres === undefined) return '';
  const egp = piastres / 100;
  const hasFraction = piastres % 100 !== 0;
  const num = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(egp);
  return lang === 'ar' ? `${num} ج.م` : `EGP ${num}`;
}

/** Parse "1,250.50" / "1250" / "١٢٥٠" into piastres. Returns null when invalid. */
export function parseEGP(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.round(input * 100);
  }
  const normalized = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,\s٬]/g, '')
    .replace('٫', '.');
  if (normalized === '') return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ''] = normalized.split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return p > 0 ? p : null;
}

export function piastresToEGPString(p: number | null | undefined): string {
  if (p === null || p === undefined) return '';
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2);
}
