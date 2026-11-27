// Automatic engagement orders for new posts on the LYnto Facebook Page and Instagram account.
//
// Every cron tick (5 min) while enabled: read the latest posts through the Meta Graph API, and for each post published after
// the feature was switched on (`armed_at`), place one order on JustAnotherPanel (JAP): Facebook → service 8705 (Love reactions)
// × 100, Instagram → service 10211 (EG likes) × 50 by default (owner request, 25 Nov 2026).
//
// Money safety:
// - A post is claimed in D1 (UNIQUE platform+post_id) before the order is sent, so it is never ordered twice.
// - A network error / timeout (60 s for "add") / non-JSON answer from JAP leaves the row 'unknown' (the order may exist) and is NEVER retried
//   automatically; only an explicit JAP `{error}` answer marks it 'failed' (the owner can retry from the admin page).
// - Rolling 24 h cap on orders, a minimum JAP balance, and a maximum post age (older posts are ignored).
// - Posts published before the switch was turned on are never ordered.
import type { Env } from '../env';
import { getSecret } from '../lib/settings';
import { isProd, now, parseJSON } from '../lib/util';

export type Platform = 'facebook' | 'instagram';
export type BoostTarget = { enabled: boolean; service: number; quantity: number };
export type SocialBoostConfig = {
  enabled: boolean;
  armed_at: number | null; // posts published before this moment are never ordered
  page_id: string; // optional: pick this Page when the token can see several
  facebook: BoostTarget;
  instagram: BoostTarget;
  max_orders_per_day: number; // rolling 24 h, both platforms together
  min_balance_usd: number;
  max_post_age_hours: number;
};
export type SocialBoostState = {
  page_id: string | null;
  page_name: string | null;
  ig_id: string | null;
  ig_username: string | null;
  last_check_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
  balance_usd: string | null;
  balance_at: number | null;
  status_refresh_at: number | null;
};
type Stored = { config: SocialBoostConfig; state: SocialBoostState };
export type Post = { platform: Platform; id: string; permalink: string; posted_at: number };

const KEY = 'social_boost';
const GRAPH_VERSION = 'v23.0';
const MIN_INTERVAL_MS = 4 * 60_000;
const STATUS_REFRESH_MS = 30 * 60_000;
const ADD_TIMEOUT_MS = 60_000;

export const DEFAULT_BOOST_CONFIG: SocialBoostConfig = {
  enabled: false,
  armed_at: null,
  page_id: '',
  facebook: { enabled: true, service: 8705, quantity: 100 },
  instagram: { enabled: true, service: 10211, quantity: 50 },
  max_orders_per_day: 6,
  min_balance_usd: 1,
  max_post_age_hours: 48,
};
const EMPTY_STATE: SocialBoostState = { page_id: null, page_name: null, ig_id: null, ig_username: null, last_check_at: null, last_success_at: null, last_error: null, balance_usd: null, balance_at: null, status_refresh_at: null };

export class SocialBoostError extends Error {
  constructor(public code: 'not_connected' | 'meta_error' | 'meta_reconnect' | 'no_page' | 'jap_error' | 'disabled', message: string) { super(message); }
}

export async function loadSocialBoost(env: Env): Promise<Stored> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first<{ value: string }>();
  const s = parseJSON<Partial<Stored>>(row?.value, {});
  const c: Partial<SocialBoostConfig> = s.config ?? {};
  return {
    config: { ...DEFAULT_BOOST_CONFIG, ...c, facebook: { ...DEFAULT_BOOST_CONFIG.facebook, ...(c.facebook ?? {}) }, instagram: { ...DEFAULT_BOOST_CONFIG.instagram, ...(c.instagram ?? {}) } },
    state: { ...EMPTY_STATE, ...(s.state ?? {}) },
  };
}
export async function saveSocialBoost(env: Env, v: Stored, actor = 'system') {
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4')
    .bind(KEY, JSON.stringify(v), now(), actor).run();
}
async function patchState(env: Env, patch: Partial<SocialBoostState>) {
  const cur = await loadSocialBoost(env);
  await saveSocialBoost(env, { config: cur.config, state: { ...cur.state, ...patch } });
}

