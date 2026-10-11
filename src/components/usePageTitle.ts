import { useEffect } from 'react';

export function usePageTitle(title: string, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    document.title = title.includes('LYnto') ? title : `${title} | LYnto`;
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (opts.noindex) {
      if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
      meta.content = 'noindex,nofollow';
    }
  }, [title, opts.noindex]);
}
