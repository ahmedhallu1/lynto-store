-- Idempotency for inbound WhatsApp webhook messages (Meta retries deliveries).
CREATE TABLE wa_inbound (
  message_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_wa_inbound_created ON wa_inbound(created_at);
