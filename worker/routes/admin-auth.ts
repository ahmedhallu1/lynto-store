import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../env';
import { accessGate, createSession, csrfOk, destroySession, readSession, requireAdmin } from '../lib/auth';
import { PBKDF2_ITERATIONS, base32Encode, decryptText, encryptText, hashPassword, newId, randomBytes, timingSafeEqual, verifyPassword, verifyTotp } from '../lib/crypto';
import { HttpError, audit, bad, clientIp, enforceRate, forbidden, ipHash, now } from '../lib/util';

export const adminAuth = new Hono<AppContext>();

adminAuth.use('*', async (c, next) => {
  if (!(await accessGate(c))) throw new HttpError(403, 'access_denied');
  if (!csrfOk(c)) throw new HttpError(403, 'csrf');
  c.header('cache-control', 'no-store');
  await next();
});

const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(200);

adminAuth.get('/status', async (c) => {
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  const s = await readSession(c, true);
  return c.json({
    admin_exists: (count?.n ?? 0) > 0,
    setup_available: (count?.n ?? 0) === 0 && !!c.env.SETUP_TOKEN && c.env.SETUP_TOKEN.length >= 32,
    signed_in: !!s && !s.mfaPending,
    mfa_pending: !!s?.mfaPending,
    admin: s && !s.mfaPending ? s.admin : null,
  });
});

// One-time bootstrap: requires the SETUP_TOKEN Worker secret and only works while no admin exists.
adminAuth.post('/setup', async (c) => {
  await enforceRate(c.env, `setup:${await ipHash(c.env, clientIp(c))}`, 5, 3600_000);
  const body = z.object({ token: z.string().min(32).max(200), email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().max(80).default(''), password: passwordSchema })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input', body.error.issues[0]?.message);
  if (!c.env.SETUP_TOKEN || c.env.SETUP_TOKEN.length < 32 || !timingSafeEqual(body.data.token, c.env.SETUP_TOKEN)) throw forbidden('invalid_setup_token');
  const id = newId('adm');
  const t = now();
  const res = await c.env.DB.prepare(`INSERT INTO admins (id, email, name, password_hash, created_at, updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM admins)`)
    .bind(id, body.data.email, body.data.name, await hashPassword(body.data.password), t, t).run();
  if (res.meta.changes !== 1) throw forbidden('setup_already_completed');
  await audit(c.env, `admin:${id}`, 'admin_created', 'admin', id, { email: body.data.email });
  await createSession(c, id, false);
  return c.json({ ok: true });
});

