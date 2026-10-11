import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppContext, Env, AdminUser } from '../env';
import { fromB64, randomToken, sha256Hex } from './crypto';
import { HttpError, now } from './util';

export const SESSION_COOKIE = '__Host-lynto_admin';
const IDLE_MS = 12 * 3600_000;
const ABSOLUTE_MS = 7 * 86_400_000;

export async function createSession(c: Context<AppContext>, adminId: string, mfaPending: boolean) {
  const token = randomToken(32);
  const t = now();
  await c.env.DB.prepare('INSERT INTO admin_sessions (id_hash, admin_id, mfa_pending, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)')
    .bind(await sha256Hex(token), adminId, mfaPending ? 1 : 0, t, t + ABSOLUTE_MS, t, c.req.header('cf-connecting-ip') ?? '', (c.req.header('user-agent') ?? '').slice(0, 200)).run();
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: ABSOLUTE_MS / 1000 });
}

export async function destroySession(c: Context<AppContext>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

export async function readSession(c: Context<AppContext>, allowMfaPending = false): Promise<{ admin: AdminUser; hash: string; mfaPending: boolean } | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length < 30) return null;
  const hash = await sha256Hex(token);
  const t = now();
  const row = await c.env.DB.prepare(
    `SELECT s.mfa_pending, s.last_seen_at, s.expires_at, a.id, a.email, a.name, a.totp_enabled, a.disabled FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id_hash = ?`,
  ).bind(hash).first<any>();
  if (!row || row.disabled || row.expires_at < t || row.last_seen_at + IDLE_MS < t) return null;
  if (row.mfa_pending && !allowMfaPending) return null;
  if (t - row.last_seen_at > 5 * 60_000) await c.env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?').bind(t, hash).run();
  return { admin: { id: row.id, email: row.email, name: row.name, totp_enabled: row.totp_enabled }, hash, mfaPending: !!row.mfa_pending };
}

// ---- Optional Cloudflare Access (Zero Trust) validation ----
let jwksCache: { at: number; keys: any[] } | null = null;
async function verifyAccessJwt(env: Env, jwt: string): Promise<boolean> {
  const [h, p, sig] = jwt.split('.');
  if (!h || !p || !sig) return false;
  const header = JSON.parse(new TextDecoder().decode(fromB64(h)));
  const payload = JSON.parse(new TextDecoder().decode(fromB64(p)));
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < now() || payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
  if (!jwksCache || now() - jwksCache.at > 3600_000) {
    const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    jwksCache = { at: now(), keys: ((await res.json()) as any).keys ?? [] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64(sig), new TextEncoder().encode(`${h}.${p}`));
}

export async function accessGate(c: Context<AppContext>): Promise<boolean> {
  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) return true;
  const jwt = c.req.header('cf-access-jwt-assertion');
  if (!jwt) return false;
  try { return await verifyAccessJwt(c.env, jwt); } catch { return false; }
}

/** CSRF: cookies are SameSite=Strict; additionally require a custom header (forces CORS preflight) and same-origin Origin. */
export function csrfOk(c: Context<AppContext>): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return true;
  if (c.req.header('x-lynto-csrf') !== '1') return false;
  const origin = c.req.header('origin');
  if (origin && origin !== new URL(c.req.url).origin) return false;
  return true;
}

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  if (!(await accessGate(c))) throw new HttpError(403, 'access_denied');
  if (!csrfOk(c)) throw new HttpError(403, 'csrf');
  const s = await readSession(c);
  if (!s) throw new HttpError(401, 'unauthenticated');
  c.set('admin', s.admin);
  c.set('sessionHash', s.hash);
  await next();
};
