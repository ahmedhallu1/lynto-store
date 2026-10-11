import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Link, useLocation } from '../lib/router';
import { ApiError, api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { compressReceipt } from '../lib/compress';
import { trackPurchaseOnce } from '../lib/pixel';
import { Icon } from '../components/icons';
import { Alert, Badge, Button, CopyButton, Field, Input, Select, Spinner, Textarea, cx } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';

type OrderView = {
  number: string; created_at: number; total_piastres: number; payment_status: string; fulfillment_status: string; rejection_reason: string | null;
  verified_at: number | null; delivery_due_at: number | null; delivered_at: number | null; cancelled_at: number | null;
  refund: { requested_at: number; refunded_at: number | null; amount_piastres: number | null } | null;
  payment_method_id: string;
  payment_destination: null | { id: string; type: string; label_ar: string; label_en: string; account: string; account_name: string; bank_name: string; iban: string; wallet_provider: string; instapay_link: string; instructions_ar: string; instructions_en: string };
  available_methods: Array<{ id: string; label_ar: string; label_en: string }>;
  can_upload_proof: boolean; can_cancel: boolean;
  proofs: Array<{ status: string; reject_reason: string | null; transaction_ref: string; created_at: number }>;
  items: Array<{ id: string; product_title_ar: string; product_title_en: string; plan_name_ar: string; plan_name_en: string; qty: number; line_total_piastres: number; fields: Record<string, string>;
    fulfillment_status: string; delivered_at: number | null; activated_at: number | null; expires_at: number | null; guarantee_until: number | null; is_perpetual: boolean;
    delivery: null | { via: string; kind: string; created_at: number; details: string | null; note: string } }>;
  timeline: Array<{ type: string; data: any; created_at: number }>;
  support: { whatsapp: string; email: string };
};

const statusKind = (s: string) => (['verified', 'delivered'].includes(s) ? 'ok' : ['rejected', 'cancelled'].includes(s) ? 'bad' : ['refund_requested', 'refunded', 'partially_delivered'].includes(s) ? 'warn' : s === 'processing' ? 'info' : 'cyan');

export function OrderPage({ number }: { number: string }) {
  const { t, href, lang, pick } = useI18n();
  const { hash } = useLocation();
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('k') ?? '';
  const [order, setOrder] = useState<OrderView | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  usePageTitle(t('order.title', { number }), { noindex: true });

  const load = useCallback(() => {
    if (!key) { setState('missing'); return; }
    api.get<{ order: OrderView }>(`/api/public/orders/${encodeURIComponent(number)}`, { 'x-order-key': key })
      .then((r) => { setOrder(r.order); setState('ok'); try { sessionStorage.setItem('lynto_support_order', JSON.stringify({ number, key })); } catch { /* ignore */ } })
      .catch((e: ApiError) => setState(e.status === 404 ? 'missing' : 'error'));
  }, [number, key]);
  useEffect(load, [load]);
  useEffect(() => {
    if (order && ['verified', 'refund_requested', 'refunded'].includes(order.payment_status)) trackPurchaseOnce(order.number, order.total_piastres / 100);
  }, [order?.payment_status]);

  if (state === 'loading') return <Spinner label={t('common.loading')} />;
  if (state !== 'ok' || !order) return <div className="mx-auto max-w-2xl px-4 py-16"><Alert kind={state === 'error' ? 'bad' : 'warn'} title={state === 'error' ? t('common.error') : t('order.notFound')}><Link href={href('/support')} className="underline">{t('support.form')}</Link></Alert></div>;

  const link = window.location.href;
  const awaitingPayment = ['awaiting_transfer', 'rejected', 'proof_submitted'].includes(order.payment_status);
  const dest = order.payment_destination;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('order.title', { number: '' })}<span className="ltr inline-block">{order.number}</span></h1>
          <p className="text-sm text-dim">{dateTime(order.created_at, lang)}</p>
        </div>
        <p className="text-2xl font-bold price">{money(order.total_piastres, lang)}</p>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <Icon.alert className="text-warn shrink-0" />
        <p className="flex-1 text-muted">{t('order.save')}</p>
        <CopyButton value={link} label={t('order.copyLink')} copiedLabel={t('order.copied')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4"><p className="text-xs text-dim">{t('order.payment')}</p><Badge kind={statusKind(order.payment_status) as any} className="mt-1 text-sm">{t(`status.${order.payment_status}` as any)}</Badge></div>
        <div className="card p-4"><p className="text-xs text-dim">{t('order.delivery')}</p><Badge kind={statusKind(order.fulfillment_status) as any} className="mt-1 text-sm">{t(`status.${order.fulfillment_status}` as any)}</Badge></div>
      </div>

      {order.payment_status === 'rejected' && <Alert kind="bad" title={t('order.rejected')}>{order.rejection_reason}</Alert>}
      {order.payment_status === 'verified' && order.fulfillment_status !== 'delivered' && (
        <Alert kind="ok" title={t('order.preparing')}>
          {order.delivery_due_at && <p>{t('order.due')} <strong>{dateTime(order.delivery_due_at, lang)}</strong> ({t('order.cairo')})</p>}
        </Alert>
      )}
      {order.refund && <Alert kind="warn" title={t('order.refund')}>{order.refund.refunded_at ? t('order.refund.done', { amount: money(order.refund.amount_piastres, lang) }) : t('order.refund.requested')}</Alert>}

      {awaitingPayment && dest && <PaymentBox order={order} onChange={load} orderKey={key} />}
      {order.can_upload_proof && <ProofForm number={order.number} orderKey={key} onDone={load} hasProof={order.payment_status === 'proof_submitted'} />}
      {order.proofs.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold">{t('order.proof.history')}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.proofs.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">{dateTime(p.created_at, lang)} {p.transaction_ref && <span className="ltr inline-block">· {p.transaction_ref}</span>}</span>
                <Badge kind={p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'bad' : 'neutral'}>{p.status === 'pending' ? t('status.proof_submitted') : p.status === 'accepted' ? t('status.verified') : p.status === 'rejected' ? t('status.rejected') : '—'}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">{t('order.items')}</h2>
        <ul className="mt-3 divide-y divide-line/60">
          {order.items.map((it) => <OrderItem key={it.id} it={it} />)}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">{t('order.timeline')}</h2>
        <ol className="mt-3 space-y-3 border-s border-line ps-4">
          {order.timeline.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -start-[1.4rem] top-1.5 size-2.5 rounded-full bg-cyan" aria-hidden />
              <p className="text-sm">{t(`event.${e.type}` as any, { title: pick(e.data?.title_ar ?? '', e.data?.title_en ?? '') })}{e.type === 'proof_rejected' && e.data?.reason ? ` — ${e.data.reason}` : ''}</p>
              <p className="text-xs text-dim">{dateTime(e.created_at, lang)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-muted">{t('order.help')}</p>
        <div className="flex flex-wrap gap-2">
          {order.support.whatsapp && <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-cyan/60" target="_blank" rel="noopener noreferrer"
            href={`https://wa.me/${order.support.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`${pick('طلب رقم', 'Order')} ${order.number}`)}`}><Icon.whatsapp width={18} height={18} /> {t('support.whatsapp')}</a>}
          <Link href={href('/support')} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:border-cyan/60">{t('support.form')}</Link>
          {order.can_cancel && <CancelButton number={order.number} orderKey={key} onDone={load} />}
        </div>
      </section>
    </div>
  );
}

function PaymentBox({ order, orderKey, onChange }: { order: OrderView; orderKey: string; onChange: () => void }) {
  const { t, lang, pick } = useI18n();
  const d = order.payment_destination!;
  const [busy, setBusy] = useState(false);
  const row = (label: string, value: string, copy = true) => value ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/50 px-3 py-2.5">
      <div><p className="text-xs text-dim">{label}</p><p className="font-semibold ltr text-start break-all">{value}</p></div>
      {copy && <CopyButton value={value} label={t('order.copy')} copiedLabel={t('order.copied')} />}
    </div>
  ) : null;
  return (
    <section className="card glow space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">{d.type === 'bank' ? <Icon.bank className="text-cyan" /> : <Icon.wallet className="text-cyan" />} {t('order.pay.title')} {pick(d.label_ar, d.label_en)}</h2>
      {row(t('order.pay.amount'), money(order.total_piastres, 'en').replace('EGP ', ''), true)}
      <p className="-mt-1 text-xs text-dim">{lang === 'ar' ? 'جنيه مصري' : 'Egyptian pounds'}</p>
      {row(d.type === 'wallet' ? `${t('order.pay.account')} (${d.wallet_provider})` : t('order.pay.account'), d.account)}
      {row(t('order.pay.name'), d.account_name, false)}
      {d.type === 'bank' && row(t('order.pay.bank'), d.bank_name, false)}
      {d.type === 'bank' && row(t('order.pay.iban'), d.iban)}
      {row(t('order.pay.reference'), order.number)}
      {pick(d.instructions_ar, d.instructions_en) && <p className="text-sm text-muted whitespace-pre-line">{pick(d.instructions_ar, d.instructions_en)}</p>}
      {d.instapay_link && <a href={d.instapay_link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan/50 px-4 font-semibold text-cyan">{t('order.pay.openInstapay')} <Icon.external width={16} height={16} /></a>}
      {order.available_methods.length > 1 && order.payment_status !== 'proof_submitted' && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t('order.pay.change')}
          <Select className="w-auto" value={order.payment_method_id} disabled={busy} onChange={async (e) => {
            setBusy(true);
            try { await api.post(`/api/public/orders/${order.number}/payment-method`, { method_id: e.target.value }, { 'x-order-key': orderKey }); onChange(); } finally { setBusy(false); }
          }}>
            {order.available_methods.map((m) => <option key={m.id} value={m.id}>{pick(m.label_ar, m.label_en)}</option>)}
          </Select>
        </label>
      )}
    </section>
  );
}

function ProofForm({ number, orderKey, onDone, hasProof }: { number: string; orderKey: string; onDone: () => void; hasProof: boolean }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [open, setOpen] = useState(!hasProof);
  if (!open) return <div className="flex flex-wrap items-center gap-3"><Alert kind="ok">{t('order.proof.done')}</Alert><Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{t('order.proof.again')}</Button></div>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setMsg({ kind: 'bad', text: t('order.proof.file') }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', await compressReceipt(file));
      fd.append('transaction_ref', ref);
      fd.append('note', note);
      await api.post(`/api/public/orders/${number}/proof`, fd, { 'x-order-key': orderKey });
      setMsg({ kind: 'ok', text: t('order.proof.done') });
      setFile(null); setOpen(false);
      onDone();
    } catch (err) {
      setMsg({ kind: 'bad', text: (err as ApiError).message || t('common.error') });
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon.receipt className="text-cyan" /> {t('order.proof.title')}</h2>
      <Field label={t('order.proof.file')} required htmlFor="proof">
        <label className="flex min-h-14 cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-ink/50 p-3 text-sm hover:border-cyan/60 focus-within:border-cyan">
          <input id="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-semibold"><Icon.upload width={16} height={16} /> {t('order.proof.choose')}</span>
          <span className={cx('min-w-0 truncate', file ? 'text-text ltr' : 'text-dim')}>{file ? file.name : t('order.proof.none')}</span>
        </label>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('order.proof.ref')} htmlFor="ref"><Input id="ref" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} /></Field>
        <Field label={t('order.proof.note')} htmlFor="note"><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Button type="submit" loading={busy}><Icon.upload width={18} height={18} /> {busy ? t('order.proof.uploading') : t('order.proof.submit')}</Button>
    </form>
  );
}

