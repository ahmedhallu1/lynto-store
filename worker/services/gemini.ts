// Optional, owner-triggered Gemini helper for drafting bilingual product copy.
// Only PUBLIC catalog content is sent (brand, title, category, existing public copy).
// Never sends customer data, receipts, prices, payment details, credentials or order history.
// Output is a suggestion the owner reviews; nothing is saved automatically.
import type { Env } from '../env';
import { getSecret, loadSettings } from '../lib/settings';
import { HttpError, isProd, now } from '../lib/util';

export type DraftCopy = { summary_ar: string; summary_en: string; description_ar: string; description_en: string; features_ar: string[]; features_en: string[] };

export async function geminiKey(env: Env) {
  return (await getSecret(env, 'gemini_api_key')) ?? env.GEMINI_API_KEY ?? null;
}

export async function draftProductCopy(env: Env, input: { brand: string; title_en: string; title_ar: string; category: string; description_en?: string; official_url?: string }): Promise<DraftCopy> {
  const s = await loadSettings(env);
  if (!s.ai.gemini_enabled) throw new HttpError(409, 'ai_disabled', 'Gemini is disabled in Setup.');
  const key = await geminiKey(env);
  if (!key) throw new HttpError(409, 'ai_not_configured', 'No Gemini API key is configured.');
  const day = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare(`INSERT INTO ai_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 RETURNING count`).bind(day).first<{ count: number }>();
  if ((usage?.count ?? 0) > s.ai.daily_limit) throw new HttpError(429, 'ai_daily_limit', 'Daily AI draft limit reached.');

  const prompt = `You write concise, factual product copy for LYnto, an Egyptian online store selling digital subscriptions, licenses and gift cards.
Product: ${input.title_en} (${input.brand}). Category: ${input.category}. Arabic title: ${input.title_ar}.
${input.description_en ? `Current English description: ${input.description_en}` : ''}
Rules:
- Arabic must be natural Egyptian Arabic (عامية مصرية مهذبة), professional and clear.
- Only state general, widely known facts about the service. Do NOT invent prices, discounts, plan limits, numbers, guarantees, delivery times, or partnerships.
- Do not claim instant activation or official partnership. Mention that plan details are set by the provider when relevant.
- 1-sentence summaries (max 140 chars), 2-3 sentence descriptions, 2-4 short features each.`;

  const base = !isProd(env) && env.TEST_PROVIDER_BASE ? env.TEST_PROVIDER_BASE : 'https://generativelanguage.googleapis.com';
  const ctrl = AbortSignal.timeout(20_000);
  let res: Response;
  try {
    res = await fetch(`${base}/v1beta/models/${encodeURIComponent(s.ai.model)}:generateContent`, {
      method: 'POST', signal: ctrl,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4, maxOutputTokens: 1200, responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT', required: ['summary_ar', 'summary_en', 'description_ar', 'description_en', 'features_ar', 'features_en'],
            properties: {
              summary_ar: { type: 'STRING' }, summary_en: { type: 'STRING' }, description_ar: { type: 'STRING' }, description_en: { type: 'STRING' },
              features_ar: { type: 'ARRAY', items: { type: 'STRING' } }, features_en: { type: 'ARRAY', items: { type: 'STRING' } },
            },
          },
        },
      }),
    });
  } catch (e: any) {
    throw new HttpError(502, 'ai_unavailable', 'Gemini did not respond in time. You can write the copy manually.');
  }
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    throw new HttpError(502, 'ai_unavailable', `Gemini error ${res.status}: ${body?.error?.status ?? ''}. You can write the copy manually.`);
  }
  const body: any = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  try {
    const parsed = JSON.parse(text) as DraftCopy;
    const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
    return {
      summary_ar: clip(parsed.summary_ar, 200), summary_en: clip(parsed.summary_en, 200),
      description_ar: clip(parsed.description_ar, 1200), description_en: clip(parsed.description_en, 1200),
      features_ar: (parsed.features_ar ?? []).slice(0, 5).map((f) => clip(f, 120)), features_en: (parsed.features_en ?? []).slice(0, 5).map((f) => clip(f, 120)),
    };
  } catch {
    throw new HttpError(502, 'ai_bad_output', 'Gemini returned an unexpected format. Try again or write manually.');
  }
}

export const aiUsageToday = async (env: Env) =>
  (await env.DB.prepare('SELECT count FROM ai_usage WHERE day = ?').bind(new Date(now()).toISOString().slice(0, 10)).first<{ count: number }>())?.count ?? 0;
