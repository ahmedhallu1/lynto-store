import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Spinner } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin, when } from './common';
import { SecretInput } from './Setup';

type Target = { enabled: boolean; service: number; quantity: number };
type Config = { enabled: boolean; armed_at: number | null; page_id: string; facebook: Target; instagram: Target; max_orders_per_day: number; min_balance_usd: number; max_post_age_hours: number };
type Row = { id: number; platform: 'facebook' | 'instagram'; post_id: string; permalink: string; posted_at: number; service: number; quantity: number; status: string; jap_order_id: string | null; jap_status: string | null; jap_remains: number | null; charge_usd: string | null; error: string | null; trigger: string; created_at: number };
type Info = {
  config: Config;
  state: { page_name: string | null; ig_username: string | null; last_check_at: number | null; last_success_at: number | null; last_error: string | null; balance_usd: string | null; balance_at: number | null };
  connected: { meta: boolean; jap: boolean };
  secrets: Record<string, { set: boolean; hint: string }>;
  rows: Row[];
  last_24h: number;
};
type TestResult = {
  meta: null | { ok: true; page_name: string; ig_username: string | null; instagram_linked: boolean; newest_facebook: { permalink: string; posted_at: number } | null; newest_instagram: { permalink: string; posted_at: number } | null } | { ok: false; error: string };
  jap: null | { ok: true; balance_usd: string } | { ok: false; error: string };
};

const STATUS_KIND: Record<string, any> = { ordered: 'ok', pending: 'info', failed: 'bad', unknown: 'warn', skipped: 'neutral' };
const PLATFORM = { facebook: 'Facebook', instagram: 'Instagram' } as const;