function OrderItem({ it }: { it: OrderView['items'][number] }) {
  const { t, lang, pick } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold"><bdi>{pick(it.product_title_ar, it.product_title_en)}</bdi></p>
          <p className="text-sm text-muted"><bdi>{pick(it.plan_name_ar, it.plan_name_en)}</bdi> <span className="ltr inline-block">×{it.qty}</span></p>
          {Object.keys(it.fields).length > 0 && <p className="text-xs text-dim ltr text-start">{Object.values(it.fields).join(' · ')}</p>}
        </div>
        <div className="text-end">
          <p className="font-semibold price">{money(it.line_total_piastres, lang)}</p>
          <Badge kind={statusKind(it.fulfillment_status) as any}>{t(`status.${it.fulfillment_status}` as any)}</Badge>
        </div>
      </div>
      {it.fulfillment_status === 'delivered' && it.delivery && (
        <div className="mt-3 rounded-xl border border-ok/30 bg-ok/5 p-3">
          {it.delivery.via === 'portal' && it.delivery.details ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('order.details')}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setShow((v) => !v)}><Icon.eye width={14} height={14} /> {show ? t('order.hide') : t('order.reveal')}</Button>
                  {show && <CopyButton value={it.delivery.details} label={t('order.copy')} copiedLabel={t('order.copied')} />}
                </div>
              </div>
              {show && <pre className={cx('mt-2 whitespace-pre-wrap break-words rounded-lg bg-ink/70 p-3 text-sm ltr text-start font-sans')}>{it.delivery.details}</pre>}
            </>
          ) : <p className="text-sm text-muted">{t('order.deliveredExternal')}</p>}
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-3">
            {it.activated_at && <div><dt className="inline">{t('order.activated')}: </dt><dd className="inline">{dateTime(it.activated_at, lang, false)}</dd></div>}
            {it.expires_at && <div><dt className="inline">{t('order.expires')}: </dt><dd className="inline">{dateTime(it.expires_at, lang, false)}</dd></div>}
            {it.guarantee_until && <div><dt className="inline">{t('order.guaranteeUntil')}: </dt><dd className="inline">{dateTime(it.guarantee_until, lang, false)}</dd></div>}
          </dl>
        </div>
      )}
    </li>
  );
}

function CancelButton({ number, orderKey, onDone }: { number: string; orderKey: string; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="danger" loading={busy} onClick={async () => {
      if (!window.confirm(t('order.cancelConfirm'))) return;
      setBusy(true);
      try { await api.post(`/api/public/orders/${number}/cancel`, {}, { 'x-order-key': orderKey }); onDone(); } finally { setBusy(false); }
    }}>{t('order.cancel')}</Button>
  );
}
