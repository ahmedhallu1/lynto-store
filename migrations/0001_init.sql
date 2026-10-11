-- LYnto core schema. All timestamps are UTC epoch milliseconds (INTEGER).
-- Money is stored as integer piastres (1 EGP = 100 piastres).

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Integration credentials, AES-GCM encrypted with the DATA_KEY Worker secret.
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  mfa_pending INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  brand TEXT NOT NULL DEFAULT '',
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_ar TEXT NOT NULL DEFAULT '',
  summary_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  features_ar TEXT NOT NULL DEFAULT '[]',
  features_en TEXT NOT NULL DEFAULT '[]',
  delivery_ar TEXT NOT NULL DEFAULT '',
  delivery_en TEXT NOT NULL DEFAULT '',
  guarantee_ar TEXT NOT NULL DEFAULT '',
  guarantee_en TEXT NOT NULL DEFAULT '',
  customer_fields TEXT NOT NULL DEFAULT '[]',
  owner_instructions TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  icon_text TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  supply_status TEXT NOT NULL DEFAULT 'pending' CHECK (supply_status IN ('pending','validated','unavailable')),
  supply_notes TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX idx_products_status ON products(status, category_id, sort);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('private','shared','invite','license','gift_card','topup')),
  duration_value INTEGER,
  duration_unit TEXT CHECK (duration_unit IS NULL OR duration_unit IN ('day','month','year')),
  is_perpetual INTEGER NOT NULL DEFAULT 0,
  price_piastres INTEGER CHECK (price_piastres IS NULL OR price_piastres > 0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','retired')),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','unavailable')),
  max_qty INTEGER NOT NULL DEFAULT 1 CHECK (max_qty BETWEEN 1 AND 20),
  guarantee_kind TEXT NOT NULL DEFAULT 'pending' CHECK (guarantee_kind IN ('full_period','days','none','pending')),
  guarantee_days INTEGER,
  notes_ar TEXT NOT NULL DEFAULT '',
  notes_en TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_plans_product ON plans(product_id, sort);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  access_hash TEXT NOT NULL,
  access_enc TEXT NOT NULL,
  idem_hash TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'ar',
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  preferred_channel TEXT NOT NULL CHECK (preferred_channel IN ('whatsapp','email')),
  whatsapp_optin INTEGER NOT NULL DEFAULT 0,
  renewal_optin INTEGER NOT NULL DEFAULT 0,
  tracking_consent INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  subtotal_piastres INTEGER NOT NULL,
  total_piastres INTEGER NOT NULL,
  payment_method_id TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'awaiting_transfer' CHECK (payment_status IN
    ('awaiting_transfer','proof_submitted','verified','rejected','cancelled','refund_requested','refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'not_started' CHECK (fulfillment_status IN
    ('not_started','processing','partially_delivered','delivered','cancelled')),
  verified_amount_piastres INTEGER,
  verified_reference TEXT,
  verified_at INTEGER,
  verified_by TEXT,
  delivery_due_at INTEGER,
  delivered_at INTEGER,
  cancelled_at INTEGER,
  cancel_reason TEXT,
  refund_requested_at INTEGER,
  refund_reason TEXT,
  refunded_at INTEGER,
  refund_amount_piastres INTEGER,
  refund_reference TEXT,
  rejection_reason TEXT,
  last_action_id TEXT,
  internal_notes TEXT NOT NULL DEFAULT '',
  overdue_alerted INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_orders_payment ON orders(payment_status, created_at);
CREATE INDEX idx_orders_fulfillment ON orders(fulfillment_status, delivery_due_at);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_whatsapp ON orders(customer_whatsapp);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  product_title_ar TEXT NOT NULL,
  product_title_en TEXT NOT NULL,
  plan_name_ar TEXT NOT NULL,
  plan_name_en TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  duration_value INTEGER,
  duration_unit TEXT,
  is_perpetual INTEGER NOT NULL DEFAULT 0,
  guarantee_kind TEXT NOT NULL DEFAULT 'pending',
  guarantee_days INTEGER,
  unit_price_piastres INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_total_piastres INTEGER NOT NULL,
  customer_fields TEXT NOT NULL DEFAULT '{}',
  fulfillment_status TEXT NOT NULL DEFAULT 'not_started' CHECK (fulfillment_status IN
    ('not_started','processing','delivered','cancelled')),
  delivered_at INTEGER,
  delivered_via TEXT CHECK (delivered_via IS NULL OR delivered_via IN ('portal','external')),
  activated_at INTEGER,
  expires_at INTEGER,
  guarantee_until INTEGER,
  renewal_reminded_at INTEGER,
  last_action_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_items_order ON order_items(order_id, sort);
CREATE INDEX idx_items_expiry ON order_items(expires_at);

-- Delivery records (encrypted details); latest per item is shown to the customer.
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('initial','replacement','update')),
  via TEXT NOT NULL CHECK (via IN ('portal','external')),
  details_enc TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_deliveries_item ON deliveries(item_id, created_at);

CREATE TABLE payment_proofs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  transaction_ref TEXT NOT NULL DEFAULT '',
  payer_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  reject_reason TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT
);
CREATE INDEX idx_proofs_order ON payment_proofs(order_id, created_at);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('customer','internal')),
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_order ON order_events(order_id, id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('customer','owner')),
  event TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','manual')),
  recipient TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','sent','delivered','failed','manual_action_required')),
  provider TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL UNIQUE,
  manual_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  delivered_at INTEGER
);
CREATE INDEX idx_notifications_status ON notifications(status, next_attempt_at);
CREATE INDEX idx_notifications_order ON notifications(order_id);
CREATE INDEX idx_notifications_provider ON notifications(provider_message_id);

CREATE TABLE support_requests (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  order_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  admin_notes TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'ar',
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_support_status ON support_requests(status, created_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY,
  order_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
