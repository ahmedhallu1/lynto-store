import { Link } from '../lib/router';
import { Alert, Card, Spinner } from '../components/ui';
import { PageHeader, dueLabel, egp, label, useAdmin, when, NoteBadge } from './common';

type Dash = {
  now: number;
  counts: Record<string, number>;
  revenue: { verified_all: number; verified_month: number; refunded_all: number; refunded_month: number; paid_orders: number };
  proofs: Array<{ id: string; number: string; customer_name: string; total_piastres: number; payment_method_id: string; updated_at: number }>;
  awaiting_delivery: Array<{ id: string; number: string; customer_name: string; total_piastres: number; delivery_due_at: number; fulfillment_status: string }>;
  attention: Array<{ id: string; order_id: string; event: string; channel: string; status: string; last_error: string | null; number: string | null }>;
  support: Array<{ id: string; number: string; name: string; topic: string; created_at: number }>;
  products: Record<string, number>;
  blockers: string[];
  accepting_orders: boolean;
};

const BLOCKER_TEXT: Record<string, string> = {
  no_payment_method: 'Add at least one complete payment destination (InstaPay, wallet or bank).',
  schedule_missing: 'Set your working days and hours (needed for the 2-working-hour delivery clock).',
  policies_unconfirmed: 'Review and confirm the guarantee & refund terms.',
  support_missing: 'Add a support WhatsApp number or email.',
  store_closed: 'Switch "Accepting orders" on when you are ready.',
};

function Tile({ label: l, value, href, tone }: { label: string; value: string | number; href?: string; tone?: 'warn' | 'bad' | 'ok' }) {
  const inner = (
    <>
      <p className="text-xs text-muted">{l}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</p>
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:border-cyan/60">{inner}</Link> : <div className="card p-4">{inner}</div>;
}

export function Dashboard() {
  const { data, error } = useAdmin<Dash>('/dashboard');
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner label="Loading dashboard…" />;
  const c = data.counts;
  return (
    <>
      <PageHeader title="Dashboard" sub={`Updated ${when(data.now)} (Cairo)`} />
      {data.blockers.length > 0 && (
        <div className="mb-5">
          <Alert kind="warn" title="Checkout is closed until setup is complete">
            <ul className="mt-1 list-disc ps-5">{data.blockers.map((b) => <li key={b}>{BLOCKER_TEXT[b] ?? b}</li>)}</ul>
            <Link href="/admin/setup" className="mt-2 inline-block font-semibold text-cyan">Open setup →</Link>
          </Alert>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Payment proofs to review" value={c.proofs_pending} href="/admin/orders?view=proofs" tone={c.proofs_pending ? 'warn' : undefined} />
        <Tile label="Paid, awaiting delivery" value={c.awaiting_delivery} href="/admin/orders?view=to_deliver" />
        <Tile label="Overdue deliveries" value={c.overdue} href="/admin/orders?view=overdue" tone={c.overdue ? 'bad' : undefined} />
        <Tile label="Notifications needing action" value={c.failed_notifications + c.manual_notifications} href="/admin/inbox" tone={c.failed_notifications ? 'bad' : c.manual_notifications ? 'warn' : undefined} />
        <Tile label="Verified revenue (this month)" value={egp(data.revenue.verified_month)} tone="ok" />
        <Tile label="Refunds (this month)" value={egp(data.revenue.refunded_month)} />
        <Tile label="Verified revenue (all time)" value={egp(data.revenue.verified_all)} />
        <Tile label="Open support requests" value={c.open_support} href="/admin/inbox" />
      </div>
      <p className="mt-2 text-xs text-dim">Revenue counts only payments you verified. Unpaid orders and uploaded receipts are not sales. Refunds are shown separately (net all-time: {egp(data.revenue.verified_all - data.revenue.refunded_all)}).</p>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Payment proofs awaiting review</h2>
          {data.proofs.length === 0 ? <p className="mt-2 text-sm text-dim">Nothing to review.</p> : (
            <ul className="mt-3 divide-y divide-line/60">
              {data.proofs.map((o) => (
                <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-cyan">
                  <span><span className="font-mono">{o.number}</span> · {o.customer_name} <span className="text-xs text-dim">via {o.payment_method_id}</span></span><span className="font-semibold">{egp(o.total_piastres)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Approved orders awaiting delivery (by deadline)</h2>
          {data.awaiting_delivery.length === 0 ? <p className="mt-2 text-sm text-dim">Nothing waiting.</p> : (
            <ul className="mt-3 divide-y divide-line/60">
              {data.awaiting_delivery.map((o) => {
                const d = dueLabel(o.delivery_due_at, data.now);
                return (
                  <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-cyan">
                    <span><span className="font-mono">{o.number}</span> · {o.customer_name} <span className="text-xs text-dim">{label(o.fulfillment_status)}</span></span>
                    <span className={d.overdue ? 'text-bad font-semibold' : 'text-muted'}>{d.text}</span>
                  </Link></li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Failed / manual notifications</h2>
          {data.attention.length === 0 ? <p className="mt-2 text-sm text-dim">All clear.</p> : (
            <ul className="mt-3 divide-y divide-line/60 text-sm">
              {data.attention.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{n.number ? <Link href={`/admin/orders/${n.order_id}`} className="font-mono text-cyan">{n.number}</Link> : '—'} · {label(n.event)} · {n.channel}</span>
                  <NoteBadge s={n.status} />
                  {n.last_error && <span className="w-full text-xs text-bad">{n.last_error}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Catalog</h2>
          <p className="mt-2 text-sm text-muted">Published: <b>{data.products.published ?? 0}</b> · Drafts: <b>{data.products.draft ?? 0}</b> · Archived: <b>{data.products.archived ?? 0}</b></p>
          <p className="mt-2 text-sm text-dim">Suggested products are drafts with empty prices. Approve plans and prices, mark supply as validated, then publish.</p>
          <div className="mt-3 flex gap-3 text-sm"><Link href="/admin/products" className="font-semibold text-cyan">Review products →</Link><Link href="/admin/pricing" className="font-semibold text-cyan">Set prices →</Link></div>
          {data.support.length > 0 && (
            <>
              <h3 className="mt-5 font-semibold">Recent support requests</h3>
              <ul className="mt-2 text-sm text-muted">{data.support.map((s) => <li key={s.id}>{s.number} · {s.name} · {s.topic} · {when(s.created_at)}</li>)}</ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
