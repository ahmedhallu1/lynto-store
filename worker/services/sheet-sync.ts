// Daily import of sales from the owner's cashier Google Sheet ("Transactions" tab).
// Every credit row of type "Transactions" whose entered amount is a whole number becomes a paid + delivered order matched
// to the nearest catalogue plan(s) (shared/match.ts). Imported orders carry no customer details, send no notifications and
// fire no Meta events; they count in revenue like verified website orders (owner decision, Oct 2026).
//
// Reading: the sheet has ~40k rows and new rows can land in reused rows in the middle, so we never read the whole tab.
// Instead the Google Visualization query endpoint filters server-side by date (credits only, ordered by date, capped), which
// keeps each run to a few hundred rows inside the Workers Free CPU budget. A first run backfills from `start_date` in chunks
// (one chunk per cron tick); afterwards a daily run re-reads the last 7 days so late-entered rows are still picked up.
// Dedupe: each row gets a stable key from its date, amount and wallet (+ occurrence number for identical rows).
import type { Env } from '../env';
import { getSecret } from '../lib/settings';
import { newId, randomCode, randomToken, sha256Hex } from '../lib/crypto';
import { isProd, now, parseJSON } from '../lib/util';
import { localParts, zonedToUtc } from '../../shared/schedule';
import { buildMatcher, type Match } from '../../shared/match';

export type SheetSyncConfig = {
  enabled: boolean;
  spreadsheet_id: string;
  sheet_name: string;
  start_date: string; // YYYY-MM-DD (sheet time zone)
  run_hour: number; // daily run at/after this hour (sheet time zone)
  timezone: string;
  columns: { date: string; wallet: string; amount: string; credit: string; type: string; id: string };
};
export type SheetSyncState = {
  cursor: number | null; // latest transaction time seen (ms)
  next_from: number | null; // a pass is in progress: the next chunk starts here
  backfill_done: boolean; // the first pass (from start_date) has caught up
  last_run_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
};
type Stored = { config: SheetSyncConfig; state: SheetSyncState };

const KEY = 'sheet_sync';
const LOOKBACK_MS = 7 * 86_400_000;
const CHUNK = 300;
const RETRY_AFTER_ERROR_MS = 3600_000;

export const DEFAULT_SHEET_CONFIG: SheetSyncConfig = {
  enabled: true,
  spreadsheet_id: '1x4MOXfUGd1peIUjY-DbcfAy03HtzD-RqrH0fUUWSLKs',
  sheet_name: 'Transactions',
  start_date: '2026-08-01',
  run_hour: 3,
  timezone: 'Africa/Cairo',
  columns: { date: 'A', wallet: 'B', amount: 'C', credit: 'F', type: 'G', id: 'I' },
};
const EMPTY_STATE: SheetSyncState = { cursor: null, next_from: null, backfill_done: false, last_run_at: null, last_success_at: null, last_error: null };

export class SheetSyncError extends Error {
  constructor(public code: 'not_connected' | 'reconnect' | 'google_error' | 'query_error' | 'stalled', message: string) { super(message); }
}

export async function loadSheetSync(env: Env): Promise<Stored> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first<{ value: string }>();
  const s = parseJSON<Partial<Stored>>(row?.value, {});
  return {
    config: { ...DEFAULT_SHEET_CONFIG, ...(s.config ?? {}), columns: { ...DEFAULT_SHEET_CONFIG.columns, ...(s.config?.columns ?? {}) } },
    state: { ...EMPTY_STATE, ...(s.state ?? {}) },
  };
}
export async function saveSheetSync(env: Env, v: Stored, actor = 'system') {
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4')
    .bind(KEY, JSON.stringify(v), now(), actor).run();
}

export async function googleConnected(env: Env) {
  const [id, secret, refresh] = await Promise.all([getSecret(env, 'google_client_id'), getSecret(env, 'google_client_secret'), getSecret(env, 'google_refresh_token')]);
  return { connected: !!(id && secret && refresh), id, secret, refresh };
}

const testBase = (env: Env) => (!isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE.replace(/\/$/, '') + '/google' : null);

async function accessToken(env: Env): Promise<string> {
  const g = await googleConnected(env);
  if (!g.connected) throw new SheetSyncError('not_connected', 'Google account is not connected (run scripts/google-connect.mjs).');
  const url = (testBase(env) ?? 'https://oauth2.googleapis.com') + '/token';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.id!, client_secret: g.secret!, refresh_token: g.refresh!, grant_type: 'refresh_token' }),
  });
  const j = await res.json<any>().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    if (j.error === 'invalid_grant') throw new SheetSyncError('reconnect', 'Google access was revoked or expired — reconnect the Google account.');
    throw new SheetSyncError('google_error', `Google token error: ${String(j.error_description ?? j.error ?? res.status).slice(0, 160)}`);
  }
  return j.access_token as string;
}

