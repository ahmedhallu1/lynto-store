// WhatsApp Cloud API management helpers: connection status, template creation and approval sync.
import type { Env } from '../env';
import { getSecret, loadSettings, saveSettings } from '../lib/settings';
import { HttpError, isProd } from '../lib/util';
import { WHATSAPP_TEMPLATE_GUIDE } from './messages';

export const TEMPLATE_EXAMPLES: Record<string, string[]> = {
  order_received: ['أحمد', 'LY-K7M2QX', '1,180 ج.م', 'https://lynto.store/order/LY-K7M2QX'],
  payment_reminder: ['أحمد', 'LY-K7M2QX', '1,180 ج.م', 'https://lynto.store/order/LY-K7M2QX'],
  proof_rejected: ['أحمد', 'LY-K7M2QX', 'المبلغ لسه موصلش', 'https://lynto.store/order/LY-K7M2QX'],
  payment_confirmed: ['أحمد', 'LY-K7M2QX', 'الأحد 5:00 م', 'https://lynto.store/order/LY-K7M2QX'],
  order_delivered: ['أحمد', 'LY-K7M2QX', 'https://lynto.store/order/LY-K7M2QX'],
  item_delivered: ['أحمد', 'LY-K7M2QX', 'https://lynto.store/order/LY-K7M2QX'],
  renewal_reminder: ['أحمد', 'Netflix', '11 نوفمبر 2026', 'https://lynto.store'],
};
export const templateName = (event: string) => `lynto_${event}`;

const base = (env: Env) => (!isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE : 'https://graph.facebook.com');

async function graph(env: Env, method: 'GET' | 'POST', path: string, body?: unknown) {
  const s = await loadSettings(env);
  const token = await getSecret(env, 'whatsapp_access_token');
  if (!token) throw new HttpError(409, 'whatsapp_token_missing', 'WhatsApp access token is not configured.');
  const url = `${base(env)}/${s.notifications.whatsapp_api_version}${path}`;
  const res = await fetch(url, {
    method, signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function whatsappStatus(env: Env) {
  const s = await loadSettings(env);
  const n = s.notifications;
  if (!n.whatsapp_phone_number_id) throw new HttpError(409, 'whatsapp_phone_missing', 'Enter the Phone number ID first.');
  const phone = await graph(env, 'GET', `/${n.whatsapp_phone_number_id}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type,account_mode,messaging_limit_tier`);
  const templates = n.whatsapp_waba_id ? await graph(env, 'GET', `/${n.whatsapp_waba_id}/message_templates?fields=name,status,language,category,rejected_reason&limit=100`) : null;
  const subscribed = n.whatsapp_waba_id ? await graph(env, 'GET', `/${n.whatsapp_waba_id}/subscribed_apps`) : null;
  return {
    phone: phone.ok ? phone.json : { error: phone.json?.error?.message ?? `HTTP ${phone.status}` },
    templates: templates?.ok ? (templates.json.data ?? []) : templates ? { error: templates.json?.error?.message ?? `HTTP ${templates.status}` } : null,
    subscribed: subscribed?.ok ? (subscribed.json.data ?? []).length > 0 : null,
    configured_templates: n.whatsapp_templates,
  };
}

export async function createMissingTemplates(env: Env) {
  const s = await loadSettings(env);
  const n = s.notifications;
  if (!n.whatsapp_waba_id) throw new HttpError(409, 'whatsapp_waba_missing', 'Enter the WhatsApp Business account ID first.');
  const lang = n.whatsapp_templates.order_received?.language || 'ar_EG';
  const existing = await graph(env, 'GET', `/${n.whatsapp_waba_id}/message_templates?fields=name,language,status&limit=200`);
  if (!existing.ok) throw new HttpError(502, 'whatsapp_error', existing.json?.error?.message ?? 'Could not list templates');
  const have = new Set<string>((existing.json.data ?? []).filter((t: any) => t.language === lang).map((t: any) => t.name));
  const results: Array<{ name: string; status: 'created' | 'exists' | 'error'; detail?: string }> = [];
  for (const [event, g] of Object.entries(WHATSAPP_TEMPLATE_GUIDE)) {
    const name = templateName(event);
    if (have.has(name)) { results.push({ name, status: 'exists' }); continue; }
    const r = await graph(env, 'POST', `/${n.whatsapp_waba_id}/message_templates`, {
      name, language: lang, category: 'UTILITY',
      components: [{ type: 'BODY', text: g.ar, example: { body_text: [TEMPLATE_EXAMPLES[event]] } }],
    });
    results.push(r.ok ? { name, status: 'created', detail: r.json.status } : { name, status: 'error', detail: r.json?.error?.error_user_msg ?? r.json?.error?.message ?? `HTTP ${r.status}` });
  }
  return { language: lang, results };
}

/** Copies APPROVED template names into settings so LYnto starts using them (pending/rejected ones stay unset). */
export async function syncApprovedTemplates(env: Env, actor: string) {
  const s = await loadSettings(env);
  const n = s.notifications;
  if (!n.whatsapp_waba_id) throw new HttpError(409, 'whatsapp_waba_missing', 'Enter the WhatsApp Business account ID first.');
  const r = await graph(env, 'GET', `/${n.whatsapp_waba_id}/message_templates?fields=name,language,status&limit=200`);
  if (!r.ok) throw new HttpError(502, 'whatsapp_error', r.json?.error?.message ?? 'Could not list templates');
  const approved = new Map<string, string>();
  for (const t of r.json.data ?? []) if (t.status === 'APPROVED') approved.set(t.name, t.language);
  const next = structuredClone(n.whatsapp_templates);
  const activated: string[] = [];
  for (const event of Object.keys(WHATSAPP_TEMPLATE_GUIDE)) {
    const name = templateName(event);
    if (approved.has(name)) { next[event] = { name, language: approved.get(name)! }; activated.push(event); }
    else if (next[event]?.name === name) next[event] = { name: '', language: next[event].language };
  }
  s.notifications.whatsapp_templates = next;
  await saveSettings(env, s, actor);
  return { activated, pending: Object.keys(WHATSAPP_TEMPLATE_GUIDE).filter((e) => !activated.includes(e)) };
}
