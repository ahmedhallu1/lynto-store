import type { Schedule } from './schedule';

export type Lang = 'ar' | 'en';

export const PAYMENT_STATUSES = ['awaiting_transfer', 'proof_submitted', 'verified', 'rejected', 'cancelled', 'refund_requested', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const FULFILLMENT_STATUSES = ['not_started', 'processing', 'partially_delivered', 'delivered', 'cancelled'] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'delivered', 'failed', 'manual_action_required'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const PLAN_TYPES = ['private', 'shared', 'invite', 'license', 'gift_card', 'topup'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export type CustomerField = {
  key: string;
  type: 'text' | 'email' | 'select';
  required: boolean;
  label_ar: string;
  label_en: string;
  help_ar?: string;
  help_en?: string;
  pattern?: string;
  options?: Array<{ value: string; label_ar: string; label_en: string }>;
};

export type PaymentMethodType = 'instapay' | 'bank' | 'wallet';
export type PaymentMethod = {
  id: string;
  type: PaymentMethodType;
  enabled: boolean;
  label_ar: string;
  label_en: string;
  /** InstaPay address (name@instapay) or wallet number or bank account number */
  account: string;
  account_name: string;
  bank_name?: string;
  iban?: string;
  wallet_provider?: string;
  instapay_link?: string;
  instructions_ar?: string;
  instructions_en?: string;
};

export type BusinessSettings = {
  store: {
    accepting_orders: boolean;
    business_name: string;
    announcement_ar: string;
    announcement_en: string;
  };
  payments: { methods: PaymentMethod[] };
  schedule: Schedule & { configured: boolean };
  delivery: { sla_working_hours: number; unpaid_expiry_hours: number; renewal_reminder_days: number; payment_reminder_hours: number };
  support: {
    whatsapp: string;
    email: string;
    phone: string;
    hours_note_ar: string;
    hours_note_en: string;
    socials: { facebook: string; instagram: string; tiktok: string; telegram: string; x: string; youtube: string };
  };
  policies: {
    confirmed: boolean;
    guarantee_ar: string;
    guarantee_en: string;
    refund_ar: string;
    refund_en: string;
    terms_extra_ar: string;
    terms_extra_en: string;
  };
  notifications: {
    email_provider: 'none' | 'cloudflare' | 'resend';
    from_domain: string;
    from_email: string;
    from_support: string;
    from_name: string;
    reply_to: string;
    owner_alert_email: string;
    whatsapp_enabled: boolean;
    whatsapp_phone_number_id: string;
    whatsapp_waba_id: string;
    whatsapp_api_version: string;
    whatsapp_templates: Record<string, { name: string; language: string }>;
  };
  tracking: { meta_pixel_id: string; capi_enabled: boolean; meta_test_event_code: string };
  ai: { gemini_enabled: boolean; model: string; daily_limit: number };
};

export type PublicSettings = {
  checkout_enabled: boolean;
  checkout_blockers: string[];
  announcement_ar: string;
  announcement_en: string;
  business_name: string;
  payment_methods: Array<Pick<PaymentMethod, 'id' | 'type' | 'label_ar' | 'label_en'>>;
  support: BusinessSettings['support'];
  policies: Omit<BusinessSettings['policies'], 'confirmed'> & { confirmed: boolean };
  schedule_summary: { configured: boolean; week: Schedule['week']; timezone: string };
  sla_working_hours: number;
  meta_pixel_id: string;
};

export type PublicPlan = {
  id: string;
  name_ar: string;
  name_en: string;
  plan_type: PlanType;
  duration_value: number | null;
  duration_unit: 'day' | 'month' | 'year' | null;
  is_perpetual: boolean;
  price_piastres: number;
  available: boolean;
  max_qty: number;
  guarantee_kind: string;
  guarantee_days: number | null;
  notes_ar: string;
  notes_en: string;
};

export type PublicProduct = {
  id: string;
  slug: string;
  category: { id: string; slug: string; name_ar: string; name_en: string };
  brand: string;
  title_ar: string;
  title_en: string;
  summary_ar: string;
  summary_en: string;
  description_ar: string;
  description_en: string;
  features_ar: string[];
  features_en: string[];
  delivery_ar: string;
  delivery_en: string;
  guarantee_ar: string;
  guarantee_en: string;
  customer_fields: CustomerField[];
  image_url: string | null;
  icon_text: string;
  accent: string;
  featured: boolean;
  plans: PublicPlan[];
  min_price_piastres: number | null;
  available: boolean;
};

export type PublicCategory = { id: string; slug: string; name_ar: string; name_en: string; description_ar: string; description_en: string; icon: string; product_count: number };

export type CartLine = { productId: string; planId: string; qty: number; fields: Record<string, string> };