/** Sheet-local wall time "yyyy-MM-dd HH:mm:ss" for a gviz datetime literal. */
function gvizDateTime(t: number, tz: string) {
  const p = localParts(t, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${z(p.m)}-${z(p.d)} ${z(p.hh)}:${z(p.mm)}:00`;
}
export function startOf(dateStr: string, tz: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return zonedToUtc(y, m, d, 0, 0, tz);
}

export type SheetRow = { at: number; amount: number; wallet: string; trx: string };

/** Parses a gviz JSON response; dates arrive as "Date(y,m0,d,h,mi,s)" in the sheet's time zone. */
export function parseGviz(text: string, tz: string): SheetRow[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new SheetSyncError('query_error', 'Unexpected response from Google Sheets (not a query result). Check that the account can open the sheet.');
  const j = JSON.parse(text.slice(start, end + 1));
  if (j.status === 'error') throw new SheetSyncError('query_error', `Sheet query failed: ${String(j.errors?.[0]?.detailed_message ?? j.errors?.[0]?.message ?? 'unknown').slice(0, 200)}`);
  const out: SheetRow[] = [];
  for (const r of j.table?.rows ?? []) {
    const [cd, cw, ca, ci] = r.c ?? [];
    const m = typeof cd?.v === 'string' ? cd.v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+)(?:,(\d+))?)?\)$/) : null;
    const amount = typeof ca?.v === 'number' ? ca.v : Number(String(ca?.v ?? '').replace(/[^\d.-]/g, ''));
    if (!m || !Number.isFinite(amount)) continue;
    const at = zonedToUtc(+m[1], +m[2] + 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), tz) + (+(m[6] ?? 0)) * 1000;
    out.push({ at, amount, wallet: String(cw?.v ?? ''), trx: ci?.v === null || ci?.v === undefined ? String(ci?.f ?? '') : String(ci.v) });
  }
  return out;
}

async function querySheet(env: Env, token: string, cfg: SheetSyncConfig, from: number): Promise<SheetRow[]> {
  const c = cfg.columns;
  const tq = `select ${c.date}, ${c.wallet}, ${c.amount}, ${c.id} where ${c.credit} = 'Credit' and ${c.type} = 'Transactions' and ${c.date} >= datetime '${gvizDateTime(from, cfg.timezone)}' order by ${c.date} limit ${CHUNK}`;
  const base = testBase(env) ? `${testBase(env)}/sheets/d/${cfg.spreadsheet_id}/gviz/tq` : `https://docs.google.com/spreadsheets/d/${cfg.spreadsheet_id}/gviz/tq`;
  const url = `${base}?${new URLSearchParams({ tqx: 'out:json', headers: '1', sheet: cfg.sheet_name, tq })}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) throw new SheetSyncError('google_error', `Google refused access to the sheet (HTTP ${res.status}). The connected account must be able to open it.`);
  if (!res.ok) throw new SheetSyncError('google_error', `Google Sheets HTTP ${res.status}`);
  return parseGviz(await res.text(), cfg.timezone);
}

/** Stable per-row keys: identical (time, amount, wallet) rows are numbered in order of appearance. */
async function rowKeys(rows: SheetRow[]) {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const r of rows) {
    const base = `${r.at}|${Math.round(r.amount * 100)}|${r.wallet.trim().toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push('sheet:' + (await sha256Hex(`${base}#${n}`)).slice(0, 40));
  }
  return out;
}

const lit = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(Math.trunc(v)) : `'${v.replace(/'/g, "''")}'`);
const tuple = (vals: Array<string | number | null>) => `(${vals.map(lit).join(',')})`;

type PlanForImport = { id: string; product_id: string; name_ar: string; name_en: string; plan_type: string; duration_value: number | null; duration_unit: string | null;
  is_perpetual: number; guarantee_kind: string; guarantee_days: number | null; price_piastres: number; title_ar: string; title_en: string };

export type SyncReport = { fetched: number; eligible: number; imported: number; skipped: number; done: boolean; backfill_done: boolean; window_from: number; window_to: number | null };

/** Where a new pass starts: the start date for the first pass, otherwise 7 days before the newest row seen. */
function passStart(cfg: SheetSyncConfig, state: SheetSyncState) {
  const floor = startOf(cfg.start_date, cfg.timezone);
  return state.cursor === null ? floor : Math.max(floor, state.cursor - LOOKBACK_MS);
}