export async function boostConnections(env: Env) {
  const [meta, jap] = await Promise.all([getSecret(env, 'meta_page_token'), getSecret(env, 'jap_api_key')]);
  return { meta: !!meta, jap: !!jap, metaToken: meta, japKey: jap };
}

// ---------------------------------------------------------------- Meta Graph API
const graphBase = (env: Env) => (!isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE.replace(/\/$/, '') : 'https://graph.facebook.com') + '/' + GRAPH_VERSION;

async function graph<T>(env: Env, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(graphBase(env) + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  let res: Response;
  try { res = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) }); }
  catch (e: any) { throw new SocialBoostError('meta_error', `Meta did not answer (${String(e?.message ?? e).slice(0, 120)}).`); }
  const j = await res.json().catch(() => null) as any;
  if (!res.ok || !j || j.error) {
    const code = j?.error?.code;
    const msg = String(j?.error?.message ?? `HTTP ${res.status}`).slice(0, 300);
    if (code === 190 || code === 102 || res.status === 401) throw new SocialBoostError('meta_reconnect', `The Meta token was rejected — create a new one and save it again. (${msg})`);
    if (code === 10 || code === 200 || (typeof code === 'number' && code >= 200 && code < 300)) throw new SocialBoostError('meta_reconnect', `The Meta token is missing a permission (pages_read_engagement / instagram_basic). (${msg})`);
    throw new SocialBoostError('meta_error', `Meta error: ${msg}`);
  }
  return j as T;
}

type PageInfo = { id: string; name: string; access_token?: string; category?: string; instagram_business_account?: { id: string; username?: string } };
export type MetaContext = { pageId: string; pageName: string; pageToken: string; igId: string | null; igUsername: string | null };

