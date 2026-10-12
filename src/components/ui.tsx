import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './icons';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4',
        size === 'lg' && 'min-h-12 px-6 text-lg',
        variant === 'primary' && 'brand-gradient text-white shadow-lg shadow-blue/20 hover:brightness-110',
        variant === 'secondary' && 'bg-surface-2 border border-line text-text hover:border-cyan/60',
        variant === 'ghost' && 'text-muted hover:text-text hover:bg-text/5',
        variant === 'danger' && 'bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25',
        className,
      )}
    >
      {loading && <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, required, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label} {required && <span className="text-cyan" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-dim">{hint}</p>}
      {error && <p className="text-xs text-bad" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full min-h-11 rounded-xl bg-ink/70 border border-line px-3 py-2 text-text placeholder:text-dim focus:border-cyan focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-cyan/40';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-24', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-auto', props.className)} />;
}
export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-sm text-muted">
      <input type="checkbox" {...props} className="mt-1 size-5 shrink-0 accent-cyan" />
      <span>{label}</span>
    </label>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('card p-5', className)}>{children}</div>;
}

const tone = {
  neutral: 'bg-text/5 text-muted border-line',
  info: 'bg-blue/15 text-blue border-blue/40',
  ok: 'bg-ok/12 text-ok border-ok/40',
  warn: 'bg-warn/12 text-warn border-warn/40',
  bad: 'bg-bad/12 text-bad border-bad/40',
  cyan: 'bg-cyan/12 text-cyan border-cyan/40',
};
export function Badge({ children, kind = 'neutral', className }: { children: ReactNode; kind?: keyof typeof tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tone[kind], className)}>{children}</span>;
}

export function Alert({ kind = 'info', title, children }: { kind?: 'info' | 'ok' | 'warn' | 'bad'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={kind === 'bad' ? 'alert' : 'status'} className={cx('rounded-xl border p-4 text-sm', tone[kind])}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      {children && <div className="text-text/90">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="size-5 rounded-full border-2 border-cyan border-t-transparent animate-spin" aria-hidden />
      {label && <span>{label}</span>}
    </div>
  );
}

export function CopyButton({ value, label, copiedLabel, className }: { value: string; label: string; copiedLabel: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx('inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 min-h-9 text-xs font-semibold text-muted hover:text-text hover:border-cyan/60', className)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch {
          const ta = document.createElement('textarea'); ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        setDone(true); setTimeout(() => setDone(false), 1800);
      }}
      aria-live="polite"
    >
      {done ? <Icon.check width={14} height={14} /> : <Icon.copy width={14} height={14} />}
      {done ? copiedLabel : label}
    </button>
  );
}

/** Brand-safe monogram tile used when a product has no uploaded image (we don't reuse third-party logos). */
export function ProductMark({ text, accent, image, slug, size = 56, label }: { text: string; accent: string; image?: string | null; slug?: string; size?: number; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = image ?? (slug && !failed ? `/catalog/${slug}${size <= 120 ? '-s' : ''}.jpg` : null);
  if (src && !(failed && !image)) return <img src={src} alt={label} width={size} height={size} className="rounded-2xl object-cover bg-surface-2" style={{ width: size, height: size }} loading="lazy" onError={() => setFailed(true)} />;
  return (
    <div
      aria-hidden
      className="grid place-items-center rounded-2xl font-bold text-white ltr shrink-0"
      style={{ width: size, height: size, fontSize: size * (text.length > 2 ? 0.28 : 0.36), background: `linear-gradient(135deg, ${accent || '#168CDD'}cc, #0b203a)`, border: `1px solid ${accent || '#168CDD'}66` }}
    >
      {text || '•'}
    </div>
  );
}

export function Section({ title, children, action, id }: { title: ReactNode; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-4 py-10 scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
