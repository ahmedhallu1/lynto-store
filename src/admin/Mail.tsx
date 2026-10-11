import { useState } from 'react';
import { adminApi } from '../lib/api';
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Textarea, cx } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin, when } from './common';

type Info = { domain: string; provider: string; ready: boolean; reason: string; suggested: string[]; default_from_name: string; domain_status: { available: boolean; status?: string; note?: string; region?: string } };
type LogRow = { id: string; from_addr: string; to_addr: string; subject: string; status: string; error: string | null; created_at: number; order_id: string | null; order_number: string | null; created_by: string };

// Ready-made messages. {{name}} and {{order}} are replaced when you pick a template.
const TEMPLATES: Array<{ key: string; label: string; lang: 'ar' | 'en'; subject: string; body: string }> = [
  { key: 'info_needed', label: 'Need more info (AR)', lang: 'ar', subject: 'محتاجين معلومة بخصوص طلبك {{order}}',
    body: 'أهلاً {{name}}،\n\nعشان نكمل تجهيز طلبك رقم {{order}} محتاجين منك المعلومة دي:\n\n- \n\nأول ما تبعتها هنكمل على طول.\n\nشكراً،\nفريق LYnto' },
  { key: 'activation_help', label: 'Activation steps (AR)', lang: 'ar', subject: 'خطوات تفعيل اشتراكك — طلب {{order}}',
    body: 'أهلاً {{name}}،\n\nتفاصيل التفعيل موجودة في صفحة طلبك الآمنة. الخطوات:\n\n1. افتح رابط الطلب اللي وصلك.\n2. اضغط "اعرض التفاصيل".\n3. اتبع التعليمات المكتوبة.\n\nلو حصلت أي مشكلة رد علينا هنا وهنساعدك.\n\nفريق LYnto' },
  { key: 'replacement', label: 'Replacement sent (AR)', lang: 'ar', subject: 'بعتنالك بديل لطلب {{order}}',
    body: 'أهلاً {{name}}،\n\nراجعنا المشكلة وبعتنالك البديل في صفحة طلبك رقم {{order}}. جرّبه وطمّنا.\n\nفريق LYnto' },
  { key: 'refund_done', label: 'Refund sent (AR)', lang: 'ar', subject: 'تم رد المبلغ — طلب {{order}}',
    body: 'أهلاً {{name}}،\n\nحوّلنالك المبلغ بتاع طلب {{order}} على نفس وسيلة الدفع. ممكن يستغرق وقت بسيط عشان يظهر عندك.\n\nنعتذر عن أي إزعاج.\nفريق LYnto' },
  { key: 'general_ar', label: 'General reply (AR)', lang: 'ar', subject: 'رد من LYnto', body: 'أهلاً {{name}}،\n\n\n\nفريق LYnto' },
  { key: 'info_needed_en', label: 'Need more info (EN)', lang: 'en', subject: 'We need one more detail for order {{order}}',
    body: 'Hi {{name}},\n\nTo finish preparing order {{order}} we need this from you:\n\n- \n\nAs soon as you send it we will continue right away.\n\nThanks,\nLYnto team' },
  { key: 'general_en', label: 'General reply (EN)', lang: 'en', subject: 'Reply from LYnto', body: 'Hi {{name}},\n\n\n\nLYnto team' },
];