/** Processes one chunk of the current pass (starting a new pass if none is in progress). Throws SheetSyncError on Google/config problems. */
export async function syncChunk(env: Env, trigger: string): Promise<SyncReport> {
  const { config: cfg, state } = await loadSheetSync(env);
  const startedAt = now();
  const startFloor = startOf(cfg.start_date, cfg.timezone);
  const from = Math.max(startFloor, state.next_from ?? passStart(cfg, state));
  try {
    const token = await accessToken(env);
    const rows = await querySheet(env, token, cfg, from);
    const keys = await rowKeys(rows);
    const caughtUp = rows.length < CHUNK;
    const maxAt = rows.reduce((m, r) => Math.max(m, r.at), 0);
    // Rows of the last timestamp may continue past the limit: leave them for the next chunk (which starts at that minute).
    if (!caughtUp && rows.every((r) => r.at === maxAt)) throw new SheetSyncError('stalled', `More than ${CHUNK} credits share one timestamp; the import cannot advance.`);
    const eligible = rows.map((r, i) => ({ r, key: keys[i] })).filter(({ r }) => r.at >= startFloor && r.amount > 0 && Number.isInteger(r.amount) && (caughtUp || r.at < maxAt));
    let imported = 0, skipped = rows.length - eligible.length;
    if (eligible.length) {
      const minAt = Math.min(...eligible.map((e) => e.r.at));
      const existing = new Set((await env.DB.prepare(`SELECT idem_hash FROM orders WHERE source = 'sheet' AND created_at >= ?`).bind(minAt).all<{ idem_hash: string }>()).results.map((x) => x.idem_hash));
      const todo = eligible.filter((e) => !existing.has(e.key));
      skipped += eligible.length - todo.length;
      if (todo.length) {
        const plans = (await env.DB.prepare(`SELECT pl.id, pl.product_id, pl.name_ar, pl.name_en, pl.plan_type, pl.duration_value, pl.duration_unit, pl.is_perpetual, pl.guarantee_kind, pl.guarantee_days, pl.price_piastres,
            p.title_ar, p.title_en FROM plans pl JOIN products p ON p.id = pl.product_id
            WHERE p.status = 'published' AND p.supply_status = 'validated' AND pl.status = 'approved' AND pl.availability = 'available' AND pl.price_piastres > 0`).all<PlanForImport>()).results;
        const byId = new Map(plans.map((p) => [p.id, p]));
        const matcher = buildMatcher(plans.map((p) => ({ id: p.id, price: p.price_piastres })));
        imported = await insertOrders(env, todo.map(({ r, key }) => ({ r, key, m: matcher.match(r.amount * 100, key) })), byId);
      }
    }
    const next: SheetSyncState = {
      cursor: maxAt ? Math.max(state.cursor ?? 0, maxAt) : state.cursor,
      next_from: caughtUp ? null : maxAt,
      backfill_done: state.backfill_done || caughtUp,
      last_run_at: startedAt,
      last_success_at: caughtUp ? startedAt : state.last_success_at,
      last_error: null,
    };
    await saveSheetSync(env, { config: cfg, state: next });
    await logRun(env, trigger, 'ok', { fetched: rows.length, imported, skipped, from, to: maxAt || null, startedAt });
    return { fetched: rows.length, eligible: eligible.length, imported, skipped, done: caughtUp, backfill_done: next.backfill_done, window_from: from, window_to: maxAt || null };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    await saveSheetSync(env, { config: cfg, state: { ...state, next_from: from, last_run_at: startedAt, last_error: msg } });
    await logRun(env, trigger, 'error', { fetched: 0, imported: 0, skipped: 0, from, to: null, startedAt, error: msg });
    throw e;
  }
}

/** Runs up to `maxChunks` chunks (manual "Sync now"); the cron finishes anything left on later ticks. */
export async function runSheetSync(env: Env, trigger: string, maxChunks = 3) {
  const total = { chunks: 0, fetched: 0, imported: 0, skipped: 0, done: false };
  for (let i = 0; i < maxChunks && !total.done; i++) {
    const r = await syncChunk(env, trigger);
    total.chunks++; total.fetched += r.fetched; total.imported += r.imported; total.skipped += r.skipped; total.done = r.done;
  }
  return total;
}

async function logRun(env: Env, trigger: string, status: 'ok' | 'error', r: { fetched: number; imported: number; skipped: number; from: number; to: number | null; startedAt: number; error?: string }) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sheet_sync_runs (trigger, status, fetched, imported, skipped, window_from, window_to, error, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(trigger, status, r.fetched, r.imported, r.skipped, r.from, r.to, r.error ?? null, r.startedAt, now()),
    env.DB.prepare('DELETE FROM sheet_sync_runs WHERE started_at < ?').bind(now() - 90 * 86_400_000),
  ]);
}

