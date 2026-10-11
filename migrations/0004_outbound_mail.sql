-- Owner-composed email log + unpaid-order payment reminder flag.
CREATE TABLE outbound_emails (
  id TEXT PRIMARY KEY,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  reply_to TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed')),
  provider_message_id TEXT,
  error TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_outbound_created ON outbound_emails(created_at);
CREATE INDEX idx_outbound_provider ON outbound_emails(provider_message_id);
CREATE INDEX idx_outbound_order ON outbound_emails(order_id);

ALTER TABLE orders ADD COLUMN reminder_processed INTEGER NOT NULL DEFAULT 0;
