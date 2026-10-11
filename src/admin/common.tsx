import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { adminApi, ApiError } from '../lib/api';
import { formatEGP } from '../../shared/money';
import { formatInZone } from '../../shared/schedule';
import { Badge } from '../components/ui';

export const egp = (p: number | null | undefined) => (p === null || p === undefined ? '—' : formatEGP(p, 'en'));
export const when = (t: number | null | undefined, withTime = true) => (t ? formatInZone(t, 'en', 'Africa/Cairo', withTime) : '—');

export function useAdmin<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    adminApi.get<T>(url).then((d) => { setData(d); setError(null); }).catch((e: ApiError) => setError(e.message)).finally(() => setLoading(false));
  }, [url, ...deps]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load, setData };
}

const PAY_KIND: Record<string, any> = { awaiting_transfer: 'neutral', proof_submitted: 'cyan', verified: 'ok', rejected: 'bad', cancelled: 'neutral', refund_requested: 'warn', refunded: 'warn' };
const FUL_KIND: Record<string, any> = { not_started: 'neutral', processing: 'info', partially_delivered: 'warn', delivered: 'ok', cancelled: 'neutral' };
const NOTE_KIND: Record<string, any> = { pending: 'info', sent: 'cyan', delivered: 'ok', failed: 'bad', manual_action_required: 'warn' };
export const label = (s: string) => s.replace(/_/g, ' ');
export const PayBadge = ({ s }: { s: string }) => <Badge kind={PAY_KIND[s] ?? 'neutral'}>{label(s)}</Badge>;
export const FulBadge = ({ s }: { s: string }) => <Badge kind={FUL_KIND[s] ?? 'neutral'}>{label(s)}</Badge>;
export const NoteBadge = ({ s }: { s: string }) => <Badge kind={NOTE_KIND[s] ?? 'neutral'}>{s === 'manual_action_required' ? 'manual action required' : s === 'sent' ? 'sent / accepted by provider' : label(s)}</Badge>;

export function PageHeader({ title, actions, sub }: { title: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function dueLabel(due: number | null, now = Date.now()) {
  if (!due) return { text: '—', overdue: false };
  const diff = due - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600_000), m = Math.floor((abs % 3600_000) / 60_000);
  const span = h ? `${h}h ${m}m` : `${m}m`;
  return { text: diff < 0 ? `overdue by ${span}` : `due in ${span}`, overdue: diff < 0 };
}

export function toLocalInput(t: number | null | undefined) {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function Notice({ msg }: { msg: { kind: 'ok' | 'bad' | 'warn' | 'info'; text: string; details?: unknown } | null }) {
  if (!msg) return null;
  const cls = { ok: 'border-ok/40 bg-ok/10 text-ok', bad: 'border-bad/40 bg-bad/10 text-bad', warn: 'border-warn/40 bg-warn/10 text-warn', info: 'border-blue/40 bg-blue/10 text-[#7cc4ff]' }[msg.kind];
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>
      {msg.text}
      {Array.isArray(msg.details) && msg.details.length > 0 && <ul className="mt-2 list-disc ps-5 text-text/90">{msg.details.map((d, i) => <li key={i}>{typeof d === 'string' ? d : JSON.stringify(d)}</li>)}</ul>}
    </div>
  );
}

export const errMsg = (e: unknown) => {
  const err = e as ApiError;
  return { kind: 'bad' as const, text: err?.message || 'Request failed', details: err?.details };
};
