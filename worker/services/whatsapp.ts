// WhatsApp Cloud API management helpers: connection status, template creation and approval sync.
import type { Env } from '../env';
import { getSecret, loadSettings, saveSettings } from '../lib/settings';
import { HttpError, isProd } from '../lib/util';
import { WHATSAPP_TEMPLATE_GUIDE } from './messages';
import { FLOW_DEFS, type FlowKind } from './flows';
import { audit, rateLimit } from '../lib/util';
import type { BusinessSettings } from '../../shared/types';

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

async function graph(env: Env, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
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

// ---------------------------------------------------------------------------------------------
// Sending free-form / interactive messages (inside the 24-hour customer-service window)
// ---------------------------------------------------------------------------------------------
export async function waSend(env: Env, s: BusinessSettings, to: string, message: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = await getSecret(env, 'whatsapp_access_token');
  const phone = s.notifications.whatsapp_phone_number_id;
  if (!token || !phone) return { ok: false, error: 'WhatsApp is not configured' };
  try {
    const res = await fetch(`${base(env)}/${s.notifications.whatsapp_api_version}/${phone}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (res.ok && j?.messages?.[0]?.id) return { ok: true, id: j.messages[0].id };
    return { ok: false, error: j?.error?.message ?? `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ---------------------------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------------------------
export async function createFlows(env: Env, actor: string) {
  const s = await loadSettings(env);
  const n = s.notifications;
  if (!n.whatsapp_waba_id) throw new HttpError(409, 'whatsapp_waba_missing', 'Enter the WhatsApp Business account ID first.');
  const list = await graph(env, 'GET', `/${n.whatsapp_waba_id}/flows?fields=id,name,status&limit=100`);
  if (!list.ok) throw new HttpError(502, 'whatsapp_error', list.json?.error?.message ?? 'Could not list flows');
  const byName = new Map<string, { id: string; status: string }>((list.json.data ?? []).map((f: any) => [f.name, { id: f.id, status: f.status }]));
  const results: Array<{ kind: string; name: string; status: 'created' | 'exists' | 'draft' | 'error'; id?: string; detail?: string }> = [];
  const ids = { ...n.whatsapp_flows };
  for (const [kind, def] of Object.entries(FLOW_DEFS) as Array<[FlowKind, (typeof FLOW_DEFS)[FlowKind]]>) {
    const have = byName.get(def.name);
    if (have?.status === 'PUBLISHED') { ids[kind] = have.id; results.push({ kind, name: def.name, status: 'exists', id: have.id }); continue; }
    let id = have?.id;
    if (id) {
      // keep a clean draft of the current JSON version; otherwise replace it
      const chk = await graph(env, 'GET', `/${id}?fields=json_version,validation_errors`);
      const stale = !chk.ok || (chk.json.validation_errors ?? []).length > 0 || chk.json.json_version !== (def.json as any).version;
      if (stale) { await graph(env, 'DELETE', `/${id}`).catch(() => null); id = undefined; }
    }
    if (!id) {
      const r = await graph(env, 'POST', `/${n.whatsapp_waba_id}/flows`, { name: def.name, categories: def.categories, flow_json: JSON.stringify(def.json), publish: false });
      const errs = (r.json.validation_errors ?? []).map((e: any) => `${e.error}: ${e.message}`).join('; ');
      if (!r.ok || !r.json.id || errs) { results.push({ kind, name: def.name, status: 'error', detail: errs || r.json?.error?.error_user_msg || r.json?.error?.message || `HTTP ${r.status}` }); continue; }
      id = r.json.id as string;
    }
    const pub = await graph(env, 'POST', `/${id}/publish`, {});
    if (pub.ok && pub.json.success !== false) { ids[kind] = id!; results.push({ kind, name: def.name, status: 'created', id }); }
    else results.push({ kind, name: def.name, status: 'draft', id, detail: pub.json?.error?.error_user_msg ?? pub.json?.error?.message ?? `HTTP ${pub.status}` });
  }
  s.notifications.whatsapp_flows = ids;
  await saveSettings(env, s, actor);
  return { results, flows: ids };
}

// ---------------------------------------------------------------------------------------------
// Go-live automation: finishes the setup as soon as Meta unblocks the account.
// ---------------------------------------------------------------------------------------------
export type GoLiveStep = { step: string; ok: boolean; detail?: string };

export async function goLiveCheck(env: Env, actor = 'system'): Promise<{ steps: GoLiveStep[]; enabled: boolean; blockers: string[] }> {
  const steps: GoLiveStep[] = [];
  const blockers: string[] = [];
  const s0 = await loadSettings(env);
  const n = s0.notifications;
  if (!n.whatsapp_waba_id || !n.whatsapp_phone_number_id) return { steps: [{ step: 'configured', ok: false, detail: 'Phone number ID / account ID missing' }], enabled: false, blockers: ['not_configured'] };
  if (!(await getSecret(env, 'whatsapp_access_token'))) return { steps: [{ step: 'token', ok: false, detail: 'No access token' }], enabled: false, blockers: ['no_token'] };

  const phone = await graph(env, 'GET', `/${n.whatsapp_phone_number_id}?fields=status,platform_type,code_verification_status,name_status,quality_rating,health_status`);
  if (!phone.ok) return { steps: [{ step: 'phone', ok: false, detail: phone.json?.error?.message ?? `HTTP ${phone.status}` }], enabled: false, blockers: ['phone_unreachable'] };
  const p = phone.json;
  steps.push({ step: 'phone', ok: true, detail: `status ${p.status}, platform ${p.platform_type}, code ${p.code_verification_status}` });

  const sub = await graph(env, 'POST', `/${n.whatsapp_waba_id}/subscribed_apps`, {});
  steps.push({ step: 'subscribe_app', ok: sub.ok, detail: sub.ok ? undefined : sub.json?.error?.message });

  if (p.status !== 'CONNECTED' && p.code_verification_status === 'VERIFIED' && env.WHATSAPP_PIN) {
    const reg = await graph(env, 'POST', `/${n.whatsapp_phone_number_id}/register`, { messaging_product: 'whatsapp', pin: env.WHATSAPP_PIN });
    steps.push({ step: 'register_number', ok: reg.ok, detail: reg.ok ? undefined : reg.json?.error?.error_data?.details ?? reg.json?.error?.message });
    if (!reg.ok) blockers.push('register_failed');
  }

  try { const t = await createMissingTemplates(env); steps.push({ step: 'templates', ok: t.results.every((r) => r.status !== 'error'), detail: t.results.map((r) => `${r.name}:${r.status}`).join(', ') }); }
  catch (e: any) { steps.push({ step: 'templates', ok: false, detail: String(e?.message ?? e) }); }
  try { const f = await createFlows(env, actor); steps.push({ step: 'flows', ok: f.results.every((r) => r.status === 'created' || r.status === 'exists'), detail: f.results.map((r) => `${r.kind}:${r.status}${r.status === 'draft' ? ' (' + (r.detail ?? '') + ')' : ''}`).join(', ') }); }
  catch (e: any) { steps.push({ step: 'flows', ok: false, detail: String(e?.message ?? e) }); }
  let approved: string[] = [];
  try { approved = (await syncApprovedTemplates(env, actor)).activated; steps.push({ step: 'sync_templates', ok: true, detail: `active: ${approved.join(', ') || 'none yet'}` }); }
  catch (e: any) { steps.push({ step: 'sync_templates', ok: false, detail: String(e?.message ?? e) }); }

  // Re-read health after the above.
  const h = await graph(env, 'GET', `/${n.whatsapp_phone_number_id}?fields=status,platform_type,health_status`);
  const can = h.json?.health_status?.can_send_message;
  const connected = h.json?.status === 'CONNECTED';
  const core = ['order_received', 'payment_confirmed', 'order_delivered'].every((e) => approved.includes(e));
  if (!connected) blockers.push('number_not_connected');
  if (can !== 'AVAILABLE') {
    blockers.push('sending_blocked');
    for (const e of h.json?.health_status?.entities ?? []) for (const er of e.errors ?? []) steps.push({ step: 'blocker', ok: false, detail: `${e.entity_type}: ${er.error_description}` });
  }
  if (!core) blockers.push('templates_not_approved');

  let enabled = n.whatsapp_enabled;
  if (!enabled && n.whatsapp_autoactivate && connected && can === 'AVAILABLE' && core) {
    const s = await loadSettings(env);
    s.notifications.whatsapp_enabled = true;
    await saveSettings(env, s, 'system:whatsapp-golive');
    await audit(env, 'system', 'whatsapp_auto_enabled', 'integration', 'whatsapp', { approved });
    enabled = true;
    steps.push({ step: 'enable', ok: true, detail: 'WhatsApp notifications switched on automatically' });
  }
  return { steps, enabled, blockers };
}

/** Called from the 5-minute cron; runs the heavier go-live check at most every 30 minutes until WhatsApp is enabled. */
export async function goLiveIfDue(env: Env) {
  const s = await loadSettings(env);
  const n = s.notifications;
  if (n.whatsapp_enabled || !n.whatsapp_autoactivate || !n.whatsapp_waba_id || !n.whatsapp_phone_number_id) return null;
  if (!(await rateLimit(env, 'wa-golive', 1, 30 * 60_000))) return null;
  return goLiveCheck(env, 'system');
}
