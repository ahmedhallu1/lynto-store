-- 0010: automatic engagement orders on JustAnotherPanel (JAP) for every new post on the LYnto Facebook Page and Instagram account.
-- One row per (platform, post). The UNIQUE key is claimed BEFORE the JAP order is placed, so a post can never be ordered twice,
-- even if two cron runs overlap. Rows that end in 'unknown' (the order may or may not exist on JAP) are never retried automatically.
CREATE TABLE social_boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  post_id TEXT NOT NULL,
  permalink TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  service INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ordered', 'failed', 'unknown', 'skipped')),
  jap_order_id TEXT,
  jap_status TEXT,
  jap_remains INTEGER,
  charge_usd TEXT,
  error TEXT,
  trigger TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (platform, post_id)
);
CREATE INDEX idx_social_boosts_created ON social_boosts(created_at);
