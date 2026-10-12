import { SOCIAL_GLYPHS } from './socialGlyphs';

const META: Record<string, { label: string; bg: string }> = {
  facebook: { label: 'Facebook', bg: '#0866FF' },
  instagram: { label: 'Instagram', bg: 'linear-gradient(45deg,#FEDA75,#FA7E1E 30%,#D62976 55%,#962FBF 80%,#4F5BD5)' },
  tiktok: { label: 'TikTok', bg: '#111111' },
  telegram: { label: 'Telegram', bg: '#26A5E4' },
  x: { label: 'X', bg: '#111111' },
  youtube: { label: 'YouTube', bg: '#FF0000' },
};
const ORDER = ['facebook', 'instagram', 'tiktok', 'telegram', 'youtube', 'x'];

/** Round brand-coloured social buttons that open the page in a new tab. Unknown or non-https URLs are ignored. */
export function SocialLinks({ socials, size = 40, className }: { socials: Record<string, string> | undefined; size?: number; className?: string }) {
  const items = ORDER.filter((k) => socials?.[k] && /^https:\/\//.test(socials[k]));
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-2.5 ${className ?? ''}`}>
      {items.map((k) => (
        <li key={k}>
          <a
            href={socials![k]} target="_blank" rel="noopener noreferrer" aria-label={META[k].label} title={META[k].label}
            className="grid place-items-center rounded-full border border-line/60 shadow-sm transition hover:scale-110 hover:shadow-md"
            style={{ width: size, height: size, background: META[k].bg }}
          >
            <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="#fff" aria-hidden><path d={SOCIAL_GLYPHS[k]} /></svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
