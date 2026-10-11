import { useEffect, useState, type ReactNode } from 'react';
import { adminApi } from '../lib/api';
import type { BusinessSettings, PaymentMethod } from '../../shared/types';
import { DRAFT_POLICIES } from '../../shared/defaults';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Select, Spinner, Textarea } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin } from './common';

type SettingsResp = {
  settings: BusinessSettings; blockers: string[]; secrets: Record<string, { set: boolean; hint: string }>;
  health: { email: { usable: boolean; reason: string }; whatsapp: { usable: boolean; reason: string } };
  env: { app_env: string; email_binding: boolean; cloudflare_access: boolean; gemini_key: boolean };
  ai_usage_today: number; webhooks: { whatsapp: string; resend: string };
  whatsapp_template_guide: Record<string, { category: string; ar: string; en: string }>;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CHECK: Array<[string, string, string]> = [
  ['no_payment_method', 'Payment destinations', '#payments'],
  ['schedule_missing', 'Working days & hours', '#schedule'],
  ['support_missing', 'Support contacts', '#support'],
  ['policies_unconfirmed', 'Guarantee & refund terms', '#policies'],
  ['store_closed', 'Accepting orders switch', '#store'],
];

function Section({ id, title, desc, children, onSave, busy, done }: { id: string; title: string; desc?: ReactNode; children: ReactNode; onSave?: () => void; busy?: boolean; done?: boolean }) {
  return (
    <Card id={id} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{title} {done !== undefined && <Badge kind={done ? 'ok' : 'warn'}>{done ? 'done' : 'needed'}</Badge>}</h2>{desc && <p className="mt-1 text-sm text-muted">{desc}</p>}</div>
        {onSave && <Button size="sm" onClick={onSave} loading={busy}>Save</Button>}
      </div>
      {children}
    </Card>
  );
}

export function Setup() {
  const { data, error, reload, setData } = useAdmin<SettingsResp>('/settings');
  const [s, setS] = useState<BusinessSettings | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (data) setS(structuredClone(data.settings)); }, [data]);
  if (error) return <Alert kind="bad" title={error} />;
  if (!data || !s) return <Spinner />;

  const save = async (section: keyof BusinessSettings, value: unknown = s[section]) => {
    setBusy(section); setMsg(null);
    try {
      const r = await adminApi.put<{ settings: BusinessSettings; blockers: string[] }>(`/settings/${section}`, value);
      setData({ ...data, settings: r.settings, blockers: r.blockers });
      setMsg({ kind: 'ok', text: `${section} saved.` });
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(''); }
  };
  const upd = <K extends keyof BusinessSettings>(k: K, v: Partial<BusinessSettings[K]>) => setS({ ...s, [k]: { ...(s[k] as any), ...v } });
  const blockers = data.blockers;

  return (
    <>
      <PageHeader title="Setup" sub="Everything the store needs from you, in one place. Secrets are write-only and stored encrypted." />
      <div className="sticky top-0 z-10 mb-4 space-y-2">
        <Notice msg={msg} />
      </div>
      <Card className="mb-4">
        <h2 className="font-semibold">Launch checklist</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CHECK.map(([k, l, href]) => <li key={k}><a href={href} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:border-cyan/60"><span>{l}</span><Badge kind={blockers.includes(k) ? 'warn' : 'ok'}>{blockers.includes(k) ? 'needed' : 'done'}</Badge></a></li>)}
          <li><a href="/admin/pricing" className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:border-cyan/60"><span>Approve plans, prices & supply</span><Badge kind="info">per product</Badge></a></li>
          <li><a href="#notifications" className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:border-cyan/60"><span>Email / WhatsApp sending (optional)</span><Badge kind={data.health.email.usable || data.health.whatsapp.usable ? 'ok' : 'neutral'}>{data.health.email.usable || data.health.whatsapp.usable ? 'configured' : 'manual mode'}</Badge></a></li>
        </ul>
        <p className="mt-3 text-sm text-muted">Checkout opens automatically when the first five items are done. Products appear once you publish them.</p>
      </Card>

      <div className="space-y-4">
        <Section id="store" title="Store status" done={!blockers.includes('store_closed')} onSave={() => save('store')} busy={busy === 'store'}
          desc="Turn on when payment details, hours, support and policies are ready. You can close ordering any time.">
          <Checkbox label={<b>Accepting orders</b>} checked={s.store.accepting_orders} onChange={(e) => upd('store', { accepting_orders: e.target.checked })} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Business name" htmlFor="bn"><Input id="bn" value={s.store.business_name} onChange={(e) => upd('store', { business_name: e.target.value })} /></Field>
            <Field label="Announcement bar (Arabic)" htmlFor="aa"><Input id="aa" dir="rtl" value={s.store.announcement_ar} onChange={(e) => upd('store', { announcement_ar: e.target.value })} /></Field>
            <Field label="Announcement bar (English)" htmlFor="ae"><Input id="ae" value={s.store.announcement_en} onChange={(e) => upd('store', { announcement_en: e.target.value })} /></Field>
          </div>
        </Section>

        <Section id="payments" title="Payment destinations" done={!blockers.includes('no_payment_method')} onSave={() => save('payments')} busy={busy === 'payments'}
          desc="Enter your real receiving accounts. Customers see these only on their own order page after placing an order.">
          {s.payments.methods.map((m, i) => <MethodEditor key={i} m={m} onChange={(nm) => upd('payments', { methods: s.payments.methods.map((x, j) => (j === i ? nm : x)) })} onRemove={() => upd('payments', { methods: s.payments.methods.filter((_, j) => j !== i) })} />)}
          <div className="flex flex-wrap gap-2">
            {(['wallet', 'instapay', 'bank'] as const).map((t) => (
              <Button key={t} size="sm" variant="secondary" onClick={() => upd('payments', { methods: [...s.payments.methods, { id: `${t}_${s.payments.methods.length + 1}`, type: t, enabled: false, label_ar: t === 'bank' ? 'تحويل بنكي' : t === 'wallet' ? 'محفظة إلكترونية' : 'إنستاباي', label_en: t === 'bank' ? 'Bank transfer' : t === 'wallet' ? 'Mobile wallet' : 'InstaPay', account: '', account_name: '', wallet_provider: t === 'wallet' ? 'Vodafone Cash' : undefined }] })}>Add {t}</Button>
            ))}
          </div>
        </Section>

        <Section id="schedule" title="Working days, hours & holidays (Cairo time)" done={!blockers.includes('schedule_missing')} onSave={() => save('schedule', { timezone: s.schedule.timezone, week: s.schedule.week, holidays: s.schedule.holidays })} busy={busy === 'schedule'}
          desc="The 2-working-hour delivery deadline counts only open time. Add a break by splitting a day into two ranges. Daylight-saving changes are handled automatically (Africa/Cairo).">
          <ScheduleEditor s={s} setS={setS} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Delivery promise (working hours)" htmlFor="sla" hint="Business decision: 2"><Input id="sla" type="number" step="0.5" min={0.5} value={s.delivery.sla_working_hours} onChange={(e) => upd('delivery', { sla_working_hours: Number(e.target.value) })} /></Field>
            <Field label="Cancel unpaid orders after (hours)" htmlFor="ux"><Input id="ux" type="number" min={1} value={s.delivery.unpaid_expiry_hours} onChange={(e) => upd('delivery', { unpaid_expiry_hours: Number(e.target.value) })} /></Field>
            <Field label="Renewal reminder (days before expiry)" htmlFor="rd"><Input id="rd" type="number" min={1} max={30} value={s.delivery.renewal_reminder_days} onChange={(e) => upd('delivery', { renewal_reminder_days: Number(e.target.value) })} /></Field>
          </div>
          <Button size="sm" variant="secondary" onClick={() => save('delivery')} loading={busy === 'delivery'}>Save delivery settings</Button>
        </Section>

        <Section id="support" title="Support contacts & social links" done={!blockers.includes('support_missing')} onSave={() => save('support')} busy={busy === 'support'}
          desc="Shown on the website. Use real, monitored channels only.">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Support WhatsApp (with country code)" htmlFor="sw"><Input id="sw" dir="ltr" placeholder="+20…" value={s.support.whatsapp} onChange={(e) => upd('support', { whatsapp: e.target.value })} /></Field>
            <Field label="Support email" htmlFor="se"><Input id="se" type="email" value={s.support.email} onChange={(e) => upd('support', { email: e.target.value })} /></Field>
            <Field label="Phone (optional)" htmlFor="sp"><Input id="sp" dir="ltr" value={s.support.phone} onChange={(e) => upd('support', { phone: e.target.value })} /></Field>
            <Field label="Support hours note (Arabic)" htmlFor="sha"><Input id="sha" dir="rtl" value={s.support.hours_note_ar} onChange={(e) => upd('support', { hours_note_ar: e.target.value })} /></Field>
            <Field label="Support hours note (English)" htmlFor="she"><Input id="she" value={s.support.hours_note_en} onChange={(e) => upd('support', { hours_note_en: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(s.support.socials) as Array<keyof BusinessSettings['support']['socials']>).map((k) => (
              <Field key={k} label={`${k} URL`} htmlFor={`so-${k}`}><Input id={`so-${k}`} dir="ltr" placeholder="https://…" value={s.support.socials[k]} onChange={(e) => upd('support', { socials: { ...s.support.socials, [k]: e.target.value } })} /></Field>
            ))}
          </div>
        </Section>

        <Section id="policies" title="Guarantee & refund terms" done={!blockers.includes('policies_unconfirmed')} onSave={() => save('policies')} busy={busy === 'policies'}
          desc="Draft text reflects a full-period guarantee intent. Edit remedies, eligibility, exclusions and refund rules, then confirm. Nothing is published until confirmed.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Guarantee (Arabic) — one point per line" htmlFor="pga"><Textarea id="pga" dir="rtl" rows={6} value={s.policies.guarantee_ar} onChange={(e) => upd('policies', { guarantee_ar: e.target.value })} /></Field>
            <Field label="Guarantee (English)" htmlFor="pge"><Textarea id="pge" rows={6} value={s.policies.guarantee_en} onChange={(e) => upd('policies', { guarantee_en: e.target.value })} /></Field>
            <Field label="Refunds (Arabic)" htmlFor="pra"><Textarea id="pra" dir="rtl" rows={5} value={s.policies.refund_ar} onChange={(e) => upd('policies', { refund_ar: e.target.value })} /></Field>
            <Field label="Refunds (English)" htmlFor="pre"><Textarea id="pre" rows={5} value={s.policies.refund_en} onChange={(e) => upd('policies', { refund_en: e.target.value })} /></Field>
            <Field label="Extra purchase terms (Arabic, optional)" htmlFor="pta"><Textarea id="pta" dir="rtl" rows={3} value={s.policies.terms_extra_ar} onChange={(e) => upd('policies', { terms_extra_ar: e.target.value })} /></Field>
            <Field label="Extra purchase terms (English, optional)" htmlFor="pte"><Textarea id="pte" rows={3} value={s.policies.terms_extra_en} onChange={(e) => upd('policies', { terms_extra_en: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox label={<b>I confirm these terms are final and can be published</b>} checked={s.policies.confirmed} onChange={(e) => upd('policies', { confirmed: e.target.checked })} />
            <button className="text-xs text-muted underline" onClick={() => upd('policies', { ...DRAFT_POLICIES, confirmed: false })}>Reset to draft text</button>
          </div>
        </Section>

        <NotificationsSection data={data} s={s} upd={upd} save={save} busy={busy} reload={reload} setMsg={setMsg} />

        <Section id="tracking" title="Meta Pixel & Conversions API (optional)" onSave={() => save('tracking')} busy={busy === 'tracking'}
          desc={<>Leave empty if not connected. Browser events load only after visitor consent. <b>Purchase</b> fires only when you approve a payment (server event) and once on the customer's order page after verification, with the same event ID (<code>purchase_ORDERNUMBER</code>) so Meta deduplicates. Unpaid orders and uploaded receipts are never reported as purchases.</>}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Pixel / Dataset ID" htmlFor="px"><Input id="px" dir="ltr" value={s.tracking.meta_pixel_id} onChange={(e) => upd('tracking', { meta_pixel_id: e.target.value.trim() })} /></Field>
            <Field label="Test event code (optional)" htmlFor="tc"><Input id="tc" dir="ltr" value={s.tracking.meta_test_event_code} onChange={(e) => upd('tracking', { meta_test_event_code: e.target.value })} /></Field>
            <div className="flex items-end"><Checkbox label="Send server-side Purchase (CAPI)" checked={s.tracking.capi_enabled} onChange={(e) => upd('tracking', { capi_enabled: e.target.checked })} /></div>
          </div>
          <SecretInput name="meta_capi_token" label="Conversions API access token" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        </Section>

        <Section id="ai" title="Gemini (optional)" onSave={() => save('ai')} busy={busy === 'ai'}
          desc="Off by default and not needed to run the store. When on, the product editor can suggest bilingual copy from public product info only. It never sees customers, receipts, payments, prices or credentials, and never changes orders. Free-tier content may be used by Google to improve its products.">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-end"><Checkbox label="Enable Gemini drafting" checked={s.ai.gemini_enabled} onChange={(e) => upd('ai', { gemini_enabled: e.target.checked })} /></div>
            <Field label="Model" htmlFor="gm" hint="Free-tier model, e.g. gemini-3.5-flash-lite"><Input id="gm" dir="ltr" value={s.ai.model} onChange={(e) => upd('ai', { model: e.target.value })} /></Field>
            <Field label="Daily request cap" htmlFor="gl" hint={`Used today: ${data.ai_usage_today}`}><Input id="gl" type="number" min={1} value={s.ai.daily_limit} onChange={(e) => upd('ai', { daily_limit: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-sm text-muted">API key: {data.env.gemini_key ? <Badge kind="ok">configured</Badge> : <Badge>not set</Badge>}</p>
          <SecretInput name="gemini_api_key" label="Replace Gemini API key (optional)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        </Section>

        <Card>
          <h2 className="text-lg font-semibold">Integration health</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>Email: {data.health.email.usable ? <Badge kind="ok">ready</Badge> : <Badge kind="warn">manual mode</Badge>} <span className="text-muted">{data.health.email.reason}</span></li>
            <li>WhatsApp API: {data.health.whatsapp.usable ? <Badge kind="ok">ready</Badge> : <Badge kind="warn">manual mode</Badge>} <span className="text-muted">{data.health.whatsapp.reason}</span></li>
            <li>Cloudflare Email binding: {data.env.email_binding ? <Badge kind="ok">present</Badge> : <Badge>not configured</Badge>}</li>
            <li>Cloudflare Access on /admin: {data.env.cloudflare_access ? <Badge kind="ok">enforced</Badge> : <Badge>not configured (password + optional 2FA in use)</Badge>}</li>
            <li>Environment: <Badge kind="info">{data.env.app_env}</Badge></li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function MethodEditor({ m, onChange, onRemove }: { m: PaymentMethod; onChange: (m: PaymentMethod) => void; onRemove: () => void }) {
  const set = (k: keyof PaymentMethod, v: any) => onChange({ ...m, [k]: v });
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Checkbox label={<b>{m.label_en} enabled</b>} checked={m.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <span className="text-xs text-dim">{m.type} · id {m.id}</span>
        <button className="text-xs text-muted underline" onClick={onRemove}>Remove</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Label (Arabic)" htmlFor={`${m.id}-la`}><Input id={`${m.id}-la`} dir="rtl" value={m.label_ar} onChange={(e) => set('label_ar', e.target.value)} /></Field>
        <Field label="Label (English)" htmlFor={`${m.id}-le`}><Input id={`${m.id}-le`} value={m.label_en} onChange={(e) => set('label_en', e.target.value)} /></Field>
        <Field label={m.type === 'instapay' ? 'InstaPay address or mobile' : m.type === 'wallet' ? 'Wallet number' : 'Account number'} htmlFor={`${m.id}-ac`}><Input id={`${m.id}-ac`} dir="ltr" value={m.account} onChange={(e) => set('account', e.target.value)} /></Field>
        <Field label="Account holder name (as shown to payer)" htmlFor={`${m.id}-an`}><Input id={`${m.id}-an`} value={m.account_name} onChange={(e) => set('account_name', e.target.value)} /></Field>
        {m.type === 'wallet' && <Field label="Wallet provider" htmlFor={`${m.id}-wp`}><Select id={`${m.id}-wp`} value={m.wallet_provider ?? ''} onChange={(e) => set('wallet_provider', e.target.value)}>{['Vodafone Cash', 'Etisalat Cash (e&)', 'Orange Cash', 'WE Pay', 'Other'].map((x) => <option key={x}>{x}</option>)}</Select></Field>}
        {m.type === 'bank' && <Field label="Bank name" htmlFor={`${m.id}-bn`}><Input id={`${m.id}-bn`} value={m.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} /></Field>}
        {m.type === 'bank' && <Field label="IBAN (optional)" htmlFor={`${m.id}-ib`}><Input id={`${m.id}-ib`} dir="ltr" value={m.iban ?? ''} onChange={(e) => set('iban', e.target.value)} /></Field>}
        {m.type === 'instapay' && <Field label="InstaPay payment link (optional)" htmlFor={`${m.id}-il`}><Input id={`${m.id}-il`} dir="ltr" placeholder="https://ipn.eg/…" value={m.instapay_link ?? ''} onChange={(e) => set('instapay_link', e.target.value)} /></Field>}
        <Field label="Extra instructions (Arabic)" htmlFor={`${m.id}-ia`}><Input id={`${m.id}-ia`} dir="rtl" value={m.instructions_ar ?? ''} onChange={(e) => set('instructions_ar', e.target.value)} /></Field>
        <Field label="Extra instructions (English)" htmlFor={`${m.id}-ie`}><Input id={`${m.id}-ie`} value={m.instructions_en ?? ''} onChange={(e) => set('instructions_en', e.target.value)} /></Field>
      </div>
    </div>
  );
}

function ScheduleEditor({ s, setS }: { s: BusinessSettings; setS: (s: BusinessSettings) => void }) {
  const week = s.schedule.week;
  const setDay = (d: number, list: Array<{ start: string; end: string }>) => setS({ ...s, schedule: { ...s.schedule, week: { ...week, [String(d)]: list } } });
  const [hDate, setHDate] = useState('');
  const [hLabel, setHLabel] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Button size="sm" variant="ghost" onClick={() => setS({ ...s, schedule: { ...s.schedule, week: Object.fromEntries([0, 1, 2, 3, 4, 6].map((d) => [String(d), [{ start: '10:00', end: '22:00' }]])) } })}>Template: Sat–Thu 10:00–22:00</Button>
        <Button size="sm" variant="ghost" onClick={() => setS({ ...s, schedule: { ...s.schedule, week: Object.fromEntries([0, 1, 2, 3, 4].map((d) => [String(d), [{ start: '09:00', end: '17:00' }]])) } })}>Template: Sun–Thu 9–5</Button>
      </div>
      <p className="text-xs text-warn">Templates are only starting points — set your real hours before saving.</p>
      {[6, 0, 1, 2, 3, 4, 5].map((d) => {
        const list = week[String(d)] ?? [];
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 border-b border-line/50 pb-2">
            <span className="w-24 text-sm font-medium">{DAYS[d]}</span>
            {list.length === 0 && <span className="text-sm text-dim">Closed</span>}
            {list.map((iv, i) => (
              <span key={i} className="flex items-center gap-1">
                <Input type="time" className="!min-h-9 w-28" value={iv.start} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label={`${DAYS[d]} start`} />
                –
                <Input type="time" className="!min-h-9 w-28" value={iv.end === '24:00' ? '23:59' : iv.end} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? { ...x, end: e.target.value === '23:59' ? '24:00' : e.target.value } : x)))} aria-label={`${DAYS[d]} end`} />
                <button className="px-1 text-muted" onClick={() => setDay(d, list.filter((_, j) => j !== i))} aria-label="Remove range">✕</button>
              </span>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setDay(d, [...list, { start: list.length ? '17:00' : '10:00', end: list.length ? '22:00' : '14:00' }])}>+ range</Button>
          </div>
        );
      })}
      <div>
        <p className="text-sm font-medium">Holidays / closed dates</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Date" htmlFor="hd"><Input id="hd" type="date" className="w-44" value={hDate} onChange={(e) => setHDate(e.target.value)} /></Field>
          <Field label="Label" htmlFor="hl"><Input id="hl" className="w-56" value={hLabel} onChange={(e) => setHLabel(e.target.value)} /></Field>
          <Button size="sm" variant="secondary" disabled={!hDate} onClick={() => { setS({ ...s, schedule: { ...s.schedule, holidays: [...s.schedule.holidays.filter((h) => h.date !== hDate), { date: hDate, label: hLabel }].sort((a, b) => a.date.localeCompare(b.date)) } }); setHDate(''); setHLabel(''); }}>Add closed date</Button>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {s.schedule.holidays.map((h) => <li key={h.date} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1">{h.date} {h.label} <button aria-label="Remove" onClick={() => setS({ ...s, schedule: { ...s.schedule, holidays: s.schedule.holidays.filter((x) => x.date !== h.date) } })}>✕</button></li>)}
        </ul>
      </div>
    </div>
  );
}

function SecretInput({ name, label, secrets, onSaved, setMsg }: { name: string; label: string; secrets: SettingsResp['secrets']; onSaved: () => void; setMsg: (m: any) => void }) {
  const [v, setV] = useState('');
  const st = secrets[name];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1"><Field label={<>{label} {st?.set ? <Badge kind="ok">stored {st.hint}</Badge> : <Badge>not set</Badge>}</>} htmlFor={`sec-${name}`}>
        <Input id={`sec-${name}`} type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder={st?.set ? 'Enter a new value to replace' : 'Paste value'} />
      </Field></div>
      <Button size="sm" variant="secondary" disabled={v.length < 4} onClick={async () => { try { await adminApi.put(`/secrets/${name}`, { value: v }); setV(''); onSaved(); setMsg({ kind: 'ok', text: `${label} saved (encrypted).` }); } catch (e) { setMsg(errMsg(e)); } }}>Save</Button>
      {st?.set && st.hint !== 'Worker secret' && <Button size="sm" variant="ghost" onClick={async () => { if (confirm('Remove this credential?')) { await adminApi.del(`/secrets/${name}`); onSaved(); } }}>Remove</Button>}
    </div>
  );
}

function NotificationsSection({ data, s, upd, save, busy, reload, setMsg }: any) {
  const n = s.notifications as BusinessSettings['notifications'];
  const [to, setTo] = useState({ email: '', whatsapp: '' });
  const [testRes, setTestRes] = useState<any>(null);
  const test = async (channel: 'email' | 'whatsapp') => {
    setTestRes(null);
    try { const r = await adminApi.post<any>('/integrations/test', { channel, to: to[channel] }); setTestRes(r.ok ? { kind: 'ok', text: `${channel}: accepted by ${r.provider}. ${r.note}` } : { kind: 'bad', text: `${channel} test failed: ${r.error}` }); }
    catch (e) { setTestRes(errMsg(e)); }
  };
  return (
    <Section id="notifications" title="Customer notifications (optional)" onSave={() => save('notifications')} busy={busy === 'notifications'}
      desc="Without a sending provider the store runs in honest manual mode: each update shows as “manual action required” in the order with a WhatsApp shortcut. Nothing is labelled sent unless a provider accepted it.">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Email provider" htmlFor="ep">
          <Select id="ep" value={n.email_provider} onChange={(e) => upd('notifications', { email_provider: e.target.value })}>
            <option value="none">None (manual mode)</option><option value="resend">Resend (free tier: account + DNS verification needed)</option><option value="cloudflare">Cloudflare Email Service (Workers Paid)</option>
          </Select>
        </Field>
        <Field label="From address (verified sender)" htmlFor="fe"><Input id="fe" dir="ltr" placeholder="orders@lynto.store" value={n.from_email} onChange={(e) => upd('notifications', { from_email: e.target.value })} /></Field>
        <Field label="From name" htmlFor="fn"><Input id="fn" value={n.from_name} onChange={(e) => upd('notifications', { from_name: e.target.value })} /></Field>
        <Field label="Reply-to (optional)" htmlFor="rt"><Input id="rt" dir="ltr" value={n.reply_to} onChange={(e) => upd('notifications', { reply_to: e.target.value })} /></Field>
        <Field label="Owner alert email (new orders, proofs, overdue)" htmlFor="oa"><Input id="oa" dir="ltr" value={n.owner_alert_email} onChange={(e) => upd('notifications', { owner_alert_email: e.target.value })} /></Field>
      </div>
      {n.email_provider === 'resend' && <>
        <SecretInput name="resend_api_key" label="Resend API key" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        <SecretInput name="resend_webhook_secret" label="Resend webhook signing secret (optional, for delivery confirmations)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        <p className="text-xs text-dim">Webhook URL: <code>{data.webhooks.resend}</code> (events: email.delivered, email.bounced, email.complained)</p>
      </>}
      <hr className="border-line" />
      <Checkbox label={<b>Enable WhatsApp Cloud API</b>} checked={n.whatsapp_enabled} onChange={(e) => upd('notifications', { whatsapp_enabled: e.target.checked })} />
      {n.whatsapp_enabled && <>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Phone number ID" htmlFor="wpn"><Input id="wpn" dir="ltr" value={n.whatsapp_phone_number_id} onChange={(e) => upd('notifications', { whatsapp_phone_number_id: e.target.value.trim() })} /></Field>
          <Field label="Graph API version" htmlFor="wv"><Input id="wv" dir="ltr" value={n.whatsapp_api_version} onChange={(e) => upd('notifications', { whatsapp_api_version: e.target.value.trim() })} /></Field>
        </div>
        <SecretInput name="whatsapp_access_token" label="WhatsApp access token (system user)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        <SecretInput name="whatsapp_app_secret" label="Meta app secret (verifies webhooks)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        <SecretInput name="whatsapp_verify_token" label="Webhook verify token (any random string you also enter in Meta)" secrets={data.secrets} onSaved={reload} setMsg={setMsg} />
        <p className="text-xs text-dim">Webhook callback URL: <code>{data.webhooks.whatsapp}</code> (subscribe to “messages”). Business-initiated messages need approved templates. Messages go only to customers who opted in at checkout.</p>
        <div className="space-y-2">
          <p className="text-sm font-medium">Approved template per event</p>
          {Object.entries(data.whatsapp_template_guide).map(([ev, g]: any) => (
            <div key={ev} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[180px_1fr_120px]">
              <span className="text-sm font-medium">{ev.replace(/_/g, ' ')}</span>
              <Input dir="ltr" placeholder="template_name" value={n.whatsapp_templates[ev]?.name ?? ''} onChange={(e) => upd('notifications', { whatsapp_templates: { ...n.whatsapp_templates, [ev]: { ...(n.whatsapp_templates[ev] ?? { language: 'ar_EG' }), name: e.target.value.trim() } } })} />
              <Input dir="ltr" placeholder="ar_EG" value={n.whatsapp_templates[ev]?.language ?? 'ar_EG'} onChange={(e) => upd('notifications', { whatsapp_templates: { ...n.whatsapp_templates, [ev]: { ...(n.whatsapp_templates[ev] ?? { name: '' }), language: e.target.value.trim() } } })} />
              <p className="text-xs text-dim md:col-span-3" dir="rtl">Suggested ({g.category}): {g.ar}</p>
            </div>
          ))}
        </div>
      </>}
      <hr className="border-line" />
      <p className="text-sm font-medium">Send a test to yourself (save settings first)</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="flex gap-2"><Input dir="ltr" placeholder="your-email@example.com" value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} /><Button size="sm" variant="secondary" onClick={() => test('email')} disabled={!to.email}>Test email</Button></div>
        <div className="flex gap-2"><Input dir="ltr" placeholder="+20…" value={to.whatsapp} onChange={(e) => setTo({ ...to, whatsapp: e.target.value })} /><Button size="sm" variant="secondary" onClick={() => test('whatsapp')} disabled={!to.whatsapp}>Test WhatsApp</Button></div>
      </div>
      <Notice msg={testRes} />
    </Section>
  );
}
