// Shared creation of support tickets (website form and WhatsApp Flows).
import type { Env } from '../env';
import type { BusinessSettings } from '../../shared/types';
import { newId, randomCode } from '../lib/crypto';
import { now } from '../lib/util';
import { notificationStmts, ownerAlertStmts, planSupportChannels } from './notifications';

export type NewSupport = {
  name: string; contact: string; topic: string; message: string; lang: 'ar' | 'en';
  order_id?: string | null; order_verified?: boolean; ip_hash?: string | null; via?: 'web' | 'whatsapp';
};

export async function createSupportRequest(env: Env, s: BusinessSettings, d: NewSupport): Promise<{ id: string; number: string }> {
  const t = now();
  const id = newId('sup');
  const number = `SR-${randomCode(6)}`;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO support_requests (id, number, order_id, order_verified, name, contact, topic, message, lang, ip_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, number, d.order_id ?? null, d.order_verified ? 1 : 0, d.name.slice(0, 80), d.contact.slice(0, 120), d.topic, d.message.slice(0, 2000), d.lang, d.ip_hash ?? null, t, t),
    ...(await ownerAlertStmts(env, s, null, 'owner_support_request', `owner_support:${id}`, { number, path: '/support', extra: `Support request ${number} (${d.topic}) from ${d.name}${d.via === 'whatsapp' ? ' via WhatsApp' : ''}.` })),
    ...notificationStmts(env, { orderId: null, audience: 'customer', event: 'support_received', channels: await planSupportChannels(env, s, d.contact), recipientFor: () => d.contact.trim(), dedupeBase: `support_received:${id}`, payload: { name: d.name, number } }),
  ]);
  return { id, number };
}
