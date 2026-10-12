import type { BusinessSettings, PaymentMethod } from './types';

// Draft policy text. NOT shown publicly as final until the owner confirms it in Admin → Setup.
export const DRAFT_POLICIES = {
  guarantee_ar: [
    'بنضمن الاشتراك طول مدته، والمدة بتبدأ من تاريخ التفعيل الفعلي مش من تاريخ الطلب.',
    'لو حصلت مشكلة في التفعيل أو الاشتراك وقف بسبب من ناحيتنا، ابعتلنا من صفحة الدعم برقم الطلب، وهنراجع المشكلة ونصلحها أو نستبدل الاشتراك للمدة الباقية.',
    'الضمان مش بيغطي تغيير بيانات الحساب أو مخالفة شروط مقدّم الخدمة من ناحية العميل، ولا التغييرات اللي مقدّم الخدمة نفسه بيعملها في المميزات أو الأسعار.',
    'كروت الشحن والأكواد مضمونة إنها شغالة وقت التسليم.',
  ].join('\n'),
  guarantee_en: [
    'Subscriptions are guaranteed for their full period, counted from the actual activation date, not the order date.',
    'If activation fails or the subscription stops because of an issue on our side, contact support with your order number and we will investigate and fix it or replace the subscription for the remaining period.',
    'The guarantee does not cover changes the customer makes to the account, breaches of the provider\'s terms by the customer, or feature/price changes made by the provider.',
    'Gift cards and codes are guaranteed to be valid at the time of delivery.',
  ].join('\n'),
  refund_ar: [
    'لو دفعت ومقدرناش نسلّم طلبك، هنرجعلك المبلغ بالكامل.',
    'بعد تسليم الأكواد أو تفعيل الاشتراك، الاسترجاع بيكون بس لو المشكلة من ناحيتنا ومقدرناش نحلها.',
    'الاسترجاع بيتم يدوياً بتحويل من المتجر، والموقع نفسه مش بيرجّع التحويلات البنكية أو تحويلات المحافظ أوتوماتيك.',
  ].join('\n'),
  refund_en: [
    'If you paid and we cannot deliver your order, we refund the full amount.',
    'After codes are delivered or a subscription is activated, refunds apply only when the problem is on our side and we cannot resolve it.',
    'Refunds are made manually by transfer from the store; the website does not reverse bank or wallet transfers automatically.',
  ].join('\n'),
};

export const DEFAULT_WA_TEMPLATES: BusinessSettings['notifications']['whatsapp_templates'] = {
  order_received: { name: '', language: 'ar_EG' },
  proof_rejected: { name: '', language: 'ar_EG' },
  payment_confirmed: { name: '', language: 'ar_EG' },
  order_delivered: { name: '', language: 'ar_EG' },
  item_delivered: { name: '', language: 'ar_EG' },
  renewal_reminder: { name: '', language: 'ar_EG' },
  payment_reminder: { name: '', language: 'ar_EG' },
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  store: { accepting_orders: false, business_name: 'LYnto', announcement_ar: '', announcement_en: '' },
  payments: {
    methods: [
      { id: 'instapay', type: 'instapay', enabled: false, label_ar: 'إنستاباي', label_en: 'InstaPay', account: '', account_name: '', instapay_link: '' },
      { id: 'wallet', type: 'wallet', enabled: false, label_ar: 'محفظة إلكترونية', label_en: 'Mobile wallet', account: '', account_name: '', wallet_provider: 'Vodafone Cash' },
      { id: 'bank', type: 'bank', enabled: false, label_ar: 'تحويل بنكي', label_en: 'Bank transfer', account: '', account_name: '', bank_name: '', iban: '' },
    ],
  },
  schedule: { configured: false, timezone: 'Africa/Cairo', week: {}, holidays: [] },
  delivery: { sla_working_hours: 2, unpaid_expiry_hours: 48, renewal_reminder_days: 3, payment_reminder_hours: 6 },
  support: {
    whatsapp: '', email: '', phone: '', hours_note_ar: '', hours_note_en: '',
    socials: { facebook: '', instagram: '', tiktok: '', telegram: '', x: '', youtube: '' },
  },
  policies: { confirmed: false, ...DRAFT_POLICIES, terms_extra_ar: '', terms_extra_en: '' },
  notifications: {
    email_provider: 'none', from_domain: 'lynto.store', from_email: 'orders@lynto.store', from_support: 'support@lynto.store', from_name: 'LYnto', reply_to: '', owner_alert_email: '',
    whatsapp_enabled: false, whatsapp_phone_number_id: '', whatsapp_waba_id: '', whatsapp_api_version: 'v25.0',
    whatsapp_templates: DEFAULT_WA_TEMPLATES,
  },
  tracking: { meta_pixel_id: '', capi_enabled: false, meta_test_event_code: '' },
  ai: { gemini_enabled: false, model: 'gemini-3.5-flash-lite', daily_limit: 40 },
};

export function paymentMethodComplete(m: PaymentMethod): boolean {
  if (!m.account.trim() || !m.account_name.trim()) return false;
  if (m.type === 'bank' && !m.bank_name?.trim()) return false;
  if (m.type === 'wallet' && !m.wallet_provider?.trim()) return false;
  return true;
}

export type Blocker = 'store_closed' | 'no_payment_method' | 'schedule_missing' | 'policies_unconfirmed' | 'support_missing';

export function checkoutBlockers(s: BusinessSettings): Blocker[] {
  const b: Blocker[] = [];
  if (!s.payments.methods.some((m) => m.enabled && paymentMethodComplete(m))) b.push('no_payment_method');
  const hasHours = Object.values(s.schedule.week ?? {}).some((l) => (l ?? []).length > 0);
  if (!s.schedule.configured || !hasHours) b.push('schedule_missing');
  if (!s.policies.confirmed || !s.policies.guarantee_ar.trim() || !s.policies.refund_ar.trim()) b.push('policies_unconfirmed');
  if (!s.support.whatsapp.trim() && !s.support.email.trim()) b.push('support_missing');
  if (!s.store.accepting_orders) b.push('store_closed');
  return b;
}

/** Deep-merge stored settings over defaults so new keys always exist. */
export function mergeSettings(stored: Partial<BusinessSettings> | null | undefined): BusinessSettings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!stored) return d;
  const out: any = d;
  for (const [k, v] of Object.entries(stored)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = { ...out[k], ...v };
    } else if (v !== undefined) out[k] = v;
  }
  out.notifications.whatsapp_templates = { ...DEFAULT_WA_TEMPLATES, ...(stored.notifications?.whatsapp_templates ?? {}) };
  out.support.socials = { ...d.support.socials, ...(stored.support?.socials ?? {}) };
  return out as BusinessSettings;
}
