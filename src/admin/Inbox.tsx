import { useState } from 'react';
import { Link } from '../lib/router';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Card, Select, Spinner, Textarea, cx } from '../components/ui';
import { NoteBadge, Notice, PageHeader, errMsg, label, useAdmin, when } from './common';

export function Inbox() {
  const [tab, setTab] = useState<'notifications' | 'support' | 'expiring'>('notifications');
  return (
    <>
      <PageHeader title="Notifications & support" />
      <div className="mb-4 flex gap-2">
        {(['notifications', 'support', 'expiring'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('rounded-full border px-3 py-1.5 text-sm capitalize', tab === t ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted')}>{t === 'expiring' ? 'Expiring subscriptions' : t}</button>
        ))}
      </div>
      {tab === 'notifications' ? <Notifications /> : tab === 'support' ? <SupportList /> : <Expiring />}
    </>
  );
}

function Notifications() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useAdmin<{ notifications: any[] }>(`/notifications${status ? `?status=${status}` : ''}`, [status]);
  const [msg, setMsg] = useState<any>(null);
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm"><span className="text-muted">Status</span>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">all</option><option value="manual_action_required">manual action required</option><option value="failed">failed</option><option value="pending">pending</option><option value="sent">sent / accepted</option><option value="delivered">delivered</option>
        </Select>
      </div>
      <Notice msg={msg} />
      {error && <Alert kind="bad" title={error} />}
      {!data ? <Spinner /> : data.notifications.length === 0 ? <p className="text-muted">No notifications.</p> : (
        <div className="space-y-2">
          {data.notifications.map((n) => (
            <Card key={n.id} className="!p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{n.number ? <Link href={`/admin/orders/${n.order_id}`} className="font-mono text-cyan">{n.number}</Link> : <span className="text-dim">store</span>} · {label(n.event)} · {n.audience} · {n.channel}{n.provider ? ` · ${n.provider}` : ''}</span>
                <NoteBadge s={n.status} />
              </div>
              <p className="text-xs text-dim">{n.recipient} · attempts {n.attempts} · {when(n.updated_at)}</p>
              {n.last_error && <p className="text-xs text-bad">{n.last_error}</p>}
              {n.status === 'failed' && <Button size="sm" variant="ghost" onClick={async () => { try { await adminApi.post(`/notifications/${n.id}/retry`); reload(); } catch (e) { setMsg(errMsg(e)); } }}>Retry</Button>}
              {n.status === 'manual_action_required' && n.order_id && <Link href={`/admin/orders/${n.order_id}`} className="text-xs text-cyan">Open order to send manually →</Link>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function SupportList() {
  const { data, error, reload } = useAdmin<{ requests: any[] }>('/support');
  const [edit, setEdit] = useState<Record<string, { status: string; admin_notes: string }>>({});
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner />;
  if (!data.requests.length) return <p className="text-muted">No support requests yet.</p>;
  return (
    <div className="space-y-3">
      {data.requests.map((r) => {
        const e = edit[r.id] ?? { status: r.status, admin_notes: r.admin_notes };
        return (
          <Card key={r.id} className="!p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>{r.number}</b> · {r.name} · <span className="font-mono">{r.contact}</span> · {r.topic}</span>
              <Badge kind={r.status === 'closed' ? 'neutral' : r.status === 'open' ? 'warn' : 'info'}>{r.status}</Badge>
            </div>
            <p className="text-xs text-dim">{when(r.created_at)} · {r.lang}{r.order_number && <> · order <Link href={`/admin/orders/${r.order_id}`} className="font-mono text-cyan">{r.order_number}</Link> {r.order_verified ? <Badge kind="ok">verified via order link</Badge> : <Badge kind="warn">not verified — confirm identity before sharing details</Badge>}</>}</p>
            <p className="mt-2 whitespace-pre-line" dir="auto">{r.message}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr_auto] md:items-end">
              <Select value={e.status} onChange={(x) => setEdit({ ...edit, [r.id]: { ...e, status: x.target.value } })}><option value="open">open</option><option value="in_progress">in progress</option><option value="closed">closed</option></Select>
              <Textarea rows={1} placeholder="Internal notes / replacement record" value={e.admin_notes} onChange={(x) => setEdit({ ...edit, [r.id]: { ...e, admin_notes: x.target.value } })} />
              <Button size="sm" variant="secondary" onClick={async () => { await adminApi.put(`/support/${r.id}`, e); reload(); }}>Save</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Expiring() {
  const { data, error } = useAdmin<{ items: any[]; now: number }>('/expiring');
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner />;
  if (!data.items.length) return <p className="text-muted">No subscriptions expiring in the next 30 days.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-3 text-start">Order</th><th className="p-3 text-start">Customer</th><th className="p-3 text-start">Product</th><th className="p-3 text-start">Expires</th><th className="p-3 text-start">Reminder</th></tr></thead>
        <tbody>{data.items.map((i) => (
          <tr key={i.id} className="border-t border-line/60">
            <td className="p-3"><Link href={`/admin/orders/${i.order_id}`} className="font-mono text-cyan">{i.number}</Link></td>
            <td className="p-3">{i.customer_name}</td>
            <td className="p-3">{i.product_title_en} — {i.plan_name_en}</td>
            <td className={cx('p-3', i.expires_at < data.now && 'text-bad')}>{when(i.expires_at, false)}</td>
            <td className="p-3 text-xs">{i.renewal_reminded_at ? `sent ${when(i.renewal_reminded_at)}` : i.renewal_optin ? 'scheduled' : 'customer did not opt in'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
