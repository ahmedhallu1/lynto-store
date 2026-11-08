import { useState } from 'react';
import { Link, navigate, useLocation } from '../lib/router';
import { adminApi } from '../lib/api';
import { piastresToEGPString } from '../../shared/money';
import { Alert, Badge, Button, Card, CopyButton, Field, Input, Select, Spinner, Textarea, cx } from '../components/ui';
import { FulBadge, NoteBadge, Notice, PageHeader, PayBadge, dueLabel, egp, errMsg, fromLocalInput, label, toLocalInput, useAdmin, when } from './common';

const VIEWS = [
  ['all', 'All'], ['proofs', 'Proofs to review'], ['awaiting_transfer', 'Awaiting transfer'], ['to_deliver', 'To deliver'], ['overdue', 'Overdue'],
  ['delivered', 'Delivered'], ['refunds', 'Refunds'], ['cancelled', 'Cancelled'], ['website', 'From website'], ['sheet', 'From cashier sheet'],
] as const;

export function OrdersList() {
  const { search } = useLocation();
  const view = search.get('view') ?? 'all';
  const [q, setQ] = useState(search.get('q') ?? '');
  const [query, setQuery] = useState(q);
  const { data, error, loading } = useAdmin<{ orders: any[]; now: number }>(`/orders?view=${view}&q=${encodeURIComponent(query)}`, [view, query]);
  return (
    <>
      <PageHeader title="Orders" actions={<a className="inline-flex min-h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold hover:border-cyan/60" href="/api/admin/export/orders.csv">Export CSV</a>} />
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <Input placeholder="Search order number, name, email, WhatsApp, transfer reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {VIEWS.map(([k, l]) => (
          <button key={k} onClick={() => navigate(`/admin/orders?view=${k}`)} className={cx('whitespace-nowrap rounded-full border px-3 py-1.5 text-sm', view === k ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted')}>{l}</button>
        ))}
      </div>
      {error && <Alert kind="bad" title={error} />}
      {!data && loading && <Spinner />}
      {data && (data.orders.length === 0 ? <p className="text-muted">No orders.</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-start text-xs text-muted"><tr>
              <th className="p-3 text-start">Order</th><th className="p-3 text-start">Customer</th><th className="p-3 text-start">Total</th><th className="p-3 text-start">Payment</th><th className="p-3 text-start">Delivery</th><th className="p-3 text-start">Due / created</th>
            </tr></thead>
            <tbody>
              {data.orders.map((o) => {
                const d = dueLabel(o.delivery_due_at, data.now);
                return (
                  <tr key={o.id} className="border-t border-line/60 hover:bg-text/[0.04] cursor-pointer" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                    <td className="p-3 whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-mono text-cyan">{o.number}</Link></td>
                    <td className="p-3">{o.source === 'sheet'
                      ? <><Badge kind="info">Cashier sheet</Badge>{o.source_ref && <div className="mt-1 font-mono text-xs text-dim">{o.source_ref}</div>}</>
                      : <>{o.customer_name}<div className="text-xs text-dim">{o.customer_whatsapp}</div></>}</td>
                    <td className="p-3 font-semibold">{egp(o.total_piastres)}{o.source === 'sheet' && o.verified_amount_piastres !== o.total_piastres && <div className="text-xs font-normal text-dim">received {egp(o.verified_amount_piastres)}</div>}</td>
                    <td className="p-3"><PayBadge s={o.payment_status} /></td>
                    <td className="p-3"><FulBadge s={o.fulfillment_status} /></td>
                    <td className="p-3 text-xs">{o.payment_status === 'verified' && o.fulfillment_status !== 'delivered' ? <span className={d.overdue ? 'text-bad font-semibold' : ''}>{d.text}</span> : when(o.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdmin<any>(`/orders/${id}`);
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner />;
  const o = data.order;
  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg({ kind: r?.already ? 'info' : 'ok', text: r?.already ? 'Already done — no duplicate action was taken.' : ok });
      reload();
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  const due = dueLabel(o.delivery_due_at);
  const pm = data.payment_method;
  return (
    <>
      <PageHeader
        title={<span className="font-mono">{o.number}</span>}
        sub={<>Created {when(o.created_at)} · Total <b>{egp(o.total_piastres)}</b> · via {pm ? pm.label_en : o.payment_method_id}</>}
        actions={<><PayBadge s={o.payment_status} /><FulBadge s={o.fulfillment_status} /></>}
      />
      <div className="mb-4"><Notice msg={msg} /></div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <PaymentPanel data={data} busy={busy} act={act} />
          <DeliveryPanel data={data} busy={busy} act={act} />
          <RefundPanel data={data} busy={busy} act={act} />
        </div>
        <div className="space-y-4">
          {o.source === 'sheet' ? (
            <Card>
              <h2 className="font-semibold">Imported from the cashier sheet</h2>
              <p className="mt-2 text-sm">Received <b>{egp(o.verified_amount_piastres)}</b> on {when(o.verified_at)}{o.source_ref ? <> · transaction <span className="font-mono">{o.source_ref}</span></> : null}.</p>
              <p className="mt-1 text-sm text-muted">Matched to the nearest catalogue price{data.items.length > 1 ? 's' : ''}: items total {egp(o.total_piastres)}. No customer details are stored and no messages are sent for imported orders.</p>
            </Card>
          ) : (<>
          <Card>
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-2">{o.customer_name}</p>
            <p className="text-sm text-muted">{o.customer_email}</p>
            <p className="text-sm text-muted">{o.customer_whatsapp} · prefers {o.preferred_channel}</p>
            <p className="mt-1 text-xs text-dim">WhatsApp updates: {o.whatsapp_optin ? 'opted in' : 'not opted in'} · Renewal reminders: {o.renewal_optin ? 'yes' : 'no'} · Ad tracking consent: {o.tracking_consent ? 'yes' : 'no'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-sm" href={`https://wa.me/${o.customer_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">Open WhatsApp chat</a>
              <a className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-sm" href={`mailto:${o.customer_email}?subject=${encodeURIComponent('LYnto order ' + o.number)}`}>Email</a>
            </div>
            {o.payment_status === 'verified' && o.fulfillment_status !== 'delivered' && <p className={cx('mt-3 text-sm', due.overdue ? 'text-bad font-semibold' : 'text-muted')}>Delivery deadline {when(o.delivery_due_at)} — {due.text}</p>}
            {o.anonymized_at ? <p className="mt-3 text-xs text-warn">Personal data erased on {when(o.anonymized_at)}.</p> : (
              <Button size="sm" variant="ghost" className="mt-3" loading={busy === 'erase'} onClick={() => { if (confirm('Erase this customer\'s personal data (name, email, WhatsApp, receipts, delivery details, support messages) from ALL their orders? Amounts and dates stay for accounting. This cannot be undone.')) act('erase', async () => { const r = await adminApi.post<{ anonymized: string[]; skipped: Array<{ number: string; reason: string }> }>('/privacy/erase', { email: o.customer_email, whatsapp: o.customer_whatsapp, confirm: true }); if (r.skipped.length) throw new Error('Erased ' + r.anonymized.length + ' order(s). Skipped: ' + r.skipped.map((s) => s.number + ' (' + s.reason + ')').join(', ')); return r; }, 'Personal data erased.'); }}>Erase this customer's personal data</Button>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Customer's private order link</h2>
            <p className="mt-1 text-xs text-dim">Anyone with this link can see the order and its delivery details. Share it only with the customer.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton value={data.tracking_url} label="Copy link" copiedLabel="Copied" />
              <Button size="sm" variant="ghost" loading={busy === 'link'} onClick={() => { if (confirm('Generate a new link? The old link will stop working.')) act('link', async () => { const r = await adminApi.post<{ url: string }>(`/orders/${id}/regenerate-link`); await navigator.clipboard?.writeText(r.url).catch(() => {}); return r; }, 'New link generated and copied.'); }}>Regenerate</Button>
            </div>
          </Card>
          </>)}
          <NotificationsPanel data={data} reload={reload} setMsg={setMsg} />
          <NotesPanel id={id} initial={o.internal_notes} />
          <Card>
            <h2 className="font-semibold">Timeline & audit</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {data.events.map((e: any) => (
                <li key={e.id} className="border-s border-line ps-3">
                  <p><span className={e.visibility === 'customer' ? 'text-text' : 'text-muted'}>{label(e.type)}</span> <span className="text-xs text-dim">· {e.actor} · {e.visibility}</span></p>
                  {Object.keys(e.data ?? {}).length > 0 && <p className="text-xs text-dim break-all">{JSON.stringify(e.data)}</p>}
                  <p className="text-xs text-dim">{when(e.created_at)}</p>
                </li>
              ))}
            </ol>
          </Card>
          {['awaiting_transfer', 'proof_submitted', 'rejected'].includes(o.payment_status) && (
            <Card>
              <h2 className="font-semibold">Cancel order</h2>
              <CancelForm onSubmit={(reason) => act('cancel', () => adminApi.post(`/orders/${id}/cancel`, { reason }), 'Order cancelled.')} busy={busy === 'cancel'} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function PaymentPanel({ data, busy, act }: any) {
  const o = data.order;
  const [amount, setAmount] = useState(piastresToEGPString(o.total_piastres));
  const [reference, setReference] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [reason, setReason] = useState('');
  const open = ['awaiting_transfer', 'proof_submitted', 'rejected'].includes(o.payment_status);
  return (
    <Card>
      <h2 className="font-semibold">Payment</h2>
      {data.payment_method && <p className="mt-1 text-sm text-muted">Customer was told to pay to: <b>{data.payment_method.label_en}</b> — {data.payment_method.account} ({data.payment_method.account_name})</p>}
      <div className="mt-3 space-y-2">
        {data.proofs.length === 0 && <p className="text-sm text-dim">No receipt uploaded yet.</p>}
        {data.proofs.map((p: any) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
            <div>
              <a href={`/api/admin/proofs/${p.id}/file`} target="_blank" rel="noopener" className="font-semibold text-cyan">View receipt ({p.mime.split('/')[1]}, {Math.round(p.size / 1024)} KB) ↗</a>
              <p className="text-xs text-dim">{when(p.created_at)}{p.transaction_ref && <> · ref <span className="font-mono">{p.transaction_ref}</span></>}{p.payer_note && <> · “{p.payer_note}”</>}</p>
              {p.reject_reason && <p className="text-xs text-bad">Rejected: {p.reject_reason}</p>}
            </div>
            <Badge kind={p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'bad' : p.status === 'pending' ? 'cyan' : 'neutral'}>{p.status}</Badge>
          </div>
        ))}
      </div>
      {o.payment_status === 'verified' || o.verified_at ? (
        <p className="mt-3 text-sm text-ok">Verified {egp(o.verified_amount_piastres)} · ref <span className="font-mono">{o.verified_reference}</span> · {when(o.verified_at)}</p>
      ) : null}
      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form className="space-y-3 rounded-xl border border-ok/30 p-3" onSubmit={(e) => { e.preventDefault(); act('approve', () => adminApi.post(`/orders/${o.id}/approve`, { amount_egp: amount, reference, confirm_mismatch: mismatch }), 'Payment approved. Delivery clock started.'); }}>
            <p className="text-sm font-semibold text-ok">Approve payment</p>
            <p className="text-xs text-muted">Only approve after you see the money in your receiving account. A screenshot is not proof.</p>
            <Field label="Amount received (EGP)" htmlFor="amt"><Input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Transfer reference / sender" htmlFor="ref"><Input id="ref" required value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={mismatch} onChange={(e) => setMismatch(e.target.checked)} /> Amount differs from order total — approve anyway</label>
            <Button type="submit" loading={busy === 'approve'} className="w-full">Approve payment</Button>
          </form>
          <form className="space-y-3 rounded-xl border border-bad/30 p-3" onSubmit={(e) => { e.preventDefault(); act('reject', () => adminApi.post(`/orders/${o.id}/reject`, { reason }), 'Proof rejected. The customer can upload a new receipt.'); }}>
            <p className="text-sm font-semibold text-bad">Reject proof</p>
            <p className="text-xs text-muted">The reason is shown to the customer. They can upload a new receipt.</p>
            <Field label="Reason (customer-facing)" htmlFor="rr"><Textarea id="rr" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: المبلغ لسه موصلش حسابنا / الإيصال مش واضح" /></Field>
            <Button type="submit" variant="danger" loading={busy === 'reject'} className="w-full">Reject proof</Button>
          </form>
        </div>
      )}
    </Card>
  );
}

function DeliveryPanel({ data, busy, act }: any) {
  const o = data.order;
  const items: any[] = data.items;
  const pending = items.filter((i) => ['not_started', 'processing'].includes(i.fulfillment_status));
  const [sel, setSel] = useState<Record<string, boolean>>(Object.fromEntries(pending.map((i) => [i.id, true])));
  const [details, setDetails] = useState<Record<string, string>>({});
  const [activated, setActivated] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const chosen = pending.filter((i) => sel[i.id]);
  const deliver = (mode: 'portal' | 'external') => act(mode, () => adminApi.post(`/orders/${o.id}/deliver`, {
    mode, note, items: chosen.map((i) => ({ item_id: i.id, details: details[i.id] ?? '', activated_at: fromLocalInput(activated[i.id] ?? '') ?? undefined })),
  }), mode === 'portal' ? 'Delivered. Details are now on the customer\'s order page.' : 'Marked as delivered outside the website.');
  return (
    <Card>
      <h2 className="font-semibold">Items & delivery</h2>
      <ul className="mt-3 space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                {pending.includes(it) && o.payment_status === 'verified' && <input type="checkbox" className="me-2 accent-cyan" checked={!!sel[it.id]} onChange={(e) => setSel({ ...sel, [it.id]: e.target.checked })} aria-label="Select item" />}
                <b>{it.product_title_en}</b> — {it.plan_name_en} ×{it.qty} <span className="text-xs text-dim">({label(it.plan_type)})</span>
                {Object.keys(it.customer_fields).length > 0 && <p className="mt-1 text-xs text-muted">{Object.entries(it.customer_fields).map(([k, v]) => <span key={k} className="me-3">{k}: <span className="font-mono text-text">{String(v)}</span></span>)}</p>}
              </div>
              <div className="text-end"><p className="font-semibold">{egp(it.line_total_piastres)}</p><FulBadge s={it.fulfillment_status} /></div>
            </div>
            {it.fulfillment_status === 'delivered' && (
              <div className="mt-2 text-xs text-muted space-y-1">
                <p>Delivered {when(it.delivered_at)} via {it.delivered_via} · activated {when(it.activated_at, false)} · expires {it.expires_at ? when(it.expires_at, false) : 'no expiry'} · guarantee until {when(it.guarantee_until, false)}</p>
                {data.deliveries.filter((d: any) => d.item_id === it.id).map((d: any) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2">
                    <span>{d.kind} · {d.via} · {when(d.created_at)}</span>
                    {d.has_details ? (revealed[d.id] !== undefined
                      ? <pre className="w-full whitespace-pre-wrap rounded-lg bg-ink/70 p-2 text-text">{revealed[d.id]}</pre>
                      : <button className="text-cyan" onClick={async () => { const r = await adminApi.get<{ details: string }>(`/deliveries/${d.id}`); setRevealed({ ...revealed, [d.id]: r.details }); }}>show details</button>) : null}
                  </div>
                ))}
                <ItemTools orderId={o.id} it={it} busy={busy} act={act} />
              </div>
            )}
            {pending.includes(it) && o.payment_status === 'verified' && sel[it.id] && (
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                <Field label="Delivery details for the customer (code, invite link, steps)" htmlFor={`d-${it.id}`} hint="Encrypted and shown only on the customer's private order page. Not sent in notifications.">
                  <Textarea id={`d-${it.id}`} rows={3} dir="auto" value={details[it.id] ?? ''} onChange={(e) => setDetails({ ...details, [it.id]: e.target.value })} />
                </Field>
                <Field label="Activation date (default: now)" htmlFor={`a-${it.id}`} hint={it.duration_value ? `Expiry auto = activation + ${it.duration_value} ${it.duration_unit}(s)` : 'No expiry for this plan type'}>
                  <Input id={`a-${it.id}`} type="datetime-local" value={activated[it.id] ?? ''} onChange={(e) => setActivated({ ...activated, [it.id]: e.target.value })} />
                </Field>
              </div>
            )}
          </li>
        ))}
      </ul>
      {o.payment_status === 'verified' && pending.length > 0 && (
        <div className="mt-4 space-y-3">
          <Field label="Internal note (optional)" htmlFor="dn"><Input id="dn" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === 'portal'} disabled={!chosen.length} onClick={() => deliver('portal')}>Send & complete ({chosen.length})</Button>
            <Button variant="secondary" loading={busy === 'external'} disabled={!chosen.length} onClick={() => { if (confirm('Confirm you already sent these details outside the website (e.g. WhatsApp)?')) deliver('external'); }}>Mark delivered externally</Button>
          </div>
        </div>
      )}
      {o.payment_status !== 'verified' && pending.length > 0 && <p className="mt-3 text-sm text-dim">Approve the payment to start delivery.</p>}
    </Card>
  );
}

function ItemTools({ orderId, it, busy, act }: any) {
  const [open, setOpen] = useState<'' | 'replace' | 'dates'>('');
  const [details, setDetails] = useState('');
  const [dates, setDates] = useState({ a: toLocalInput(it.activated_at), e: toLocalInput(it.expires_at), g: toLocalInput(it.guarantee_until) });
  return (
    <div className="pt-1">
      <button className="me-3 text-cyan" onClick={() => setOpen(open === 'replace' ? '' : 'replace')}>Send replacement</button>
      <button className="text-cyan" onClick={() => setOpen(open === 'dates' ? '' : 'dates')}>Edit dates</button>
      {open === 'replace' && (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} dir="auto" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="New activation details" />
          <Button size="sm" loading={busy === 'replace'} onClick={() => act('replace', () => adminApi.post(`/orders/${orderId}/items/${it.id}/replacement`, { mode: 'portal', details }), 'Replacement recorded and shown to the customer.')}>Send replacement</Button>
        </div>
      )}
      {open === 'dates' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Field label="Activated" htmlFor={`da-${it.id}`}><Input id={`da-${it.id}`} type="datetime-local" value={dates.a} onChange={(e) => setDates({ ...dates, a: e.target.value })} /></Field>
          <Field label="Expires" htmlFor={`de-${it.id}`}><Input id={`de-${it.id}`} type="datetime-local" value={dates.e} onChange={(e) => setDates({ ...dates, e: e.target.value })} /></Field>
          <Field label="Guarantee until" htmlFor={`dg-${it.id}`}><Input id={`dg-${it.id}`} type="datetime-local" value={dates.g} onChange={(e) => setDates({ ...dates, g: e.target.value })} /></Field>
          <Button size="sm" loading={busy === 'dates'} onClick={() => act('dates', () => adminApi.post(`/orders/${orderId}/items/${it.id}/dates`, { activated_at: fromLocalInput(dates.a), expires_at: fromLocalInput(dates.e), guarantee_until: fromLocalInput(dates.g) }), 'Dates updated.')}>Save dates</Button>
        </div>
      )}
    </div>
  );
}

function RefundPanel({ data, busy, act }: any) {
  const o = data.order;
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(piastresToEGPString(o.verified_amount_piastres ?? o.total_piastres));
  const [reference, setReference] = useState('');
  if (!['verified', 'refund_requested', 'refunded'].includes(o.payment_status)) return null;
  return (
    <Card>
      <h2 className="font-semibold">Refund</h2>
      {o.payment_status === 'verified' && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act('refreq', () => adminApi.post(`/orders/${o.id}/refund-request`, { reason }), 'Refund request recorded.'); }}>
          <div className="flex-1 min-w-60"><Field label="Record a refund request — reason" htmlFor="rq"><Input id="rq" required value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
          <Button type="submit" variant="secondary" loading={busy === 'refreq'}>Record request</Button>
        </form>
      )}
      {o.payment_status === 'refund_requested' && (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (confirm('Confirm you have actually sent this refund?')) act('refdone', () => adminApi.post(`/orders/${o.id}/refund-complete`, { amount_egp: amount, reference }), 'Refund marked as completed.'); }}>
          <p className="text-sm text-muted">Requested: {o.refund_reason}. Mark completed only after you have actually transferred the money back — the website cannot reverse transfers.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refunded amount (EGP)" htmlFor="ra"><Input id="ra" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Refund transfer reference" htmlFor="rr2"><Input id="rr2" required value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
          <Button type="submit" variant="danger" loading={busy === 'refdone'}>Mark refund completed</Button>
        </form>
      )}
      {o.payment_status === 'refunded' && <p className="mt-2 text-sm text-warn">Refunded {egp(o.refund_amount_piastres)} on {when(o.refunded_at)} · ref {o.refund_reference}</p>}
    </Card>
  );
}