/**
 * Inserts imported orders with a handful of multi-row statements (D1 caps queries per invocation on the Free plan).
 * Values are generated here or come from our own catalogue, and are inlined as escaped literals.
 */
async function insertOrders(env: Env, rows: Array<{ r: SheetRow; key: string; m: Match | null }>, plans: Map<string, PlanForImport>): Promise<number> {
  const t = now();
  const orders: string[] = [], items: string[] = [], events: string[] = [];
  let count = 0;
  for (const { r, key, m } of rows) {
    if (!m) continue;
    const id = newId('ord');
    const received = Math.round(r.amount * 100);
    const notes = `Imported from the cashier sheet. Received ${r.amount} EGP; matched to items totalling ${m.total / 100} EGP (difference ${m.diff >= 0 ? '+' : ''}${m.diff / 100} EGP).`;
    orders.push(tuple([id, `LS-${randomCode(6)}`, `none:${randomToken(16)}`, 'none', key, 'ar', '', '', '', 'email', 0, 0, 0, m.total, m.total, 'sheet', 'verified', 'delivered',
      received, r.trx || null, r.at, 'sheet-sync', r.at, notes, 1, 'sheet', r.trx || null, r.at, t]));
    m.items.forEach((it, i) => {
      const p = plans.get(it.plan_id)!;
      items.push(tuple([newId('itm'), id, p.product_id, p.id, p.title_ar, p.title_en, p.name_ar, p.name_en, p.plan_type, p.duration_value, p.duration_unit, p.is_perpetual,
        p.guarantee_kind, p.guarantee_days, it.unit, it.qty, it.unit * it.qty, '{}', 'delivered', r.at, 'external', i]));
    });
    events.push(tuple([id, 'system', 'imported_from_sheet', 'internal', JSON.stringify({ received_piastres: received, matched_piastres: m.total, diff_piastres: m.diff, trx: r.trx || null }), t]));
    count++;
  }
  if (!count) return 0;
  const stmts: D1PreparedStatement[] = [];
  const PER = 80; // keeps each statement well under D1's 100 KB SQL limit
  for (let i = 0; i < orders.length; i += PER) {
    stmts.push(env.DB.prepare(`INSERT INTO orders (id, number, access_hash, access_enc, idem_hash, lang, customer_name, customer_email, customer_whatsapp, preferred_channel,
      whatsapp_optin, renewal_optin, tracking_consent, subtotal_piastres, total_piastres, payment_method_id, payment_status, fulfillment_status,
      verified_amount_piastres, verified_reference, verified_at, verified_by, delivered_at, internal_notes, reminder_processed, source, source_ref, created_at, updated_at)
      VALUES ${orders.slice(i, i + PER).join(',')}`));
  }
  for (let i = 0; i < items.length; i += PER) {
    stmts.push(env.DB.prepare(`INSERT INTO order_items (id, order_id, product_id, plan_id, product_title_ar, product_title_en, plan_name_ar, plan_name_en, plan_type,
      duration_value, duration_unit, is_perpetual, guarantee_kind, guarantee_days, unit_price_piastres, qty, line_total_piastres, customer_fields,
      fulfillment_status, delivered_at, delivered_via, sort) VALUES ${items.slice(i, i + PER).join(',')}`));
  }
  for (let i = 0; i < events.length; i += PER) {
    stmts.push(env.DB.prepare(`INSERT INTO order_events (order_id, actor, type, visibility, data, created_at) VALUES ${events.slice(i, i + PER).join(',')}`));
  }
  await env.DB.batch(stmts); // one transaction: all or nothing
  return count;
}

/** Called from the 5-minute cron: one chunk per tick while a pass is in progress; a new pass once a day after `run_hour`. */
export async function sheetSyncIfDue(env: Env): Promise<SyncReport | null> {
  const { config, state } = await loadSheetSync(env);
  if (!config.enabled) return null;
  const t = now();
  if (state.last_error && state.last_run_at && t - state.last_run_at < RETRY_AFTER_ERROR_MS) return null;
  if (state.next_from === null && state.backfill_done) {
    if (localParts(t, config.timezone).hh < config.run_hour) return null;
    if (state.last_success_at && t - state.last_success_at < 20 * 3600_000) return null;
  }
  if (!(await googleConnected(env)).connected) return null;
  return syncChunk(env, 'cron');
}