export function SocialBoost() {
  const { data, error, reload } = useAdmin<Info>('/social-boost');
  const [form, setForm] = useState<Config | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  useEffect(() => { if (data) setForm(data.config); }, [data]);
  if (error) return <Alert kind="bad" title={error} />;
  if (!data || !form) return <Spinner />;
  const ready = data.connected.meta && data.connected.jap;
  const st = data.state;

  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); reload(); } };
  const save = (next: Config) => act('save', async () => {
    const r = await adminApi.put<{ config: Config }>('/social-boost', { enabled: next.enabled, page_id: next.page_id, facebook: next.facebook, instagram: next.instagram, max_orders_per_day: Number(next.max_orders_per_day), min_balance_usd: Number(next.min_balance_usd), max_post_age_hours: Number(next.max_post_age_hours) });
    setMsg({ kind: 'ok', text: r.config.enabled ? `Saved. Automatic orders are ON for posts published after ${when(r.config.armed_at)}.` : 'Saved. Automatic orders are OFF.' });
  });
  const runTest = () => act('test', async () => { setTest(await adminApi.post<TestResult>('/social-boost/test')); });
  const runNow = () => act('run', async () => {
    const r = await adminApi.post<{ checked: number; ordered: number; failed: number; unknown: number; skipped: number; waiting: number; note?: string }>('/social-boost/run');
    setMsg({ kind: r.failed || r.unknown ? 'warn' : 'ok', text: `Checked ${r.checked} recent post(s): ${r.ordered} ordered, ${r.failed} failed, ${r.unknown} unclear, ${r.skipped} over the daily limit.${r.note ? ' ' + r.note : ''}` });
  });
  const retry = (id: number) => act('retry' + id, async () => { const r = await adminApi.post<{ status: string; error?: string }>(`/social-boost/${id}/retry`); setMsg({ kind: r.status === 'ordered' ? 'ok' : 'bad', text: r.status === 'ordered' ? 'Ordered.' : r.error ?? r.status }); });
  const tgt = (p: 'facebook' | 'instagram', k: keyof Target, v: any) => setForm({ ...form, [p]: { ...form[p], [k]: v } });

  const status = !ready ? <Badge kind="warn">Not connected</Badge>
    : !data.config.enabled ? <Badge>Off</Badge>
    : st.last_error ? <Badge kind="bad">Needs attention</Badge>
    : <Badge kind="ok">Watching for new posts</Badge>;

  return (
    <>
      <PageHeader title="Social boost" sub="When a new post appears on the LYnto Facebook Page or Instagram, order engagement on JustAnotherPanel automatically."
        actions={<>{status}<Button size="sm" variant="secondary" loading={busy === 'test'} disabled={!data.connected.meta && !data.connected.jap} onClick={runTest}>Test connection</Button><Button size="sm" loading={busy === 'run'} disabled={!ready || !data.config.enabled} onClick={runNow}>Check now</Button></>} />
      <Notice msg={msg} />

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">1 · Connections</h2>
        <p className="mt-1 text-sm text-muted">
          <b>Meta token</b>: a system-user (or Page) token from Meta Business Settings with access to the LYnto Page and these permissions: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>instagram_basic</code>.
          <b className="ms-1">JAP API key</b>: from justanotherpanel.com → Account. Both are stored encrypted.
        </p>
        <div className="mt-3 space-y-3">
          <SecretInput name="meta_page_token" label="Meta token (Page + Instagram read)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
          <SecretInput name="jap_api_key" label="JustAnotherPanel API key" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        </div>
        {test && (
          <div className="mt-3 grid gap-2 text-sm">
            {test.meta && (test.meta.ok
              ? <Alert kind="ok" title={`Meta: Page “${test.meta.page_name}”${test.meta.ig_username ? ` · Instagram @${test.meta.ig_username}` : ''}`}>
                  {!test.meta.instagram_linked && <p className="text-warn">No Instagram account is linked to this Page — Instagram posts can’t be read.</p>}
                  {test.meta.newest_facebook && <p>Newest Facebook post: {when(test.meta.newest_facebook.posted_at)} · <a className="text-cyan" href={test.meta.newest_facebook.permalink} target="_blank" rel="noopener">open ↗</a></p>}
                  {test.meta.newest_instagram && <p>Newest Instagram post: {when(test.meta.newest_instagram.posted_at)} · <a className="text-cyan" href={test.meta.newest_instagram.permalink} target="_blank" rel="noopener">open ↗</a></p>}
                </Alert>
              : <Alert kind="bad" title="Meta connection failed">{test.meta.error}</Alert>)}
            {test.jap && (test.jap.ok ? <Alert kind="ok" title={`JAP: balance $${test.jap.balance_usd}`} /> : <Alert kind="bad" title="JAP connection failed">{test.jap.error}</Alert>)}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">2 · What to order</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(['facebook', 'instagram'] as const).map((p) => (
            <div key={p} className="rounded-xl border border-line p-3">
              <Checkbox label={<b>{PLATFORM[p]} posts</b>} checked={form[p].enabled} onChange={(e) => tgt(p, 'enabled', e.target.checked)} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="JAP service ID" htmlFor={`${p}-svc`}><Input id={`${p}-svc`} inputMode="numeric" value={form[p].service} onChange={(e) => tgt(p, 'service', Number(e.target.value.replace(/\D/g, '')) || 0)} /></Field>
                <Field label="Quantity" htmlFor={`${p}-qty`}><Input id={`${p}-qty`} inputMode="numeric" value={form[p].quantity} onChange={(e) => tgt(p, 'quantity', Number(e.target.value.replace(/\D/g, '')) || 0)} /></Field>
              </div>
              <p className="mt-1 text-xs text-dim">{p === 'facebook' ? 'Default 8705 = Facebook EMOJI Post Likes [Love💖] (min 100).' : 'Default 10211 = Instagram Likes [EG 🇪🇬] (min 50).'}</p>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">Safety limits</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Max orders per 24 h (both platforms)" htmlFor="cap"><Input id="cap" inputMode="numeric" value={form.max_orders_per_day} onChange={(e) => setForm({ ...form, max_orders_per_day: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
            <Field label="Pause when JAP balance is below ($)" htmlFor="minb"><Input id="minb" inputMode="decimal" value={form.min_balance_usd} onChange={(e) => setForm({ ...form, min_balance_usd: Number(e.target.value) || 0 })} /></Field>
            <Field label="Ignore posts older than (hours)" htmlFor="age"><Input id="age" inputMode="numeric" value={form.max_post_age_hours} onChange={(e) => setForm({ ...form, max_post_age_hours: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
            <Field label="Facebook Page ID (only if the token sees several Pages)" htmlFor="pid"><Input id="pid" inputMode="numeric" value={form.page_id} onChange={(e) => setForm({ ...form, page_id: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
        </details>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" loading={busy === 'save'} onClick={() => save(form)}>Save</Button>
          {data.config.enabled
            ? <Button size="sm" variant="ghost" loading={busy === 'save'} onClick={() => save({ ...form, enabled: false })}>Turn off</Button>
            : <Button size="sm" disabled={!ready} loading={busy === 'save'} onClick={() => { if (confirm(`Turn on automatic orders? Every new post from now on is ordered on JAP and paid from your JAP balance (Facebook: ${form.facebook.quantity} × service ${form.facebook.service}; Instagram: ${form.instagram.quantity} × service ${form.instagram.service}).`)) save({ ...form, enabled: true }); }}>Turn on</Button>}
          {!ready && <span className="text-xs text-muted">Save both connections first.</span>}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">3 · Activity</h2>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <p>Status: {data.config.enabled ? <>on since <b>{when(data.config.armed_at)}</b> (older posts are never ordered)</> : <b>off</b>}</p>
          <p>Watching: <b>{st.page_name ?? '—'}</b>{st.ig_username ? <> · <b>@{st.ig_username}</b></> : ''}</p>
          <p>Last check: <b>{when(st.last_check_at)}</b> · orders in last 24 h: <b>{data.last_24h}</b> / {data.config.max_orders_per_day}</p>
          <p>JAP balance: <b>{st.balance_usd ? `$${st.balance_usd}` : '—'}</b>{st.balance_at ? <span className="text-dim"> ({when(st.balance_at)})</span> : null}</p>
        </div>
        {st.last_error && data.config.enabled && <div className="mt-3"><Alert kind="bad" title="Last check had a problem">{st.last_error}</Alert></div>}
        {data.rows.length === 0 ? <p className="mt-3 text-sm text-muted">No orders yet.</p> : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-xs text-muted"><tr>
                <th className="p-3 text-start">Post</th><th className="p-3 text-start">Order</th><th className="p-3 text-start">Status</th><th className="p-3 text-start">JAP</th><th className="p-3" />
              </tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line/60 align-top">
                    <td className="p-3"><a href={r.permalink} target="_blank" rel="noopener" className="text-cyan">{PLATFORM[r.platform]} ↗</a><div className="text-xs text-dim">posted {when(r.posted_at)}</div></td>
                    <td className="p-3">{r.quantity} × #{r.service}<div className="text-xs text-dim">{when(r.created_at)} · {r.trigger}</div></td>
                    <td className="p-3"><Badge kind={STATUS_KIND[r.status] ?? 'neutral'}>{r.status === 'unknown' ? 'unclear — check JAP' : r.status}</Badge>{r.error && <div className="mt-1 max-w-xs text-xs text-bad">{r.error}</div>}</td>
                    <td className="p-3 text-xs">{r.jap_order_id ? <>#{r.jap_order_id}<div className="text-dim">{r.jap_status ?? 'sent'}{r.jap_remains ? ` · ${r.jap_remains} left` : ''}{r.charge_usd ? ` · $${r.charge_usd}` : ''}</div></> : '—'}</td>
                    <td className="p-3 text-end">{(r.status === 'failed' || r.status === 'skipped') && <Button size="sm" variant="secondary" loading={busy === 'retry' + r.id} onClick={() => { if (confirm(`Place this order on JAP now (${r.quantity} × service ${r.service})?`)) retry(r.id); }}>Retry</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-dim">“Unclear” means JAP did not answer clearly, so the order may or may not exist. It is never retried automatically — check Orders on justanotherpanel.com.</p>
      </Card>
    </>
  );
}
