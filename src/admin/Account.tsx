import { useState } from 'react';
import { adminApi } from '../lib/api';
import { Alert, Button, Card, CopyButton, Field, Input, Spinner } from '../components/ui';
import { Notice, PageHeader, errMsg, useAdmin, when } from './common';

export function Account() {
  const settings = useAdmin<any>('/settings');
  const audit = useAdmin<{ entries: any[] }>('/audit');
  const [msg, setMsg] = useState<any>(null);
  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const [profile, setProfile] = useState<{ email: string; name: string } | null>(null);
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  if (!settings.data) return <Spinner />;
  const admin = settings.data.admin;
  const p = profile ?? { email: admin.email, name: admin.name };
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: ok }); settings.reload(); } catch (e) { setMsg(errMsg(e)); } };
  return (
    <>
      <PageHeader title="Account & security" />
      <div className="mb-4"><Notice msg={msg} /></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Owner profile</h2>
          <Field label="Name" htmlFor="pn"><Input id="pn" value={p.name} onChange={(e) => setProfile({ ...p, name: e.target.value })} /></Field>
          <Field label="Sign-in email" htmlFor="pe"><Input id="pe" type="email" value={p.email} onChange={(e) => setProfile({ ...p, email: e.target.value })} /></Field>
          <Button size="sm" onClick={() => run(() => adminApi.post('/auth/profile', p), 'Profile saved.')}>Save profile</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Change password</h2>
          <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password (12+ characters)" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Repeat new password" htmlFor="np2"><Input id="np2" type="password" autoComplete="new-password" value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} /></Field>
          <Button size="sm" disabled={!pw.next || pw.next !== pw.next2} onClick={() => run(() => adminApi.post('/auth/password', { current: pw.current, next: pw.next }), 'Password changed. Other sessions were signed out.')}>Change password</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Two-step verification (authenticator app)</h2>
          {admin.totp_enabled ? (
            <>
              <Alert kind="ok">Enabled.</Alert>
              <Field label="Password to disable" htmlFor="dp"><Input id="dp" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} /></Field>
              <Button size="sm" variant="danger" onClick={() => run(() => adminApi.post('/auth/totp/disable', { password: disablePw }), 'Two-step verification disabled.')}>Disable</Button>
            </>
          ) : totp ? (
            <>
              <p className="text-sm text-muted">Add this key in Google Authenticator, Microsoft Authenticator, 1Password or similar (“enter a setup key”), then type the 6-digit code.</p>
              <p className="break-all rounded-lg bg-ink/70 p-3 font-mono text-sm">{totp.secret.match(/.{1,4}/g)?.join(' ')}</p>
              <div className="flex flex-wrap gap-2"><CopyButton value={totp.secret} label="Copy key" copiedLabel="Copied" /><a href={totp.uri} className="text-sm text-cyan underline">Open in authenticator app</a></div>
              <Field label="6-digit code" htmlFor="tc"><Input id="tc" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
              <Button size="sm" onClick={() => run(() => adminApi.post('/auth/totp/enable', { code }), 'Two-step verification enabled.')}>Verify & enable</Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={async () => { try { setTotp(await adminApi.post('/auth/totp/begin')); } catch (e) { setMsg(errMsg(e)); } }}>Set up two-step verification</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => run(() => adminApi.post('/auth/logout-others'), 'Other sessions signed out.')}>Sign out all other sessions</Button>
        </Card>
        <Card className="xl:col-span-2">
          <h2 className="font-semibold">Audit log (latest 300)</h2>
          {!audit.data ? <Spinner /> : (
            <div className="mt-3 max-h-[480px] overflow-auto text-xs">
              <table className="w-full">
                <tbody>{audit.data.entries.map((e) => (
                  <tr key={e.id} className="border-t border-line/50 align-top">
                    <td className="whitespace-nowrap py-1.5 pe-3 text-dim">{when(e.created_at)}</td>
                    <td className="py-1.5 pe-3">{e.action}</td>
                    <td className="py-1.5 pe-3 text-muted">{e.entity} {e.entity_id}</td>
                    <td className="py-1.5 text-dim break-all">{e.actor}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