/** Works with a Page token (/me is the Page) or a user / system-user token (/me/accounts lists the Pages it manages). */
export async function metaContext(env: Env, token: string, wantPageId = ''): Promise<MetaContext> {
  // A user / system-user token lists its Pages under /me/accounts. A Page token has no "accounts" edge (Meta answers #100),
  // and /me is then the Page itself. Never ask a User node for Page-only fields such as `category` (also #100).
  let page: PageInfo | undefined;
  let pageToken = token;
  let pages: PageInfo[] | null = null;
  try {
    pages = (await graph<{ data: PageInfo[] }>(env, '/me/accounts', token, { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50' })).data ?? [];
  } catch (e) {
    if (!(e instanceof SocialBoostError) || e.code !== 'meta_error') throw e;
  }
  if (pages) {
    page = (wantPageId && pages.find((p) => p.id === wantPageId)) || pages.find((p) => /lynto/i.test(p.name)) || pages[0];
    if (page?.access_token) pageToken = page.access_token;
  } else {
    page = await graph<PageInfo>(env, '/me', token, { fields: 'id,name,instagram_business_account{id,username}' });
  }
  if (!page) throw new SocialBoostError('no_page', 'The Meta token cannot see any Facebook Page. Give the token access to the LYnto Page.');
  return { pageId: page.id, pageName: page.name, pageToken, igId: page.instagram_business_account?.id ?? null, igUsername: page.instagram_business_account?.username ?? null };
}

export async function latestPosts(env: Env, ctx: MetaContext): Promise<Post[]> {
  const out: Post[] = [];
  const fb = await graph<{ data: Array<{ id: string; permalink_url?: string; created_time: string }> }>(env, `/${ctx.pageId}/posts`, ctx.pageToken, { fields: 'id,permalink_url,created_time', limit: '10' });
  for (const p of fb.data ?? []) {
    const t = Date.parse(p.created_time);
    if (p.id && p.permalink_url && Number.isFinite(t)) out.push({ platform: 'facebook', id: p.id, permalink: p.permalink_url, posted_at: t });
  }
  if (ctx.igId) {
    const ig = await graph<{ data: Array<{ id: string; permalink?: string; timestamp: string }> }>(env, `/${ctx.igId}/media`, ctx.pageToken, { fields: 'id,permalink,timestamp,media_product_type', limit: '10' });
    for (const p of ig.data ?? []) {
      const t = Date.parse(p.timestamp);
      if (p.id && p.permalink && Number.isFinite(t)) out.push({ platform: 'instagram', id: p.id, permalink: p.permalink, posted_at: t });
    }
  }
  return out;
}

// ---------------------------------------------------------------- JustAnotherPanel API
const japUrl = (env: Env) => (!isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE.replace(/\/$/, '') + '/jap' : 'https://justanotherpanel.com') + '/api/v2';

type JapResult = { kind: 'ok'; data: any } | { kind: 'error'; message: string } | { kind: 'unknown'; message: string };
async function jap(env: Env, key: string, params: Record<string, string>, timeoutMs = 20_000): Promise<JapResult> {
  let res: Response;
  try {
    res = await fetch(japUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key, ...params }).toString(), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) { return { kind: 'unknown', message: `JAP did not answer (${String(e?.message ?? e).slice(0, 120)})` }; }
  const text = await res.text();
  const j = parseJSON<any>(text, null);
  if (j && typeof j === 'object' && !Array.isArray(j) && j.error) return { kind: 'error', message: String(j.error).slice(0, 300) };
  if (!res.ok || j === null) return { kind: 'unknown', message: `JAP answered HTTP ${res.status}: ${text.slice(0, 120)}` };
  return { kind: 'ok', data: j };
}

export async function japBalance(env: Env, key: string): Promise<{ balance: number; raw: string }> {
  const r = await jap(env, key, { action: 'balance' });
  if (r.kind !== 'ok') throw new SocialBoostError('jap_error', r.kind === 'error' ? `JAP: ${r.message}` : r.message);
  const raw = String(r.data.balance ?? '');
  const balance = Number(raw);
  if (!Number.isFinite(balance)) throw new SocialBoostError('jap_error', 'JAP returned no balance.');
  return { balance, raw };
}

/** Places the order for a row already claimed as 'pending'. */
async function placeOrder(env: Env, key: string, rowId: number, service: number, link: string, quantity: number) {
  // JAP sometimes takes well over 20 s to accept an order. Waiting costs no CPU time, and an abort leaves the order in
  // doubt ('unknown'), so give "add" a generous limit.
  const r = await jap(env, key, { action: 'add', service: String(service), link, quantity: String(quantity) }, ADD_TIMEOUT_MS);
  const t = now();
  if (r.kind === 'ok' && r.data.order !== undefined && r.data.order !== null) {
    await env.DB.prepare(`UPDATE social_boosts SET status = 'ordered', jap_order_id = ?, error = NULL, updated_at = ? WHERE id = ?`).bind(String(r.data.order), t, rowId).run();
    return { status: 'ordered' as const, order: String(r.data.order) };
  }
  const status: 'failed' | 'unknown' = r.kind === 'error' ? 'failed' : 'unknown';
  const message = r.kind === 'ok' ? `Unexpected JAP answer: ${JSON.stringify(r.data).slice(0, 150)}` : r.message;
  await env.DB.prepare('UPDATE social_boosts SET status = ?, error = ?, updated_at = ? WHERE id = ?').bind(status, message, t, rowId).run();
  return { status, error: message };
}

// ---------------------------------------------------------------- the job
export type RunResult = { checked: number; ordered: number; failed: number; unknown: number; skipped: number; waiting: number; note?: string };

/** Which posts should get an order now (pure; unit-tested). */
export function candidates(posts: Post[], config: SocialBoostConfig, seen: Set<string>, t: number): Post[] {
  if (!config.armed_at) return [];
  const oldest = Math.max(config.armed_at, t - config.max_post_age_hours * 3600_000);
  return posts
    .filter((p) => config[p.platform].enabled && p.posted_at >= oldest && p.posted_at <= t + 300_000 && !seen.has(`${p.platform}:${p.id}`))
    .sort((a, b) => a.posted_at - b.posted_at);
}

export async function runSocialBoost(env: Env, trigger: 'cron' | 'manual'): Promise<RunResult> {
  const { config } = await loadSocialBoost(env);
  if (!config.enabled) throw new SocialBoostError('disabled', 'Automatic orders are switched off.');
  const conn = await boostConnections(env);
  if (!conn.metaToken || !conn.japKey) throw new SocialBoostError('not_connected', `Missing ${[!conn.metaToken && 'Meta token', !conn.japKey && 'JAP API key'].filter(Boolean).join(' and ')}.`);
  const t = now();
  const result: RunResult = { checked: 0, ordered: 0, failed: 0, unknown: 0, skipped: 0, waiting: 0 };
  try {
    const ctx = await metaContext(env, conn.metaToken, config.page_id);
    const posts = await latestPosts(env, ctx);
    result.checked = posts.length;
    const seenRows = posts.length
      ? (await env.DB.prepare(`SELECT platform, post_id FROM social_boosts WHERE post_id IN (${posts.map(() => '?').join(',')})`).bind(...posts.map((p) => p.id)).all<{ platform: string; post_id: string }>()).results
      : [];
    const todo = candidates(posts, config, new Set(seenRows.map((r) => `${r.platform}:${r.post_id}`)), t);
    let balanceNote: string | undefined;
    const statePatch: Partial<SocialBoostState> = { page_id: ctx.pageId, page_name: ctx.pageName, ig_id: ctx.igId, ig_username: ctx.igUsername };
    if (todo.length) {
      const bal = await japBalance(env, conn.japKey);
      statePatch.balance_usd = bal.raw; statePatch.balance_at = t;
      if (bal.balance < config.min_balance_usd) {
        // Leave the posts unclaimed: they are ordered on a later run once the balance is topped up (within the age limit).
        result.waiting = todo.length;
        balanceNote = `JAP balance $${bal.raw} is below the $${config.min_balance_usd} minimum — ${todo.length} new post(s) are waiting. Add funds on JAP.`;
      } else {
        for (const p of todo) {
          const target = config[p.platform];
          const used = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM social_boosts WHERE status IN ('pending','ordered','unknown') AND created_at > ?`).bind(t - 86_400_000).first<{ n: number }>())?.n ?? 0;
          const capped = used >= config.max_orders_per_day;
          const ins = await env.DB.prepare(`INSERT OR IGNORE INTO social_boosts (platform, post_id, permalink, posted_at, service, quantity, status, error, trigger, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(p.platform, p.id, p.permalink, p.posted_at, target.service, target.quantity, capped ? 'skipped' : 'pending', capped ? `Daily limit of ${config.max_orders_per_day} orders reached` : null, trigger, t, t).run();
          if (ins.meta.changes !== 1) continue; // another run claimed it
          if (capped) { result.skipped++; continue; }
          const rowId = Number(ins.meta.last_row_id);
          const r = await placeOrder(env, conn.japKey, rowId, target.service, p.permalink, target.quantity);
          result[r.status]++;
          console.log(JSON.stringify({ level: r.status === 'ordered' ? 'info' : 'error', job: 'social_boost', platform: p.platform, post: p.id, ...r }));
        }
      }
    }
    await refreshStatuses(env, conn.japKey, t).catch(() => {});
    await patchState(env, { ...statePatch, last_check_at: t, ...(balanceNote ? {} : { last_success_at: t }), last_error: balanceNote ?? null });
    if (balanceNote) result.note = balanceNote;
    return result;
  } catch (e: any) {
    await patchState(env, { last_check_at: t, last_error: String(e?.message ?? e).slice(0, 400) });
    throw e;
  }
}

/** Cron entry point: never throws, runs at most every few minutes. */
export async function socialBoostIfDue(env: Env): Promise<RunResult | null> {
  const { config, state } = await loadSocialBoost(env);
  if (!config.enabled) return null;
  if (state.last_check_at && now() - state.last_check_at < MIN_INTERVAL_MS) return null;
  try { return await runSocialBoost(env, 'cron'); }
  catch (e: any) { console.error(JSON.stringify({ level: 'error', job: 'social_boost', message: String(e?.message ?? e).slice(0, 300) })); return null; }
}

/** Retry a 'failed' or 'skipped' row (owner action). 'unknown' rows must be checked on JAP first and are not retried here. */
export async function retryBoost(env: Env, id: number) {
  const conn = await boostConnections(env);
  if (!conn.japKey) throw new SocialBoostError('not_connected', 'Missing JAP API key.');
  const t = now();
  const claim = await env.DB.prepare(`UPDATE social_boosts SET status = 'pending', error = NULL, trigger = 'retry', updated_at = ? WHERE id = ? AND status IN ('failed','skipped')`).bind(t, id).run();
  if (claim.meta.changes !== 1) return null;
  const row = await env.DB.prepare('SELECT * FROM social_boosts WHERE id = ?').bind(id).first<any>();
  return placeOrder(env, conn.japKey, id, row.service, row.permalink, row.quantity);
}

/**
 * Owner resolves an 'unknown' row after checking Orders on justanotherpanel.com:
 * - found: link the JAP order number (checked against JAP's status API) so it is tracked like any other order;
 * - not_found: mark it 'failed' so the normal Retry button can place it.
 */
export async function resolveUnknownBoost(env: Env, id: number, input: { found: true; order_id: string } | { found: false }) {
  const row = await env.DB.prepare('SELECT id, status FROM social_boosts WHERE id = ?').bind(id).first<{ id: number; status: string }>();
  if (!row || row.status !== 'unknown') return null;
  const t = now();
  if (!input.found) {
    const r = await env.DB.prepare(`UPDATE social_boosts SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'unknown'`)
      .bind('Not found on JAP (checked by the owner) — use Retry to place it.', t, id).run();
    return r.meta.changes === 1 ? { status: 'failed' as const } : null;
  }
  const orderId = input.order_id.trim().replace(/^#/, '');
  if (!/^\d{1,20}$/.test(orderId)) throw new SocialBoostError('jap_error', 'Enter the JAP order number (digits only).');
  const conn = await boostConnections(env);
  if (!conn.japKey) throw new SocialBoostError('not_connected', 'Missing JAP API key.');
  const taken = await env.DB.prepare('SELECT id FROM social_boosts WHERE jap_order_id = ? AND id != ?').bind(orderId, id).first();
  if (taken) throw new SocialBoostError('jap_error', `JAP order #${orderId} is already linked to another post.`);
  const s = await jap(env, conn.japKey, { action: 'status', order: orderId });
  if (s.kind === 'error') throw new SocialBoostError('jap_error', `JAP: ${s.message}`);
  if (s.kind !== 'ok') throw new SocialBoostError('jap_error', s.message);
  const d = s.data ?? {};
  const r = await env.DB.prepare(`UPDATE social_boosts SET status = 'ordered', jap_order_id = ?, jap_status = ?, jap_remains = ?, charge_usd = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'unknown'`)
    .bind(orderId, d.status === undefined ? null : String(d.status), d.remains === undefined ? null : Number(d.remains), d.charge === undefined ? null : String(d.charge), t, id).run();
  return r.meta.changes === 1 ? { status: 'ordered' as const, order: orderId } : null;
}

const FINAL = new Set(['Completed', 'Canceled', 'Cancelled', 'Partial', 'Refunded']);
async function refreshStatuses(env: Env, key: string, t: number, force = false) {
  const { state } = await loadSocialBoost(env);
  if (!force && state.status_refresh_at && t - state.status_refresh_at < STATUS_REFRESH_MS) return;
  const rows = (await env.DB.prepare(`SELECT id, jap_order_id, jap_status FROM social_boosts WHERE status = 'ordered' AND jap_order_id IS NOT NULL AND created_at > ? ORDER BY id DESC LIMIT 100`).bind(t - 14 * 86_400_000).all<{ id: number; jap_order_id: string; jap_status: string | null }>()).results
    .filter((r) => !r.jap_status || !FINAL.has(r.jap_status));
  await patchState(env, { status_refresh_at: t });
  if (!rows.length) return;
  const r = await jap(env, key, { action: 'status', orders: rows.map((x) => x.jap_order_id).join(',') });
  if (r.kind !== 'ok') return;
  const stmts = [];
  for (const row of rows) {
    const s = r.data?.[row.jap_order_id];
    if (!s || s.error) continue;
    stmts.push(env.DB.prepare('UPDATE social_boosts SET jap_status = ?, jap_remains = ?, charge_usd = ?, updated_at = ? WHERE id = ?')
      .bind(String(s.status ?? ''), s.remains === undefined ? null : Number(s.remains), s.charge === undefined ? null : String(s.charge), t, row.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
export const refreshBoostStatuses = (env: Env, key: string) => refreshStatuses(env, key, now(), true);
