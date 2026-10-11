import { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Input, Select, Spinner } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin } from './common';

export function Pricing() {
  const { data, error, reload } = useAdmin<{ products: any[] }>('/products');
  const [rows, setRows] = useState<Record<string, { price_egp: string; status: string; availability: string }>>({});
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    const r: typeof rows = {};
    for (const p of data.products) for (const pl of p.plans) if (pl.status !== 'retired') r[pl.id] = { price_egp: pl.price_egp ?? '', status: pl.status, availability: pl.availability };
    setRows(r);
  }, [data]);
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner />;
  const dirty = data.products.flatMap((p) => p.plans).filter((pl: any) => rows[pl.id] && (rows[pl.id].price_egp !== (pl.price_egp ?? '') || rows[pl.id].status !== pl.status || rows[pl.id].availability !== pl.availability));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await adminApi.post<{ unpublished: string[] }>('/plans/bulk', { plans: dirty.map((pl: any) => ({ id: pl.id, price_egp: rows[pl.id].price_egp || null, status: rows[pl.id].status, availability: rows[pl.id].availability })) });
      setMsg({ kind: r.unpublished.length ? 'warn' : 'ok', text: r.unpublished.length ? `Saved. These products were unpublished because they no longer pass checks: ${r.unpublished.join(', ')}` : `Saved ${dirty.length} plan(s).` });
      reload();
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Plans & prices" sub="Edit EGP prices and approve plans in one place. Approving a plan does not publish the product." actions={<Button onClick={save} loading={busy} disabled={!dirty.length}>Save {dirty.length || ''} change(s)</Button>} />
      <div className="mb-3"><Notice msg={msg} /></div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-3 text-start">Product</th><th className="p-3 text-start">Plan</th><th className="p-3 text-start">Type</th><th className="p-3 text-start">Price (EGP)</th><th className="p-3 text-start">Plan status</th><th className="p-3 text-start">Availability</th></tr></thead>
          <tbody>
            {data.products.filter((p) => p.status !== 'archived').map((p) => p.plans.filter((pl: any) => pl.status !== 'retired').map((pl: any, i: number) => (
              <tr key={pl.id} className="border-t border-line/60">
                <td className="p-2 ps-3">{i === 0 && <><Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-cyan">{p.title_en}</Link> <Badge kind={p.status === 'published' ? 'ok' : 'warn'}>{p.status}</Badge></>}</td>
                <td className="p-2">{pl.name_en}<div className="text-xs text-dim" dir="rtl">{pl.name_ar}</div></td>
                <td className="p-2 text-xs text-muted">{pl.plan_type}{pl.duration_value ? ` · ${pl.duration_value} ${pl.duration_unit}` : ''}</td>
                <td className="p-2"><Input className="!min-h-9 w-32" inputMode="decimal" aria-label={`Price for ${p.title_en} ${pl.name_en}`} value={rows[pl.id]?.price_egp ?? ''} onChange={(e) => setRows({ ...rows, [pl.id]: { ...rows[pl.id], price_egp: e.target.value } })} placeholder="not set" /></td>
                <td className="p-2"><Select className="!min-h-9 w-36" value={rows[pl.id]?.status ?? 'proposed'} onChange={(e) => setRows({ ...rows, [pl.id]: { ...rows[pl.id], status: e.target.value } })}><option value="proposed">proposed</option><option value="approved">approved</option></Select></td>
                <td className="p-2"><Select className="!min-h-9 w-36" value={rows[pl.id]?.availability ?? 'available'} onChange={(e) => setRows({ ...rows, [pl.id]: { ...rows[pl.id], availability: e.target.value } })}><option value="available">available</option><option value="unavailable">unavailable</option></Select></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </>
  );
}
