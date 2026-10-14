import type { Env } from '../env';
import type { BusinessSettings, PublicSettings } from '../../shared/types';
import { checkoutBlockers, mergeSettings } from '../../shared/defaults';
import { decryptText, encryptText } from './crypto';
import { now } from './util';

const SETTINGS_KEY = 'business';

export async function loadSettings(env: Env): Promise<BusinessSettings> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(SETTINGS_KEY).first<{ value: string }>();
  let stored: Partial<BusinessSettings> | null = null;
  if (row) {
    try { stored = JSON.parse(row.value); } catch { stored = null; }
  }
  return mergeSettings(stored);
}

export async function saveSettings(env: Env, s: BusinessSettings, actor: string) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4',
  ).bind(SETTINGS_KEY, JSON.stringify(s), now(), actor).run();
}

export function toPublicSettings(s: BusinessSettings): PublicSettings {
  const blockers = checkoutBlockers(s);
  return {
    checkout_enabled: blockers.length === 0,
    checkout_blockers: blockers,
    announcement_ar: s.store.announcement_ar,
    announcement_en: s.store.announcement_en,
    business_name: s.store.business_name,
    payment_methods: s.payments.methods.filter((m) => m.enabled && m.account && m.account_name).map(({ id, type, label_ar, label_en }) => ({ id, type, label_ar, label_en })),
    support: s.support,
    policies: s.policies.confirmed
      ? { confirmed: true, guarantee_ar: s.policies.guarantee_ar, guarantee_en: s.policies.guarantee_en, refund_ar: s.policies.refund_ar, refund_en: s.policies.refund_en, terms_extra_ar: s.policies.terms_extra_ar, terms_extra_en: s.policies.terms_extra_en }
      : { confirmed: false, guarantee_ar: '', guarantee_en: '', refund_ar: '', refund_en: '', terms_extra_ar: '', terms_extra_en: '' },
    schedule_summary: { configured: s.schedule.configured, week: s.schedule.configured ? s.schedule.week : {}, timezone: s.schedule.timezone },
    sla_working_hours: s.delivery.sla_working_hours,
    meta_pixel_id: s.tracking.meta_pixel_id,
  };
}

// ---- Encrypted integration credentials ----
export const SECRET_KEYS = ['resend_api_key', 'resend_webhook_secret', 'whatsapp_access_token', 'whatsapp_app_secret', 'whatsapp_verify_token', 'meta_capi_token', 'gemini_api_key', 'google_client_id', 'google_client_secret', 'google_refresh_token'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const ENV_FALLBACK: Partial<Record<SecretKey, keyof Env>> = { resend_api_key: 'RESEND_API_KEY', resend_webhook_secret: 'RESEND_WEBHOOK_SECRET', gemini_api_key: 'GEMINI_API_KEY', whatsapp_access_token: 'WHATSAPP_ACCESS_TOKEN', whatsapp_app_secret: 'WHATSAPP_APP_SECRET', whatsapp_verify_token: 'WHATSAPP_VERIFY_TOKEN',
  google_client_id: 'GOOGLE_CLIENT_ID', google_client_secret: 'GOOGLE_CLIENT_SECRET', google_refresh_token: 'GOOGLE_REFRESH_TOKEN' };
export async function getSecret(env: Env, key: SecretKey): Promise<string | null> {
  const fromEnv = ENV_FALLBACK[key] ? (env[ENV_FALLBACK[key]!] as string | undefined) : undefined;
  const row = await env.DB.prepare('SELECT ciphertext FROM secrets WHERE key = ?').bind(key).first<{ ciphertext: string }>();
  if (!row) return fromEnv ?? null;
  try { return await decryptText(env.DATA_KEY, row.ciphertext, 'secret:' + key); } catch { return fromEnv ?? null; }
}
export async function setSecret(env: Env, key: SecretKey, value: string) {
  const ct = await encryptText(env.DATA_KEY, value, 'secret:' + key);
  const hint = value.length > 8 ? `…${value.slice(-4)}` : 'set';
  await env.DB.prepare('INSERT INTO secrets (key, ciphertext, hint, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET ciphertext = ?2, hint = ?3, updated_at = ?4')
    .bind(key, ct, hint, now()).run();
}
export async function deleteSecret(env: Env, key: SecretKey) {
  await env.DB.prepare('DELETE FROM secrets WHERE key = ?').bind(key).run();
}
export async function secretStatus(env: Env): Promise<Record<string, { set: boolean; hint: string; updated_at: number | null }>> {
  const rows = await env.DB.prepare('SELECT key, hint, updated_at FROM secrets').all<{ key: string; hint: string; updated_at: number }>();
  const out: Record<string, { set: boolean; hint: string; updated_at: number | null }> = {};
  for (const k of SECRET_KEYS) out[k] = { set: false, hint: '', updated_at: null };
  for (const r of rows.results) out[r.key] = { set: true, hint: r.hint, updated_at: r.updated_at };
  for (const [k, envName] of Object.entries(ENV_FALLBACK)) {
    if (env[envName as keyof Env] && !out[k].set) out[k] = { set: true, hint: 'Worker secret', updated_at: null };
  }
  return out;
}
