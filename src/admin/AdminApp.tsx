import { useEffect, useState, type FormEvent } from 'react';
import { I18nProvider } from '../i18n';
import { Link, match, navigate, useLocation } from '../lib/router';
import { adminApi, ApiError } from '../lib/api';
import { Logo } from '../components/Layout';
import { Alert, Button, Field, Input, Spinner, cx } from '../components/ui';
import { usePageTitle } from '../components/usePageTitle';
import { Dashboard } from './Dashboard';
import { SalesPage } from './Sales';
import { OrdersList, OrderDetail } from './Orders';
import { ProductsList } from './Products';
import { ProductEditor } from './ProductEditor';
import { Pricing } from './Pricing';
import { Inbox } from './Inbox';
import { Mail } from './Mail';
import { Setup } from './Setup';
import { Account } from './Account';

type Status = { admin_exists: boolean; setup_available: boolean; signed_in: boolean; mfa_pending: boolean; admin: { id: string; email: string; name: string } | null };

const NAV = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/sales', label: 'Sales' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/pricing', label: 'Pricing' },
  { to: '/admin/inbox', label: 'Notifications & support' },
  { to: '/admin/mail', label: 'Email' },
  { to: '/admin/setup', label: 'Setup' },
  { to: '/admin/account', label: 'Account' },
];

export default function AdminApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const refresh = () => adminApi.get<Status>('/auth/status').then(setStatus).catch((e: ApiError) => setError(e.message));
  useEffect(() => { refresh(); }, []);
  useEffect(() => { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; }, []);
  usePageTitle('LYnto Admin', { noindex: true });
  return (
    <I18nProvider lang="en">
      {error ? <div className="p-6"><Alert kind="bad" title="Admin unavailable">{error}</Alert></div>
        : !status ? <Spinner label="Loading…" />
        : !status.signed_in ? <AuthScreens status={status} onDone={refresh} />
        : <Shell status={status} onSignOut={refresh} />}
    </I18nProvider>
  );
}

function AuthScreens({ status, onDone }: { status: Status; onDone: () => void }) {
  const { pathname, hash } = useLocation();
  const setupToken = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? '';
  const [form, setForm] = useState({ email: '', name: '', password: '', password2: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isSetup = pathname === '/admin/setup-account';

  const run = async (e: FormEvent, fn: () => Promise<unknown>) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await fn(); onDone(); } catch (err) { setMsg((err as ApiError).message); } finally { setBusy(false); }
  };

  let body;
  if (status.mfa_pending) {
    body = (
      <form onSubmit={(e) => run(e, () => adminApi.post('/auth/mfa', { code: form.code.trim() }))} className="space-y-4">
        <h1 className="text-xl font-bold">Two-step verification</h1>
        <Field label="6-digit code from your authenticator app" htmlFor="code"><Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Button type="submit" loading={busy} className="w-full">Verify</Button>
      </form>
    );
  } else if (!status.admin_exists) {
    if (!isSetup || !setupToken) {
      body = <Alert kind="warn" title="Admin account not created yet">Open the one-time setup link from the project file <code>.admin-setup-link.txt</code> (it contains a private token). The setup page is disabled without it.</Alert>;
    } else if (!status.setup_available) {
      body = <Alert kind="bad" title="Setup is not available">The setup token secret is missing on this deployment.</Alert>;
    } else {
      body = (
        <form onSubmit={(e) => run(e, async () => {
          if (form.password !== form.password2) throw new ApiError(400, 'mismatch', 'Passwords do not match.');
          await adminApi.post('/auth/setup', { token: setupToken, email: form.email, name: form.name, password: form.password });
          window.history.replaceState(null, '', '/admin');
        })} className="space-y-4">
          <h1 className="text-xl font-bold">Create the owner account</h1>
          <p className="text-sm text-muted">This one-time link works only until the first admin is created.</p>
          <Field label="Your name" htmlFor="n"><Input id="n" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></Field>
          <Field label="Email (used to sign in)" htmlFor="e"><Input id="e" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" /></Field>
          <Field label="Password (12+ characters)" htmlFor="p"><Input id="p" type="password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Repeat password" htmlFor="p2"><Input id="p2" type="password" required minLength={12} value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} autoComplete="new-password" /></Field>
          <Button type="submit" loading={busy} className="w-full">Create account</Button>
        </form>
      );
    }
  } else {
    body = (
      <form onSubmit={(e) => run(e, () => adminApi.post<{ mfa_required: boolean }>('/auth/login', { email: form.email, password: form.password }))} className="space-y-4">
        <h1 className="text-xl font-bold">Sign in</h1>
        <Field label="Email" htmlFor="e"><Input id="e" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" /></Field>
        <Field label="Password" htmlFor="p"><Input id="p" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" /></Field>
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      </form>
    );
  }
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {body}
        {msg && <p className="mt-4 text-sm text-bad" role="alert">{msg}</p>}
      </div>
    </div>
  );
}

function Shell({ status, onSignOut }: { status: Status; onSignOut: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  if (pathname === '/admin/setup-account') { navigate('/admin', { replace: true }); return null; }
  let m: Record<string, string> | null;
  let page;
  if (pathname === '/admin' || pathname === '/admin/') page = <Dashboard />;
  else if (pathname === '/admin/orders') page = <OrdersList />;
  else if ((m = match('/admin/orders/:id', pathname))) page = <OrderDetail key={m.id} id={m.id} />;
  else if (pathname === '/admin/sales') page = <SalesPage />;
  else if (pathname === '/admin/products') page = <ProductsList />;
  else if (pathname === '/admin/products/new') page = <ProductEditor key="new" id={null} />;
  else if ((m = match('/admin/products/:id', pathname))) page = <ProductEditor key={m.id} id={m.id} />;
  else if (pathname === '/admin/pricing') page = <Pricing />;
  else if (pathname === '/admin/inbox' || pathname === '/admin/support') page = <Inbox />;
  else if (pathname === '/admin/mail') page = <Mail />;
  else if (pathname === '/admin/setup') page = <Setup />;
  else if (pathname === '/admin/account') page = <Account />;
  else page = <Alert kind="warn" title="Page not found" />;
  const active = (to: string) => (to === '/admin' ? pathname === '/admin' : pathname.startsWith(to));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-ink/60 lg:min-h-dvh lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-4 py-3 lg:py-5">
          <Link href="/admin" aria-label="Admin home"><Logo className="!h-8" /></Link>
          <button className="lg:hidden rounded-lg border border-line px-3 py-2 text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Menu</button>
        </div>
        <nav className={cx('px-2 pb-3 lg:block', open ? 'block' : 'hidden')} aria-label="Admin">
          {NAV.map((n) => (
            <Link key={n.to} href={n.to} className={cx('block rounded-lg px-3 py-2.5 text-sm font-medium', active(n.to) ? 'bg-cyan/10 text-cyan' : 'text-muted hover:text-text hover:bg-text/5')}>{n.label}</Link>
          ))}
          <div className="mt-4 border-t border-line px-3 pt-4 text-xs text-dim">
            <p className="truncate">{status.admin?.email}</p>
            <a href="/" target="_blank" rel="noopener" className="mt-2 block text-cyan">View store ↗</a>
            <button className="mt-2 text-muted hover:text-text" onClick={async () => { await adminApi.post('/auth/logout'); onSignOut(); }}>Sign out</button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8">{page}</main>
    </div>
  );
}