function NotificationsPanel({ data, reload, setMsg }: any) {
  const [busy, setBusy] = useState('');
  return (
    <Card>
      <h2 className="font-semibold">Notifications</h2>
      {data.notifications.length === 0 ? <p className="mt-2 text-sm text-dim">None.</p> : (
        <ul className="mt-3 space-y-2 text-sm">
          {data.notifications.map((n: any) => (
            <li key={n.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{label(n.event)} · {n.channel}{n.provider ? ` · ${n.provider}` : ''}</span><NoteBadge s={n.status} /></div>
              <p className="text-xs text-dim">{n.recipient} · attempts {n.attempts} · {when(n.updated_at)}</p>
              {n.last_error && <p className="text-xs text-bad">{n.last_error}</p>}
              {n.manual_note && <p className="text-xs text-muted">{n.manual_note}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {(n.status === 'manual_action_required' || n.status === 'failed') && (
                  <>
                    <Button size="sm" variant="secondary" loading={busy === n.id + 'wa'} onClick={async () => { setBusy(n.id + 'wa'); try { const r = await adminApi.get<{ url: string }>(`/notifications/${n.id}/whatsapp`); window.open(r.url, '_blank', 'noopener'); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); } }}>Open WhatsApp with prepared text</Button>
                    <Button size="sm" variant="ghost" loading={busy === n.id + 'm'} onClick={async () => { setBusy(n.id + 'm'); try { await adminApi.post(`/notifications/${n.id}/mark-sent`, { note: 'Sent manually by owner' }); reload(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); } }}>I sent it manually</Button>
                  </>
                )}
                {n.status === 'failed' && <Button size="sm" variant="ghost" loading={busy === n.id + 'r'} onClick={async () => { setBusy(n.id + 'r'); try { await adminApi.post(`/notifications/${n.id}/retry`); reload(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); } }}>Retry</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-dim">“Open WhatsApp” only opens a chat with prepared text — it is not automatic delivery. Mark it as sent after you send it.</p>
    </Card>
  );
}

function NotesPanel({ id, initial }: { id: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState('');
  return (
    <Card>
      <h2 className="font-semibold">Internal notes</h2>
      <Textarea className="mt-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="mt-2 flex items-center gap-3"><Button size="sm" variant="secondary" onClick={async () => { await adminApi.post(`/orders/${id}/notes`, { notes }); setSaved('Saved'); setTimeout(() => setSaved(''), 1500); }}>Save notes</Button><span className="text-xs text-ok">{saved}</span></div>
    </Card>
  );
}

function CancelForm({ onSubmit, busy }: { onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (confirm('Cancel this order?')) onSubmit(reason); }}>
      <div className="flex-1 min-w-48"><Field label="Reason" htmlFor="cr"><Select id="cr" value={reason} onChange={(e) => setReason(e.target.value)} required>
        <option value="">Choose…</option><option>Customer request</option><option>No payment received</option><option>Duplicate order</option><option>Product unavailable</option><option>Other</option>
      </Select></Field></div>
      <Button type="submit" variant="danger" loading={busy}>Cancel order</Button>
    </form>
  );
}
