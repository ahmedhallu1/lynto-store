import { useEffect, useState } from 'react';
import { navigate } from '../lib/router';
import { adminApi } from '../lib/api';
import { PLAN_TYPES } from '../../shared/types';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Select, Spinner, Textarea } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin } from './common';

const emptyPlan = () => ({ name_ar: '', name_en: '', plan_type: 'private', duration_value: 1, duration_unit: 'month', is_perpetual: false, price_egp: '', status: 'proposed', availability: 'available', max_qty: 1, guarantee_kind: 'pending', guarantee_days: null, notes_ar: '', notes_en: '', sort: 0 });
const emptyProduct = () => ({
  slug: '', category_id: 'cat_ai', brand: '', title_ar: '', title_en: '', summary_ar: '', summary_en: '', description_ar: '', description_en: '', features_ar: [] as string[], features_en: [] as string[],
  delivery_ar: '', delivery_en: '', guarantee_ar: '', guarantee_en: '', customer_fields: [] as any[], owner_instructions: '', image_key: null as string | null, icon_text: '', accent: '#168CDD',
  featured: false, supply_status: 'pending', supply_notes: '', official_url: '', sort: 50, plans: [emptyPlan()] as any[],
});

export function ProductEditor({ id }: { id: string | null }) {
  const remote = useAdmin<{ product: any }>(id ? `/products/${id}` : null);
  const cats = useAdmin<{ categories: any[] }>('/categories');
  const settings = useAdmin<any>('/settings');
  const [p, setP] = useState<any>(id ? null : emptyProduct());
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { if (remote.data) setP({ ...remote.data.product, plans: remote.data.product.plans.filter((pl: any) => pl.status !== 'retired') }); }, [remote.data]);
  if (remote.error) return <Alert kind="bad" title={remote.error} />;
  if (!p) return <Spinner />;
  const set = (k: string, v: any) => setP((x: any) => ({ ...x, [k]: v }));
  const setPlan = (i: number, k: string, v: any) => setP((x: any) => ({ ...x, plans: x.plans.map((pl: any, j: number) => (j === i ? { ...pl, [k]: v } : pl)) }));
  const status = remote.data?.product.status ?? 'draft';
  const problems: string[] = remote.data?.product.publish_problems ?? [];

  const payload = () => ({
    slug: p.slug, category_id: p.category_id, brand: p.brand, title_ar: p.title_ar, title_en: p.title_en, summary_ar: p.summary_ar, summary_en: p.summary_en,
    description_ar: p.description_ar, description_en: p.description_en, features_ar: p.features_ar.filter(Boolean), features_en: p.features_en.filter(Boolean),
    delivery_ar: p.delivery_ar, delivery_en: p.delivery_en, guarantee_ar: p.guarantee_ar, guarantee_en: p.guarantee_en, customer_fields: p.customer_fields,
    owner_instructions: p.owner_instructions, image_key: p.image_key, icon_text: p.icon_text, accent: p.accent || '', featured: !!p.featured, supply_status: p.supply_status,
    supply_notes: p.supply_notes, official_url: p.official_url, sort: Number(p.sort) || 0,
    plans: p.plans.map((pl: any, i: number) => ({
      ...(pl.id ? { id: pl.id } : {}), name_ar: pl.name_ar, name_en: pl.name_en, plan_type: pl.plan_type, duration_value: pl.is_perpetual ? null : Number(pl.duration_value) || null,
      duration_unit: pl.is_perpetual ? null : pl.duration_unit || null, is_perpetual: !!pl.is_perpetual, price_egp: pl.price_egp === '' ? null : String(pl.price_egp), status: pl.status,
      availability: pl.availability, max_qty: Number(pl.max_qty) || 1, guarantee_kind: pl.guarantee_kind, guarantee_days: pl.guarantee_kind === 'days' ? Number(pl.guarantee_days) || null : null,
      notes_ar: pl.notes_ar ?? '', notes_en: pl.notes_en ?? '', sort: i + 1,
    })),
  });
  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      if (id) { await adminApi.put(`/products/${id}`, payload()); remote.reload(); setMsg({ kind: 'ok', text: 'Saved.' }); }
      else { const r = await adminApi.post<{ product: any }>('/products', payload()); navigate(`/admin/products/${r.product.id}`, { replace: true }); }
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  const setStatus = async (s: string) => {
    setBusy(s); setMsg(null);
    try { await adminApi.post(`/products/${id}/status`, { status: s }); remote.reload(); setMsg({ kind: 'ok', text: `Product is now ${s}.` }); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  const aiOn = settings.data?.settings.ai.gemini_enabled && settings.data?.env.gemini_key;

  return (
    <>
      <PageHeader title={id ? p.title_en || 'Product' : 'New product'} sub={id ? <>Status: <Badge kind={status === 'published' ? 'ok' : 'warn'}>{status}</Badge></> : 'Save as draft first, then review and publish.'}
        actions={<>
          {id && <a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold" href={`/p/${p.slug}?preview=${id}`} target="_blank" rel="noopener">Preview</a>}
          <Button onClick={save} loading={busy === 'save'}>Save</Button>
          {id && status !== 'published' && <Button variant="secondary" onClick={() => setStatus('published')} loading={busy === 'published'}>Publish</Button>}
          {id && status === 'published' && <Button variant="secondary" onClick={() => setStatus('draft')} loading={busy === 'draft'}>Unpublish</Button>}
        </>} />
      <div className="mb-4 space-y-3">
        <Notice msg={msg} />
        {id && status !== 'published' && problems.length > 0 && <Alert kind="warn" title="Before publishing (saved version):"><ul className="list-disc ps-5">{problems.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Basics</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title (Arabic)" htmlFor="ta"><Input id="ta" dir="rtl" value={p.title_ar} onChange={(e) => set('title_ar', e.target.value)} /></Field>
            <Field label="Title (English)" htmlFor="te"><Input id="te" value={p.title_en} onChange={(e) => set('title_en', e.target.value)} /></Field>
            <Field label="URL slug" htmlFor="sl" hint="lowercase-with-dashes"><Input id="sl" value={p.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} /></Field>
            <Field label="Brand" htmlFor="br"><Input id="br" value={p.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Category" htmlFor="ca"><Select id="ca" value={p.category_id} onChange={(e) => set('category_id', e.target.value)}>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</Select></Field>
            <Field label="Sort order" htmlFor="so"><Input id="so" type="number" value={p.sort} onChange={(e) => set('sort', e.target.value)} /></Field>
          </div>
          <Checkbox label="Featured on the home page" checked={!!p.featured} onChange={(e) => set('featured', e.target.checked)} />
          <ImageField p={p} set={set} />
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Supply validation (private)</h2>
          <Field label="Supply status" htmlFor="ss" hint="Mark validated only after confirming you can legitimately supply this product, its plan names and delivery method.">
            <Select id="ss" value={p.supply_status} onChange={(e) => set('supply_status', e.target.value)}><option value="pending">pending</option><option value="validated">validated</option><option value="unavailable">unavailable</option></Select>
          </Field>
          <Field label="Validation notes" htmlFor="sn"><Textarea id="sn" rows={4} value={p.supply_notes} onChange={(e) => set('supply_notes', e.target.value)} /></Field>
          <Field label="Official product page" htmlFor="ou"><Input id="ou" value={p.official_url} onChange={(e) => set('official_url', e.target.value)} /></Field>
          <Field label="Your fulfilment instructions (private)" htmlFor="oi"><Textarea id="oi" rows={3} value={p.owner_instructions} onChange={(e) => set('owner_instructions', e.target.value)} /></Field>
        </Card>
        <Card className="space-y-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Customer-facing copy</h2>
            {id && (aiOn
              ? <Button size="sm" variant="secondary" loading={busy === 'ai'} onClick={async () => { setBusy('ai'); setMsg(null); try { const r = await adminApi.post<{ draft: any }>('/ai/draft', { product_id: id }); setDraft(r.draft); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); } }}>Suggest copy with Gemini</Button>
              : <span className="text-xs text-dim">Gemini drafting is off (Setup → AI).</span>)}
          </div>
          {draft && (
            <Alert kind="info" title="Gemini suggestion — review before using (sends only public product info)">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><b>AR</b><p dir="rtl">{draft.summary_ar}</p><p dir="rtl" className="mt-1">{draft.description_ar}</p><ul dir="rtl" className="list-disc ps-5">{draft.features_ar.map((f: string) => <li key={f}>{f}</li>)}</ul></div>
                <div><b>EN</b><p>{draft.summary_en}</p><p className="mt-1">{draft.description_en}</p><ul className="list-disc ps-5">{draft.features_en.map((f: string) => <li key={f}>{f}</li>)}</ul></div>
              </div>
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setP((x: any) => ({ ...x, ...draft })); setDraft(null); }}>Use these (then Save)</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button></div>
            </Alert>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Summary (Arabic)" htmlFor="sa"><Input id="sa" dir="rtl" value={p.summary_ar} onChange={(e) => set('summary_ar', e.target.value)} /></Field>
            <Field label="Summary (English)" htmlFor="se"><Input id="se" value={p.summary_en} onChange={(e) => set('summary_en', e.target.value)} /></Field>
            <Field label="Description (Arabic)" htmlFor="da"><Textarea id="da" dir="rtl" rows={4} value={p.description_ar} onChange={(e) => set('description_ar', e.target.value)} /></Field>
            <Field label="Description (English)" htmlFor="de"><Textarea id="de" rows={4} value={p.description_en} onChange={(e) => set('description_en', e.target.value)} /></Field>
            <Field label="Features (Arabic, one per line)" htmlFor="fa"><Textarea id="fa" dir="rtl" rows={3} value={p.features_ar.join('\n')} onChange={(e) => set('features_ar', e.target.value.split('\n'))} /></Field>
            <Field label="Features (English, one per line)" htmlFor="fe"><Textarea id="fe" rows={3} value={p.features_en.join('\n')} onChange={(e) => set('features_en', e.target.value.split('\n'))} /></Field>
            <Field label="How it is delivered (Arabic)" htmlFor="dla" hint="Leave empty for the default text."><Textarea id="dla" dir="rtl" rows={2} value={p.delivery_ar} onChange={(e) => set('delivery_ar', e.target.value)} /></Field>
            <Field label="How it is delivered (English)" htmlFor="dle"><Textarea id="dle" rows={2} value={p.delivery_en} onChange={(e) => set('delivery_en', e.target.value)} /></Field>
            <Field label="Product-specific guarantee notes (Arabic)" htmlFor="ga"><Textarea id="ga" dir="rtl" rows={2} value={p.guarantee_ar} onChange={(e) => set('guarantee_ar', e.target.value)} /></Field>
            <Field label="Product-specific guarantee notes (English)" htmlFor="ge"><Textarea id="ge" rows={2} value={p.guarantee_en} onChange={(e) => set('guarantee_en', e.target.value)} /></Field>
          </div>
        </Card>
        <Card className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Plans</h2><Button size="sm" variant="secondary" onClick={() => set('plans', [...p.plans, emptyPlan()])}>Add plan</Button></div>
          <p className="text-xs text-dim">A plan can be “approved” only with a price. Customers only see approved, priced, available plans of published products.</p>
          {p.plans.map((pl: any, i: number) => (
            <div key={pl.id ?? i} className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-4">
              <Field label="Name (Arabic)" htmlFor={`pna${i}`}><Input id={`pna${i}`} dir="rtl" value={pl.name_ar} onChange={(e) => setPlan(i, 'name_ar', e.target.value)} /></Field>
              <Field label="Name (English)" htmlFor={`pne${i}`}><Input id={`pne${i}`} value={pl.name_en} onChange={(e) => setPlan(i, 'name_en', e.target.value)} /></Field>
              <Field label="Type" htmlFor={`pt${i}`}><Select id={`pt${i}`} value={pl.plan_type} onChange={(e) => setPlan(i, 'plan_type', e.target.value)}>{PLAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
              <Field label="Price (EGP)" htmlFor={`pp${i}`}><Input id={`pp${i}`} inputMode="decimal" value={pl.price_egp ?? ''} onChange={(e) => setPlan(i, 'price_egp', e.target.value)} placeholder="empty = not set" /></Field>
              <div className="flex items-end gap-2">
                <Field label="Duration" htmlFor={`pd${i}`}><Input id={`pd${i}`} type="number" min={1} disabled={pl.is_perpetual} value={pl.duration_value ?? ''} onChange={(e) => setPlan(i, 'duration_value', e.target.value)} /></Field>
                <Select aria-label="Duration unit" disabled={pl.is_perpetual} value={pl.duration_unit ?? 'month'} onChange={(e) => setPlan(i, 'duration_unit', e.target.value)}><option value="day">days</option><option value="month">months</option><option value="year">years</option></Select>
              </div>
              <div className="flex items-end"><Checkbox label="No expiry (code / top-up / perpetual)" checked={!!pl.is_perpetual} onChange={(e) => setPlan(i, 'is_perpetual', e.target.checked)} /></div>
              <Field label="Plan status" htmlFor={`ps${i}`}><Select id={`ps${i}`} value={pl.status} onChange={(e) => setPlan(i, 'status', e.target.value)}><option value="proposed">proposed</option><option value="approved">approved</option></Select></Field>
              <Field label="Availability" htmlFor={`pa${i}`}><Select id={`pa${i}`} value={pl.availability} onChange={(e) => setPlan(i, 'availability', e.target.value)}><option value="available">available</option><option value="unavailable">unavailable</option></Select></Field>
              <Field label="Guarantee" htmlFor={`pg${i}`}><Select id={`pg${i}`} value={pl.guarantee_kind} onChange={(e) => setPlan(i, 'guarantee_kind', e.target.value)}><option value="pending">pending (not set)</option><option value="full_period">full period</option><option value="days">N days</option><option value="none">none (valid at delivery)</option></Select></Field>
              {pl.guarantee_kind === 'days' && <Field label="Guarantee days" htmlFor={`pgd${i}`}><Input id={`pgd${i}`} type="number" min={1} value={pl.guarantee_days ?? ''} onChange={(e) => setPlan(i, 'guarantee_days', e.target.value)} /></Field>}
              <Field label="Max quantity per order" htmlFor={`pq${i}`}><Input id={`pq${i}`} type="number" min={1} max={20} value={pl.max_qty} onChange={(e) => setPlan(i, 'max_qty', e.target.value)} /></Field>
              <Field label="Plan note (Arabic)" htmlFor={`pnoa${i}`}><Input id={`pnoa${i}`} dir="rtl" value={pl.notes_ar ?? ''} onChange={(e) => setPlan(i, 'notes_ar', e.target.value)} /></Field>
              <Field label="Plan note (English)" htmlFor={`pnoe${i}`}><Input id={`pnoe${i}`} value={pl.notes_en ?? ''} onChange={(e) => setPlan(i, 'notes_en', e.target.value)} /></Field>
              <div className="flex items-end"><Button size="sm" variant="ghost" onClick={() => set('plans', p.plans.filter((_: any, j: number) => j !== i))}>Remove plan</Button></div>
            </div>
          ))}
        </Card>
        <Card className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Required customer data</h2>
            <Button size="sm" variant="secondary" onClick={() => set('customer_fields', [...p.customer_fields, { key: 'account_email', type: 'email', required: true, label_ar: '', label_en: '', help_ar: '', help_en: '' }])}>Add field</Button></div>
          <p className="text-xs text-dim">Ask only for what you need to deliver (e.g. account email for an invite, player ID). Never ask for passwords.</p>
          {p.customer_fields.map((f: any, i: number) => {
            const upd = (k: string, v: any) => set('customer_fields', p.customer_fields.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <div key={i} className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-4">
                <Field label="Key" htmlFor={`fk${i}`}><Input id={`fk${i}`} value={f.key} onChange={(e) => upd('key', e.target.value)} /></Field>
                <Field label="Type" htmlFor={`ft${i}`}><Select id={`ft${i}`} value={f.type} onChange={(e) => upd('type', e.target.value)}><option value="text">text</option><option value="email">email</option><option value="select">select</option></Select></Field>
                <Field label="Label (Arabic)" htmlFor={`fla${i}`}><Input id={`fla${i}`} dir="rtl" value={f.label_ar} onChange={(e) => upd('label_ar', e.target.value)} /></Field>
                <Field label="Label (English)" htmlFor={`fle${i}`}><Input id={`fle${i}`} value={f.label_en} onChange={(e) => upd('label_en', e.target.value)} /></Field>
                <Field label="Help (Arabic)" htmlFor={`fha${i}`}><Input id={`fha${i}`} dir="rtl" value={f.help_ar ?? ''} onChange={(e) => upd('help_ar', e.target.value)} /></Field>
                <Field label="Help (English)" htmlFor={`fhe${i}`}><Input id={`fhe${i}`} value={f.help_en ?? ''} onChange={(e) => upd('help_en', e.target.value)} /></Field>
                <Field label="Pattern (regex, optional)" htmlFor={`fp${i}`}><Input id={`fp${i}`} value={f.pattern ?? ''} onChange={(e) => upd('pattern', e.target.value || undefined)} /></Field>
                <div className="flex items-end gap-3"><Checkbox label="Required" checked={!!f.required} onChange={(e) => upd('required', e.target.checked)} /><Button size="sm" variant="ghost" onClick={() => set('customer_fields', p.customer_fields.filter((_: any, j: number) => j !== i))}>Remove</Button></div>
                {f.type === 'select' && (
                  <div className="md:col-span-4"><Field label="Options (one per line: value|Arabic label|English label)" htmlFor={`fo${i}`}>
                    <Textarea id={`fo${i}`} rows={3} value={(f.options ?? []).map((o: any) => `${o.value}|${o.label_ar}|${o.label_en}`).join('\n')}
                      onChange={(e) => upd('options', e.target.value.split('\n').filter(Boolean).map((l) => { const [value, label_ar, label_en] = l.split('|'); return { value: value ?? '', label_ar: label_ar ?? '', label_en: label_en ?? '' }; }))} />
                  </Field></div>
                )}
              </div>
            );
          })}
        </Card>
      </div>
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy === 'save'}>Save</Button><Button variant="ghost" onClick={() => navigate('/admin/products')}>Back to products</Button></div>
    </>
  );
}

function ImageField({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
      {p.image_key ? <img src={`/media/${p.image_key}`} alt="" className="size-16 rounded-xl object-cover" /> : <div className="grid size-16 place-items-center rounded-xl border border-line text-xs text-dim">{p.icon_text || 'no image'}</div>}
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Monogram text" htmlFor="it"><Input id="it" maxLength={6} value={p.icon_text} onChange={(e) => set('icon_text', e.target.value)} /></Field>
        <Field label="Accent colour" htmlFor="ac"><Input id="ac" value={p.accent} onChange={(e) => set('accent', e.target.value)} placeholder="#168CDD" /></Field>
        <Field label="Image (optional)" htmlFor="img" hint="Use images you have the right to use." error={err}>
          <input id="img" type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return; setBusy(true); setErr('');
            try { const fd = new FormData(); fd.append('file', f); const r = await adminApi.upload<{ id: string }>('/media', fd); set('image_key', r.id); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
          }} />
        </Field>
      </div>
      {p.image_key && <button className="text-xs text-muted underline sm:col-start-2 text-start" onClick={() => set('image_key', null)}>Remove image</button>}
    </div>
  );
}
