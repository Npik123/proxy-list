-- Daily per-hash click counts and month/year totals (replaces Firestore
-- click_daily / click_monthly / click_yearly used by /stats/).

CREATE TABLE IF NOT EXISTS click_daily (
  date TEXT NOT NULL,
  hash TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, hash)
);

CREATE INDEX IF NOT EXISTS idx_click_daily_date ON click_daily (date);

CREATE TABLE IF NOT EXISTS click_period (
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, period)
);