export function Mail() {
  const info = useAdmin<Info>('/mail/info');
  const log = useAdmin<{ emails: LogRow[] }>('/mail/log');
  const [tab, setTab] = useState<'compose' | 'sent'>('compose');
  const [form, setForm] = useState({ from_local: 'orders', custom: '', from_name: '', to: '', reply_to: '', subject: '', body: '', lang: 'ar' as 'ar' | 'en', order_number: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<any>(null);
  if (info.error) return <Alert kind="bad" title={info.error} />;
  if (!info.data) return <Spinner />;
  const i = info.data;
  const local = form.from_local === '__custom' ? form.custom.trim().toLowerCase() : form.from_local;

  const applyTemplate = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const fill = (s: string) => s.replaceAll('{{name}}', '…').replaceAll('{{order}}', form.order_number || '…');
    setForm({ ...form, lang: t.lang, subject: fill(t.subject), body: fill(t.body) });
  };

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      let order_id: string | null = null;
      if (form.order_number.trim()) {
        const r = await adminApi.get<{ orders: Array<{ id: string; number: string }> }>(`/orders?q=${encodeURIComponent(form.order_number.trim())}`);
        order_id = r.orders.find((o) => o.number.toUpperCase() === form.order_number.trim().toUpperCase())?.id ?? null;
        if (!order_id) { setMsg({ kind: 'bad', text: `Order ${form.order_number} was not found. Clear the order field or fix the number.` }); setBusy(false); return; }
      }
      const r = await adminApi.post<{ from: string; results: Array<{ to: string; status: string; error?: string }> }>('/mail/send', {
        from_local: local, from_name: form.from_name || undefined, to: form.to.split(/[,;\s]+/).filter(Boolean), reply_to: form.reply_to || undefined,
        subject: form.subject, body: form.body, lang: form.lang, order_id,
      });
      const failed = r.results.filter((x) => x.status !== 'sent');
      setMsg(failed.length
        ? { kind: 'bad', text: `Some messages failed:`, details: failed.map((f) => `${f.to}: ${f.error}`) }
        : { kind: 'ok', text: `Sent from ${r.from} to ${r.results.map((x) => x.to).join(', ')}. “Accepted by provider” means Resend took it; delivery shows in the Sent tab when Resend confirms.` });
      log.reload();
      if (!failed.length) setForm({ ...form, subject: '', body: '' });
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };

  const ds = i.domain_status;
  return (
    <>
      <PageHeader title="Email" sub={<>Send from any username @{i.domain} — orders, support, contact, info… Replies go to the Reply-To address.</>} />
      <div className="mb-4 space-y-2">
        {!i.ready && <Alert kind="warn" title="Email sending is not ready">{i.reason} Finish it in <a className="underline" href="/admin/setup#notifications">Setup → Customer notifications</a>.</Alert>}
        {i.ready && ds.available && ds.status !== 'verified' && <Alert kind="warn" title={`Domain ${i.domain} status: ${ds.status}`}>Resend has not verified the DNS records yet. Open Resend → Domains and press “Verify”.</Alert>}
        {i.ready && ds.available && ds.status === 'verified' && <Alert kind="ok" title={`${i.domain} is verified in Resend (${ds.region ?? ''}). You can send from any @${i.domain} address.`} />}
        {i.ready && !ds.available && <p className="text-xs text-dim">{ds.note}</p>}
      </div>
      <div className="mb-4 flex gap-2">
        {(['compose', 'sent'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === 'sent') log.reload(); }} className={cx('rounded-full border px-3 py-1.5 text-sm capitalize', tab === t ? 'border-cyan bg-cyan/10 text-cyan' : 'border-line text-muted')}>{t === 'sent' ? 'Sent mail' : 'Compose'}</button>
        ))}
      </div>

      {tab === 'compose' ? (
        <Card className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
            <Field label="From (username)" htmlFor="m-from" hint={`Becomes ${local || '…'}@${i.domain}`}>
              <Select id="m-from" value={form.from_local} onChange={(e) => setForm({ ...form, from_local: e.target.value })}>
                {i.suggested.map((u) => <option key={u} value={u}>{u}@{i.domain}</option>)}
                <option value="__custom">Other username…</option>
              </Select>
            </Field>
            {form.from_local === '__custom'
              ? <Field label="Custom username" htmlFor="m-cu"><Input id="m-cu" dir="ltr" placeholder="e.g. ahmed" value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} /></Field>
              : <Field label="Display name" htmlFor="m-fn" hint={`Default: ${i.default_from_name}`}><Input id="m-fn" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></Field>}
            <Field label="Language / direction" htmlFor="m-lang"><Select id="m-lang" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as 'ar' | 'en' })}><option value="ar">Arabic (RTL)</option><option value="en">English (LTR)</option></Select></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="To (comma-separated, up to 10)" htmlFor="m-to"><Input id="m-to" dir="ltr" placeholder="customer@example.com" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
            <Field label="Reply-To (optional)" htmlFor="m-rt" hint="Default: the From address"><Input id="m-rt" dir="ltr" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} /></Field>
            <Field label="Template" htmlFor="m-tpl"><Select id="m-tpl" value="" onChange={(e) => applyTemplate(e.target.value)}><option value="">Choose a template…</option>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select></Field>
            <Field label="Attach to order (optional)" htmlFor="m-ord" hint="Logs the email on the order timeline"><Input id="m-ord" dir="ltr" placeholder="LY-XXXXXX" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Subject" htmlFor="m-sub"><Input id="m-sub" dir="auto" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Message" htmlFor="m-body" hint="Plain text. Blank line = new paragraph. Links become clickable. It is wrapped in the LYnto email design.">
            <Textarea id="m-body" rows={10} dir="auto" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <Notice msg={msg} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={send} loading={busy} disabled={!i.ready || !form.to.trim() || !form.subject.trim() || !form.body.trim() || !local}>Send email</Button>
            <span className="text-xs text-dim">Never put passwords or full card/bank numbers in emails.</span>
          </div>
        </Card>
      ) : !log.data ? <Spinner /> : log.data.emails.length === 0 ? <p className="text-muted">Nothing sent from here yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-xs text-muted"><tr><th className="p-3 text-start">When</th><th className="p-3 text-start">From → To</th><th className="p-3 text-start">Subject</th><th className="p-3 text-start">Status</th></tr></thead>
            <tbody>{log.data.emails.map((e) => (
              <tr key={e.id} className="border-t border-line/60 align-top">
                <td className="p-3 whitespace-nowrap text-xs text-muted">{when(e.created_at)}</td>
                <td className="p-3 text-xs" dir="ltr">{e.from_addr}<br />→ {e.to_addr}{e.order_number && <><br /><span className="text-cyan">{e.order_number}</span></>}</td>
                <td className="p-3" dir="auto">{e.subject}</td>
                <td className="p-3"><Badge kind={e.status === 'delivered' ? 'ok' : e.status === 'sent' ? 'cyan' : e.status === 'failed' ? 'bad' : 'neutral'}>{e.status === 'sent' ? 'accepted by provider' : e.status}</Badge>{e.error && <p className="mt-1 text-xs text-bad">{e.error}</p>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
