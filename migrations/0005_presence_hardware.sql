-- Coarse RAM / CPU core / architecture rollups from presence heartbeats (not Sentry).
-- RAM is the browser deviceMemory bucket (0.25–8, where 8 means 8 GB+).
-- Cores are navigator.hardwareConcurrency. Arch is UA / Client Hints.

CREATE TABLE IF NOT EXISTS presence_hw_daily (
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, kind, value)
);

CREATE INDEX IF NOT EXISTS idx_presence_hw_daily_date ON presence_hw_daily (date);
