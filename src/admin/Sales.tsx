import { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Select, Spinner, cx } from '../components/ui';
import { Notice, PageHeader, egp, errMsg, useAdmin, when } from './common';

type Sales = {
  from: number;
  by_source: Array<{ source: string; orders: number; revenue: number }>;
  by_product: Array<{ product_id: string; title: string; units: number; orders: number; value: number; sheet_units: number; website_units: number }>;
  by_month: Array<{ month: string; source: string; orders: number; revenue: number }>;
};
type SyncInfo = {
  config: { enabled: boolean; spreadsheet_id: string; sheet_name: string; start_date: string; run_hour: number; timezone: string };
  state: { cursor: number | null; next_from: number | null; backfill_done: boolean; last_run_at: number | null; last_success_at: number | null; last_error: string | null };
  connected: boolean;
  totals: { orders: number; revenue: number; first_at: number | null; last_at: number | null };
  runs: Array<{ id: number; trigger: string; status: string; fetched: number; imported: number; skipped: number; window_from: number | null; window_to: number | null; error: string | null; started_at: number }>;
};

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months'], [0, 'All time']] as const;

export function SalesPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useAdmin<Sales>(`/sales?days=${days}`, [days]);
  const total = (data?.by_source ?? []).reduce((a, r) => ({ orders: a.orders + r.orders, revenue: a.revenue + r.revenue }), { orders: 0, revenue: 0 });
  const src = (k: string) => data?.by_source.find((r) => r.source === k) ?? { orders: 0, revenue: 0 };
  const months = [...new Set((data?.by_month ?? []).map((m) => m.month))];
  const cell = (month: string, source: string) => data?.by_month.find((m) => m.month === month && m.source === source);
  return (
    <>
      <PageHeader title="Sales" sub="Paid orders from the website and the cashier sheet. Revenue is the amount actually received." />
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map(([d, l]) => (
          <button key={d} onClick={() => setDays(d)} className={cx('rounded-full border px-3 py-1.5 text-sm', days === d ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted')}>{l}</button>
        ))}
      </div>
      {error && <Alert kind="bad" title={error} />}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[['Total', total], ['Website', src('website')], ['Cashier sheet', src('sheet')]].map(([l, v]: any) => (
              <div key={l} className="card p-4">
                <p className="text-xs text-muted">{l}</p>
                <p className="mt-1 text-2xl font-bold">{egp(v.revenue)}</p>
                <p className="text-xs text-dim">{v.orders} paid order{v.orders === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>

          <h2 className="mb-2 mt-6 text-lg font-semibold">By product</h2>
          {data.by_product.length === 0 ? <p className="text-muted">No paid orders in this period.</p> : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-2 text-xs text-muted"><tr>
                  <th className="p-3 text-start">Product</th><th className="p-3 text-end">Units</th><th className="p-3 text-end">Website</th><th className="p-3 text-end">Sheet</th><th className="p-3 text-end">Orders</th><th className="p-3 text-end">Item value</th>
                </tr></thead>
                <tbody>
                  {data.by_product.map((p) => (
                    <tr key={p.product_id} className="border-t border-line/60">
                      <td className="p-3"><Link href={`/admin/products/${p.product_id}`} className="text-cyan">{p.title}</Link></td>
                      <td className="p-3 text-end font-semibold">{p.units}</td>
                      <td className="p-3 text-end">{p.website_units}</td>
                      <td className="p-3 text-end">{p.sheet_units}</td>
                      <td className="p-3 text-end">{p.orders}</td>
                      <td className="p-3 text-end">{egp(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-dim">Item value uses catalogue prices; for sheet orders the matched items can differ slightly from the amount received.</p>

          {months.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-lg font-semibold">By month</h2>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-3 text-start">Month</th><th className="p-3 text-end">Website</th><th className="p-3 text-end">Cashier sheet</th><th className="p-3 text-end">Total</th></tr></thead>
                  <tbody>
                    {months.map((m) => {
                      const w = cell(m, 'website'), sh = cell(m, 'sheet');
                      return (
                        <tr key={m} className="border-t border-line/60">
                          <td className="p-3 font-mono">{m}</td>
                          <td className="p-3 text-end">{w ? `${egp(w.revenue)} · ${w.orders}` : '—'}</td>
                          <td className="p-3 text-end">{sh ? `${egp(sh.revenue)} · ${sh.orders}` : '—'}</td>
                          <td className="p-3 text-end font-semibold">{egp((w?.revenue ?? 0) + (sh?.revenue ?? 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <SheetSyncPanel />
    </>
  );
}

function SheetSyncPanel() {
  const { data, error, reload } = useAdmin<SyncInfo>('/sheet-sync');
  const [form, setForm] = useState<SyncInfo['config'] | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (data) setForm(data.config); }, [data]);
  if (error) return <div className="mt-6"><Alert kind="bad" title={error} /></div>;
  if (!data || !form) return null;
  const st = data.state;
  const running = st.next_from !== null;
  const status = !data.connected ? <Badge kind="warn">Google not connected</Badge>
    : !data.config.enabled ? <Badge>Paused</Badge>
    : st.last_error ? <Badge kind="bad">Last run failed</Badge>
    : running || !st.backfill_done ? <Badge kind="info">Importing…</Badge>
    : <Badge kind="ok">Up to date</Badge>;
  const run = async () => {
    setBusy('run'); setMsg(null);
    try {
      const r = await adminApi.post<{ chunks: number; fetched: number; imported: number; skipped: number; done: boolean }>('/sheet-sync/run');
      setMsg({ kind: 'ok', text: `Read ${r.fetched} credit row(s), imported ${r.imported} new order(s), skipped ${r.skipped} (already imported, decimal or before the start date).${r.done ? '' : ' More rows remain — the import continues automatically every few minutes.'}` });
      reload();
    } catch (e) { setMsg(errMsg(e)); reload(); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      const r = await adminApi.put<{ restart: boolean }>('/sheet-sync', { enabled: form.enabled, spreadsheet_id: form.spreadsheet_id, sheet_name: form.sheet_name, start_date: form.start_date, run_hour: Number(form.run_hour) });
      setMsg({ kind: 'ok', text: r.restart ? 'Saved. The next run re-reads the sheet from the start date (already-imported rows are skipped).' : 'Saved.' });
      reload();
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Cashier sheet import</h2>
        <div className="flex items-center gap-2">{status}<Button size="sm" loading={busy === 'run'} disabled={!data.connected} onClick={run}>Sync now</Button></div>
      </div>
      <p className="mt-1 text-sm text-muted">
        Once a day (after {String(data.config.run_hour).padStart(2, '0')}:00 Cairo) every <b>Credit</b> row of type <b>Transactions</b> with a whole-number amount, dated from {data.config.start_date}, becomes a paid and delivered order
        matched to the nearest product price (1–3 items). No customer details are stored and no messages are sent. The last 7 days are re-checked each day for late entries.
      </p>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <p>Imported orders: <b>{data.totals.orders}</b> · {egp(data.totals.revenue)}</p>
        <p>Last successful sync: <b>{when(st.last_success_at)}</b></p>
        <p>Newest row read: {when(st.cursor)}</p>
        <p><Link href="/admin/orders?view=sheet" className="text-cyan">View imported orders →</Link></p>
      </div>
      {st.last_error && <div className="mt-3"><Alert kind="bad" title="Last run failed">{st.last_error}</Alert></div>}
      {!data.connected && (
        <div className="mt-3"><Alert kind="warn" title="Connect the Google account that owns the sheet">
          Run <code>node scripts/google-connect.mjs &lt;client-secret.json&gt;</code> on the Mac and sign in with read-only access; it stores the credentials as Worker secrets.
        </Alert></div>
      )}
      <div className="mt-3"><Notice msg={msg} /></div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">Settings</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Checkbox label="Import automatically every day" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <span />
          <Field label="Start date (import credits from this day)" htmlFor="sd"><Input id="sd" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="Daily run after (Cairo hour)" htmlFor="rh">
            <Select id="rh" value={form.run_hour} onChange={(e) => setForm({ ...form, run_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </Select>
          </Field>
          <Field label="Spreadsheet ID" htmlFor="sid"><Input id="sid" value={form.spreadsheet_id} onChange={(e) => setForm({ ...form, spreadsheet_id: e.target.value })} /></Field>
          <Field label="Tab name" htmlFor="tab"><Input id="tab" value={form.sheet_name} onChange={(e) => setForm({ ...form, sheet_name: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" size="sm" variant="secondary" loading={busy === 'save'} onClick={save}>Save settings</Button>
      </details>
      {data.runs.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">Recent runs</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-muted"><tr><th className="p-2 text-start">When</th><th className="p-2 text-start">By</th><th className="p-2 text-start">Result</th><th className="p-2 text-end">Read</th><th className="p-2 text-end">Imported</th><th className="p-2 text-end">Skipped</th></tr></thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-t border-line/60">
                    <td className="p-2">{when(r.started_at)}</td>
                    <td className="p-2">{r.trigger === 'cron' ? 'Daily job' : 'Manual'}</td>
                    <td className="p-2">{r.status === 'ok' ? <Badge kind="ok">ok</Badge> : <span className="text-bad">{r.error}</span>}</td>
                    <td className="p-2 text-end">{r.fetched}</td><td className="p-2 text-end">{r.imported}</td><td className="p-2 text-end">{r.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