adminAuth.post('/login', async (c) => {
  const ih = await ipHash(c.env, clientIp(c));
  await enforceRate(c.env, `login-ip:${ih}`, 10, 900_000);
  const body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input');
  await enforceRate(c.env, `login-email:${body.data.email}`, 6, 900_000);
  const a = await c.env.DB.prepare('SELECT * FROM admins WHERE email = ? AND disabled = 0').bind(body.data.email).first<any>();
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = a ? await verifyPassword(body.data.password, a.password_hash) : (await verifyPassword(body.data.password, `pbkdf2$sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`), false);
  if (!a || !ok) {
    await audit(c.env, 'anonymous', 'login_failed', 'admin', a?.id ?? '', { ip_hash: ih });
    throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  await createSession(c, a.id, !!a.totp_enabled);
  if (!a.totp_enabled) {
    await c.env.DB.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(now(), a.id).run();
    await audit(c.env, `admin:${a.id}`, 'login', 'admin', a.id, { ip_hash: ih });
  }
  return c.json({ ok: true, mfa_required: !!a.totp_enabled });
});

adminAuth.post('/mfa', async (c) => {
  const s = await readSession(c, true);
  if (!s || !s.mfaPending) throw new HttpError(401, 'unauthenticated');
  await enforceRate(c.env, `mfa:${s.admin.id}`, 6, 900_000);
  const body = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_code');
  const a = await c.env.DB.prepare('SELECT totp_secret_enc FROM admins WHERE id = ?').bind(s.admin.id).first<{ totp_secret_enc: string }>();
  const secret = a?.totp_secret_enc ? await decryptText(c.env.DATA_KEY, a.totp_secret_enc, 'totp:' + s.admin.id) : '';
  if (!secret || !(await verifyTotp(secret, body.data.code))) throw new HttpError(401, 'invalid_code', 'Code is incorrect.');
  await c.env.DB.prepare('UPDATE admin_sessions SET mfa_pending = 0 WHERE id_hash = ?').bind(s.hash).run();
  await c.env.DB.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(now(), s.admin.id).run();
  await audit(c.env, `admin:${s.admin.id}`, 'login', 'admin', s.admin.id, { mfa: true });
  return c.json({ ok: true });
});

adminAuth.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// ---- Authenticated account management ----
adminAuth.post('/password', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const body = z.object({ current: z.string().max(200), next: passwordSchema }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input', body.error.issues[0]?.message);
  const a = await c.env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(admin.id).first<{ password_hash: string }>();
  if (!a || !(await verifyPassword(body.data.current, a.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(body.data.next), now(), admin.id),
    c.env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id_hash != ?').bind(admin.id, c.get('sessionHash')),
  ]);
  await audit(c.env, `admin:${admin.id}`, 'password_changed', 'admin', admin.id);
  return c.json({ ok: true });
});

adminAuth.post('/profile', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input');
  await c.env.DB.prepare('UPDATE admins SET email = ?, name = ?, updated_at = ? WHERE id = ?').bind(body.data.email, body.data.name, now(), admin.id).run();
  await audit(c.env, `admin:${admin.id}`, 'profile_updated', 'admin', admin.id, body.data);
  return c.json({ ok: true });
});

adminAuth.post('/logout-others', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id_hash != ?').bind(c.get('admin').id, c.get('sessionHash')).run();
  return c.json({ ok: true });
});

adminAuth.post('/totp/begin', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const secret = base32Encode(randomBytes(20));
  await c.env.DB.prepare('UPDATE admins SET totp_secret_enc = ?, totp_enabled = 0 WHERE id = ? AND totp_enabled = 0')
    .bind(await encryptText(c.env.DATA_KEY, secret, 'totp:' + admin.id), admin.id).run();
  const uri = `otpauth://totp/LYnto:${encodeURIComponent(admin.email)}?secret=${secret}&issuer=LYnto&digits=6&period=30`;
  return c.json({ secret, uri });
});

adminAuth.post('/totp/enable', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const body = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_code');
  const a = await c.env.DB.prepare('SELECT totp_secret_enc FROM admins WHERE id = ?').bind(admin.id).first<{ totp_secret_enc: string | null }>();
  if (!a?.totp_secret_enc) throw bad('totp_not_started');
  const secret = await decryptText(c.env.DATA_KEY, a.totp_secret_enc, 'totp:' + admin.id);
  if (!(await verifyTotp(secret, body.data.code))) throw new HttpError(401, 'invalid_code', 'Code is incorrect.');
  await c.env.DB.prepare('UPDATE admins SET totp_enabled = 1 WHERE id = ?').bind(admin.id).run();
  await audit(c.env, `admin:${admin.id}`, 'totp_enabled', 'admin', admin.id);
  return c.json({ ok: true });
});

adminAuth.post('/totp/disable', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const body = z.object({ password: z.string().max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw bad('invalid_input');
  const a = await c.env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(admin.id).first<{ password_hash: string }>();
  if (!a || !(await verifyPassword(body.data.password, a.password_hash))) throw new HttpError(401, 'invalid_credentials');
  await c.env.DB.prepare('UPDATE admins SET totp_enabled = 0, totp_secret_enc = NULL WHERE id = ?').bind(admin.id).run();
  await audit(c.env, `admin:${admin.id}`, 'totp_disabled', 'admin', admin.id);
  return c.json({ ok: true });
});
