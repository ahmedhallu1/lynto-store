import type { Context } from 'hono';
import type { Env } from '../env';
import { hmacHex } from './crypto';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}
export const bad = (code: string, message?: string, details?: unknown) => new HttpError(400, code, message, details);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string, message?: string, details?: unknown) => new HttpError(409, code, message, details);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);

export const now = () => Date.now();

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
}
export async function ipHash(env: Env, ip: string): Promise<string> {
  return (await hmacHex(env.TOKEN_SECRET, 'ip:' + ip)).slice(0, 24);
}

/** Fixed-window rate limiting backed by D1. Returns false when the limit is exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count`,
  ).bind(key, t + windowMs, t).first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}
/** `scalable` limits may be raised in non-production via RATE_LIMIT_MULTIPLIER (for automated tests). Auth limits stay strict. */
export async function enforceRate(env: Env, key: string, limit: number, windowMs: number, scalable = false) {
  const mult = scalable && !isProd(env) && env.RATE_LIMIT_MULTIPLIER ? Math.max(1, Number(env.RATE_LIMIT_MULTIPLIER) || 1) : 1;
  if (!(await rateLimit(env, key, limit * mult, windowMs))) throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait and try again.');
}

export async function audit(env: Env, actor: string, action: string, entity: string, entityId: string, data: unknown = {}) {
  await env.DB.prepare('INSERT INTO audit_log (actor, action, entity, entity_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actor, action, entity, entityId, JSON.stringify(data ?? {}), now()).run();
}

export function orderEventStmt(env: Env, orderId: string, actor: string, type: string, visibility: 'customer' | 'internal', data: unknown = {}, itemId: string | null = null) {
  return env.DB.prepare('INSERT INTO order_events (order_id, item_id, actor, type, visibility, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(orderId, itemId, actor, type, visibility, JSON.stringify(data ?? {}), now());
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function isProd(env: Env) {
  return env.APP_ENV === 'production';
}

export function baseUrl(env: Env) {
  return env.PUBLIC_BASE_URL.replace(/\/$/, '');
}

/** Normalise a phone number to E.164-ish digits with leading +. Egyptian local numbers (01xxxxxxxxx) get +20. */
export function normalizePhone(input: string): string | null {
  const t = input.replace(/[\s\-().]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let digits: string;
  if (t.startsWith('+')) digits = t.slice(1);
  else if (t.startsWith('00')) digits = t.slice(2);
  else if (/^01\d{9}$/.test(t)) digits = '20' + t.slice(1);
  else digits = t;
  if (!/^\d{8,15}$/.test(digits)) return null;
  if (digits.startsWith('20') && !/^201[0125]\d{8}$/.test(digits)) return null;
  return '+' + digits;
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return '﻿' + [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))].join('\r\n') + '\r\n';
}
export function parseCsv(text: string): Array<Record<string, string>> {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').replace(/^'(?=[=+\-@])/, '')])));
}
