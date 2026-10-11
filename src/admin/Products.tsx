import { useState } from 'react';
import { Link, navigate } from '../lib/router';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Card, Select, Spinner, Textarea, cx } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin } from './common';

export function ProductsList() {
  const { data, error, reload } = useAdmin<{ products: any[] }>('/products');
  const cats = useAdmin<{ categories: any[] }>('/categories');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  if (error) return <Alert kind="bad" title={error} />;
  if (!data) return <Spinner />;
  const list = data.products.filter((p) => filter === 'all' || p.status === filter || (filter === 'needs_price' && p.plans.some((pl: any) => !pl.price_egp)));
  const ids = Object.keys(sel).filter((k) => sel[k]);
  const catName = (id: string) => cats.data?.categories.find((c) => c.id === id)?.name_en ?? id;
  const bulk = async (action: string, value?: string) => {
    setBusy(action); setMsg(null);
    try {
      const r = await adminApi.post<{ results: Array<{ id: string; ok: boolean; problems: string[] }> }>('/products/bulk', { ids, action, value });
      const failed = r.results.filter((x) => !x.ok);
      setMsg(failed.length ? { kind: 'warn', text: `${r.results.length - failed.length} updated, ${failed.length} not changed:`, details: failed.map((f) => `${data.products.find((p) => p.id === f.id)?.title_en}: ${f.problems.join(' ')}`) } : { kind: 'ok', text: `${r.results.length} product(s) updated.` });
      reload();
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <>
      <PageHeader title="Products" sub="Suggested products are unpublished drafts. Each needs approved plans, EGP prices, validated supply and guarantee terms before it can be published."
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen((v) => !v)}>Import CSV</Button>
          <a className="inline-flex min-h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold hover:border-cyan/60" href="/api/admin/export/products.csv">Export CSV</a>
          <Button size="sm" onClick={() => navigate('/admin/products/new')}>New product</Button>
        </>} />
      {importOpen && <ImportBox onDone={() => { reload(); }} />}
      <div className="mb-3"><Notice msg={msg} /></div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {['all', 'draft', 'published', 'archived', 'needs_price'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('rounded-full border px-3 py-1.5 text-sm', filter === f ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted')}>{f.replace('_', ' ')}</button>
        ))}
      </div>
      {ids.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan/40 bg-surface p-3 text-sm">
          <b>{ids.length} selected</b>
          <Button size="sm" loading={busy === 'publish'} onClick={() => bulk('publish')}>Publish</Button>
          <Button size="sm" variant="secondary" loading={busy === 'unpublish'} onClick={() => bulk('unpublish')}>Unpublish</Button>
          <Button size="sm" variant="secondary" onClick={() => bulk('feature')}>Feature</Button>
          <Button size="sm" variant="secondary" onClick={() => bulk('unfeature')}>Unfeature</Button>
          <Select className="!min-h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && bulk('set_supply', e.target.value)}>
            <option value="">Set supply status…</option><option value="validated">validated</option><option value="pending">pending</option><option value="unavailable">unavailable</option>
          </Select>
          <Select className="!min-h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && bulk('set_category', e.target.value)}>
            <option value="">Move to category…</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </Select>
          <Button size="sm" variant="danger" onClick={() => confirm('Archive selected products?') && bulk('archive')}>Archive</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel({})}>Clear</Button>
        </div>
      )}
      <div className="space-y-2">
        {list.map((p) => (
          <Card key={p.id} className="!p-4">
            <div className="flex flex-wrap items-start gap-3">
              <input type="checkbox" className="mt-1.5 size-4 accent-cyan" checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} aria-label={`Select ${p.title_en}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-cyan">{p.title_en}</Link>
                  <span className="text-sm text-muted">{p.title_ar}</span>
                  <Badge kind={p.status === 'published' ? 'ok' : p.status === 'archived' ? 'neutral' : 'warn'}>{p.status}</Badge>
                  <Badge kind={p.supply_status === 'validated' ? 'ok' : p.supply_status === 'unavailable' ? 'bad' : 'neutral'}>supply: {p.supply_status}</Badge>
                  {p.featured && <Badge kind="cyan">featured</Badge>}
                </div>
                <p className="mt-1 text-xs text-dim">{catName(p.category_id)} · /p/{p.slug}</p>
                <p className="mt-1 text-sm text-muted">{p.plans.map((pl: any) => `${pl.name_en}: ${pl.price_egp ? 'EGP ' + pl.price_egp : 'no price'} (${pl.status})`).join(' · ') || 'No plans'}</p>
                {p.status !== 'published' && p.publish_problems.length > 0 && <p className="mt-1 text-xs text-warn">To publish: {p.publish_problems.slice(0, 3).join(' ')}{p.publish_problems.length > 3 ? ` (+${p.publish_problems.length - 3} more)` : ''}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/products/${p.id}`)}>Edit</Button>
                <a className="inline-flex min-h-9 items-center rounded-xl border border-line px-3 text-sm" href={`/p/${p.slug}?preview=${p.id}`} target="_blank" rel="noopener">Preview</a>
                <Button size="sm" variant="ghost" onClick={async () => { try { const r = await adminApi.post<{ id: string }>(`/products/${p.id}/duplicate`); navigate(`/admin/products/${r.id}`); } catch (e) { setMsg(errMsg(e)); } }}>Duplicate</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function ImportBox({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dry: boolean) => {
    setBusy(true);
    try { const r = await adminApi.post<any>('/import/products', { csv, dry_run: dry }); setRes(r); if (r.applied) onDone(); } catch (e) { setRes({ error: (e as Error).message, details: (e as any).details }); } finally { setBusy(false); }
  };
  return (
    <Card className="mb-4 space-y-3">
      <p className="text-sm text-muted">Export the CSV, edit prices/plans in a spreadsheet, then paste or upload it here. Validate first; nothing changes until you click Apply. Publishing via CSV still requires every publish check to pass.</p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} className="text-sm" />
      <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="product_id,slug,category,…" className="font-mono text-xs" />
      <div className="flex gap-2"><Button size="sm" variant="secondary" loading={busy} onClick={() => run(true)} disabled={!csv}>Validate</Button><Button size="sm" loading={busy} onClick={() => run(false)} disabled={!csv || !res || res.errors?.length || res.error}>Apply</Button></div>
      {res && (res.error ? <Alert kind="bad" title={res.error} /> : (
        <Alert kind={res.errors.length ? 'bad' : res.applied ? 'ok' : 'info'} title={res.applied ? 'Import applied' : res.errors.length ? 'Fix these rows first' : 'Validation passed'}>
          {res.rows} rows · {res.product_updates} products · {res.plan_updates} plan updates · {res.plan_creates} new plans
          {res.errors.length > 0 && <ul className="mt-2 list-disc ps-5">{res.errors.slice(0, 20).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>}
        </Alert>
      ))}
    </Card>
  );
}
