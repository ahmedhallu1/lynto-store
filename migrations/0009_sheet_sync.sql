-- 0009: orders imported once a day from the owner's cashier Google Sheet (credit transactions, whole amounts).
-- Imported orders carry no customer details; they are recorded as paid and delivered and count in revenue.
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE orders ADD COLUMN source_ref TEXT;
CREATE INDEX idx_orders_source ON orders(source, created_at);

CREATE TABLE sheet_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  fetched INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  window_from INTEGER,
  window_to INTEGER,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL
);
CREATE INDEX idx_sheet_runs_started ON sheet_sync_runs(started_at);
